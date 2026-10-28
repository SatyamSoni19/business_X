import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../dexie';
import { saveDraftRows } from '../itemsRepo';
import {
    restockItem,
    recordSale,
    recordReturn,
    getBatchesForItem,
    createItemWithBatch,
    getTotalStockValue,
} from '../stockRepo';
import { seedSunilOilDemo, removeDemoData } from '../seedDemo';
import { newId } from '../../lib/id';
import { canonicalKey } from '../../parser/normalize';

// Reset database before each test
beforeEach(async () => {
    await db.delete();
    await db.open();
});

// Helper: create a packaged item directly
async function createTestItem({ name, qty, purchasePrice, sellingPrice, mrp, createdAt, type = 'packaged', unit = 'pcs', sizes = [] }) {
    const id = newId();
    const item = {
        id,
        name,
        nameKey: canonicalKey(name),
        type,
        unit,
        qty,
        purchasePrice,
        sellingPrice,
        mrp: mrp ?? null,
        taxRate: null,
        customId: null,
        sizes,
        lastPurchasePrice: purchasePrice,
        avgCost: purchasePrice,
        createdAt: createdAt || Date.now(),
        updatedAt: createdAt || Date.now(),
    };

    await db.transaction('rw', db.items, db.batches, async () => {
        await createItemWithBatch(item, db);
    });

    return id;
}

