// Loaded on demand (dynamic import) so pdf-lib and the fonts stay out of the startup bundle.
import regularUrl from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf?url';
import semiboldUrl from '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf?url';
import { inPrintLanguage } from '../i18n';
import { downloadBlob } from '../lib/download';
import { buildPdf, type PdfInput } from './buildPdf';
import { buildStoreSawPdf, type StoreSawPdfInput } from './storeSawPdf';

async function load(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the PDF font (${res.status})`);
  return res.arrayBuffer();
}

/** File name from the project name: "Skrinky do dielne" → "skrinky-do-dielne.pdf". */
export function pdfFileName(name: string, suffix = ''): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'cutting-plan'}${suffix}.pdf`;
}

/** The cutting plan as a PDF file, named after the project. */
export async function makePdf(input: PdfInput): Promise<File> {
  const [regular, semibold] = await Promise.all([load(regularUrl), load(semiboldUrl)]);
  // Scripts the PDF font can't draw get an English PDF (see pdfLanguage).
  const bytes = await inPrintLanguage(() => buildPdf(input, { regular, semibold }));
  return new File([bytes as BlobPart], pdfFileName(input.project.name), {
    type: 'application/pdf',
  });
}

export async function exportPdf(input: PdfInput): Promise<void> {
  const file = await makePdf(input);
  await downloadBlob(file, file.name, { name: 'PDF', extensions: ['pdf'] });
}

export async function exportStoreSawPdf(input: StoreSawPdfInput): Promise<void> {
  const [regular, semibold] = await Promise.all([load(regularUrl), load(semiboldUrl)]);
  const bytes = await inPrintLanguage(() => buildStoreSawPdf(input, { regular, semibold }));
  const file = new File([bytes as BlobPart], pdfFileName(input.project.name, '-store-saw'), {
    type: 'application/pdf',
  });
  await downloadBlob(file, file.name, { name: 'PDF', extensions: ['pdf'] });
}
