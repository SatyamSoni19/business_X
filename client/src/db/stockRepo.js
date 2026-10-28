import { db } from './dexie';
import { newId } from '../lib/id';
import { restockSchema, saleSchema, returnSchema } from '../schemas/stockSchemas';
import { mergeSizes } from '../lib/rows';

const EPS = 1e-9;

// ─── helpers ────────────────────────────────────────────────────────

/** Recalculate denormalised caches on an item from its batches. */
async function refreshItemCaches(tx, itemId) {
    const batches = await tx.table('batches')
        .where('itemId').equals(itemId)
        .sortBy('receivedAt');

    batches.sort((a, b) => (a.receivedAt - b.receivedAt) || ((a.createdAt || 0) - (b.createdAt || 0)));

    let totalQtyLeft = 0;
    let costOfOldest = null;
    let lastPrice = null;
    let latestMrp = null;
    let weightedCost = 0;

    for (const b of batches) {
        totalQtyLeft += b.qtyLeft;
        if (costOfOldest === null && b.qtyLeft > EPS) {
            costOfOldest = b.purchasePrice;
        }
        lastPrice = b.purchasePrice;
        if (b.mrp != null) {
            latestMrp = b.mrp;
        }
        weightedCost += b.qtyLeft * b.purchasePrice;
    }

    const avgCost = totalQtyLeft > EPS ? Math.round((weightedCost / totalQtyLeft) * 100) / 100 : (lastPrice ?? 0);

    await tx.table('items').update(itemId, {
        qty: Math.round(totalQtyLeft * 1000) / 1000,
        purchasePrice: costOfOldest ?? lastPrice ?? 0,
        lastPurchasePrice: lastPrice ?? 0,
        avgCost,
        mrp: latestMrp,
        updatedAt: Date.now(),
    });
}

// ─── restockItem ────────────────────────────────────────────────────

/**
 * Restock an existing item: creates a new batch, optionally updates selling price.
 * Must be called inside a Dexie rw transaction OR opens its own.
 */
export async function restockItem(params, tx = null) {
    const validated = restockSchema.parse(params);
    const {
        itemId,
        qty,
        purchasePrice,
        mrp = null,
        sellingPrice,
        sizes,
        receivedAt = Date.now(),
        isDemo,
    } = validated;

    async function doWork(t) {
        const item = await t.table('items').get(itemId);
        if (!item) throw new Error(`Item not found: ${itemId}`);

        // Ensure receivedAt is strictly after previous batches if timestamp was not explicitly provided
        let batchReceivedAt = receivedAt;
        if (!params.receivedAt) {
            const existingBatches = await t.table('batches').where('itemId').equals(itemId).toArray();
            if (existingBatches.length > 0) {
                const maxReceived = Math.max(...existingBatches.map(b => b.receivedAt));
                if (batchReceivedAt <= maxReceived) {
                    batchReceivedAt = maxReceived + 1;
                }
            }
        }

        const now = Date.now();
        const batch = {
            id: newId(),
            itemId,
            receivedAt: batchReceivedAt,
            createdAt: now,
            qtyIn: qty,
            qtyLeft: qty,
            purchasePrice,
            mrp: mrp ?? null,
            isDemo: isDemo !== undefined ? isDemo : (item.isDemo ?? false),
        };
        await t.table('batches').add(batch);

        // Update sizes if sized item
        if (item.type === 'sized' && sizes && sizes.length > 0) {
            const merged = mergeSizes(item.sizes, sizes);
            await t.table('items').update(itemId, { sizes: merged });
        }

        // Update selling price if provided
        if (sellingPrice !== undefined && sellingPrice !== null) {
            await t.table('items').update(itemId, { sellingPrice });
        }

        // Recalc caches (qty, purchasePrice=oldest batch cost, lastPurchasePrice, mrp=latest)
        await refreshItemCaches(t, itemId);

        return batch;
    }

    if (tx) {
        return doWork(tx);
    }
    return db.transaction('rw', db.items, db.batches, async () => {
        return doWork(db);
    });
}

// ─── createItemWithBatch ────────────────────────────────────────────

/**
 * Adds a brand-new item + its first batch in one go.
 * Called from saveDraftRows for new items.
 */
