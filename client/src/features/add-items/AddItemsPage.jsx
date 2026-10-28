import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Keyboard, ScanLine, FileSpreadsheet } from 'lucide-react';
import Button from '../../components/ui/Button';
import BillUpload from './BillUpload';
import CsvImport from './CsvImport';
import ReviewTable from './ReviewTable';
import { useImportStore } from './useImportStore';

const TABS = [
    { id: 'scan', label: 'Scan bill', icon: ScanLine },
    { id: 'csv', label: 'Import CSV', icon: FileSpreadsheet },
    { id: 'manual', label: 'Type manually', icon: Keyboard },
];

export default function AddItemsPage() {
    const stage = useImportStore((s) => s.stage);
    const startBlank = useImportStore((s) => s.startBlank);
    const [tab, setTab] = useState('scan');
    const [saved, setSaved] = useState(null);
    const navigate = useNavigate();

    if (saved) {
        return (
            <div className="mx-auto max-w-xl rounded-xl border-2 border-slate-900 bg-white p-8 text-center">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border-2 border-emerald-700 bg-emerald-50 text-emerald-700">
                    <CheckCircle2 size={34} />
                </div>
                <h2 className="text-2xl font-black">Items saved</h2>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                    {saved.added} added
                    {saved.merged ? ` · ${saved.merged} stock updated` : ''}
                    {saved.skipped ? ` · ${saved.skipped} skipped (already in stock)` : ''}
                </p>
                <div className="mt-6 flex justify-center gap-3">
                    <Button variant="secondary" onClick={() => setSaved(null)}>
                        Add more
                    </Button>
                    <Button onClick={() => navigate('/stock')}>View stock</Button>
                </div>
            </div>
        );
    }

    if (stage === 'review') {
        return (
            <div className="mx-auto max-w-[1400px]">
                <div className="mb-5">
                    <h1 className="text-2xl font-black">Review items</h1>
                    <p className="text-sm font-medium text-slate-600">
                        Check the highlighted cells. Hover an item name to see the text read from your bill. Your draft is auto-saved,
                        so you can come back to it later.
                    </p>
                </div>
                <ReviewTable onSaved={setSaved} />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl">
            <div className="mb-6">
                <h1 className="text-3xl font-black">Add items</h1>
                <p className="mt-1 text-sm font-medium text-slate-600">
                    Put your whole shop into BusinessX in one sitting: scan the supplier bill, import a spreadsheet, or type.
                </p>
            </div>

            <div className="mb-5 inline-flex flex-wrap gap-2 rounded-xl border-2 border-slate-900 bg-white p-1.5">
                {TABS.map((t) => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`inline-flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-bold transition-colors ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-transparent hover:bg-slate-100'
                                }`}
                        >
                            <Icon size={16} />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {tab === 'scan' && <BillUpload />}
            {tab === 'csv' && <CsvImport />}
            {tab === 'manual' && (
                <div className="rounded-xl border-2 border-slate-900 bg-white p-6 md:p-8">
                    <div className="mb-3 grid h-14 w-14 place-items-center rounded-xl border-2 border-slate-900 bg-slate-900 text-white">
                        <Keyboard size={28} />
                    </div>
                    <h3 className="text-xl font-extrabold">Type items yourself</h3>
                    <p className="mt-1 max-w-xl text-sm font-medium text-slate-600">
                        Opens the same editable table with one empty row. Add as many rows as you like, including loose items and shoe/clothing
                        sizes.
                    </p>
                    <div className="mt-5">
                        <Button size="lg" onClick={startBlank}>
                            Start with an empty table
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}