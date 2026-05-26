import { z } from 'zod';

export const sellerSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  whatsappPhone: z.string().trim().min(7).max(32),
  category: z.enum(['clothing', 'beauty', 'food', 'accessories', 'other']),
  mainChannel: z.enum(['whatsapp', 'instagram', 'tiktok', 'other']),
  logoUrl: z.string().url().optional().or(z.literal(''))
});

export const createOrderSchema = z.object({
  sellerId: z.string().uuid(),
  buyerName: z.string().trim().min(2).max(120),
  buyerPhone: z.string().trim().min(7).max(32),
  productName: z.string().trim().min(2).max(160),
  productVariation: z.string().trim().max(160).optional().or(z.literal('')),
  quantity: z.coerce.number().int().positive().max(999),
  amount: z.coerce.number().min(0).max(9999999),
  currency: z.string().trim().min(3).max(3).default('GHS'),
  deliveryArea: z.string().trim().min(2).max(160),
  deliveryAddress: z.string().trim().max(300).optional().or(z.literal('')),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentTerms: z.enum(['unpaid', 'part_paid', 'paid', 'pay_on_delivery']),
  internalNotes: z.string().trim().max(1000).optional().or(z.literal(''))
});

export const publicBuyerRequestSchema = createOrderSchema.omit({ sellerId: true });

export const readinessSchema = z.object({
  sellerId: z.string().uuid(),
  packageReady: z.boolean()
});

export const sellerScopedSchema = z.object({
  sellerId: z.string().uuid()
});

export const confirmReceiptSchema = z.object({
  buyerName: z.string().trim().min(2).max(120).optional(),
  buyerPhone: z.string().trim().min(7).max(32).optional(),
  deliveryAddress: z.string().trim().max(300).optional()
});
