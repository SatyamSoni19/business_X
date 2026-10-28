import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Download, FileSpreadsheet } from 'lucide-react';
import Button from '../../components/ui/Button';
import { newRow } from '../../lib/rows';
import { cleanName, canonicalUnit } from '../../parser/normalize';
import { ITEM_TYPES } from '../../lib/constants';
import { useImportStore } from './useImportStore';

const ALIASES = {
    name: ['name', 'item', 'itemname', 'product', 'productname', 'description'],
    qty: ['qty', 'quantity', 'stock', 'instock'],
    purchasePrice: ['purchaseprice', 'purchase', 'cost', 'costprice', 'buyprice', 'buyingprice', 'rate'],
    sellingPrice: ['sellingprice', 'selling', 'sellprice', 'saleprice', 'price', 'sp'],
    mrp: ['mrp'],
    taxRate: ['tax', 'taxrate', 'gst', 'gstrate', 'gstpercent'],
    customId: ['customid', 'id', 'sku', 'code', 'barcode', 'itemcode'],
    unit: ['unit', 'uom'],
    type: ['type'],
    sizes: ['sizes', 'sizewise', 'sizeqty'],
};

function pick(raw, key) {
    const map = {};
    for (const k of Object.keys(raw)) map[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = raw[k];
    for (const a of ALIASES[key]) if (map[a] !== undefined && String(map[a]).trim() !== '') return map[a];
    return undefined;
}

const toNum = (v) => {
    if (v === undefined) return null;
    const n = parseFloat(String(v).replace(/[₹,\s%]/g, ''));
    return Number.isFinite(n) ? n : null;
};

function parseSizes(v) {
    if (!v) return [];
    return String(v)
        .split(/[|;]/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
            const [size, qty] = p.split(':');
            return { size: size.trim(), qty: Math.max(0, parseInt(qty ?? '0', 10) || 0) };
        });
}

function rowFromCsv(raw) {
    const name = pick(raw, 'name');
    if (!name || !String(name).trim()) return null;

    const sizes = parseSizes(pick(raw, 'sizes'));
    const unit = canonicalUnit(pick(raw, 'unit'));
    const typeText = String(pick(raw, 'type') || '').toLowerCase();

    let type = 'packaged';
    if (sizes.length) type = 'sized';
    else if (ITEM_TYPES.includes(typeText)) type = typeText;
    else if (unit && unit !== 'mg') type = 'loose';
    if (type === 'loose' && !(unit && unit !== 'mg')) type = 'packaged';

    return newRow({
        name: cleanName(String(name)),
        type,
        unit: type === 'loose' ? unit : 'pcs',
        qty: type === 'sized' ? sizes.reduce((s, x) => s + x.qty, 0) : toNum(pick(raw, 'qty')),
        purchasePrice: toNum(pick(raw, 'purchasePrice')),
        sellingPrice: toNum(pick(raw, 'sellingPrice')),
        mrp: type === 'loose' ? null : toNum(pick(raw, 'mrp')),
        taxRate: toNum(pick(raw, 'taxRate')),
        customId: String(pick(raw, 'customId') ?? '').trim(),
        sizes: type === 'sized' ? sizes : [],
        source: 'csv',
    });
}

function downloadTemplate() {
    const csv = Papa.unparse([
        { name: 'Fortune Sunflower Oil 1L', qty: 20, purchasePrice: 140, sellingPrice: 160, mrp: 165, taxRate: 5, customId: 'OIL-1L', unit: '', sizes: '' },
        { name: 'Sugar', qty: 50, purchasePrice: 44, sellingPrice: 48, mrp: '', taxRate: '', customId: '', unit: 'kg', sizes: '' },
        { name: 'Bata Walker Sneakers', qty: '', purchasePrice: 620, sellingPrice: 799, mrp: 899, taxRate: 12, customId: 'SH-101', unit: '', sizes: '7:2|8:3|9:3|10:1' },
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'businessx-items-template.csv';
    a.click();
    URL.revokeObjectURL(url);
}

export default function CsvImport() {
    const loadRows = useImportStore((s) => s.loadRows);
    const inputRef = useRef(null);
    const [error, setError] = useState('');

    function handleFile(file) {
        setError('');
        if (!file) return;
        Papa.parse(file, {
            header: true,
            skipEmptyLines: 'greedy',
            complete: (res) => {
                const rows = res.data.map(rowFromCsv).filter(Boolean);
                if (!rows.length) {
                    setError('No items found. Make sure the first row has headers like name, qty, purchasePrice, sellingPrice.');
                    return;
                }
                loadRows(rows, [], file.name);
            },
            error: (e) => setError(e.message || 'Could not read this file'),
        });
    }

    return (
        <div className="rounded-xl border-2 border-slate-900 bg-white p-6 md:p-8">
            <div className="mb-3 grid h-14 w-14 place-items-center rounded-xl border-2 border-slate-900 bg-slate-900 text-white">
                <FileSpreadsheet size={28} />
            </div>
            <h3 className="text-xl font-extrabold">Import from a spreadsheet (CSV)</h3>
            <p className="mt-1 max-w-xl text-sm font-medium text-slate-600">
                Best for shoe and clothing shops: put sizes in one cell like <code className="font-bold">7:2|8:3|9:3</code> (size:quantity).
                For loose items set unit to kg, g, L or ml. Headers are matched flexibly (name, qty, cost, price, mrp, gst, id…).
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
                <Button size="lg" icon={FileSpreadsheet} onClick={() => inputRef.current?.click()}>
                    Choose CSV file
                </Button>
                <Button size="lg" variant="secondary" icon={Download} onClick={downloadTemplate}>
                    Download template
                </Button>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = '';
                }}
            />
            {error && (
                <div className="mt-4 rounded-lg border-2 border-red-700 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div>
            )}
        </div>
    );
}