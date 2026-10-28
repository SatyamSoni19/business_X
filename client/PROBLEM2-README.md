# BusinessX — Problem 2: Restocking at a New Price

## Definition of "Correct"

BusinessX uses **FIFO (First In, First Out) cost layers** to track the true cost of every item sold.

Every purchase of an item creates a **batch** (cost layer): `{ id, itemId, receivedAt, qtyIn, qtyLeft, purchasePrice, mrp }`. When a sale happens, the system automatically consumes the **oldest batch first** (by `receivedAt`), possibly spanning several batches. The profit on each sale is calculated from the **actual cost of the batches consumed**, not from a single "current price."

This means:
- **Old stock keeps its old cost** — restocking at a new price never changes the cost of bottles already on the shelf
- **Profit is locked at the time of sale** — later restocks cannot change past profits
- **Stock value is real** — it's the sum of `qtyLeft × purchasePrice` across all batches, not `qty × some average price`

The shopkeeper doesn't need to do anything extra. The system is automatic. The only optional question at restock time is "what selling price do you want on the shelf?"

---

## Sunil's Oil — Fortune Sunflower Oil 1L (October 2026)

### Timeline
1. **1 Oct:** Restock 20 bottles @ ₹140 cost, MRP ₹165, selling ₹160
2. **1–19 Oct:** Sell 14 @ ₹160 → profit ₹20 each = **₹280**. 6 bottles left.
3. **20 Oct:** Restock 24 bottles @ ₹152 cost, MRP ₹175, selling price changed to ₹170. Stock = 30.
4. **21–31 Oct:** Sell 18 @ ₹170:
   - First 6 consume the ₹140 batch → profit ₹30 each = **₹180**
   - Next 12 consume the ₹152 batch → profit ₹18 each = **₹216**
   - Second phase profit: **₹396**

### Five Answers

| # | Question | Answer |
|---|----------|--------|
| 1 | Profit on a 25 Oct sale at ₹170? | **₹30** if old ₹140 bottles still unsold (FIFO); **₹18** if old batch exhausted |
| 2 | Real October profit? | **₹676** (revenue ₹5,300 − COGS ₹4,624) |
| 3 | Value of 12 left? | **₹1,824** at cost (12 × ₹152); ₹2,040 at selling (12 × ₹170) |
| 4 | What does the item screen show? | Selling ₹170, MRP ₹175, Cost ₹152 (oldest batch with stock) |
| 5 | The general rule? | FIFO: old stock keeps its old cost, new stock gets its new cost. The shopkeeper does nothing — the system tracks each batch automatically. |

---

## Edge Cases

### 1. New purchase price LOWER than before
Same FIFO logic. Old units keep their **higher** cost. The restock dialog defaults to "keep old" selling price. The higher-cost old bottles will show lower profit when sold — that's correct.

### 2. Selling price change WITHOUT restock
Use the "Edit price" pencil icon on the Stock page. This changes only `item.sellingPrice`. No batch is created. Past sales are untouched.

### 3. Restock after stock ran out (qty = 0)
The old batch has `qtyLeft = 0` and is ignored. The item's cost cache (`purchasePrice`) automatically switches to the new batch. Works perfectly.

### 4. Customer returns a bottle
The returned unit goes back to the **same batch** it came from (using the sale's `allocations` in reverse order). Cost stays correct. Revenue, COGS, and profit are reversed proportionally in a new `type: 'return'` record.

### 5. Same-price restock
No dialog needed. A new batch is still created (for stock tracking), but since there's no price change, no user interaction is required.

### 6. Selling below cost
Allowed but **flagged** with an amber warning on both the sale form and the restock dialog. The system records the actual (negative) profit.

---

## Assumptions

### Sized items
- Quantity per size is tracked in `item.sizes`
- Batches track cost at the **item level** (FIFO cost is per item, not per size)
- A sale of a sized item picks a size and decrements that size AND consumes batch cost FIFO

### Rounding
- All monetary calculations use full precision during computation
- Rounding to 2 decimal places happens only at the final result (`revenue`, `cogs`, `profit`)
- For packaged items, the "average" selling price suggestion is rounded to nearest ₹1
- For loose items, it's rounded to 2 decimal places

---

## Data Model (Dexie v2)

### `items` table (unchanged indexes)
Fields added: `lastPurchasePrice`, `avgCost`  
Denormalised caches: `qty` = sum of batches' `qtyLeft`, `purchasePrice` = oldest non-empty batch's cost, `mrp` = latest batch's MRP

### `batches` table (new)
```
{ id, itemId, receivedAt, qtyIn, qtyLeft, purchasePrice, mrp }
```
Indexes: `id, itemId, receivedAt, [itemId+receivedAt]`

### `sales` table (new)
```
{ id, itemId, itemName, type, qty, unitPrice, revenue, cogs, profit, allocations, sizeKey, soldAt, refSaleId }
```
- `type`: `'sale'` or `'return'`
- `allocations`: `[{ batchId, qty, unitCost }]`
- Returns have negative `revenue`, `cogs`, `profit` and a `refSaleId` pointing to the original sale

### Migration
Existing items get ONE batch created from their current `qty`/`purchasePrice`/`mrp`.

