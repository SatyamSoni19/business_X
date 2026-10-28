import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus } from 'lucide-react';
import { db } from '../../db/dexie';
import { saveDraftRows } from '../../db/itemsRepo';
import { editSellingPrice } from '../../db/stockRepo';
import { annotateRows } from '../../parser/duplicates';
import { validateRow } from '../../lib/validate';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import ItemRow, { GRID, ROW_H } from './ItemRow';
import SizeMatrixEditor from './SizeMatrixEditor';
import RestockPriceDialog from '../../components/ui/RestockPriceDialog';
import { useImportStore } from './useImportStore';

const HEADERS = ['#', 'Item name', 'Type', 'Quantity', 'Purchase ₹', 'Selling ₹', 'MRP ₹', 'GST', 'Custom ID', 'Status', ''];

export default function ReviewTable({ onSaved }) {
    const store = useImportStore();
    const { rows, skipped, sourceLabel } = store;
    const existing = useLiveQuery(() => db.items.toArray(), [], []);

    const info = useMemo(() => annotateRows(rows, existing), [rows, existing]);

    const stats = useMemo(() => {
        const checks = {};
        let errorRows = 0;
        let warnRows = 0;
        let inStock = 0;
        let noSelling = 0;
        let dupBill = 0;
        for (const r of rows) {
            const c = validateRow(r);
            const i = info[r.id];
            if (i.dupInBill) {
                c.errors.name = 'Appears twice in this list – merge or delete one';
                dupBill++;
            }
            if (i.customIdClash) c.errors.customId = i.customIdClash;
            if (i.existing) inStock++;
            if (!(r.sellingPrice > 0)) noSelling++;
            if (Object.keys(c.errors).length) errorRows++;
            else if (Object.keys(c.warnings).length) warnRows++;
            checks[r.id] = c;
        }
        return { checks, errorRows, warnRows, inStock, noSelling, dupBill };
    }, [rows, info]);

    // virtualised list: stays smooth with 400+ rows
    const parentRef = useRef(null);
    const rv = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_H,
        overscan: 10,
    });

    const cursor = useRef(-1);
    function nextIssue() {
        const n = rows.length;
        for (let k = 1; k <= n; k++) {
            const idx = (cursor.current + k) % n;
            if (Object.keys(stats.checks[rows[idx].id].errors).length) {
                cursor.current = idx;
                rv.scrollToIndex(idx, { align: 'center' });
                return;
            }
        }
    }

    const [mode, setMode] = useState('mrp');
    const [margin, setMargin] = useState(15);
    const [sizeRowId, setSizeRowId] = useState(null);
    const sizeRow = rows.find((r) => r.id === sizeRowId);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    // Restock price dialog
    const [restockDialogOpen, setRestockDialogOpen] = useState(false);
    const [restockInfo, setRestockInfo] = useState([]);
    const [pendingSaveResult, setPendingSaveResult] = useState(null);

    async function save() {
        setSaving(true);
        setSaveError('');
        try {
            const result = await saveDraftRows(rows);

            // If there are items that need the restock price dialog
            if (result.restockInfo && result.restockInfo.length > 0) {
                setRestockInfo(result.restockInfo);
                setPendingSaveResult(result);
                setRestockDialogOpen(true);
                setSaving(false);
                return;
            }

            onSaved(result);
            store.reset();
        } catch (e) {
            setSaveError(e?.message || 'Could not save items');
        } finally {
            setSaving(false);
        }
    }

    async function handleRestockConfirm(decisions) {
        // Apply the selling price decisions
        for (const [itemId, price] of decisions) {
            await editSellingPrice(itemId, price);
        }
        setRestockDialogOpen(false);
        setRestockInfo([]);
        if (pendingSaveResult) {
            onSaved(pendingSaveResult);
            setPendingSaveResult(null);
            store.reset();
        }
    }

    function discard() {
        if (window.confirm('Discard this whole list? Nothing will be saved.')) store.reset();
    }

    const canSave = rows.length > 0 && stats.errorRows === 0 && !saving;

    return (
        <div className="space-y-4">
            {/* summary + actions */}
            <div className="rounded-xl border-2 border-slate-900 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="mr-2 text-lg font-extrabold">{rows.length} items to review</h3>
                    {sourceLabel && <Badge>{sourceLabel}</Badge>}
                    {stats.errorRows > 0 && <Badge tone="error">{stats.errorRows} need fixing</Badge>}
                    {stats.warnRows > 0 && <Badge tone="warn">{stats.warnRows} to double-check</Badge>}
                    {stats.inStock > 0 && <Badge tone="info">{stats.inStock} already in stock</Badge>}
                    {stats.errorRows === 0 && rows.length > 0 && <Badge tone="ok">All rows valid</Badge>}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button size="sm" variant="secondary" icon={Plus} onClick={() => store.addRow()}>
                        Add row
                    </Button>
                    {stats.errorRows > 0 && (
                        <Button size="sm" variant="secondary" onClick={nextIssue}>
                            Jump to next problem
                        </Button>
                    )}
                    {stats.dupBill > 0 && (
                        <Button size="sm" variant="secondary" onClick={store.mergeBillDuplicates}>
                            Merge duplicates in list
                        </Button>
                    )}
                    <div className="ml-auto flex gap-3">
                        <Button variant="outlineDanger" onClick={discard}>
                            Discard
                        </Button>
                        <Button icon={Check} size="lg" disabled={!canSave} onClick={save}>
                            {saving ? 'Saving…' : `Save ${rows.length} items`}
                        </Button>
                    </div>
                </div>

                {saveError && <p className="mt-3 text-sm font-semibold text-red-700">{saveError}</p>}
                {stats.errorRows > 0 && (
                    <p className="mt-3 text-sm font-medium text-slate-600">
                        Saving unlocks when every red row is fixed or deleted. This keeps wrong numbers out of your stock and profit.
                    </p>
                )}
            </div>

            {/* selling price helper: bills only contain purchase prices */}
            {stats.noSelling > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-slate-900 bg-amber-50 p-4">
                    <div className="text-sm font-bold">{stats.noSelling} items have no selling price.</div>
                    <select
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                        className="h-10 rounded-md border-2 border-slate-900 bg-white px-2 text-sm font-semibold"
                    >
                        <option value="mrp">Use MRP (else cost + margin)</option>
                        <option value="margin">Cost + margin</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm font-semibold">
                        Margin
                        <input
                            type="number"
                            min="0"
                            value={margin}
                            onChange={(e) => setMargin(Number(e.target.value) || 0)}
                            className="h-10 w-20 rounded-md border-2 border-slate-900 bg-white px-2 text-sm font-semibold"
                        />
                        %
                    </label>
                    <Button size="sm" onClick={() => store.fillSellingPrices({ mode, margin })}>
                        Fill empty selling prices
                    </Button>
                </div>
            )}

            {/* table */}
            <div className="overflow-x-auto rounded-xl border-2 border-slate-900 bg-white">
                <div className="min-w-[1320px]">
                    <div
                        className="grid bg-slate-900 px-3 py-3 text-xs font-bold uppercase tracking-wide text-white"
                        style={{ gridTemplateColumns: GRID, columnGap: 8 }}
                    >
                        {HEADERS.map((h, i) => (
                            <div key={i}>{h}</div>
                        ))}
                    </div>

                    {rows.length === 0 ? (
                        <div className="p-10 text-center text-sm font-semibold text-slate-500">No rows. Use "Add row" to add an item.</div>
                    ) : (
                        <div ref={parentRef} className="h-[62vh] overflow-y-auto">
                            <div style={{ height: rv.getTotalSize(), position: 'relative' }}>
                                {rv.getVirtualItems().map((v) => {
                                    const r = rows[v.index];
                                    return (
                                        <div
                                            key={r.id}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                height: ROW_H,
                                                transform: `translateY(${v.start}px)`,
                                            }}
                                        >
                                            <ItemRow
                                                row={r}
                                                index={v.index}
                                                check={stats.checks[r.id]}
                                                info={info[r.id]}
                                                onChange={store.updateRow}
                                                onRemove={store.removeRow}
                                                onOpenSizes={setSizeRowId}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* lines OCR could not turn into an item */}
            {skipped.length > 0 && (
                <details className="rounded-xl border-2 border-slate-900 bg-white p-4">
                    <summary className="cursor-pointer text-sm font-bold">
                        {skipped.length} lines could not be read as items (tap to review)
                    </summary>
                    <ul className="mt-3 space-y-2">
                        {skipped.map((line, idx) => (
                            <li key={idx} className="flex items-center gap-3 rounded-lg border-2 border-slate-300 p-2">
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">{line}</span>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                        store.addRow({ name: line.replace(/[\d.,]+/g, ' ').replace(/\s+/g, ' ').trim(), rawLine: line, source: 'ocr' });
                                        store.removeSkipped(idx);
                                    }}
                                >
                                    Add as item
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => store.removeSkipped(idx)}>
                                    Ignore
                                </Button>
                            </li>
                        ))}
                    </ul>
                </details>
            )}

            <SizeMatrixEditor
                open={!!sizeRow}
                row={sizeRow}
                onClose={() => setSizeRowId(null)}
                onSave={(sizes) => {
                    store.updateRow(sizeRowId, { sizes });
                    setSizeRowId(null);
                }}
            />

            {/* Restock price change dialog */}
            <RestockPriceDialog
                open={restockDialogOpen}
                restockInfo={restockInfo}
                onConfirm={handleRestockConfirm}
                onClose={() => {
                    setRestockDialogOpen(false);
                    // Still complete the save even if they close the dialog (keep old prices)
                    if (pendingSaveResult) {
                        onSaved(pendingSaveResult);
                        setPendingSaveResult(null);
                        store.reset();
                    }
                }}
            />
        </div>
    );
}
