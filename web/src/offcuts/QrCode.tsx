// QR code as one SVG path. The code only identifies the offcut (its ID as plain text).
import QRCode from 'qrcode';
import { useMemo } from 'react';

/** Quiet zone in modules (the spec asks for 4; 2 is plenty on a white label and saves space). */
const QUIET = 2;

export function qrPath(text: string): { path: string; size: number } {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  let path = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.data[y * n + x]) path += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
    }
  }
  return { path, size: n + 2 * QUIET };
}

/** `size` is any CSS length, e.g. "30mm" for print or "120px" on screen. */
export function QrCode({ text, size }: { text: string; size: string }) {
  const { path, size: n } = useMemo(() => qrPath(text), [text]);
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      style={{ width: size, height: size, display: 'block', flex: 'none' }}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code: ${text}`}
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
