// Copies the OCR engine + language data into /public/tesseract so OCR works offline.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(root, 'node_modules');
const out = path.join(root, 'public', 'tesseract');
fs.mkdirSync(out, { recursive: true });

const walk = (dir) =>
    !fs.existsSync(dir)
        ? []
        : fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
        );

const copy = (src, name = path.basename(src)) => {
    fs.copyFileSync(src, path.join(out, name));
    console.log('  ✓', name, `(${(fs.statSync(src).size / 1048576).toFixed(1)} MB)`);
};

console.log('Preparing offline OCR assets…');

// 1) worker
const worker = path.join(nm, 'tesseract.js', 'dist', 'worker.min.js');
if (!fs.existsSync(worker)) {
    console.error('✗ tesseract.js not installed. Run: npm i tesseract.js');
    process.exit(1);
}
copy(worker);

// 2) core (we use the LSTM engine only, so skip the legacy variants to save space)
const coreDir = path.join(nm, 'tesseract.js-core');
const coreAll = fs.existsSync(coreDir)
    ? fs.readdirSync(coreDir).filter((f) => /^tesseract-core.*\.(js|wasm)$/.test(f))
    : [];
const core = coreAll.filter((f) => f.includes('lstm'));
(core.length ? core : coreAll).forEach((f) => copy(path.join(coreDir, f)));
if (!coreAll.length) console.error('✗ tesseract.js-core not found');

// 3) language data
for (const lang of ['eng', 'hin']) {
    const pkg = path.join(nm, '@tesseract.js-data', lang);
    const matches = walk(pkg)
        .filter((f) => f.endsWith(`${lang}.traineddata.gz`))
        .sort((a, b) => Number(b.includes('best_int')) - Number(a.includes('best_int')));
    if (matches.length) copy(matches[0], `${lang}.traineddata.gz`);
    else if (lang === 'eng') {
        console.error('✗ English language data missing. Run: npm i "@tesseract.js-data/eng"');
        process.exit(1);
    }
}
console.log('Done.');