import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
const MAX_PAGES = 12;

async function openPdf(file) {
    const data = new Uint8Array(await file.arrayBuffer());
    return pdfjsLib.getDocument({ data }).promise;
}

// Digital PDFs already contain real text: reading it is exact and instant (no OCR needed).
export async function extractPdfTextLines(file) {
    const pdf = await openPdf(file);
    const lines = [];
    for (let p = 1; p <= Math.min(pdf.numPages, MAX_PAGES); p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const items = content.items
            .filter((i) => i.str && i.str.trim())
            .map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }))
            .sort((a, b) => b.y - a.y || a.x - b.x);

        let cur = [];
        let curY = null;
        const flush = () => {
            if (cur.length) {
                cur.sort((a, b) => a.x - b.x);
                lines.push({ text: cur.map((i) => i.s).join(' '), confidence: 100 });
            }
            cur = [];
        };
        for (const it of items) {
            if (curY === null || Math.abs(it.y - curY) > 3) {
                flush();
                curY = it.y;
            }
            cur.push(it);
        }
        flush();
    }
    return lines;
}

// Scanned PDFs: render each page to a canvas so it can be OCR'd.
export async function pdfToCanvases(file, scale = 2.5) {
    const pdf = await openPdf(file);
    const out = [];
    for (let p = 1; p <= Math.min(pdf.numPages, MAX_PAGES); p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; // PDFs can be transparent; OCR needs a white page
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        out.push(canvas);
    }
    return out;
}