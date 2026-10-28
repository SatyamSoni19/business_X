import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/dexie';
import { getTotalStockValue } from '../../db/stockRepo';
import { seedSunilOilDemo, removeDemoData } from '../../db/seedDemo';
import { inr } from '../../lib/format';
import Button from '../../components/ui/Button';
import { Beaker, Trash2 } from 'lucide-react';

function monthOptions() {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
        });
    }
    return months;
}

export default function ReportPage() {
    const now = new Date();
    const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    const [seeding, setSeeding] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [seedResult, setSeedResult] = useState('');

    const sales = useLiveQuery(() => db.sales.toArray(), [], []);
    const stockValue = useLiveQuery(() => getTotalStockValue(), [], 0);

    const { start, end } = useMemo(() => {
        const [y, m] = month.split('-').map(Number);
        return {
            start: new Date(y, m - 1, 1).getTime(),
            end: new Date(y, m, 1).getTime(),
        };
    }, [month]);

    const report = useMemo(() => {
        const filtered = (sales || []).filter(s => s.soldAt >= start && s.soldAt < end);
        let revenue = 0;
        let cogs = 0;
        let profit = 0;
        const byItem = new Map();

        for (const s of filtered) {
            revenue += s.revenue;
            cogs += s.cogs; // Returns have negative cogs, correctly reducing cost
            profit += s.profit;

            if (!byItem.has(s.itemId)) {
                byItem.set(s.itemId, { itemName: s.itemName, qtySold: 0, revenue: 0, cogs: 0, profit: 0 });
            }
            const entry = byItem.get(s.itemId);
            entry.qtySold += s.type === 'return' ? -s.qty : s.qty;
            entry.revenue += s.revenue;
            entry.cogs += s.cogs;
            entry.profit += s.profit;
        }

        revenue = Math.round(revenue * 100) / 100;
        cogs = Math.round(cogs * 100) / 100;
        profit = Math.round(profit * 100) / 100;
        const margin = revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0;

        return { revenue, cogs, profit, margin, items: [...byItem.values()].sort((a, b) => b.profit - a.profit) };
    }, [sales, start, end]);

    async function loadDemo() {
        setSeeding(true);
        setSeedResult('');
        try {
            const { itemName } = await seedSunilOilDemo();
            setSeedResult(`Demo loaded! "${itemName}" with October transactions. Switch to October 2026 in the month picker to view the report.`);
        } catch (e) {
            setSeedResult(`Error: ${e?.message || 'Could not seed demo'}`);
        } finally {
            setSeeding(false);
        }
    }

    async function handleRemoveDemo() {
        setRemoving(true);
        setSeedResult('');
        try {
            await removeDemoData();
            setSeedResult('Demo data removed successfully.');
        } catch (e) {
            setSeedResult(`Error: ${e?.message || 'Could not remove demo data'}`);
        } finally {
            setRemoving(false);
        }
    }

    return (
        <div className="mx-auto max-w-[1000px]">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-black">Report</h1>
                    <p className="text-sm font-medium text-slate-600">Monthly profit and loss overview.</p>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                    <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="h-11 rounded-lg border-2 border-slate-900 bg-white px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-slate-900/15"
                    >
                        {monthOptions().map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                    <Button variant="secondary" icon={Beaker} onClick={loadDemo} disabled={seeding || removing}>
                        {seeding ? 'Loading…' : "Load Sunil's oil demo"}
                    </Button>
                    <Button variant="secondary" icon={Trash2} onClick={handleRemoveDemo} disabled={seeding || removing}>
                        {removing ? 'Removing…' : 'Remove demo data'}
                    </Button>
                </div>
            </div>

            {seedResult && (
                <div className={`mb-4 rounded-xl border-2 p-4 text-sm font-semibold ${seedResult.startsWith('Error') ? 'border-red-700 bg-red-50 text-red-800' : 'border-emerald-700 bg-emerald-50 text-emerald-800'}`}>
                    {seedResult}
                </div>
            )}

            {/* Summary stats */}
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border-2 border-slate-900 bg-white p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Revenue</div>
                    <div className="mt-1 text-2xl font-black">{inr(report.revenue)}</div>
                </div>
                <div className="rounded-xl border-2 border-slate-900 bg-white p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Cost of items sold</div>
                    <div className="mt-1 text-2xl font-black">{inr(report.cogs)}</div>
                </div>
                <div className="rounded-xl border-2 border-slate-900 bg-white p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Net profit</div>
                    <div className={`mt-1 text-2xl font-black ${report.profit < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {inr(report.profit)}
                    </div>
                </div>
                <div className="rounded-xl border-2 border-slate-900 bg-white p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Margin</div>
                    <div className="mt-1 text-2xl font-black">{report.margin}%</div>
                </div>
            </div>

            {/* Stock value */}
            <div className="mb-6 rounded-xl border-2 border-slate-900 bg-white p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Cost price of stock on hand</div>
                <div className="mt-1 text-2xl font-black">{inr(stockValue)}</div>
            </div>

            {/* Per-item breakdown */}
            {report.items.length > 0 && (
                <div className="rounded-xl border-2 border-slate-900 bg-white">
                    <div className="border-b-2 border-slate-900 px-5 py-3">
                        <h3 className="text-lg font-extrabold">Item breakdown</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white">
                                <tr>
                                    {['Item', 'Qty sold', 'Revenue', 'Cost of items sold', 'Profit'].map(h => (
                                        <th key={h} className="px-3 py-3 font-bold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {report.items.map((item, idx) => (
                                    <tr key={idx} className="border-b border-slate-300 hover:bg-slate-50">
                                        <td className="px-3 py-3 font-bold">{item.itemName}</td>
                                        <td className="px-3 py-3 font-medium">{item.qtySold}</td>
                                        <td className="px-3 py-3 font-medium">{inr(item.revenue)}</td>
                                        <td className="px-3 py-3 font-medium">{inr(item.cogs)}</td>
                                        <td className={`px-3 py-3 font-bold ${item.profit < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                            {inr(item.profit)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {report.items.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-slate-500 bg-white p-12 text-center">
                    <div className="text-lg font-extrabold">No sales this month</div>
                    <p className="mt-1 text-sm font-medium text-slate-600">
                        Record sales from the Sales page, or load the demo to see Sunil's oil example.
                    </p>
                </div>
            )}
        </div>
    );
}
