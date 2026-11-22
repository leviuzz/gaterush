import { useEffect, useRef } from 'react';
import { REPORT_CONTENT_STYLE, renderHtmlReportBody } from '@gateflow/sim-metrics';
import type { ResultsDocument } from '@gateflow/sim-metrics';
import { REPORT_HOST_STYLE } from '../page-style';

/**
 * The HTML report of a run, as the CLI writes it, inside a shadow root: its styles do not leak into
 * the page and take the page's colour tokens, so it follows the light or dark theme.
 */
export function ReportView({ doc }: { readonly doc: ResultsDocument }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${REPORT_CONTENT_STYLE}${REPORT_HOST_STYLE}</style><div class="report">${renderHtmlReportBody(doc)}</div>`;
  }, [doc]);
  return <div ref={host} id="report" className="report-frame" />;
}
