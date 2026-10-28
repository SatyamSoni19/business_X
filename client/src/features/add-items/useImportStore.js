import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { newRow, sumSizes, mergeSizes } from '../../lib/rows';
import { canonicalKey } from '../../parser/normalize';

function applyPatch(r, patch) {
    const next = { ...r, ...patch };
    if (patch.type && patch.type !== r.type) {
        next.unit = patch.type === 'loose' ? 'kg' : 'pcs';
        if (patch.type === 'loose') next.mrp = null;
        if (patch.type === 'sized') next.qty = sumSizes(next.sizes);
    }
    if (patch.sizes) next.qty = sumSizes(patch.sizes);
    return next;
}

const emptyState = { stage: 'idle', rows: [], skipped: [], sourceLabel: '', error: null };

// Draft rows are persisted in localStorage so a half-reviewed bill survives a refresh or crash.
export const useImportStore = create(
    persist(
        (set) => ({
            ...emptyState,
            progress: { pct: 0, message: '' },

            setProgress: (progress) => set({ progress }),
            startProcessing: () => set({ stage: 'processing', error: null, progress: { pct: 0, message: 'Starting…' } }),
            fail: (error) => set({ stage: 'idle', error }),
            loadRows: (rows, skipped = [], sourceLabel = '') =>
                set({ rows, skipped, sourceLabel, stage: 'review', error: null }),
            startBlank: () => set({ rows: [newRow()], skipped: [], sourceLabel: 'Manual entry', stage: 'review', error: null }),

            addRow: (over) => set((s) => ({ rows: [...s.rows, newRow(over)] })),
            updateRow: (id, patch) => set((s) => ({ rows: s.rows.map((r) => (r.id === id ? applyPatch(r, patch) : r)) })),
            removeRow: (id) => set((s) => ({ rows: s.rows.filter((r) => r.id !== id) })),
            removeSkipped: (idx) => set((s) => ({ skipped: s.skipped.filter((_, i) => i !== idx) })),

            // bills have purchase price only – fill empty selling prices in one click
            fillSellingPrices: ({ mode, margin }) =>
                set((s) => ({
                    rows: s.rows.map((r) => {
                        if (r.sellingPrice > 0) return r;
                        if (mode === 'mrp' && r.mrp) return { ...r, sellingPrice: r.mrp };
                        if (r.purchasePrice > 0) {
                            let p = r.purchasePrice * (1 + margin / 100);
                            p = r.type === 'loose' ? Math.round(p * 100) / 100 : Math.ceil(p);
                            if (r.mrp && p > r.mrp) p = r.mrp;
                            return { ...r, sellingPrice: p };
                        }
                        return r;
                    }),
                })),

            // same item listed twice on the bill -> add quantities into the first row
            mergeBillDuplicates: () =>
                set((s) => {
                    const seen = new Map();
                    const out = [];
                    for (const r of s.rows) {
                        const key = canonicalKey(r.name);
                        if (!key) {
                            out.push(r);
                            continue;
                        }
                        const first = seen.get(key);
                        if (!first) {
                            const copy = { ...r };
                            seen.set(key, copy);
                            out.push(copy);
                        } else if (first.type === 'sized') {
                            first.sizes = mergeSizes(first.sizes, r.sizes);
                            first.qty = sumSizes(first.sizes);
                        } else {
                            first.qty = (first.qty || 0) + (r.qty || 0);
                        }
                    }
                    return { rows: out };
                }),

            reset: () => set({ ...emptyState, progress: { pct: 0, message: '' } }),
        }),
        {
            name: 'businessx-import-draft',
            partialize: (s) => ({
                rows: s.rows,
                skipped: s.skipped,
                sourceLabel: s.sourceLabel,
                stage: s.stage === 'review' ? 'review' : 'idle',
            }),
        }
    )
);