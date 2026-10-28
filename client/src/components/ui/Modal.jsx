import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    if (!open) return null;
    const width = size === 'lg' ? 'max-w-3xl' : 'max-w-xl';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onMouseDown={onClose}>
            <div
                className={`flex max-h-[92vh] w-full ${width} flex-col rounded-xl border-2 border-slate-900 bg-white shadow-2xl`}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b-2 border-slate-900 px-5 py-3">
                    <h3 className="text-lg font-bold">{title}</h3>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="rounded-md border-2 border-slate-900 p-1 hover:bg-slate-100"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="overflow-y-auto p-5">{children}</div>
                {footer && <div className="flex justify-end gap-3 border-t-2 border-slate-900 bg-slate-50 px-5 py-3">{footer}</div>}
            </div>
        </div>
    );
}