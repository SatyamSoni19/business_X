const TONES = {
    neutral: 'bg-slate-100 text-slate-800 border-slate-500',
    ok: 'bg-emerald-50 text-emerald-900 border-emerald-700',
    warn: 'bg-amber-50 text-amber-900 border-amber-600',
    error: 'bg-red-50 text-red-800 border-red-700',
    info: 'bg-sky-50 text-sky-900 border-sky-700',
};

export default function Badge({ tone = 'neutral', className = '', children, ...props }) {
    return (
        <span
            {...props}
            className={`inline-flex items-center rounded-md border-2 px-2 py-0.5 text-xs font-bold ${TONES[tone]} ${className}`}
        >
            {children}
        </span>
    );
}