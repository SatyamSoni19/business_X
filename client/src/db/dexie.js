import Dexie from 'dexie';
import { newId } from '../lib/id';

export const db = new Dexie('businessx');

db.version(1).stores({
    // only indexed fields are listed; other fields are stored as-is
    items: 'id, nameKey, customId, createdAt',
});

db.version(2).stores({
    items:   'id, nameKey, customId, createdAt',
    batches: 'id, itemId, receivedAt, [itemId+receivedAt]',
    sales:   'id, itemId, soldAt, type',
}).upgrade(async (tx) => {
    // Migrate existing items: create ONE batch per item from its current qty/purchasePrice/mrp.
    const items = await tx.table('items').toArray();
    const batchesToAdd = [];
    for (const item of items) {
        if (item.qty > 0) {
            batchesToAdd.push({
                id: newId(),
                itemId: item.id,
                receivedAt: item.createdAt || Date.now(),
                qtyIn: item.qty,
                qtyLeft: item.qty,
                purchasePrice: item.purchasePrice,
                mrp: item.mrp ?? null,
            });
        }
        // Add lastPurchasePrice field to existing items
        await tx.table('items').update(item.id, {
            lastPurchasePrice: item.purchasePrice,
        });
    }
    if (batchesToAdd.length) {
        await tx.table('batches').bulkAdd(batchesToAdd);
    }
});