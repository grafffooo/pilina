// Loaded on demand (dynamic import) so pdf-lib and the fonts stay out of the startup bundle.
import regularUrl from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf?url';
import semiboldUrl from '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf?url';
import { downloadBlob } from '../lib/download';
import { buildPdf, type PdfInput } from './buildPdf';

async function load(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the PDF font (${res.status})`);
  return res.arrayBuffer();
}

/** File name from the project name: "Skrinky do dielne" → "skrinky-do-dielne.pdf". */
export function pdfFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'cutting-plan'}.pdf`;
}

export async function exportPdf(input: PdfInput): Promise<void> {
  const [regular, semibold] = await Promise.all([load(regularUrl), load(semiboldUrl)]);
  const bytes = await buildPdf(input, { regular, semibold });
  await downloadBlob(
    new Blob([bytes as BlobPart], { type: 'application/pdf' }),
    pdfFileName(input.project.name),
    { name: 'PDF', extensions: ['pdf'] },
  );
}
