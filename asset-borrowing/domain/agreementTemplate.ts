import { z } from 'zod';
import { assetAgreementTypeSchema } from './asset';

export const assetAgreementTemplateSchema = z.object({
  id: z.string().uuid(),
  type: assetAgreementTypeSchema,
  title: z.string().trim().min(1).max(500),
  header: z.string().max(20000),
  body: z.string().trim().min(1).max(150000),
  footer: z.string().max(20000),
  isActive: z.boolean(),
  createdBy: z.string().trim(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const assetAgreementTemplateInputSchema = assetAgreementTemplateSchema.omit({
  id: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  isActive: z.boolean().default(true),
});

export type AssetAgreementTemplate = z.infer<typeof assetAgreementTemplateSchema>;
export type AssetAgreementTemplateInput = z.infer<typeof assetAgreementTemplateInputSchema>;
