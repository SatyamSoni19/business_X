import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { SIZE_PRESETS } from '../../lib/constants';

export default function SizeMatrixEditor({ open, row, onClose, onSave }) {
    const [sizes, setSizes] = useState([]);
    const [custom, setCustom] = useState('');
    const [fillAll, setFillAll] = useState('');

    useEffect(() => {
        if (open) {
            setSizes((row?.sizes || []).map((s) => ({ ...s })));
            setCustom('');
            setFillAll('');
        }
    }, [open, row?.id]);

    const total = sizes.reduce((s, x) => s + x.qty, 0);
    const clean = (v) => Math.max(0, Math.floor(Number(v) || 0));

    const addSizes = (labels) =>
        setSizes((list) => {
            const have = new Set(list.map((s) => s.size));
            return [...list, ...labels.filter((l) => !have.has(l)).map((l) => ({ size: l, qty: 0 }))];
        });
    const setQty = (size, v) => setSizes((list) => list.map((s) => (s.size === size ? { ...s, qty: clean(v) } : s)));
    const remove = (size) => setSizes((list) => list.filter((s) => s.size !== size));

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            title={`Sizes – ${row?.name || 'New item'}`}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={() => onSave(sizes)}>Save sizes ({total} pcs)</Button>
                </>
            }
        >
            <div className="space-y-5">
                <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Quick size sets</div>
                    <div className="flex flex-wrap gap-2">
                        {SIZE_PRESETS.map((p) => (
                            <Button key={p.label} size="sm" variant="secondary" onClick={() => addSizes(p.sizes)}>
                                + {p.label}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Add custom sizes</div>
                        <input
                            value={custom}
                            onChange={(e) => setCustom(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    addSizes(custom.split(/[,\s]+/).filter(Boolean));
                                    setCustom('');
                                }
                            }}
                            placeholder="e.g. 5, 5.5, 6"
                            className="h-10 w-52 rounded-md border-2 border-slate-400 px-3 text-sm font-medium outline-none focus:border-slate-900"
                        />
                    </div>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                            addSizes(custom.split(/[,\s]+/).filter(Boolean));
                            setCustom('');
                        }}
                    >
                        Add
                    </Button>
                    <div className="ml-auto flex items-end gap-2">
                        <div>
                            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Set all to</div>
                            <input
                                type="number"
                                min="0"
                                value={fillAll}
                                onChange={(e) => setFillAll(e.target.value)}
                                className="h-10 w-20 rounded-md border-2 border-slate-400 px-3 text-sm font-medium outline-none focus:border-slate-900"
                            />
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={fillAll === ''}
                            onClick={() => setSizes((list) => list.map((s) => ({ ...s, qty: clean(fillAll) })))}
                        >
                            Apply
                        </Button>
                    </div>
                </div>

                {sizes.length === 0 ? (
                    <div className="rounded-lg border-2 border-dashed border-slate-400 p-6 text-center text-sm font-semibold text-slate-500">
                        Pick a quick size set above, or add your own sizes.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {sizes.map((s, idx) => (
                            <div key={s.size} className="relative rounded-lg border-2 border-slate-900 bg-white p-3">
                                <button
                                    onClick={() => remove(s.size)}
                                    aria-label={`Remove size ${s.size}`}
                                    className="absolute right-1.5 top-1.5 text-slate-500 hover:text-red-700"
                                >
                                    <X size={14} />
                                </button>
                                <div className="text-xs font-bold uppercase text-slate-500">Size</div>
                                <div className="mb-2 text-xl font-black">{s.size}</div>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    autoFocus={idx === 0}
                                    value={s.qty}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => setQty(s.size, e.target.value)}
                                    className="h-10 w-full rounded-md border-2 border-slate-400 px-2 text-center text-base font-bold outline-none focus:border-slate-900"
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}