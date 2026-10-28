import { db } from './dexie';
import { itemSchema } from '../schemas/itemSchema';
import { canonicalKey } from '../parser/normalize';
import { mergeSizes, sumSizes } from '../lib/rows';
import { restockItem, createItemWithBatch } from './stockRepo';

function toItem(r) {
    const candidate = {
        name: (r.name || '').trim(),
        type: r.type,
        unit: r.unit,
        qty: r.type === 'sized' ? sumSizes(r.sizes) : r.qty,
        purchasePrice: r.purchasePrice,
        sellingPrice: r.sellingPrice,
        mrp: r.type === 'loose' ? null : r.mrp ?? null,
        taxRate: r.taxRate ?? null,
        customId: r.customId?.trim() || null,
        sizes: r.type === 'sized' ? r.sizes : [],
    };
    const parsed = itemSchema.parse(candidate); // throws on bad data
    return { ...parsed, nameKey: canonicalKey(parsed.name) };
}

/**
 * Saves all reviewed rows in ONE transaction (all or nothing).
 * Existing items are either skipped or restocked (new batch).
 * NEW items create the item plus its first batch.
 *
 * Returns { added, merged, skipped, restockInfo[] } where restockInfo
 * contains details needed for the restock price dialog.
 */
export async function saveDraftRows(rows) {
    const now = Date.now();
    const result = { added: 0, merged: 0, skipped: 0, restockInfo: [] };

    await db.transaction('rw', db.items, db.batches, async () => {
        const existing = await db.items.toArray();
        const byKey = new Map(existing.map((i) => [i.nameKey, i]));
        const pendingIds = new Set();
        const toAdd = [];

        for (const r of rows) {
            const clean = toItem(r);
            const found = byKey.get(clean.nameKey);

            if (found) {
                if (r.dupAction !== 'add') {
                    result.skipped++;
                    continue;
                }

                // Gather info for the restock price dialog BEFORE restocking
                const oldItem = { ...found };

                // Restock via stockRepo: new batch with the row's purchasePrice and mrp
                await restockItem({
                    itemId: found.id,
                    qty: clean.qty,
                    purchasePrice: clean.purchasePrice,
                    mrp: clean.mrp,
                    sellingPrice: r._resolvedSellingPrice ?? undefined,
                    sizes: clean.type === 'sized' ? clean.sizes : undefined,
                    receivedAt: now,
                }, db);

                // Collect restockInfo for any item where price changed
                const priceChanged = clean.purchasePrice !== oldItem.purchasePrice;
                const mrpChanged = (clean.mrp ?? null) !== (oldItem.mrp ?? null);
                const sellingChanged = r._resolvedSellingPrice != null && r._resolvedSellingPrice !== oldItem.sellingPrice;

                if (priceChanged || mrpChanged || sellingChanged) {
                    result.restockInfo.push({
                        itemId: found.id,
                        itemName: found.name,
                        itemType: found.type,
                        oldPurchasePrice: oldItem.purchasePrice,
                        oldSellingPrice: oldItem.sellingPrice,
                        oldMrp: oldItem.mrp,
                        oldQty: oldItem.qty,
                        newPurchasePrice: clean.purchasePrice,
                        newSellingPrice: clean.sellingPrice,
                        newMrp: clean.mrp,
                        newQty: clean.qty,
                    });
                }

                // Refresh found so later rows that match see updated qty
                const updated = await db.items.get(found.id);
                if (updated) {
                    byKey.set(clean.nameKey, updated);
                }

                result.merged++;
                continue;
            }

            const item = { ...clean, id: r.id, createdAt: now, updatedAt: now };
            toAdd.push(item);
            pendingIds.add(item.id);
            byKey.set(item.nameKey, item);
            result.added++;
        }

        // Create new items with their first batch
        for (const item of toAdd) {
            await createItemWithBatch(item, db);
        }
    });

    return result;
}
