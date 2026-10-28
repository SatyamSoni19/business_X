import { z } from 'zod';
import { ITEM_TYPES, ALL_UNITS } from '../lib/constants';

// Final gate before anything is written to the database.
export const itemSchema = z
    .object({
        name: z.string().trim().min(2, 'Name is too short').max(120),
        type: z.enum(ITEM_TYPES),
        unit: z.enum(ALL_UNITS),
        qty: z.number().min(0),
        purchasePrice: z.number().positive(),
        sellingPrice: z.number().positive(),
        mrp: z.number().positive().nullable(),
        taxRate: z.number().min(0).max(100).nullable(),
        customId: z.string().trim().max(40).nullable(),
        sizes: z.array(z.object({ size: z.string().trim().min(1), qty: z.number().int().min(0) })),
        isDemo: z.boolean().optional(),
    })
    .superRefine((v, ctx) => {
        if (v.type !== 'loose' && !Number.isInteger(v.qty)) {
            ctx.addIssue({ code: 'custom', path: ['qty'], message: 'Quantity must be a whole number' });
        }
        if (v.type === 'sized') {
            if (v.sizes.length === 0) ctx.addIssue({ code: 'custom', path: ['sizes'], message: 'Add at least one size' });
            const sum = v.sizes.reduce((s, x) => s + x.qty, 0);
            if (sum !== v.qty) ctx.addIssue({ code: 'custom', path: ['qty'], message: 'Size quantities must add up' });
        }
    });
