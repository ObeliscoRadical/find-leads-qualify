import { z } from 'zod'

export const leadStatusSchema = z.enum(['new', 'contacted', 'replied', 'qualified', 'closed', 'opted_out'])

export const leadPayloadSchema = z.object({
  sourceType: z.string().trim().min(1).max(50).default('manual'),
  leadType: z.string().trim().min(1).max(50).default('customer'),
  instagramId: z.string().trim().max(255).nullable().optional(),
  instagramUsername: z.string().trim().max(255).nullable().optional(),
  instagramDisplayName: z.string().trim().max(255).nullable().optional(),
  instagramBio: z.string().trim().max(3000).nullable().optional(),
  instagramFollowers: z.number().int().min(0).nullable().optional(),
  instagramIsBusiness: z.boolean().nullable().optional(),
  instagramCategory: z.string().trim().max(255).nullable().optional(),
  instagramProfileUrl: z.url().max(500).nullable().optional(),
  contactEmail: z.email().max(255).nullable().optional(),
  contactWhatsapp: z.string().trim().max(50).nullable().optional(),
  website: z.url().max(500).nullable().optional(),
  icpSegment: z.string().trim().max(1000).nullable().optional(),
  leadStatus: leadStatusSchema.default('new'),
  noContact: z.boolean().default(false),
  noContactReason: z.string().trim().max(1000).nullable().optional(),
})

export const leadUpdateSchema = leadPayloadSchema.partial()

export const statusUpdateSchema = z.object({
  status: leadStatusSchema,
})

export const messagePayloadSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']).default('user'),
  content: z.string().trim().min(1).max(10000),
  sentVia: z.enum(['api', 'manual']).default('manual'),
  isFromLead: z.boolean().default(false),
  instagramMessageId: z.string().trim().max(255).optional(),
})

export const leadListQuerySchema = z.object({
  status: leadStatusSchema.optional(),
  sourceType: z.string().trim().max(50).optional(),
  leadType: z.string().trim().max(50).optional(),
  search: z.string().trim().max(255).optional(),
  minScore: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})
