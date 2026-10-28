const VARIANTS = {
    primary: 'bg-slate-900 text-white border-slate-900 hover:bg-black',
    secondary: 'bg-white text-slate-900 border-slate-900 hover:bg-slate-100',
    danger: 'bg-red-700 text-white border-red-800 hover:bg-red-800',
    outlineDanger: 'bg-white text-red-700 border-red-700 hover:bg-red-50',
};
const SIZES = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-5 text-sm', lg: 'h-12 px-6 text-base' };

export default function Button({
    variant = 'primary',
    size = 'md',
    icon: Icon,
    className = '',
    type = 'button',
    children,
    ...props
}) {
    return (
        <button
            type={type}
            {...props}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border-2 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
        >
            {Icon && <Icon size={size === 'sm' ? 16 : 18} />}
            {children}
        </button>
    );
}