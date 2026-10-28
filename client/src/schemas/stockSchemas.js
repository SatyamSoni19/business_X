import { z } from 'zod';

export const batchSchema = z.object({
    itemId: z.string().min(1),
    receivedAt: z.number().positive(),
    qtyIn: z.number().positive(),
    qtyLeft: z.number().min(0),
    purchasePrice: z.number().positive(),
    mrp: z.number().positive().nullable(),
    isDemo: z.boolean().optional(),
});

export const restockSchema = z.object({
    itemId: z.string().min(1),
    qty: z.number().positive(),
    purchasePrice: z.number().positive(),
    mrp: z.number().positive().nullable().optional(),
    sellingPrice: z.number().positive().optional(),
    sizes: z.array(z.object({ size: z.string().min(1), qty: z.number().int().min(0) })).optional(),
    receivedAt: z.number().positive().optional(),
    isDemo: z.boolean().optional(),
});

export const saleSchema = z.object({
    itemId: z.string().min(1),
    qty: z.number().positive(),
    unitPrice: z.number().positive(),
    size: z.string().optional(),
    soldAt: z.number().positive().optional(),
    isDemo: z.boolean().optional(),
});

export const returnSchema = z.object({
    saleId: z.string().min(1),
    qty: z.number().positive(),
    isDemo: z.boolean().optional(),
});