export async function createItemWithBatch(item, tx) {
    await tx.table('items').add(item);

    const now = Date.now();
    const batch = {
        id: newId(),
        itemId: item.id,
        receivedAt: item.createdAt || now,
        createdAt: item.createdAt || now,
        qtyIn: item.qty,
        qtyLeft: item.qty,
        purchasePrice: item.purchasePrice,
        mrp: item.mrp ?? null,
        isDemo: !!item.isDemo,
    };
    await tx.table('batches').add(batch);

    // set lastPurchasePrice and avgCost
    await tx.table('items').update(item.id, {
        lastPurchasePrice: item.purchasePrice,
        avgCost: item.purchasePrice,
    });
}

// ─── recordSale (FIFO) ─────────────────────────────────────────────

export async function recordSale(params) {
    const validated = saleSchema.parse(params);
    const { itemId, qty, unitPrice, size, soldAt = Date.now(), isDemo } = validated;

    if (!(qty > 0)) {
        throw new Error('Quantity must be greater than zero');
    }

    return db.transaction('rw', db.items, db.batches, db.sales, async () => {
        const item = await db.items.get(itemId);
        if (!item) throw new Error(`Item not found: ${itemId}`);

        if (item.type !== 'loose' && !Number.isInteger(qty)) {
            throw new Error('Quantity must be a whole number for packaged or sized items');
        }

        if (item.type === 'sized') {
            if (!size) {
                throw new Error('Please select a size for this item');
            }
            const sizeEntry = item.sizes?.find(s => s.size === size);
            const sizeAvailable = sizeEntry?.qty ?? 0;
            if (qty - sizeAvailable > EPS) {
                throw new Error(`Not enough stock in size "${size}". Available: ${sizeAvailable}, requested: ${qty}`);
            }
        }

        if (qty - item.qty > EPS) {
            throw new Error(`Not enough stock. Available: ${item.qty}, requested: ${qty}`);
        }

        // Walk batches FIFO (oldest first)
        const batches = await db.batches
            .where('itemId').equals(itemId)
            .sortBy('receivedAt');
        batches.sort((a, b) => (a.receivedAt - b.receivedAt) || ((a.createdAt || 0) - (b.createdAt || 0)));

        let remaining = qty;
        const allocations = [];

        for (const b of batches) {
            if (remaining <= EPS) break;
            if (b.qtyLeft <= EPS) continue;

            const take = Math.min(b.qtyLeft, remaining);
            allocations.push({ batchId: b.id, qty: take, unitCost: b.purchasePrice });
            b.qtyLeft -= take;
            remaining -= take;
            await db.batches.update(b.id, { qtyLeft: b.qtyLeft });
        }

        if (remaining > EPS) {
            throw new Error('FIFO error: could not fully allocate from batches');
        }

        const revenue = Math.round(qty * unitPrice * 100) / 100;
        const cogs = Math.round(allocations.reduce((s, a) => s + a.qty * a.unitCost, 0) * 100) / 100;
        const profit = Math.round((revenue - cogs) * 100) / 100;

        const sale = {
            id: newId(),
            itemId,
            itemName: item.name,
            type: 'sale',
            qty,
            unitPrice,
            revenue,
            cogs,
            profit,
            allocations,
            sizeKey: size || null,
            soldAt,
            refSaleId: null,
            isDemo: isDemo !== undefined ? isDemo : (item.isDemo ?? false),
        };
        await db.sales.add(sale);

        // Update sized item sizes
        if (item.type === 'sized' && size) {
            const updatedSizes = item.sizes.map(s =>
                s.size === size ? { ...s, qty: s.qty - qty } : s
            );
            await db.items.update(itemId, { sizes: updatedSizes });
        }

        // Refresh item caches
        await refreshItemCaches(db, itemId);

        return sale;
    });
}

// ─── recordReturn ───────────────────────────────────────────────────

