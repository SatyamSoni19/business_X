import { MEASURE_UNITS, NUM_TOKEN, SKIP_LINE, isHeaderLine } from './patterns';
import { canonicalUnit, cleanName } from './normalize';
import { newRow } from '../lib/rows';

function parseNum(tok) {
    let t = tok.trim().replace(/^[(\[{:;]+|[)\]}:;,.]+$/g, '').replace(/\/-$/, '');
    // OCR often reads 0 as O inside numbers
    if (/^[\dOo,.]+%?$/.test(t) && /\d/.test(t)) t = t.replace(/[Oo]/g, '0');
    if (!NUM_TOKEN.test(t)) return null;
    const value = parseFloat(t.replace(/[,%]/g, ''));
    return Number.isFinite(value) ? { value, pct: t.endsWith('%') } : null;
}

/**
 * One OCR line -> one item row.
 * Key idea: on a purchase bill, quantity × rate = amount. Finding that triple tells us which
 * numbers are qty / purchase rate, and ignores HSN codes, pack sizes and MRP.
 */
function parseLine(rawText, confidence = 100) {
    const text = rawText
        .replace(/[|_~]/g, ' ')
        .replace(/₹|\brs\.?(?=\s|\d)|\binr\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (text.length < 5) return {};
    if (SKIP_LINE.some((re) => re.test(text)) || isHeaderLine(text)) return {};

    let tokens = text.split(' ');
    // drop a leading serial number ("1 Fortune Oil …")
    if (tokens.length > 3 && /^\d{1,3}[.)]?$/.test(tokens[0]) && /^[A-Za-z(]/.test(tokens[1])) {
        tokens = tokens.slice(1);
    }

    const cands = [];
    tokens.forEach((tok, i) => {
        const p = parseNum(tok);
        if (!p) return;
        const next = (tokens[i + 1] || '').replace(/[.,]/g, '').toLowerCase();
        cands.push({
            i,
            tok,
            value: p.value,
            pct: p.pct,
            decimal: tok.includes('.'),
            // number directly followed by a measure unit: "1 L" (pack size) or "50 kg" (loose qty)
            measure: MEASURE_UNITS.has(next) ? canonicalUnit(next) : null,
        });
    });

    const nums = cands.filter((c) => !c.pct && c.value > 0);
    const pcts = cands.filter((c) => c.pct);
    const looksLikeItem = /\d/.test(text);
    if (nums.length === 0) return {};

    // 1) find qty × rate = amount (amount searched from the right)
    let found = null;
    outer: for (let a = nums.length - 1; a >= 2; a--) {
        for (let q = 0; q < a - 1; q++) {
            for (let r = q + 1; r < a; r++) {
                const amt = nums[a].value;
                if (Math.abs(nums[q].value * nums[r].value - amt) <= Math.max(1, amt * 0.02)) {
                    found = { q: nums[q], r: nums[r], a: nums[a] };
                    break outer;
                }
            }
        }
    }

    let qtyC;
    let rateC;
    let verified = true;

    if (found) {
        qtyC = found.q;
        rateC = found.r;
    } else {
        // 2) fallback guess, only if the line really looks like an item line
        const usable = nums.filter((n) => !(Number.isInteger(n.value) && /^\d{5,8}$/.test(n.tok)));
        if (usable.length < 2 || !(usable.some((n) => n.decimal) || usable.length >= 3)) {
            return { unread: looksLikeItem };
        }
        const nonMeasure = usable.filter((n) => !n.measure);
        const pool = nonMeasure.length >= 2 ? nonMeasure : usable;
        qtyC = pool[0];
        rateC = pool[1];
        verified = false;
    }

    // name = everything before the first numeric column (pack sizes like "1 L" stay in the name)
    const boundaries = nums.filter((n) => n.i >= 1 && (!n.measure || n === qtyC)).map((n) => n.i);
    if (!boundaries.length) return { unread: looksLikeItem };
    const name = cleanName(tokens.slice(0, Math.min(...boundaries)).join(' '));
    if (!/[A-Za-z]{2,}/.test(name)) return { unread: looksLikeItem };

    const loose = !!qtyC.measure;
    const rate = rateC.value;
    const used = new Set([qtyC, rateC, found?.a].filter(Boolean));

    // MRP = biggest leftover per-unit price between 1× and 3× the rate
    const mrpC = nums
        .filter((n) => !used.has(n) && !n.measure && !/^\d{5,8}$/.test(n.tok) && n.value >= rate && n.value <= rate * 3)
        .sort((x, y) => y.value - x.value)[0];

    // GST: an explicit "5%" wins, otherwise a leftover standard slab
    let tax = pcts.length ? pcts[0].value : null;
    if (tax == null) {
        const t = nums.find((n) => !used.has(n) && n !== mrpC && !n.measure && [5, 12, 18, 28].includes(n.value));
        if (t) tax = t.value;
    }
    if (tax != null && (tax < 0 || tax > 100)) tax = null;

    return {
        row: newRow({
            name,
            type: loose ? 'loose' : 'packaged',
            unit: loose ? qtyC.measure : 'pcs',
            qty: qtyC.value,
            purchasePrice: rate,
            mrp: loose ? null : mrpC?.value ?? null,
            taxRate: tax,
            source: 'ocr',
            confidence,
            verified,
            rawLine: rawText,
        }),
    };
}

export function parseBillLines(lines) {
    const rows = [];
    const skipped = [];
    for (const l of lines) {
        const res = parseLine(l.text, l.confidence);
        if (res.row) rows.push(res.row);
        else if (res.unread) skipped.push(l.text);
    }
    return { rows, skipped };
}