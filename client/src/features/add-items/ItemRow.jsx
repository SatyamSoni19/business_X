import { Trash2 } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import { GST_SLABS, MEASURE_UNIT_LIST, TYPE_SHORT } from '../../lib/constants';

export const GRID = '40px minmax(240px,2.4fr) 120px 140px 110px 110px 110px 84px 120px 150px 40px';
export const ROW_H = 76;

const base =
    'h-10 w-full rounded-md border-2 px-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/15 disabled:bg-slate-100 disabled:text-slate-400';
const tone = (err, warn) =>
    err ? 'border-red-600 bg-red-50' : warn ? 'border-amber-500 bg-amber-50' : 'border-slate-400 bg-white';
const num = (v) => (v === '' ? null : Number(v));

function Money({ value, onChange, err, warn, disabled, suffix }) {
    return (
        <div className="relative">
            <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                disabled={disabled}
                value={value ?? ''}
                placeholder={disabled ? '—' : '0'}
                onChange={(e) => onChange(num(e.target.value))}
                className={`${base} ${tone(err, warn)} ${suffix ? 'pr-10' : ''}`}
            />
            {suffix && (
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">
                    {suffix}
                </span>
            )}
        </div>
    );
}

export default function ItemRow({ row, index, check, info, onChange, onRemove, onOpenSizes }) {
    const e = check.errors;
    const w = check.warnings;
    const set = (patch) => onChange(row.id, patch);
    const loose = row.type === 'loose';
    const sized = row.type === 'sized';
    const taxOptions = [...new Set([...GST_SLABS, ...(row.taxRate != null ? [row.taxRate] : [])])].sort((a, b) => a - b);
    const hasErr = Object.keys(e).length > 0;
    const hasWarn = Object.keys(w).length > 0;
    const message = Object.values(e)[0] || Object.values(w)[0];

    return (
        <div
            className={`grid items-center border-b border-slate-300 px-3 ${hasErr ? 'bg-red-50/40' : 'bg-white'}`}
            style={{ gridTemplateColumns: GRID, columnGap: 8, height: ROW_H }}
        >
            <div className="text-sm font-bold text-slate-500">{index + 1}</div>

            {/* name */}
            <div title={row.rawLine ? `Read from bill: ${row.rawLine}` : undefined}>
                <input
                    value={row.name}
                    onChange={(ev) => set({ name: ev.target.value })}
                    placeholder="Item name"
                    className={`${base} ${tone(e.name, w.name)}`}
                />
                <div
                    className={`mt-0.5 h-4 truncate text-xs font-semibold ${hasErr ? 'text-red-700' : hasWarn ? 'text-amber-700' : 'text-transparent'
                        }`}
                >
                    {message || '.'}
                </div>
            </div>

            {/* type */}
            <select value={row.type} onChange={(ev) => set({ type: ev.target.value })} className={`${base} border-slate-400 bg-white`}>
                {Object.entries(TYPE_SHORT).map(([k, label]) => (
                    <option key={k} value={k}>
                        {label}
                    </option>
                ))}
            </select>

            {/* quantity */}
            {sized ? (
                <button
                    onClick={() => onOpenSizes(row.id)}
                    className={`h-10 w-full rounded-md border-2 border-slate-900 bg-slate-900 px-2 text-xs font-bold text-white hover:bg-black ${e.qty ? 'ring-2 ring-red-500' : ''
                        }`}
                >
                    {row.sizes.length ? `${row.sizes.length} sizes · ${row.qty}` : 'Add sizes'}
                </button>
            ) : loose ? (
                <div className="flex gap-1">
                    <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={row.qty ?? ''}
                        onChange={(ev) => set({ qty: num(ev.target.value) })}
                        className={`${base} ${tone(e.qty, w.qty)}`}
                    />
                    <select
                        value={row.unit}
                        onChange={(ev) => set({ unit: ev.target.value })}
                        className={`${base} w-[64px] shrink-0 border-slate-400 bg-white px-1`}
                    >
                        {MEASURE_UNIT_LIST.map((u) => (
                            <option key={u}>{u}</option>
                        ))}
                    </select>
                </div>
            ) : (
                <Money value={row.qty} onChange={(v) => set({ qty: v })} err={e.qty} warn={w.qty} suffix="pcs" />
            )}

            <Money
                value={row.purchasePrice}
                onChange={(v) => set({ purchasePrice: v })}
                err={e.purchasePrice}
                warn={w.purchasePrice}
                suffix={loose ? `/${row.unit}` : null}
            />
            <Money
                value={row.sellingPrice}
                onChange={(v) => set({ sellingPrice: v })}
                err={e.sellingPrice}
                warn={w.sellingPrice}
                suffix={loose ? `/${row.unit}` : null}
            />
            <Money value={row.mrp} onChange={(v) => set({ mrp: v })} disabled={loose} />

            <select
                value={row.taxRate ?? ''}
                onChange={(ev) => set({ taxRate: ev.target.value === '' ? null : Number(ev.target.value) })}
                className={`${base} ${tone(false, w.taxRate)}`}
            >
                <option value="">—</option>
                {taxOptions.map((t) => (
                    <option key={t} value={t}>
                        {t}%
                    </option>
                ))}
            </select>

            <input
                value={row.customId}
                onChange={(ev) => set({ customId: ev.target.value })}
                placeholder="Optional"
                className={`${base} ${tone(e.customId, false)}`}
                title={e.customId || ''}
            />

            {/* status */}
            <div>
                {hasErr ? (
                    <Badge tone="error">Fix</Badge>
                ) : info.existing ? (
                    <select
                        value={row.dupAction}
                        onChange={(ev) => set({ dupAction: ev.target.value })}
                        className="h-9 w-full rounded-md border-2 border-sky-700 bg-sky-50 px-1 text-xs font-bold text-sky-900 outline-none"
                        title="This item already exists in your stock"
                    >
                        <option value="skip">In stock · skip</option>
                        <option value="add">In stock · add qty</option>
                    </select>
                ) : hasWarn ? (
                    <Badge tone="warn">Check</Badge>
                ) : (
                    <Badge tone="ok">Ready</Badge>
                )}
            </div>

            <button
                onClick={() => onRemove(row.id)}
                aria-label="Delete row"
                className="grid h-9 w-9 place-items-center rounded-md border-2 border-transparent text-slate-600 hover:border-red-700 hover:bg-red-50 hover:text-red-700"
            >
                <Trash2 size={17} />
            </button>
        </div>
    );
}