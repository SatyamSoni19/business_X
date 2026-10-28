const inr0 = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
});

export const inr = (n) => (n == null || Number.isNaN(n) ? '—' : inr0.format(n));
export const fmtQty = (item) => (item.type === 'loose' ? `${item.qty} ${item.unit}` : `${item.qty}`);