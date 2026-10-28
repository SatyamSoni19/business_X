import { NavLink, Outlet } from 'react-router-dom';
import { useState, useEffect, useSyncExternalStore } from 'react';
import { Boxes, PackagePlus, ShoppingCart, BarChart3, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { db } from '../db/dexie';
import ErrorBoundary from './ErrorBoundary';
import Button from './ui/Button';

function useOnlineStatus() {
    return useSyncExternalStore(
        (cb) => {
            window.addEventListener('online', cb);
            window.addEventListener('offline', cb);
            return () => {
                window.removeEventListener('online', cb);
                window.removeEventListener('offline', cb);
            };
        },
        () => navigator.onLine,
        () => true
    );
}

function useDbStatus() {
    const [status, setStatus] = useState({ isBlocked: false, error: null });

    useEffect(() => {
        const onBlocked = () => {
            setStatus({ isBlocked: true, error: null });
        };
        db.on('blocked', onBlocked);

        db.open().catch((err) => {
            console.error('Dexie open error:', err);
            setStatus({ isBlocked: false, error: err });
        });

        return () => {
            db.on('blocked').unsubscribe(onBlocked);
        };
    }, []);

    return status;
}

const link = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-sm font-bold transition-colors ${isActive
        ? 'border-slate-900 bg-slate-900 text-white'
        : 'border-transparent text-slate-800 hover:border-slate-900 hover:bg-slate-100'
    }`;

export default function Layout() {
    const online = useOnlineStatus();
    const dbStatus = useDbStatus();

    return (
        <div className="min-h-screen md:flex">
            <aside className="border-b-2 border-slate-900 bg-white p-4 md:min-h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r-2 md:p-5">
                <div className="mb-4 flex items-center gap-3 md:mb-8">
                    <div className="grid h-10 w-10 place-items-center rounded-lg border-2 border-slate-900 bg-slate-900 text-lg font-black text-white">
                        B
                    </div>
                    <div>
                        <div className="text-lg font-black leading-none">BusinessX</div>
                        <div className="text-xs font-semibold text-slate-500">Stock &amp; profit</div>
                    </div>
                </div>

                <nav className="flex gap-2 md:flex-col">
                    <NavLink to="/add" className={link}>
                        <PackagePlus size={18} /> Add items
                    </NavLink>
                    <NavLink to="/stock" className={link}>
                        <Boxes size={18} /> Stock
                    </NavLink>
                    <NavLink to="/sales" className={link}>
                        <ShoppingCart size={18} /> Sales
                    </NavLink>
                    <NavLink to="/report" className={link}>
                        <BarChart3 size={18} /> Report
                    </NavLink>
                </nav>

                <div
                    className={`mt-4 inline-flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-bold md:mt-8 ${online ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-amber-600 bg-amber-50 text-amber-900'
                        }`}
                >
                    {online ? <Wifi size={14} /> : <WifiOff size={14} />}
                    {online ? 'Online' : 'Offline – everything still works'}
                </div>
            </aside>

            <main className="min-w-0 flex-1 p-4 md:p-8">
                {dbStatus.isBlocked ? (
                    <div className="mx-auto max-w-lg rounded-xl border-2 border-slate-900 bg-white p-6 my-8">
                        <div className="flex items-center gap-3 text-amber-700">
                            <AlertTriangle size={24} />
                            <h2 className="text-lg font-black text-slate-900">Database upgrade blocked</h2>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-700">
                            Close other BusinessX tabs and reload.
                        </p>
                        <div className="mt-4">
                            <Button onClick={() => window.location.reload()}>Reload</Button>
                        </div>
                    </div>
                ) : dbStatus.error ? (
                    <div className="mx-auto max-w-lg rounded-xl border-2 border-slate-900 bg-white p-6 my-8">
                        <div className="flex items-center gap-3 text-red-700">
                            <AlertTriangle size={24} />
                            <h2 className="text-lg font-black text-slate-900">Database failed to open</h2>
                        </div>
                        <p className="mt-2 rounded border border-slate-300 bg-slate-100 p-2 text-xs font-mono text-slate-600 break-words">
                            {dbStatus.error.message || String(dbStatus.error)}
                        </p>
                        <div className="mt-4">
                            <Button onClick={() => window.location.reload()}>Reload</Button>
                        </div>
                    </div>
                ) : (
                    <ErrorBoundary>
                        <Outlet />
                    </ErrorBoundary>
                )}
            </main>
        </div>
    );
}
