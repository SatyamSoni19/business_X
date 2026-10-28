import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Search, Trash2, ChevronDown, ChevronRight, PackagePlus, Pencil, ShoppingCart } from 'lucide-react';
import Papa from 'papaparse';
import { Link } from 'react-router-dom';
import { db } from '../../db/dexie';
import { getBatchesForItem, restockItem, editSellingPrice, getTotalStockValue } from '../../db/stockRepo';
import { fmtQty, inr } from '../../lib/format';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import RestockPriceDialog from '../../components/ui/RestockPriceDialog';

function exportCsv(items) {
    const csv = Papa.unparse(
        items.map((i) => ({
            name: i.name,
            type: i.type,
            unit: i.type === 'loose' ? i.unit : '',
            qty: i.type === 'sized' ? '' : i.qty,
            purchasePrice: i.purchasePrice,
            sellingPrice: i.sellingPrice,
            mrp: i.mrp ?? '',
            taxRate: i.taxRate ?? '',
            customId: i.customId ?? '',
            sizes: i.sizes.map((s) => `${s.size}:${s.qty}`).join('|'),
        }))
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'businessx-stock.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function Stat({ label, value, subline, extraLine }) {
    return (
        <div className="rounded-xl border-2 border-slate-900 bg-white p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-black">{value}</div>
            {subline && <div className="mt-1 text-xs text-slate-500 font-medium">{subline}</div>}
            {extraLine && <div className="mt-0.5 text-xs font-bold text-slate-800">{extraLine}</div>}
        </div>
    );
}

function BatchRow({ batch }) {
    return (
        <tr className="border-b border-slate-200 text-xs">
            <td className="px-3 py-2 font-medium">
                {new Date(batch.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </td>
            <td className="px-3 py-2 font-medium">{inr(batch.purchasePrice)}</td>
            <td className="px-3 py-2 font-medium">{batch.qtyIn}</td>
            <td className="px-3 py-2 font-bold">{batch.qtyLeft}</td>
            <td className="px-3 py-2 font-medium">{batch.mrp != null ? inr(batch.mrp) : '—'}</td>
        </tr>
    );
}

function ItemBatches({ itemId }) {
    const batches = useLiveQuery(() => getBatchesForItem(itemId), [itemId], []);
    if (!batches || !batches.length) return <div className="px-3 py-2 text-xs text-slate-500">No batches</div>;
    return (
        <div>
            <p className="text-xs text-slate-600 mb-2 font-medium">
                Items are sold oldest-first, so profit uses the price you actually paid for that batch.
            </p>
            <table className="w-full text-left">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                        <th className="px-3 py-1.5 font-bold">Date</th>
                        <th className="px-3 py-1.5 font-bold">Bought at</th>
                        <th className="px-3 py-1.5 font-bold">Quantity bought</th>
                        <th className="px-3 py-1.5 font-bold">Quantity left</th>
                        <th className="px-3 py-1.5 font-bold">MRP</th>
                    </tr>
                </thead>
                <tbody>
                    {batches.map(b => <BatchRow key={b.id} batch={b} />)}
                </tbody>
            </table>
        </div>
    );
}

function RestockForm({ item, onClose }) {
    const [qty, setQty] = useState('');
    const [pp, setPp] = useState('');
    const [mrp, setMrp] = useState('');
    const [sp, setSp] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Restock price dialog state
    const [showPriceDialog, setShowPriceDialog] = useState(false);
    const [restockInfo, setRestockInfo] = useState([]);

    async function handleRestock() {
        const purchasePrice = Number(pp);
        const sellingPrice = Number(sp) || undefined;
        const mrpVal = item.type === 'loose' ? null : (Number(mrp) || null);
        const qtyVal = Number(qty);

        if (!(qtyVal > 0) || !(purchasePrice > 0)) {
            setError('Quantity and purchase price are required');
            return;
        }

        // Check if price change dialog is needed
        const priceChanged = purchasePrice !== item.purchasePrice;
        const sellingChanged = sellingPrice && sellingPrice !== item.sellingPrice;

        if (priceChanged || sellingChanged) {
            setRestockInfo([{
                itemId: item.id,
                itemName: item.name,
                itemType: item.type,
                oldPurchasePrice: item.purchasePrice,
                oldSellingPrice: item.sellingPrice,
                oldMrp: item.mrp,
                oldQty: item.qty,
                newPurchasePrice: purchasePrice,
                newSellingPrice: sellingPrice || item.sellingPrice,
                newMrp: mrpVal,
                newQty: qtyVal,
            }]);
            setShowPriceDialog(true);
            return;
        }

        // Same price: restock silently
        await doRestock(sellingPrice);
    }

    async function doRestock(finalSellingPrice) {
        setSaving(true);
        setError('');
        try {
            await restockItem({
                itemId: item.id,
                qty: Number(qty),
                purchasePrice: Number(pp),
                mrp: item.type === 'loose' ? null : (Number(mrp) || null),
                sellingPrice: finalSellingPrice,
            });
            onClose();
        } catch (e) {
            setError(e?.message || 'Could not restock');
        } finally {
            setSaving(false);
        }
    }

    function handlePriceConfirm(decisions) {
        const price = decisions.get(item.id);
        setShowPriceDialog(false);
        doRestock(price);
    }

    return (
        <>
            <div className="space-y-3">
                <div>
                    <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Quantity</label>
                    <input
                        type="number" min="0" step={item.type === 'loose' ? 'any' : '1'}
                        value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0"
                        className="h-11 w-full rounded-lg border-2 border-slate-900 bg-white px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-slate-900/15"
                    />
                </div>
                <div>
                    <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Purchase price</label>
                    <input
                        type="number" min="0" step="any"
                        value={pp} onChange={(e) => setPp(e.target.value)} placeholder={String(item.purchasePrice)}
                        className="h-11 w-full rounded-lg border-2 border-slate-900 bg-white px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-slate-900/15"
                    />
                </div>
                {item.type !== 'loose' && (
                    <div>
                        <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">MRP</label>
                        <input
                            type="number" min="0" step="any"
                            value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder={item.mrp ? String(item.mrp) : ''}
                            className="h-11 w-full rounded-lg border-2 border-slate-900 bg-white px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-slate-900/15"
                        />
                    </div>
                )}
                <div>
                    <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Selling price (optional)</label>
                    <input
                        type="number" min="0" step="any"
                        value={sp} onChange={(e) => setSp(e.target.value)} placeholder={String(item.sellingPrice)}
                        className="h-11 w-full rounded-lg border-2 border-slate-900 bg-white px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-slate-900/15"
                    />
                </div>
                {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleRestock} disabled={saving}>{saving ? 'Restocking…' : 'Restock'}</Button>
                </div>
            </div>

            <RestockPriceDialog
                open={showPriceDialog}
                restockInfo={restockInfo}
                onConfirm={handlePriceConfirm}
                onClose={() => setShowPriceDialog(false)}
            />
        </>
    );
}

function EditPriceForm({ item, onClose }) {
    const [sp, setSp] = useState(String(item.sellingPrice));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function handleSave() {
        setSaving(true);
        setError('');
        try {
            await editSellingPrice(item.id, Number(sp));
            onClose();
        } catch (e) {
            setError(e?.message || 'Could not update price');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-3">
            <p className="text-sm font-medium text-slate-600">
                Change the selling price for <span className="font-bold">{item.name}</span>. Past sales are not affected.
            </p>
            <div>
                <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">New selling price</label>
                <input
                    type="number" min="0" step="any"
                    value={sp} onChange={(e) => setSp(e.target.value)}
                    className="h-11 w-full rounded-lg border-2 border-slate-900 bg-white px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-slate-900/15"
                />
            </div>
            {Number(sp) > 0 && Number(sp) < item.purchasePrice && (
                <div className="flex items-center gap-2 rounded-lg border-2 border-amber-600 bg-amber-50 px-3 py-2">
                    <Badge tone="warn">Warning</Badge>
                    <span className="text-sm font-semibold text-amber-900">Below cost ({inr(item.purchasePrice)})</span>
                </div>
            )}
            {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
            <div className="flex gap-3">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !(Number(sp) > 0)}>
                    {saving ? 'Saving…' : 'Update price'}
                </Button>
            </div>
        </div>
    );
}

export default function StockPage() {
    const items = useLiveQuery(() => db.items.orderBy('createdAt').reverse().toArray(), [], undefined);
    const stockValue = useLiveQuery(() => getTotalStockValue(), [], 0);
    const [q, setQ] = useState('');
    const [limit, setLimit] = useState(150);
    const [expandedId, setExpandedId] = useState(null);
    const [restockItemId, setRestockItemId] = useState(null);
    const [editPriceItemId, setEditPriceItemId] = useState(null);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return (items || []).filter(
            (i) => !s || i.name.toLowerCase().includes(s) || (i.customId || '').toLowerCase().includes(s)
        );
    }, [items, q]);

    const stats = useMemo(() => {
        const list = items || [];
        const retail = Math.round(list.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.sellingPrice) || 0), 0) * 100) / 100;
        return {
            count: list.length,
            retail,
        };
    }, [items]);

    const restockItem2 = items?.find(i => i.id === restockItemId);
    const editPriceItem = items?.find(i => i.id === editPriceItemId);

    if (items === undefined) return <div className="p-8 font-semibold text-slate-500">Loading stock…</div>;

    const expectedProfit = Math.round((stats.retail - stockValue) * 100) / 100;

    return (
        <div className="mx-auto max-w-[1300px]">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-black">Stock</h1>
                    <p className="text-sm font-medium text-slate-600">Saved on this device. Works offline.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" icon={Download} disabled={!items.length} onClick={() => exportCsv(items)}>
                        Export CSV
                    </Button>
                    <Button
                        variant="outlineDanger"
                        icon={Trash2}
                        disabled={!items.length}
                        onClick={async () => {
                            if (window.confirm('Delete ALL items, batches, and sales from this device?')) {
                                await db.transaction('rw', db.items, db.batches, db.sales, async () => {
                                    await db.items.clear();
                                    await db.batches.clear();
                                    await db.sales.clear();
                                });
                            }
                        }}
                    >
                        Clear all
                    </Button>
                </div>
            </div>

            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <Stat label="Items" value={stats.count} />
                <Stat
                    label="Cost price of all stock"
                    value={inr(stockValue)}
                    subline="What you paid for the items on your shelf"
                />
                <Stat
                    label="Selling price of all stock"
                    value={inr(stats.retail)}
                    subline="What you would get if you sold everything at today's prices"
                    extraLine={`Expected profit: ${inr(expectedProfit)}`}
                />
            </div>

            {items.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-slate-500 bg-white p-12 text-center">
                    <div className="text-lg font-extrabold">No items yet</div>
                    <p className="mt-1 text-sm font-medium text-slate-600">Scan a bill or import a spreadsheet to get started.</p>
                    <Link to="/add" className="mt-5 inline-block">
                        <Button>Add items</Button>
                    </Link>
                </div>
            ) : (
                <>
                    <div className="relative mb-4 max-w-md">
                        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search by name or ID"
                            className="h-11 w-full rounded-lg border-2 border-slate-900 bg-white pl-10 pr-3 text-sm font-medium outline-none focus:ring-4 focus:ring-slate-900/15"
                        />
                    </div>

                    <div className="overflow-x-auto rounded-xl border-2 border-slate-900 bg-white">
                        <table className="w-full min-w-[1100px] text-left text-sm">
                            <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white">
                                <tr>
                                    {['', 'Item', 'Type', 'In stock', 'Cost price', 'Selling price', 'MRP', 'GST', 'ID', ''].map((h) => (
                                        <th key={h} className="px-3 py-3 font-bold">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.slice(0, limit).map((i) => {
                                    const isExpanded = expandedId === i.id;
                                    const costOfNext = i.purchasePrice ?? 0;
                                    const profitOnNext = Math.round((i.sellingPrice - costOfNext) * 100) / 100;
                                    const isBelowCost = i.sellingPrice < costOfNext;

                                    return (
                                        <React.Fragment key={i.id}>
                                            <tr className="border-b border-slate-300 hover:bg-slate-50">
                                                <td className="px-3 py-3">
                                                    <button
                                                        onClick={() => setExpandedId(isExpanded ? null : i.id)}
                                                        className="rounded p-1 hover:bg-slate-200"
                                                    >
                                                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                    </button>
                                                </td>
                                                <td className="px-3 py-3 font-bold">
                                                    <div className="flex items-center gap-2">
                                                        <span>{i.name}</span>
                                                        {isBelowCost && <Badge tone="warn">Below cost</Badge>}
                                                    </div>
                                                    {i.type === 'sized' && (
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            {i.sizes.map((s) => (
                                                                <Badge key={s.size}>
                                                                    {s.size}: {s.qty}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 font-medium capitalize">{i.type === 'sized' ? 'Sizes' : i.type}</td>
                                                <td className="px-3 py-3 font-bold">{fmtQty(i)}</td>
                                                <td className="px-3 py-3">
                                                    <div className="font-bold text-slate-900">Next sale costs {inr(costOfNext)}</div>
                                                    <div className="text-xs text-slate-500 font-medium">Avg cost {inr(i.avgCost ?? costOfNext)}</div>
                                                    <div className="text-xs text-slate-500 font-medium">Last bought {inr(i.lastPurchasePrice ?? costOfNext)}</div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="font-bold text-slate-900">
                                                        {inr(i.sellingPrice)}
                                                        {i.type === 'loose' && <span className="text-slate-500 font-normal"> /{i.unit}</span>}
                                                    </div>
                                                    <div className={`text-xs font-bold ${profitOnNext < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                        Profit on next sale: {inr(profitOnNext)}
                                                    </div>
                                                    <div className="text-xs text-slate-500 font-medium">
                                                        MRP {i.mrp != null ? inr(i.mrp) : '—'}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 font-medium">{i.mrp != null ? inr(i.mrp) : '—'}</td>
                                                <td className="px-3 py-3 font-medium">{i.taxRate != null ? `${i.taxRate}%` : '—'}</td>
                                                <td className="px-3 py-3 font-medium">{i.customId || '—'}</td>
                                                <td className="px-3 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Link
                                                            to={`/sales?itemId=${i.id}`}
                                                            title="Sell"
                                                            className="rounded-md border-2 border-transparent p-1.5 text-slate-600 hover:border-slate-900 hover:bg-slate-100"
                                                        >
                                                            <ShoppingCart size={16} />
                                                        </Link>
                                                        <button
                                                            onClick={() => setRestockItemId(i.id)}
                                                            title="Restock"
                                                            className="rounded-md border-2 border-transparent p-1.5 text-slate-600 hover:border-slate-900 hover:bg-slate-100"
                                                        >
                                                            <PackagePlus size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => setEditPriceItemId(i.id)}
                                                            title="Edit selling price"
                                                            className="rounded-md border-2 border-transparent p-1.5 text-slate-600 hover:border-slate-900 hover:bg-slate-100"
                                                        >
                                                            <Pencil size={16} />
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                if (window.confirm(`Delete "${i.name}" and all its batches?`)) {
                                                                    await db.transaction('rw', db.items, db.batches, async () => {
                                                                        await db.items.delete(i.id);
                                                                        await db.batches.where('itemId').equals(i.id).delete();
                                                                    });
                                                                }
                                                            }}
                                                            aria-label={`Delete ${i.name}`}
                                                            className="rounded-md border-2 border-transparent p-1.5 text-slate-600 hover:border-red-700 hover:bg-red-50 hover:text-red-700"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan={10} className="bg-slate-50 px-6 py-4">
                                                        <div className="text-xs font-bold uppercase text-slate-500 mb-2">Batches</div>
                                                        <ItemBatches itemId={i.id} />
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {filtered.length > limit && (
                        <div className="mt-4 text-center">
                            <Button variant="secondary" onClick={() => setLimit((l) => l + 150)}>
                                Show more ({filtered.length - limit} left)
                            </Button>
                        </div>
                    )}
                </>
            )}

            {/* Restock modal */}
            <Modal
                open={!!restockItem2}
                onClose={() => setRestockItemId(null)}
                title={restockItem2 ? `Restock: ${restockItem2.name}` : 'Restock'}
            >
                {restockItem2 && <RestockForm item={restockItem2} onClose={() => setRestockItemId(null)} />}
            </Modal>

            {/* Edit price modal */}
            <Modal
                open={!!editPriceItem}
                onClose={() => setEditPriceItemId(null)}
                title="Edit selling price"
            >
                {editPriceItem && <EditPriceForm item={editPriceItem} onClose={() => setEditPriceItemId(null)} />}
            </Modal>
        </div>
    );
}
