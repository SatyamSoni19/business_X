import { canonicalKey } from './normalize';

// For every draft row: is it repeated in this list? does it already exist in stock? does its custom ID clash?
export function annotateRows(rows, existingItems) {
    const existingByKey = new Map(existingItems.map((i) => [i.nameKey, i]));
    const existingByCid = new Map(
        existingItems.filter((i) => i.customId).map((i) => [i.customId.toLowerCase(), i])
    );
    const seenKey = new Set();
    const seenCid = new Map();
    const out = {};

    for (const r of rows) {
        const key = canonicalKey(r.name);
        const cid = (r.customId || '').trim().toLowerCase();
        const info = { key, dupInBill: false, existing: null, customIdClash: null };

        if (key) {
            if (seenKey.has(key)) info.dupInBill = true;
            else seenKey.add(key);
            info.existing = existingByKey.get(key) || null;
        }

        if (cid) {
            const clash = existingByCid.get(cid);
            if (clash && clash.nameKey !== key) info.customIdClash = `ID already used by "${clash.name}"`;
            else if (seenCid.has(cid) && seenCid.get(cid) !== key) info.customIdClash = 'ID repeated in this list';
            else seenCid.set(cid, key);
        }
        out[r.id] = info;
    }
    return out;
}