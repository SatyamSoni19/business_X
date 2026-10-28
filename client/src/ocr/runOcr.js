import { getOcrWorker, setOcrListener } from './ocrWorker';
import { fileToCanvas, preprocessCanvas } from './preprocess';
import { extractPdfTextLines, pdfToCanvases } from './pdfToImages';

const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

// Tesseract's result shape differs a little between versions, so read it defensively.
function extractLines(data) {
    const out = [];
    const push = (l) => {
        const text = (l.text || '').replace(/\s+/g, ' ').trim();
        if (text) out.push({ text, confidence: Math.round(l.confidence ?? data.confidence ?? 0) });
    };
    if (Array.isArray(data.lines) && data.lines.length) data.lines.forEach(push);
    else if (Array.isArray(data.blocks))
        data.blocks.forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach(push)));
    else (data.text || '').split('\n').forEach((t) => push({ text: t }));
    return out;
}

async function ocrCanvas(canvas) {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(canvas);
    return extractLines(data);
}

/** files -> [{ text, confidence }] lines, all on-device. */
export async function scanFiles(files, { adaptive = false, onProgress } = {}) {
    const all = [];
    const n = files.length;
    const report = (pct, message) => onProgress?.({ pct: Math.min(99, Math.round(pct)), message });

    try {
        for (let fi = 0; fi < n; fi++) {
            const file = files[fi];
            const base = (fi / n) * 100;
            const span = 100 / n;
            const tag = n > 1 ? ` (file ${fi + 1} of ${n})` : '';

            setOcrListener((m) => {
                if (m.status === 'recognizing text') report(base + m.progress * span * 0.9, `Reading text${tag}`);
                else if (String(m.status).includes('loading') || String(m.status).includes('initializ'))
                    report(base, 'Starting offline OCR engine');
            });

            if (isPdf(file)) {
                report(base, `Reading PDF${tag}`);
                const textLines = await extractPdfTextLines(file).catch(() => []);
                if (textLines.length >= 5) {
                    all.push(...textLines);
                    continue;
                }
                const pages = await pdfToCanvases(file);
                for (const page of pages) all.push(...(await ocrCanvas(preprocessCanvas(page, { adaptive }))));
            } else {
                report(base, `Preparing image${tag}`);
                const canvas = preprocessCanvas(await fileToCanvas(file), { adaptive });
                all.push(...(await ocrCanvas(canvas)));
            }
        }
    } finally {
        setOcrListener(null);
    }
    return all;
}