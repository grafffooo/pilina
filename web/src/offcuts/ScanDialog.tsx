// Reading an offcut label with the phone's camera: the back camera's picture, searched for a
// QR code several times a second. Chrome's built-in reader is used where it exists; elsewhere
// (Safari) the jsQR library, loaded only when the scanner opens. The label's QR holds just
// the offcut ID, which goes into the library search.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isDesktopApp } from '../lib/platform';
import { CloseIcon } from '../ui/icons';
import ui from '../ui/ui.module.css';
import styles from './Offcuts.module.css';

type Reader = (video: HTMLVideoElement) => Promise<string | null>;

interface DetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorWindow = Window & {
  BarcodeDetector?: new (o: { formats: string[] }) => DetectorLike;
};

/** A camera is there to ask for (not in the Mac app, which has no camera permission). */
export function canScan(): boolean {
  return (
    !isDesktopApp() && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  );
}

async function makeReader(): Promise<Reader> {
  const Detector = (window as DetectorWindow).BarcodeDetector;
  if (Detector) {
    try {
      const d = new Detector({ formats: ['qr_code'] });
      return async (video) => (await d.detect(video))[0]?.rawValue ?? null;
    } catch {
      // Present but without QR support: fall through.
    }
  }
  const jsQR = (await import('jsqr')).default;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return async (video) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    // A smaller frame reads faster and a label fills much of it anyway.
    const scale = Math.min(1, 640 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

export function ScanDialog({
  onResult,
  onClose,
}: {
  onResult: (text: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef({ onResult, onClose });
  useEffect(() => {
    done.current = { onResult, onClose };
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done.current.onClose();
    document.addEventListener('keydown', onKey);

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (stopped) return;
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const read = await makeReader();
        const tick = async () => {
          if (stopped) return;
          const text = await read(v).catch(() => null);
          if (text && !stopped) {
            stopped = true;
            done.current.onResult(text.trim());
            return;
          }
          timer = setTimeout(() => void tick(), 150);
        };
        void tick();
      } catch (e) {
        const denied = e instanceof DOMException && e.name === 'NotAllowedError';
        setError(
          denied
            ? t('Pilina isn’t allowed to use the camera. Allow it in the browser’s settings.')
            : t('Couldn’t start the camera.'),
        );
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      document.removeEventListener('keydown', onKey);
    };
  }, [t]);

  return (
    <div
      className={styles.scanBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={t('Scan a label')}
    >
      <div className={styles.scanTop}>
        <span>{t('Point the camera at an offcut label')}</span>
        <button type="button" className={ui.iconButton} aria-label={t('Close')} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className={styles.scanView}>
        <video ref={video} className={styles.scanVideo} playsInline muted />
        <span className={styles.scanFrame} aria-hidden="true" />
        {error && <p className={styles.scanError}>{error}</p>}
      </div>
    </div>
  );
}
