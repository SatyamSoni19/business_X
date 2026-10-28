import { db } from './dexie';
import { newId } from '../lib/id';
import { canonicalKey } from '../parser/normalize';
import { restockItem, recordSale, createItemWithBatch } from './stockRepo';

/**
 * Removes only demo-tagged items, batches, and sales from the database.
 */
export async function removeDemoData() {
    await db.transaction('rw', db.items, db.batches, db.sales, async () => {
        // Collect demo item IDs (both tagged isDemo and canonical demo name)
        const demoItems = await db.items.filter(i => !!i.isDemo).toArray();
        const demoItemIds = new Set(demoItems.map(i => i.id));

        const canonicalDemo = await db.items.where('nameKey').equals(canonicalKey('Fortune Sunflower Oil 1L')).toArray();
        for (const i of canonicalDemo) {
            demoItemIds.add(i.id);
        }

        for (const itemId of demoItemIds) {
            await db.items.delete(itemId);
            await db.batches.where('itemId').equals(itemId).delete();
            await db.sales.where('itemId').equals(itemId).delete();
        }

        // Delete any remaining batches or sales explicitly tagged isDemo
        const demoBatches = await db.batches.filter(b => !!b.isDemo).toArray();
        for (const b of demoBatches) {
            await db.batches.delete(b.id);
        }

        const demoSales = await db.sales.filter(s => !!s.isDemo).toArray();
        for (const s of demoSales) {
            await db.sales.delete(s.id);
        }
    });
}

/**
 * Checks if demo data currently exists in the database.
 */
export async function hasDemoData() {
    const item = await db.items.filter(i => !!i.isDemo).first();
    if (item) return true;
    const sale = await db.sales.filter(s => !!s.isDemo).first();
    return !!sale;
}

/**
 * Seeds Sunil's oil demo (Fortune Sunflower Oil 1L) through the real repo functions.
 * Idempotent: removes any existing demo data before creating records so running twice does not create duplicates.
 */
export async function seedSunilOilDemo() {
    // Clean up any existing demo records to ensure idempotency
    await removeDemoData();

    const itemId = newId();
    const itemName = 'Fortune Sunflower Oil 1L';

    // 1 Oct: Initial stock — 20 @ ₹140, MRP 165, selling ₹160
    const oct1 = new Date(2026, 9, 1, 10, 0, 0).getTime(); // Oct 1, 2026

    const item = {
        id: itemId,
        name: itemName,
        nameKey: canonicalKey(itemName),
        type: 'packaged',
        unit: 'pcs',
        qty: 20,
        purchasePrice: 140,
        sellingPrice: 160,
        mrp: 165,
        taxRate: null,
        customId: null,
        sizes: [],
        createdAt: oct1,
        updatedAt: oct1,
        isDemo: true,
    };

    await db.transaction('rw', db.items, db.batches, async () => {
        await createItemWithBatch(item, db);
    });

    // 1–19 Oct: sell 14 @ ₹160 (1 sale per day for 14 days)
    for (let day = 1; day <= 14; day++) {
        const soldAt = new Date(2026, 9, day, 12, 0, 0).getTime();
        await recordSale({
            itemId,
            qty: 1,
            unitPrice: 160,
            soldAt,
            isDemo: true,
        });
    }

    // 20 Oct: restock 24 @ ₹152, MRP 175, selling price "Use new" = ₹170
    const oct20 = new Date(2026, 9, 20, 9, 0, 0).getTime();
    await restockItem({
        itemId,
        qty: 24,
        purchasePrice: 152,
        mrp: 175,
        sellingPrice: 170,
        receivedAt: oct20,
        isDemo: true,
    });

    // 21–31 Oct: sell 18 @ ₹170
    // Distribute 18 sales across Oct 21 to Oct 29 (2 per day)
    for (let i = 0; i < 18; i++) {
        const day = 21 + Math.floor(i / 2);
        const hour = (i % 2 === 0) ? 11 : 16;
        const soldAt = new Date(2026, 9, day, hour, 0, 0).getTime();
        await recordSale({
            itemId,
            qty: 1,
            unitPrice: 170,
            soldAt,
            isDemo: true,
        });
    }

    return { itemId, itemName };
}
