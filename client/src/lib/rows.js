import { newId } from './id';

export function newRow(over = {}) {
    return {
        id: newId(),
        name: '',
        type: 'packaged', // packaged | loose | sized
        unit: 'pcs',
        qty: null,
        purchasePrice: null,
        sellingPrice: null,
        mrp: null,
        taxRate: null,
        customId: '',
        sizes: [], // [{ size: '7', qty: 3 }]
        dupAction: 'skip', // what to do if the item already exists in stock: skip | add
        source: 'manual', // manual | ocr | csv
        confidence: null, // OCR line confidence 0-100
        verified: null, // true if qty × rate = amount matched on the bill
        rawLine: '', // original OCR text, shown as a tooltip
        ...over,
    };
}

export const sumSizes = (sizes = []) => sizes.reduce((s, x) => s + (Number(x.qty) || 0), 0);

export function mergeSizes(a = [], b = []) {
    const map = new Map(a.map((s) => [s.size, { ...s }]));
    for (const s of b) {
        const found = map.get(s.size);
        if (found) found.qty += s.qty;
        else map.set(s.size, { ...s });
    }
    return [...map.values()];
}