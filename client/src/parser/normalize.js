const UNIT_MAP = {
    l: 'L', lt: 'L', ltr: 'L', ltrs: 'L', litre: 'L', litres: 'L', liter: 'L', liters: 'L',
    ml: 'ml',
    kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
    g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
    mg: 'mg',
};

const PACK_RE = /(\d+(?:\.\d+)?)\s*(ltrs?|litres?|liters?|lt|l|ml|kgs?|kilograms?|gms?|grams?|g|mg)\b/gi;

export function canonicalUnit(u) {
    return UNIT_MAP[String(u || '').toLowerCase().replace(/\./g, '')] || null;
}

// "1 LTR" -> "1L", "500 ML" -> "500ml", "100 gms" -> "100g"
export function normalizePackSizes(text) {
    return text.replace(PACK_RE, (_, n, u) => `${Number(n)}${UNIT_MAP[u.toLowerCase()]}`);
}

export function titleCase(s) {
    return s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

export function cleanName(raw) {
    let s = raw.replace(/[|\\_~*]+/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^[\-.,:;()\s]+|[\-.,:;(\s]+$/g, '');
    return normalizePackSizes(titleCase(s));
}

// Used to detect "same item". Different pack sizes stay different: "…oil 1l" ≠ "…oil 500ml".
export function canonicalKey(name = '') {
    return normalizePackSizes(name)
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, ' ')
        .trim();
}