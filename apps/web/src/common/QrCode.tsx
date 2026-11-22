import { useMemo } from 'react';
import { qrPath } from './qr';

/**
 * A QR code as an SVG drawn by React: no image, no inline markup, nothing the page's Content
 * Security Policy has to allow.
 */
export function QrCode({ text, label }: { readonly text: string; readonly label: string }) {
  const { size, path } = useMemo(() => qrPath(text), [text]);
  return (
    <svg
      className="qr"
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
