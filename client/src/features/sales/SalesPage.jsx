import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, ShoppingCart, Undo2, AlertTriangle, PackagePlus } from 'lucide-react';
import { db } from '../../db/dexie';
import { recordSale, recordReturn, getBatchesForItem } from '../../db/stockRepo';
import { inr, fmtQty } from '../../lib/format';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';

export default function SalesPage() {
    const [searchParams] = useSearchParams();
    const queryItemId = searchParams.get('itemId');

    const items = useLiveQuery(
        async () => {
            const list = await db.items.toArray();
            return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        },
        [],
        undefined
    );
    const sales = useLiveQuery(() => db.sales.orderBy('soldAt').reverse().toArray(), [], undefined);

    const [q, setQ] = useState('');
    const [selectedItemId, setSelectedItemId] = useState('');
    const [saleQty, setSaleQty] = useState('1');
    const [salePrice, setSalePrice] = useState('');
    const [saleSize, setSaleSize] = useState('');
    const [saleDate, setSaleDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Sales table search and pagination
    const [salesSearch, setSalesSearch] = useState('');
    const [visibleSalesCount, setVisibleSalesCount] = useState(25);

    // Return dialog
    const [returnSaleId, setReturnSaleId] = useState(null);
    const [returnQty, setReturnQty] = useState('1');
    const [returnError, setReturnError] = useState('');
    const [returning, setReturning] = useState(false);

    // Live cost preview from FIFO batches
    const [previewCost, setPreviewCost] = useState(null);

    // Pre-select item from query param if provided
    useEffect(() => {
        if (queryItemId && items && items.length > 0) {
            const found = items.find(i => i.id === queryItemId);
            if (found) {
                setSelectedItemId(found.id);
                setSalePrice(String(found.sellingPrice));
                setSaleQty('1');
                setSaleSize('');
            }
        }
    }, [queryItemId, items]);

    const selectedItem = useMemo(() => {
        if (!items) return null;
        return items.find(i => i.id === selectedItemId) || null;
    }, [items, selectedItemId]);

    // Live profit calculation
    const liveProfit = useMemo(() => {
        if (!selectedItem || !saleQty || !salePrice) return null;
        const qty = Number(saleQty);
        const price = Number(salePrice);
        if (!(qty > 0) || !(price > 0)) return null;
        const revenue = Math.round(qty * price * 100) / 100;
        const cost = previewCost ?? Math.round(qty * (selectedItem.purchasePrice || 0) * 100) / 100;
        const profit = Math.round((revenue - cost) * 100) / 100;
        return { revenue, cost, profit };
    }, [selectedItem, saleQty, salePrice, previewCost]);

    // Update FIFO cost preview when item or quantity changes
    useEffect(() => {
        let active = true;
        if (!selectedItemId || !saleQty) {
            setPreviewCost(null);
            return;
        }
        const qty = Number(saleQty);
        if (!(qty > 0)) {
            setPreviewCost(null);
            return;
        }

        getBatchesForItem(selectedItemId).then(batches => {
            if (!active) return;
            let remaining = qty;
            let cost = 0;
            for (const b of batches) {
                if (remaining <= 0) break;
                if (b.qtyLeft <= 0) continue;
                const take = Math.min(b.qtyLeft, remaining);
                cost += take * b.purchasePrice;
                remaining -= take;
            }
            // If requested qty exceeds current stock, estimate excess at last purchase price
            if (remaining > 0 && selectedItem) {
                cost += remaining * (selectedItem.lastPurchasePrice ?? selectedItem.purchasePrice ?? 0);
            }
            setPreviewCost(Math.round(cost * 100) / 100);
        });

        return () => {
            active = false;
        };
    }, [selectedItemId, saleQty, selectedItem]);

    // Filter items for search dropdown
    const filteredItems = useMemo(() => {
        if (!items) return [];
        const s = q.trim().toLowerCase();
        if (!s) return items;
        return items.filter(i =>
            i.name.toLowerCase().includes(s) || (i.customId || '').toLowerCase().includes(s)
        );
    }, [items, q]);

    // Today's summary stats
    const todayStats = useMemo(() => {
        if (!sales) return { count: 0, revenue: 0, profit: 0 };
        const todayStr = new Date().toDateString();
        let count = 0;
        let revenue = 0;
        let profit = 0;
        for (const s of sales) {
            if (new Date(s.soldAt).toDateString() === todayStr) {
                if (s.type === 'sale') count += 1;
                revenue += s.revenue;
                profit += s.profit;
            }
        }
        return {
            count,
            revenue: Math.round(revenue * 100) / 100,
            profit: Math.round(profit * 100) / 100,
        };
    }, [sales]);

    // Filter recent sales
    const filteredSales = useMemo(() => {
        if (!sales) return [];
        const s = salesSearch.trim().toLowerCase();
        if (!s) return sales;
        return sales.filter(sale =>
            sale.itemName.toLowerCase().includes(s) || (sale.sizeKey || '').toLowerCase().includes(s)
        );
    }, [sales, salesSearch]);

    function handleSelectItem(itemId) {
        setSelectedItemId(itemId);
        const item = items?.find(i => i.id === itemId);
        if (item) {
            setSalePrice(String(item.sellingPrice));
            setSaleQty('1');
            setSaleSize('');
        }
        setQ('');
        setError('');
        setSuccess('');
    }

    async function handleSale() {
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            const soldAt = new Date(saleDate + 'T12:00:00').getTime() || Date.now();
            const sale = await recordSale({
                itemId: selectedItemId,
                qty: Number(saleQty),
                unitPrice: Number(salePrice),
                size: saleSize || undefined,
                soldAt,
            });

            setSuccess(`Sold ${sale.qty} × ${selectedItem?.name} for ${inr(sale.revenue)}. Profit ${inr(sale.profit)}`);
            setSelectedItemId('');
            setSaleQty('1');
            setSalePrice('');
            setSaleSize('');
        } catch (e) {
            setError(e?.message || 'Could not record sale');
        } finally {
            setSaving(false);
        }
    }

    const returnSale = useMemo(() => {
        if (!sales || !returnSaleId) return null;
        return sales.find(s => s.id === returnSaleId) || null;
    }, [sales, returnSaleId]);

    const maxReturnable = useMemo(() => {
        if (!returnSale || !sales) return 0;
        const alreadyReturned = sales
            .filter(s => s.type === 'return' && s.refSaleId === returnSale.id)
            .reduce((sum, r) => sum + r.qty, 0);
        return returnSale.qty - alreadyReturned;
    }, [returnSale, sales]);

    async function handleReturn() {
        setReturning(true);
        setReturnError('');
        try {
            await recordReturn({ saleId: returnSaleId, qty: Number(returnQty) });
            setReturnSaleId(null);
            setReturnQty('1');
        } catch (e) {
            setReturnError(e?.message || 'Could not process return');
        } finally {
            setReturning(false);
        }
    }

    // Loading state while useLiveQuery resolves
    if (items === undefined || sales === undefined) {
        return <div className="p-8 font-semibold text-slate-500">Loading sales…</div>;
    }

    // Empty state if no items exist in stock yet
    if (items.length === 0) {
        return (
            <div className="mx-auto max-w-[1000px]">
                <div className="mb-6">
                    <h1 className="text-3xl font-black">Sales</h1>
                    <p className="text-sm font-medium text-slate-600">Record sales and track profit per transaction.</p>
                </div>
                <div className="rounded-xl border-2 border-dashed border-slate-500 bg-white p-12 text-center">
                    <div className="text-lg font-extrabold">No items yet</div>
                    <p className="mt-1 text-sm font-medium text-slate-600">
                        Add items to your stock before recording sales.
                    </p>
                    <Link to="/add" className="mt-5 inline-block">
                        <Button icon={PackagePlus}>Add items</Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1000px]">
            <div className="mb-6">
                <h1 className="text-3xl font-black">Sales</h1>
                <p className="text-sm font-medium text-slate-600">Record sales and track profit per transaction.</p>
            </div>

            {/* Strip at the top: today's sales, revenue, profit */}
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border-2 border-slate-900 bg-white p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Today's sales</div>
                    <div className="mt-1 text-2xl font-black">{todayStats.count}</div>
                </div>
                <div className="rounded-xl border-2 border-slate-900 bg-white p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Today's revenue</div>
                    <div className="mt-1 text-2xl font-black">{inr(todayStats.revenue)}</div>
                </div>
                <div className="rounded-xl border-2 border-slate-900 bg-white p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Today's profit</div>
                    <div className={`mt-1 text-2xl font-black ${todayStats.profit < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {inr(todayStats.profit)}
                    </div>
                </div>
            </div>

            {/* Record a sale card */}
            <div className="rounded-xl border-2 border-slate-900 bg-white p-5 mb-6">
                <h3 className="text-lg font-extrabold mb-4">Record a sale</h3>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Item selector */}
                    <div className="sm:col-span-2">
                        <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Item</label>
                        {selectedItem ? (
                            <div className="flex items-center gap-2">
                                <div className="flex-1 min-h-[44px] flex flex-wrap items-center justify-between rounded-lg border-2 border-slate-900 bg-slate-50 px-3 py-2 text-sm font-bold gap-1">
                                    <span>{selectedItem.name}</span>
                                    <span className="text-xs font-semibold text-slate-500">
                                        {fmtQty(selectedItem)} left · Selling {inr(selectedItem.sellingPrice)} · Next cost {inr(selectedItem.purchasePrice)}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedItemId(''); setSalePrice(''); setSaleSize(''); }}
                                    className="h-11 px-3 rounded-lg border-2 border-slate-900 text-sm font-bold hover:bg-slate-100 shrink-0"
                                >
                                    Change
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Search by name or ID…"
                                    className="h-11 w-full rounded-lg border-2 border-slate-900 bg-white pl-9 pr-3 text-sm font-medium outline-none focus:ring-4 focus:ring-slate-900/15"
                                />
                                {q.trim() && filteredItems.length > 0 && (
                                    <div className="absolute left-0 right-0 top-12 z-10 max-h-56 overflow-y-auto rounded-lg border-2 border-slate-900 bg-white shadow-lg">
                                        {filteredItems.slice(0, 20).map(i => (
                                            <button
                                                key={i.id}
                                                type="button"
                                                onClick={() => handleSelectItem(i.id)}
                                                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold hover:bg-slate-100 border-b border-slate-200 last:border-b-0"
                                            >
                                                <span>{i.name}</span>
                                                <span className="text-xs text-slate-500">
                                                    {fmtQty(i)} left · Selling {inr(i.sellingPrice)} · Next cost {inr(i.purchasePrice)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Quantity */}
                    <div>
                        <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Quantity</label>
                        <input
                            type="number"
                            min="0"
                            step={selectedItem?.type === 'loose' ? 'any' : '1'}
                            value={saleQty}
                            onChange={(e) => setSaleQty(e.target.value)}
                            placeholder="1"
                            className="h-11 w-full rounded-lg border-2 border-slate-900 bg-white px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-slate-900/15"
                        />
                    </div>

                    {/* Price per unit */}
                    <div>
                        <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Sold at (per unit)</label>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={salePrice}
                            onChange={(e) => setSalePrice(e.target.value)}
                            placeholder="₹"
                            className="h-11 w-full rounded-lg border-2 border-slate-900 bg-white px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-slate-900/15"
                        />
                    </div>

                    {/* Size selector for sized items */}
                    {selectedItem?.type === 'sized' && (
                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Size</label>
                            <select
                                value={saleSize}
                                onChange={(e) => setSaleSize(e.target.value)}
                                className="h-11 w-full rounded-lg border-2 border-slate-900 bg-white px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-slate-900/15"
                            >
                                <option value="">Select size</option>
                                {selectedItem.sizes.map(s => (
                                    <option key={s.size} value={s.size}>{s.size} ({s.qty} left)</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Date */}
                    <div>
                        <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Date</label>
                        <input
                            type="date"
                            value={saleDate}
                            onChange={(e) => setSaleDate(e.target.value)}
                            className="h-11 w-full rounded-lg border-2 border-slate-900 bg-white px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-slate-900/15"
                        />
                    </div>
                </div>

                {/* Live line under the form: Profit on this sale */}
                {liveProfit && (
                    <div
                        className={`mt-4 rounded-lg border-2 px-4 py-2.5 text-sm font-bold flex items-center justify-between ${
                            liveProfit.profit < 0
                                ? 'border-red-600 bg-red-50 text-red-700'
                                : 'border-slate-900 bg-slate-50 text-emerald-700'
                        }`}
                    >
                        <div>
                            Profit on this sale: <span className="font-black">{inr(liveProfit.profit)}</span>
                            {liveProfit.profit < 0 && (
                                <span className="ml-2 font-black text-red-700">— Selling below your cost</span>
                            )}
                        </div>
                        <span className="text-xs text-slate-500 font-semibold">
                            (cost {inr(liveProfit.cost)} from oldest stock)
                        </span>
                    </div>
                )}

                <div className="mt-4 flex items-center gap-3">
                    <Button
                        icon={ShoppingCart}
                        disabled={!selectedItemId || !Number(saleQty) || !Number(salePrice) || saving}
                        onClick={handleSale}
                    >
                        {saving ? 'Recording…' : 'Record sale'}
                    </Button>
                </div>

                {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
                {success && <p className="mt-3 text-sm font-semibold text-emerald-700">{success}</p>}
            </div>

            {/* Recent sales list */}
            <div className="rounded-xl border-2 border-slate-900 bg-white">
                <div className="border-b-2 border-slate-900 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-extrabold">Recent sales</h3>
                    <div className="relative w-full max-w-xs sm:w-64">
                        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            value={salesSearch}
                            onChange={(e) => setSalesSearch(e.target.value)}
                            placeholder="Filter by item…"
                            className="h-9 w-full rounded-lg border-2 border-slate-900 bg-white pl-8 pr-3 text-xs font-medium outline-none focus:ring-2 focus:ring-slate-900/15"
                        />
                    </div>
                </div>

                {filteredSales.length === 0 ? (
                    <div className="p-8 text-center text-sm font-semibold text-slate-500">
                        {sales.length === 0 ? 'No sales yet.' : 'No matching sales found.'}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px] text-left text-sm">
                            <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white">
                                <tr>
                                    {['Date', 'Item', 'Type', 'Qty', 'Price', 'Revenue', 'Profit', ''].map(h => (
                                        <th key={h} className="px-3 py-3 font-bold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSales.slice(0, visibleSalesCount).map(s => (
                                    <tr key={s.id} className={`border-b border-slate-300 hover:bg-slate-50 ${s.type === 'return' ? 'bg-amber-50/50' : ''}`}>
                                        <td className="px-3 py-3 font-medium">
                                            {new Date(s.soldAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                        </td>
                                        <td className="px-3 py-3 font-bold">
                                            {s.itemName}
                                            {s.sizeKey && <span className="text-slate-500 ml-1">({s.sizeKey})</span>}
                                        </td>
                                        <td className="px-3 py-3">
                                            {s.type === 'return' ? <Badge tone="warn">Return</Badge> : <Badge tone="ok">Sale</Badge>}
                                        </td>
                                        <td className="px-3 py-3 font-bold">{s.type === 'return' ? `-${s.qty}` : s.qty}</td>
                                        <td className="px-3 py-3 font-medium">{inr(s.unitPrice)}</td>
                                        <td className="px-3 py-3 font-medium">{inr(s.revenue)}</td>
                                        <td className={`px-3 py-3 font-bold ${s.profit < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                            {inr(s.profit)}
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            {s.type === 'sale' && (
                                                <button
                                                    onClick={() => { setReturnSaleId(s.id); setReturnQty('1'); setReturnError(''); }}
                                                    className="rounded-md border-2 border-transparent p-1.5 text-slate-600 hover:border-amber-600 hover:bg-amber-50 hover:text-amber-700"
                                                    title="Return"
                                                >
                                                    <Undo2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {filteredSales.length > visibleSalesCount && (
                    <div className="p-3 text-center border-t border-slate-200">
                        <Button variant="secondary" onClick={() => setVisibleSalesCount(c => c + 25)}>
                            Show more ({filteredSales.length - visibleSalesCount} left)
                        </Button>
                    </div>
                )}
            </div>

            {/* Return dialog */}
            <Modal
                open={!!returnSaleId}
                onClose={() => setReturnSaleId(null)}
                title="Return item"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setReturnSaleId(null)}>Cancel</Button>
                        <Button onClick={handleReturn} disabled={!Number(returnQty) || returning || Number(returnQty) > maxReturnable}>
                            {returning ? 'Processing…' : 'Process return'}
                        </Button>
                    </>
                }
            >
                {returnSale && (
                    <div className="space-y-3">
                        <p className="text-sm font-semibold">
                            Returning: <span className="font-black">{returnSale.itemName}</span>
                            {returnSale.sizeKey && <span className="text-slate-500 ml-1">({returnSale.sizeKey})</span>}
                        </p>
                        <p className="text-sm font-medium text-slate-600">
                            Original sale: {returnSale.qty}× at {inr(returnSale.unitPrice)} on {new Date(returnSale.soldAt).toLocaleDateString('en-IN')}.
                            {maxReturnable < returnSale.qty && (
                                <span className="block mt-1 font-bold text-amber-800">
                                    Already returned: {returnSale.qty - maxReturnable}. Max returnable now: {maxReturnable}.
                                </span>
                            )}
                        </p>
                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Quantity to return</label>
                            <input
                                type="number"
                                min="1"
                                max={maxReturnable}
                                step="1"
                                value={returnQty}
                                onChange={(e) => setReturnQty(e.target.value)}
                                className="h-11 w-32 rounded-lg border-2 border-slate-900 bg-white px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-slate-900/15"
                            />
                        </div>
                        {returnError && <p className="text-sm font-semibold text-red-700">{returnError}</p>}
                    </div>
                )}
            </Modal>
        </div>
    );
}
