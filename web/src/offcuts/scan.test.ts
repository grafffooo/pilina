import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';

/** The label's QR code as camera-like pixels: 6 px per module, white quiet zone. */
function pixels(text: string) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const px = 6;
  const quiet = 4;
  const size = (n + 2 * quiet) * px;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.modules.data[y * n + x]) continue;
      for (let dy = 0; dy < px; dy++) {
        for (let dx = 0; dx < px; dx++) {
          const i = (((y + quiet) * px + dy) * size + (x + quiet) * px + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { data, size };
}

describe('scanning labels without a built-in reader', () => {
  it('reads the offcut ID from a label QR code', () => {
    const { data, size } = pixels('OC-0042');
    expect(jsQR(data, size, size, { inversionAttempts: 'dontInvert' })?.data).toBe('OC-0042');
  });
});
