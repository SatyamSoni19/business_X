const MAX_SIDE = 2800;
const MIN_SIDE = 1800;

async function loadBitmap(file) {
    if ('createImageBitmap' in window) {
        try {
            // 'from-image' applies the phone's EXIF rotation so the bill is upright
            return await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch {
            /* fall through */
        }
    }
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => reject(new Error('Could not open this image'));
        img.src = url;
    });
}

// Image file -> canvas, resized to a size OCR likes (not too small, not huge).
export async function fileToCanvas(file) {
    const src = await loadBitmap(file);
    const w0 = src.width || src.naturalWidth;
    const h0 = src.height || src.naturalHeight;
    const long = Math.max(w0, h0);
    let scale = 1;
    if (long > MAX_SIDE) scale = MAX_SIDE / long;
    else if (long < MIN_SIDE) scale = Math.min(2.5, MIN_SIDE / long);

    const c = document.createElement('canvas');
    c.width = Math.round(w0 * scale);
    c.height = Math.round(h0 * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    src.close?.();
    return c;
}

function adaptiveThreshold(gray, w, h, win, c) {
    const W = w + 1;
    const integral = new Uint32Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
            row += gray[y * w + x];
            integral[(y + 1) * W + (x + 1)] = integral[y * W + (x + 1)] + row;
        }
    }
    const out = new Uint8Array(w * h);
    const half = win >> 1;
    for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - half);
        const y1 = Math.min(h - 1, y + half);
        for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - half);
            const x1 = Math.min(w - 1, x + half);
            const area = (x1 - x0 + 1) * (y1 - y0 + 1);
            const sum =
                integral[(y1 + 1) * W + (x1 + 1)] - integral[y0 * W + (x1 + 1)] - integral[(y1 + 1) * W + x0] + integral[y0 * W + x0];
            out[y * w + x] = gray[y * w + x] < sum / area - c ? 0 : 255;
        }
    }
    return out;
}

/**
 * Grayscale + contrast stretch (always).
 * adaptive=true additionally removes shadows/uneven light with a local threshold.
 */
export function preprocessCanvas(canvas, { adaptive = false } = {}) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    const gray = new Uint8Array(w * h);
    const hist = new Uint32Array(256);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        gray[p] = g;
        hist[g]++;
    }

    const total = w * h;
    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let v = 0; v < 256; v++) {
        acc += hist[v];
        if (acc >= total * 0.01) {
            lo = v;
            break;
        }
    }
    acc = 0;
    for (let v = 255; v >= 0; v--) {
        acc += hist[v];
        if (acc >= total * 0.01) {
            hi = v;
            break;
        }
    }
    if (hi - lo < 30) {
        lo = 0;
        hi = 255;
    }
    const k = 255 / (hi - lo);
    for (let p = 0; p < gray.length; p++) {
        gray[p] = Math.max(0, Math.min(255, (gray[p] - lo) * k));
    }

    const result = adaptive ? adaptiveThreshold(gray, w, h, Math.max(25, (Math.min(w, h) / 16) | 0), 12) : gray;

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const v = result[p];
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}