export async function recordReturn(params) {
    const validated = returnSchema.parse(params);
    const { saleId, qty, isDemo } = validated;

    if (!(qty > 0)) {
        throw new Error('Return quantity must be greater than zero');
    }

    return db.transaction('rw', db.items, db.batches, db.sales, async () => {
        const sale = await db.sales.get(saleId);
        if (!sale) throw new Error(`Sale not found: ${saleId}`);
        if (sale.type !== 'sale') throw new Error('Can only return against a sale');

        const item = await db.items.get(sale.itemId);
        if (item && item.type !== 'loose' && !Number.isInteger(qty)) {
            throw new Error('Quantity must be a whole number for packaged or sized items');
        }

        // How much has already been returned against this sale?
        const existingReturns = await db.sales
            .where('itemId').equals(sale.itemId)
            .filter(s => s.type === 'return' && s.refSaleId === saleId)
            .toArray();
        const alreadyReturned = existingReturns.reduce((s, r) => s + r.qty, 0);
        const maxReturnable = sale.qty - alreadyReturned;

        if (qty - maxReturnable > EPS) {
            throw new Error(`Cannot return ${qty}. Max returnable: ${maxReturnable}`);
        }

        // Reverse allocations from the sale, in REVERSE order (LIFO within the sale's allocs)
        // so we put back the newest-consumed first
        const reversedAllocs = [...sale.allocations].reverse();
        let remaining = qty;
        const returnAllocations = [];

        for (const alloc of reversedAllocs) {
            if (remaining <= EPS) break;
            const take = Math.min(alloc.qty, remaining);
            returnAllocations.push({ batchId: alloc.batchId, qty: take, unitCost: alloc.unitCost });

            const batch = await db.batches.get(alloc.batchId);
            if (batch) {
                await db.batches.update(alloc.batchId, { qtyLeft: batch.qtyLeft + take });
            }
            remaining -= take;
        }

        const revenue = -Math.round(qty * sale.unitPrice * 100) / 100;
        const cogs = -Math.round(returnAllocations.reduce((s, a) => s + a.qty * a.unitCost, 0) * 100) / 100;
        const profit = Math.round((revenue - cogs) * 100) / 100;

        const returnRecord = {
            id: newId(),
            itemId: sale.itemId,
            itemName: sale.itemName,
            type: 'return',
            qty,
            unitPrice: sale.unitPrice,
            revenue,
            cogs,
            profit,
            allocations: returnAllocations,
            sizeKey: sale.sizeKey,
            soldAt: Date.now(),
            refSaleId: saleId,
            isDemo: isDemo !== undefined ? isDemo : (sale.isDemo ?? false),
        };
        await db.sales.add(returnRecord);

        // Update sized item sizes (restore)
        if (item && item.type === 'sized' && sale.sizeKey) {
            const updatedSizes = item.sizes.map(s =>
                s.size === sale.sizeKey ? { ...s, qty: s.qty + qty } : s
            );
            await db.items.update(sale.itemId, { sizes: updatedSizes });
        }

        // Refresh item caches
        await refreshItemCaches(db, sale.itemId);

        return returnRecord;
    });
}

// ─── helpers for stock value ────────────────────────────────────────

/** Real FIFO stock value = sum of (qtyLeft × purchasePrice) across all batches of an item. */
export async function getStockValueForItem(itemId) {
    const batches = await db.batches.where('itemId').equals(itemId).toArray();
    return batches.reduce((s, b) => s + b.qtyLeft * b.purchasePrice, 0);
}

/** Total stock value across all items. */
export async function getTotalStockValue() {
    const batches = await db.batches.toArray();
    return Math.round(batches.reduce((s, b) => s + b.qtyLeft * b.purchasePrice, 0) * 100) / 100;
}

/** Update only the selling price of an item. No batch created, past sales untouched. */
export async function editSellingPrice(itemId, newSellingPrice) {
    if (!(newSellingPrice > 0)) throw new Error('Selling price must be positive');
    await db.items.update(itemId, { sellingPrice: newSellingPrice, updatedAt: Date.now() });
}

/** Get batches for an item, sorted oldest first. */
export async function getBatchesForItem(itemId) {
    const batches = await db.batches.where('itemId').equals(itemId).sortBy('receivedAt');
    batches.sort((a, b) => (a.receivedAt - b.receivedAt) || ((a.createdAt || 0) - (b.createdAt || 0)));
    return batches;
}
