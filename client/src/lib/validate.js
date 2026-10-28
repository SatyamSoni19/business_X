import { GST_SLABS } from './constants';

// Row-level checks used live in the review table.
// errors   = block saving, warnings = shown but allowed.
export function validateRow(row) {
    const errors = {};
    const warnings = {};

    if (!row.name || row.name.trim().length < 2) errors.name = 'Enter an item name';

    if (row.qty == null || row.qty < 0) errors.qty = 'Enter quantity';
    else if (row.type !== 'loose' && !Number.isInteger(row.qty)) errors.qty = 'Whole number only';
    if (row.type === 'sized' && row.sizes.length === 0) errors.qty = 'Add sizes';

    if (!(row.purchasePrice > 0)) errors.purchasePrice = 'Required';
    if (!(row.sellingPrice > 0)) errors.sellingPrice = 'Required';

    if (!errors.purchasePrice && !errors.sellingPrice) {
        if (row.sellingPrice < row.purchasePrice) warnings.sellingPrice = 'Selling below cost';
        if (row.type !== 'loose' && row.mrp != null && row.sellingPrice > row.mrp)
            warnings.sellingPrice = 'Selling above MRP';
    }
    if (row.type !== 'loose' && row.mrp != null && row.purchasePrice > row.mrp)
        warnings.purchasePrice = 'Cost is above MRP';

    if (row.taxRate != null && !GST_SLABS.includes(row.taxRate)) warnings.taxRate = 'Unusual GST rate';

    if (row.source === 'ocr') {
        if (row.confidence != null && row.confidence < 70)
            warnings.name = warnings.name || 'Low OCR confidence – compare with bill';
        if (row.verified === false) warnings.qty = warnings.qty || 'Qty × rate did not match the amount';
    }

    return { errors, warnings };
}