import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clock } from '@gateflow/sim-trace';

export interface ChartSeries {
  readonly name: string;
  /** Colour slot of the report palette (`--series-1` ...): it follows the policy, not the rank. */
  readonly slot: 1 | 2 | 3;
  readonly values: readonly number[];
}

interface Props {
  readonly id: string;
  readonly title: string;
  readonly unit: string;
  readonly times: readonly number[];
  readonly series: readonly ChartSeries[];
  readonly cursorMs: number;
  readonly onSeek: (ms: number) => void;
  /** Draw steps (a count that changes at instants, e.g. lanes) instead of lines. */
  readonly step?: boolean;
}

const HEIGHT = 132;
const LEFT = 40;
const RIGHT = 12;
const TOP = 10;
const BOTTOM = 22;
const HOUR = 3_600_000;

/**
 * The top of the axis: an even number for small counts (so that the middle tick is a whole
 * number), else the smallest of 1, 2 or 5 times a power of ten that is at least `value`.
 */
function niceMax(value: number): number {
  if (value <= 10) return Math.max(2, Math.ceil(value / 2) * 2);
  const power = 10 ** Math.floor(Math.log10(value));
  for (const factor of [1, 2, 5, 10]) if (factor * power >= value) return factor * power;
  return 10 * power;
}

/**
 * The width of an element, followed as it changes. It is measured before the first paint, so that
 * a chart never shows, even for a frame, at the fallback width: wider than a phone, it would make
 * the page scroll sideways.
 */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measured = Math.round(element.getBoundingClientRect().width);
    if (measured > 0) setWidth(measured);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined && w > 0) setWidth(Math.round(w));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, width] as const;
}

/** A small chart of counts over the day, with the replay's moment marked and seekable. */
export const TimeChart = memo(function TimeChart({
  id,
  title,
  unit,
  times,
  series,
  cursorMs,
  onSeek,
  step = false,
}: Props) {
  const [ref, width] = useWidth(600);
  const [hover, setHover] = useState<number | null>(null);
  const fromMs = times[0] ?? 0;
  const toMs = times[times.length - 1] ?? fromMs + 1;
  const plotW = Math.max(40, width - LEFT - RIGHT);
  const plotH = HEIGHT - TOP - BOTTOM;
  const maxValue = Math.max(1, ...series.map((s) => Math.max(0, ...s.values)));
  const yMax = niceMax(maxValue);
  const x = (t: number) => LEFT + ((t - fromMs) / Math.max(1, toMs - fromMs)) * plotW;
  const y = (v: number) => TOP + plotH - (v / yMax) * plotH;

  const paths = useMemo(
    () =>
      series.map((s) => {
        let d = '';
        s.values.forEach((v, i) => {
          const px = x(times[i] ?? fromMs).toFixed(1);
          const py = y(v).toFixed(1);
          if (i === 0) d = `M${px} ${py}`;
          else if (step) d += `H${px}V${py}`;
          else d += `L${px} ${py}`;
        });
        return d;
      }),
    // The paths depend on the data and the size only.
    [series, times, width, yMax, step],
  );

  const hours = (toMs - fromMs) / HOUR;
  const every = hours <= 8 ? 1 : hours <= 16 ? 2 : 3;
  const ticks: number[] = [];
  for (let t = Math.ceil(fromMs / (every * HOUR)) * every * HOUR; t <= toMs; t += every * HOUR) {
    ticks.push(t);
  }
  const indexAt = (clientX: number, rect: DOMRect) => {
    const ratio =
      (clientX - rect.left - (LEFT / width) * rect.width) / ((plotW / width) * rect.width);
    return Math.max(0, Math.min(times.length - 1, Math.round(ratio * (times.length - 1))));
  };
  const cursorX = x(Math.max(fromMs, Math.min(toMs, cursorMs)));
  const cursorIndex = Math.max(
    0,
    Math.min(
      times.length - 1,
      Math.round(((cursorMs - fromMs) / Math.max(1, toMs - fromMs)) * (times.length - 1)),
    ),
  );
  const shown = hover ?? cursorIndex;
  const tipLeft = Math.min(width - 150, Math.max(0, x(times[shown] ?? fromMs) + 8));

  return (
    <figure className="chart" aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="chart-title">
        {title}
      </figcaption>
      <div className="chart-plot" ref={ref}>
        <svg
          id={id}
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={`${title}, by time of day`}
          onPointerMove={(event) => {
            setHover(indexAt(event.clientX, event.currentTarget.getBoundingClientRect()));
          }}
          onPointerLeave={() => {
            setHover(null);
          }}
          onClick={(event) => {
            const i = indexAt(event.clientX, event.currentTarget.getBoundingClientRect());
            onSeek(times[i] ?? fromMs);
          }}
        >
          {[0, yMax / 2, yMax].map((v) => (
            <g key={v}>
              <line
                x1={LEFT}
                x2={LEFT + plotW}
                y1={y(v)}
                y2={y(v)}
                className={v === 0 ? 'axis-line' : 'grid-line'}
              />
              <text x={LEFT - 6} y={y(v) + 4} className="tick" textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={HEIGHT - 6} className="tick" textAnchor="middle">
              {clock(t)}
            </text>
          ))}
          {paths
            .map((d, i) => ({ d, s: series[i] }))
            .reverse()
            .map(({ d, s }, i) => (
              // The first series is drawn last, on top.
              <path
                key={s?.name ?? i}
                d={d}
                fill="none"
                stroke={`var(--series-${s?.slot ?? 1})`}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          <line x1={cursorX} x2={cursorX} y1={TOP} y2={TOP + plotH} className="cursor-line" />
          {series.map((s) => (
            <circle
              key={s.name}
              cx={x(times[shown] ?? fromMs)}
              cy={y(s.values[shown] ?? 0)}
              r={4}
              fill={`var(--series-${s.slot})`}
              stroke="var(--surface)"
              strokeWidth={2}
            />
          ))}
        </svg>
        <div className="chart-tip" style={{ left: tipLeft }} aria-hidden="true">
          <b>{clock(times[shown] ?? fromMs)}</b>
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: `var(--series-${s.slot})` }} />
              {s.values[shown] ?? 0} {unit}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
});