describe("Sunil's oil scenario — Fortune Sunflower Oil 1L", () => {
    let itemId;
    const oct1 = new Date(2026, 9, 1, 10, 0, 0).getTime();

    beforeEach(async () => {
        // 1 Oct: restock 20 @ ₹140, MRP 165, selling ₹160
        itemId = await createTestItem({
            name: 'Fortune Sunflower Oil 1L',
            qty: 20,
            purchasePrice: 140,
            sellingPrice: 160,
            mrp: 165,
            createdAt: oct1,
        });
    });

    it('initial state: 20 bottles at ₹140, selling ₹160', async () => {
        const item = await db.items.get(itemId);
        expect(item.qty).toBe(20);
        expect(item.purchasePrice).toBe(140);
        expect(item.sellingPrice).toBe(160);
        expect(item.mrp).toBe(165);

        const batches = await getBatchesForItem(itemId);
        expect(batches).toHaveLength(1);
        expect(batches[0].qtyLeft).toBe(20);
        expect(batches[0].purchasePrice).toBe(140);
    });

    it('1–19 Oct: sell 14 @ ₹160 → profit ₹280', async () => {
        let totalProfit = 0;

        for (let day = 1; day <= 14; day++) {
            const soldAt = new Date(2026, 9, day, 12, 0, 0).getTime();
            const sale = await recordSale({
                itemId,
                qty: 1,
                unitPrice: 160,
                soldAt,
            });
            expect(sale.profit).toBe(20); // 160 - 140 = 20 per bottle
            totalProfit += sale.profit;
        }

        expect(totalProfit).toBe(280);

        const item = await db.items.get(itemId);
        expect(item.qty).toBe(6);
    });

    it('full October scenario: profit = ₹676, revenue = ₹5,300, COGS = ₹4,624', async () => {
        // Sell 14 @ ₹160 (Oct 1–19)
        for (let day = 1; day <= 14; day++) {
            const soldAt = new Date(2026, 9, day, 12, 0, 0).getTime();
            await recordSale({ itemId, qty: 1, unitPrice: 160, soldAt });
        }

        let item = await db.items.get(itemId);
        expect(item.qty).toBe(6);

        // 20 Oct: restock 24 @ ₹152, MRP 175, selling ₹170
        const oct20 = new Date(2026, 9, 20, 9, 0, 0).getTime();
        await restockItem({
            itemId,
            qty: 24,
            purchasePrice: 152,
            mrp: 175,
            sellingPrice: 170,
            receivedAt: oct20,
        });

        item = await db.items.get(itemId);
        expect(item.qty).toBe(30); // 6 + 24
        expect(item.sellingPrice).toBe(170);
        expect(item.mrp).toBe(175);
        expect(item.purchasePrice).toBe(140); // 6 left from batch 1
        expect(item.lastPurchasePrice).toBe(152);

        const batches = await getBatchesForItem(itemId);
        expect(batches).toHaveLength(2);
        expect(batches[0].qtyLeft).toBe(6);
        expect(batches[0].purchasePrice).toBe(140);
        expect(batches[1].qtyLeft).toBe(24);
        expect(batches[1].purchasePrice).toBe(152);

        // 21–31 Oct: sell 18 @ ₹170
        let secondPhaseProfit = 0;
        for (let i = 0; i < 18; i++) {
            const day = 21 + Math.floor(i / 2);
            const hour = (i % 2 === 0) ? 11 : 16;
            const soldAt = new Date(2026, 9, day, hour, 0, 0).getTime();
            const sale = await recordSale({ itemId, qty: 1, unitPrice: 170, soldAt });
            secondPhaseProfit += sale.profit;
        }

        // First 6 consume the ₹140 batch: profit = 170 - 140 = 30 each = ₹180
        // Next 12 consume the ₹152 batch: profit = 170 - 152 = 18 each = ₹216
        // Total second phase = 180 + 216 = ₹396
        expect(secondPhaseProfit).toBe(396);

        // Total October: 280 (first phase) + 396 (second phase) = ₹676
        const allSales = await db.sales.where('itemId').equals(itemId).toArray();
        expect(allSales).toHaveLength(32);
        const totalProfit = allSales.reduce((s, sale) => s + sale.profit, 0);
        expect(totalProfit).toBe(676);

        // Revenue check: 14 × 160 + 18 × 170 = 2240 + 3060 = 5300
        const totalRevenue = allSales.reduce((s, sale) => s + sale.revenue, 0);
        expect(totalRevenue).toBe(5300);

        // COGS check: 5300 - 676 = 4624
        const totalCogs = allSales.reduce((s, sale) => s + sale.cogs, 0);
        expect(totalCogs).toBe(4624);

        // Remaining stock: 12 bottles, all from ₹152 batch
        item = await db.items.get(itemId);
        expect(item.qty).toBe(12);

        // Cost price of stock: 12 × 152 = ₹1824
        const finalBatches = await getBatchesForItem(itemId);
        const stockCostValue = finalBatches.reduce((s, b) => s + b.qtyLeft * b.purchasePrice, 0);
        expect(stockCostValue).toBe(1824);

        // Selling price of stock: 12 × 170 = ₹2040
        expect(item.qty * item.sellingPrice).toBe(2040);

        // Next sale costs ₹152, selling price ₹170, MRP ₹175, profit on next sale ₹18
        expect(item.purchasePrice).toBe(152);
        expect(item.sellingPrice).toBe(170);
        expect(item.mrp).toBe(175);
        expect(item.sellingPrice - item.purchasePrice).toBe(18);
    });

    it('seedSunilOilDemo produces exact section 6 numbers through real repo functions', async () => {
        // Clear anything from beforeEach
        await db.items.clear();
        await db.batches.clear();
        await db.sales.clear();

        const { itemId: demoId } = await seedSunilOilDemo();
        const item = await db.items.get(demoId);

        // Expected stock: 12 bottles, cost price of stock ₹1,824, selling price of stock ₹2,040
        expect(item.qty).toBe(12);
        expect(item.purchasePrice).toBe(152); // "Next sale costs ₹152"
        expect(item.sellingPrice).toBe(170);
        expect(item.mrp).toBe(175);
        expect(item.sellingPrice - item.purchasePrice).toBe(18); // "Profit on next sale ₹18"

        const batches = await getBatchesForItem(demoId);
        const stockCostValue = batches.reduce((s, b) => s + b.qtyLeft * b.purchasePrice, 0);
        expect(stockCostValue).toBe(1824);
        expect(item.qty * item.sellingPrice).toBe(2040);

        // Expected report for October: units sold 32, revenue ₹5,300, cost ₹4,624, profit ₹676
        const sales = await db.sales.where('itemId').equals(demoId).toArray();
        expect(sales).toHaveLength(32);
        const totalRevenue = sales.reduce((s, x) => s + x.revenue, 0);
        const totalCogs = sales.reduce((s, x) => s + x.cogs, 0);
        const totalProfit = sales.reduce((s, x) => s + x.profit, 0);

        expect(totalRevenue).toBe(5300);
        expect(totalCogs).toBe(4624);
        expect(totalProfit).toBe(676);
    });

    it('running the demo button twice is idempotent and does NOT create duplicates', async () => {
        await db.items.clear();
        await db.batches.clear();
        await db.sales.clear();

        // Run once
        await seedSunilOilDemo();
        let items = await db.items.toArray();
        let batches = await db.batches.toArray();
        let sales = await db.sales.toArray();
        expect(items).toHaveLength(1);
        expect(batches).toHaveLength(2);
        expect(sales).toHaveLength(32);

        // Run second time
        await seedSunilOilDemo();
        items = await db.items.toArray();
        batches = await db.batches.toArray();
        sales = await db.sales.toArray();
        expect(items).toHaveLength(1);
        expect(batches).toHaveLength(2);
        expect(sales).toHaveLength(32);
    });

    it('removeDemoData cleanly deletes only demo items, batches, and sales', async () => {
        await db.items.clear();
        await db.batches.clear();
        await db.sales.clear();

        // Add a non-demo item
        const nonDemoId = await createTestItem({
            name: 'Regular Store Item',
            qty: 5,
            purchasePrice: 50,
            sellingPrice: 70,
        });

        // Seed demo
        await seedSunilOilDemo();

        let items = await db.items.toArray();
        expect(items).toHaveLength(2);

        // Remove demo data
        await removeDemoData();

        items = await db.items.toArray();
        expect(items).toHaveLength(1);
        expect(items[0].id).toBe(nonDemoId);

        const batches = await db.batches.toArray();
        expect(batches).toHaveLength(1);
        expect(batches[0].itemId).toBe(nonDemoId);

        const sales = await db.sales.toArray();
        expect(sales).toHaveLength(0);
    });

    it('return of 1 bottle restores it to its original batch and reverses profit', async () => {
        // Sell 1 @ ₹160 → profit = 20
        const sale = await recordSale({
            itemId,
            qty: 1,
            unitPrice: 160,
            soldAt: new Date(2026, 9, 5, 12, 0, 0).getTime(),
        });
        expect(sale.profit).toBe(20);

        let item = await db.items.get(itemId);
        expect(item.qty).toBe(19);

        // Return 1
        const ret = await recordReturn({ saleId: sale.id, qty: 1 });
        expect(ret.type).toBe('return');
        expect(ret.profit).toBe(-20);
        expect(ret.revenue).toBe(-160);
        expect(ret.cogs).toBe(-140);

        // Item qty restored
        item = await db.items.get(itemId);
        expect(item.qty).toBe(20);

        // Batch qtyLeft restored
        const batches = await getBatchesForItem(itemId);
        expect(batches[0].qtyLeft).toBe(20);
    });

    it('cannot return more than sold minus already returned', async () => {
        const sale = await recordSale({
            itemId,
            qty: 2,
            unitPrice: 160,
            soldAt: new Date(2026, 9, 5, 12, 0, 0).getTime(),
        });

        // Return 1
        await recordReturn({ saleId: sale.id, qty: 1 });

        // Return 1 more should work
        await recordReturn({ saleId: sale.id, qty: 1 });

        // Return another should fail
        await expect(recordReturn({ saleId: sale.id, qty: 1 })).rejects.toThrow();
    });
});

