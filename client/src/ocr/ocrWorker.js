import { createWorker } from 'tesseract.js';

// Everything is loaded from OUR origin (/tesseract/*) – no CDN – so it works offline.
const base = () => `${window.location.origin}${import.meta.env.BASE_URL}tesseract`.replace(/\/+$/, '');

let workerPromise = null;
let listener = null;
export const setOcrListener = (fn) => {
    listener = fn;
};

export function getOcrWorker() {
    if (!workerPromise) {
        const b = base();
        workerPromise = createWorker('eng', 1, {
            workerPath: `${b}/worker.min.js`,
            corePath: b,
            langPath: b,
            gzip: true,
            logger: (m) => listener?.(m),
        })
            .then(async (w) => {
                // 6 = one uniform block of text, best for bill tables
                await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
                return w;
            })
            .catch((e) => {
                workerPromise = null;
                throw e;
            });
    }
    return workerPromise;
}

// Checks the offline OCR files are really being served (Vite returns index.html for missing files).
export async function checkOcrAssets() {
    const b = base();
    try {
        for (const f of ['worker.min.js', 'eng.traineddata.gz']) {
            const ctrl = new AbortController();
            const res = await fetch(`${b}/${f}`, { signal: ctrl.signal });
            const ct = res.headers.get('content-type') || '';
            ctrl.abort(); // we only need the headers
            if (!res.ok || ct.includes('text/html')) return false;
        }
        return true;
    } catch {
        return false;
    }
}