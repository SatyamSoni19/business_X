export const NUM_TOKEN = /^-?\d[\d,]*(\.\d+)?%?$/;

export const MEASURE_UNITS = new Set([
    'kg', 'kgs', 'g', 'gm', 'gms', 'gram', 'grams',
    'l', 'lt', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters', 'ml',
]);

// Lines that are never items (headers, totals, tax summaries, addresses…)
export const SKIP_LINE = [
    /\b(gstin|gst\s*no|tax\s*invoice|invoice|bill\s*(no|date)|cash\s*memo|dl\s*no|fssai|pan\s*no)\b/i,
    /^\s*(sub\s*)?total\b/i,
    /\bgrand\s*total\b/i,
    /\bround(ing)?\s*off\b/i,
    /\b(cgst|sgst|igst)\b/i,
    /\bamount\s*in\s*words\b/i,
    /\b(thank\s*you|terms|conditions|signature|authori[sz]ed|ifsc|bank|subject\s*to)\b/i,
    /\b(phone|mobile|mob|tel|email|e-mail|www)\b[:.\s]/i,
    /\b(date|dated)\s*[:\-]/i,
];

// A column-header line mentions several of these words together.
export function isHeaderLine(text) {
    const hits =
        text.toLowerCase().match(/\b(qty|quantity|rate|amount|amt|mrp|hsn|description|particulars|item|price|gst|disc|unit|sr)\b/g) ||
        [];
    return new Set(hits).size >= 3;
}