describe('Edge cases', () => {
    it('restock after qty reached 0: new batch works correctly', async () => {
        const itemId = await createTestItem({
            name: 'Test Item Zero Stock',
            qty: 5,
            purchasePrice: 100,
            sellingPrice: 120,
            mrp: 130,
        });

        // Sell all 5
        for (let i = 0; i < 5; i++) {
            await recordSale({ itemId, qty: 1, unitPrice: 120, soldAt: Date.now() + i });
        }

        let item = await db.items.get(itemId);
        expect(item.qty).toBe(0);

        // Restock with new price
        await restockItem({
            itemId,
            qty: 10,
            purchasePrice: 110,
            mrp: 140,
            sellingPrice: 130,
        });

        item = await db.items.get(itemId);
        expect(item.qty).toBe(10);
        expect(item.purchasePrice).toBe(110);
        expect(item.sellingPrice).toBe(130);
        expect(item.mrp).toBe(140);

        // Sell 1 → profit = 130 - 110 = 20
        const sale = await recordSale({ itemId, qty: 1, unitPrice: 130, soldAt: Date.now() });
        expect(sale.profit).toBe(20);
    });

    it('lower-price restock: old units keep their higher cost', async () => {
        const itemId = await createTestItem({
            name: 'Test Item Lower Price',
            qty: 10,
            purchasePrice: 200,
            sellingPrice: 250,
            mrp: 260,
        });

        // Restock at LOWER price
        await restockItem({
            itemId,
            qty: 10,
            purchasePrice: 180,
            mrp: 250,
        });

        // First sale comes from the ₹200 batch (FIFO)
        const sale1 = await recordSale({ itemId, qty: 1, unitPrice: 250, soldAt: Date.now() });
        expect(sale1.cogs).toBe(200);
        expect(sale1.profit).toBe(50);

        // After selling remaining 9 from old batch, next comes from ₹180 batch
        for (let i = 0; i < 9; i++) {
            await recordSale({ itemId, qty: 1, unitPrice: 250, soldAt: Date.now() + i + 1 });
        }

        const sale11 = await recordSale({ itemId, qty: 1, unitPrice: 250, soldAt: Date.now() + 100 });
        expect(sale11.cogs).toBe(180);
        expect(sale11.profit).toBe(70);
    });

    it('same-price restock creates a new batch without dialog', async () => {
        const itemId = await createTestItem({
            name: 'Test Same Price',
            qty: 10,
            purchasePrice: 100,
            sellingPrice: 120,
            mrp: 130,
        });

        await restockItem({
            itemId,
            qty: 5,
            purchasePrice: 100,
            mrp: 130,
        });

        const batches = await getBatchesForItem(itemId);
        expect(batches).toHaveLength(2);
        expect(batches[0].qtyLeft).toBe(10);
        expect(batches[1].qtyLeft).toBe(5);

        const item = await db.items.get(itemId);
        expect(item.qty).toBe(15);
    });

    it('sale spanning multiple batches allocates correctly', async () => {
        const itemId = await createTestItem({
            name: 'Multi-batch sale test',
            qty: 3,
            purchasePrice: 100,
            sellingPrice: 150,
        });

        await restockItem({
            itemId,
            qty: 5,
            purchasePrice: 120,
        });

        // Sell 5: should take 3 from batch 1 (₹100) and 2 from batch 2 (₹120)
        const sale = await recordSale({ itemId, qty: 5, unitPrice: 150, soldAt: Date.now() });
        expect(sale.cogs).toBe(3 * 100 + 2 * 120); // 300 + 240 = 540
        expect(sale.profit).toBe(5 * 150 - 540); // 750 - 540 = 210
        expect(sale.allocations).toHaveLength(2);
    });

    it('selling more than stock is rejected', async () => {
        const itemId = await createTestItem({
            name: 'Stock Limit Test',
            qty: 5,
            purchasePrice: 100,
            sellingPrice: 120,
        });

        await expect(recordSale({ itemId, qty: 6, unitPrice: 120 })).rejects.toThrow(/not enough stock/i);
    });

    it('rejects non-integer quantity for packaged and sized items', async () => {
        const packagedId = await createTestItem({
            name: 'Packaged Biscuits',
            qty: 10,
            purchasePrice: 10,
            sellingPrice: 15,
            type: 'packaged',
        });

        await expect(recordSale({ itemId: packagedId, qty: 2.5, unitPrice: 15 })).rejects.toThrow(/whole number/i);
    });

    it('allows decimal quantities for loose items', async () => {
        const looseId = await createTestItem({
            name: 'Loose Rice',
            qty: 50.5,
            purchasePrice: 40,
            sellingPrice: 50,
            type: 'loose',
            unit: 'kg',
        });

        const sale = await recordSale({ itemId: looseId, qty: 2.5, unitPrice: 50 });
        expect(sale.qty).toBe(2.5);
        expect(sale.revenue).toBe(125);
        expect(sale.cogs).toBe(100);

        const item = await db.items.get(looseId);
        expect(item.qty).toBe(48);
    });

    it('sized items reduce specific size and reject if not enough stock in that size', async () => {
        const sizedId = await createTestItem({
            name: 'Cotton Shirt',
            qty: 5,
            purchasePrice: 300,
            sellingPrice: 500,
            type: 'sized',
            unit: 'pcs',
            sizes: [{ size: 'M', qty: 3 }, { size: 'L', qty: 2 }],
        });

        // Selling without size is rejected
        await expect(recordSale({ itemId: sizedId, qty: 1, unitPrice: 500 })).rejects.toThrow(/size/i);

        // Selling more than available in size M (available 3, requesting 4)
        await expect(recordSale({ itemId: sizedId, qty: 4, unitPrice: 500, size: 'M' })).rejects.toThrow(/not enough stock/i);

        // Selling 2 of size M succeeds
        const sale = await recordSale({ itemId: sizedId, qty: 2, unitPrice: 500, size: 'M' });
        expect(sale.sizeKey).toBe('M');

        const item = await db.items.get(sizedId);
        expect(item.qty).toBe(3); // 5 - 2
        const mSize = item.sizes.find(s => s.size === 'M');
        expect(mSize.qty).toBe(1);
    });

    it('saveDraftRows creates item with batch for new items', async () => {
        const rows = [{
            id: newId(),
            name: 'New Test Item',
            type: 'packaged',
            unit: 'pcs',
            qty: 10,
            purchasePrice: 100,
            sellingPrice: 120,
            mrp: 130,
            taxRate: null,
            customId: null,
            sizes: [],
            dupAction: 'skip',
            source: 'manual',
        }];

        const result = await saveDraftRows(rows);
        expect(result.added).toBe(1);

        const items = await db.items.toArray();
        expect(items).toHaveLength(1);

        const batches = await db.batches.toArray();
        expect(batches).toHaveLength(1);
        expect(batches[0].itemId).toBe(items[0].id);
        expect(batches[0].qtyLeft).toBe(10);
        expect(batches[0].purchasePrice).toBe(100);
    });

    it('saveDraftRows with dupAction=add creates a new batch for existing items', async () => {
        // First, add an item
        const rows1 = [{
            id: newId(),
            name: 'Restock Test Item',
            type: 'packaged',
            unit: 'pcs',
            qty: 10,
            purchasePrice: 100,
            sellingPrice: 120,
            mrp: 130,
            taxRate: null,
            customId: null,
            sizes: [],
            dupAction: 'skip',
            source: 'manual',
        }];
        await saveDraftRows(rows1);

        // Now "restock" via saveDraftRows with different price
        const rows2 = [{
            id: newId(),
            name: 'Restock Test Item',
            type: 'packaged',
            unit: 'pcs',
            qty: 5,
            purchasePrice: 110,
            sellingPrice: 130,
            mrp: 140,
            taxRate: null,
            customId: null,
            sizes: [],
            dupAction: 'add',
            source: 'manual',
        }];
        const result = await saveDraftRows(rows2);
        expect(result.merged).toBe(1);

        const items = await db.items.toArray();
        expect(items).toHaveLength(1);
        expect(items[0].qty).toBe(15); // 10 + 5

        const batches = await db.batches.toArray();
        expect(batches).toHaveLength(2);
    });
});
