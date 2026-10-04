import { z } from 'zod'

// ============ Types ============

export const ScoringWeightsSchema = z.object({
  keywordMatch: z.number().min(0).max(1).default(0.30),
  businessProfile: z.number().min(0).max(1).default(0.10),
  followerTier: z.number().min(0).max(1).default(0.15),
  engagementProxy: z.number().min(0).max(1).default(0.15),
  semanticSimilarity: z.number().min(0).max(1).default(0.30),
})

export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>

export const CompanyICPProfileSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1),
  keywords: z.array(z.string().trim().min(1)).default([]),
  negativeKeywords: z.array(z.string().trim().min(1)).default([]),
  idealFollowerRange: z.tuple([z.number().int().min(0), z.number().int().min(0)]).default([500, 50_000]),
  requiredCategories: z.array(z.string().trim().min(1)).default([]),
  weights: ScoringWeightsSchema.partial().default({}),
  embeddingVector: z.array(z.number()).optional(),
  updatedAt: z.date().optional(),
})

export type CompanyICPProfile = z.infer<typeof CompanyICPProfileSchema>

export const ScoringInputSchema = z.object({
  companyProfile: CompanyICPProfileSchema,
  leadBio: z.string().max(5000).nullable().optional(),
  leadCategory: z.string().max(255).nullable().optional(),
  leadFollowers: z.number().int().min(0).nullable().optional(),
  leadIsBusiness: z.boolean().nullable().optional(),
  leadEmbedding: z.array(z.number()).optional(),
})

export type ScoringInput = z.infer<typeof ScoringInputSchema>

export const ScoringBreakdownSchema = z.object({
  keywordMatch: z.number().min(0).max(1),
  businessProfile: z.number().min(0).max(1),
  followerTier: z.number().min(0).max(1),
  engagementProxy: z.number().min(0).max(1),
  semanticSimilarity: z.number().min(0).max(1),
})

export type ScoringBreakdown = z.infer<typeof ScoringBreakdownSchema>

export const ScoringResultSchema = z.object({
  score: z.number().min(0).max(1),
  breakdown: ScoringBreakdownSchema,
  signals: z.array(z.string()),
  matchedKeywords: z.array(z.string()),
  excludedBy: z.array(z.string()),
})

export type ScoringResult = z.infer<typeof ScoringResultSchema>

// ============ Default Profile ============

export const DEFAULT_ICP_PROFILE: CompanyICPProfile = {
  organizationId: '',
  name: 'Default',
  keywords: [],
  negativeKeywords: [],
  idealFollowerRange: [500, 50_000],
  requiredCategories: [],
  weights: ScoringWeightsSchema.parse({}),
  updatedAt: new Date(),
}

// ============ Helpers ============

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractKeywords(text: string, minLength = 3): string[] {
  return Array.from(new Set(normalizeText(text).split(/\s+/).filter(w => w.length >= minLength)))
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ============ Main Scoring Function ============

/**
 * Calculate ICP match score for a lead against a company profile.
 * Returns detailed breakdown for explainability.
 */
export function calculateICPScore(input: ScoringInput): ScoringResult {
  const { companyProfile, leadBio, leadCategory, leadFollowers, leadIsBusiness, leadEmbedding } = input
  const weights = { ...DEFAULT_ICP_PROFILE.weights, ...companyProfile.weights } as ScoringWeights

  const signals: string[] = []
  const matchedKeywords: string[] = []
  const excludedBy: string[] = []

  // 1. Negative keywords check (hard exclusion)
  const leadText = normalizeText(`${leadBio || ''} ${leadCategory || ''}`)
  for (const negKw of companyProfile.negativeKeywords) {
    if (leadText.includes(normalizeText(negKw))) {
      excludedBy.push(negKw)
    }
  }

  // If excluded, return zero score with explanation
  if (excludedBy.length > 0) {
    return {
      score: 0,
      breakdown: { keywordMatch: 0, businessProfile: 0, followerTier: 0, engagementProxy: 0, semanticSimilarity: 0 },
      signals: [`Excluído por: ${excludedBy.join(', ')}`],
      matchedKeywords: [],
      excludedBy,
    }
  }

  // 2. Keyword match (positive keywords)
  let keywordScore = 0
  if (companyProfile.keywords.length > 0 && leadText) {
    const leadWords = new Set(extractKeywords(leadText))
    for (const kw of companyProfile.keywords) {
      const normKw = normalizeText(kw)
      if (leadWords.has(normKw) || leadText.includes(normKw)) {
        matchedKeywords.push(kw)
      }
    }
    keywordScore = matchedKeywords.length / companyProfile.keywords.length
    if (matchedKeywords.length > 0) {
      signals.push(`${matchedKeywords.length}/${companyProfile.keywords.length} palavras-chave: ${matchedKeywords.slice(0, 5).join(', ')}${matchedKeywords.length > 5 ? '…' : ''}`)
    }
  }

  // 3. Business profile
  let businessScore = 0
  if (leadIsBusiness) {
    businessScore = 1
    signals.push('Perfil profissional (business)')
  }

  // 4. Follower tier
  let followerScore = 0
  if (leadFollowers !== null && leadFollowers !== undefined) {
    const [min, max] = companyProfile.idealFollowerRange
    if (leadFollowers >= min && leadFollowers <= max) {
      followerScore = 1
      signals.push(`${leadFollowers.toLocaleString()} seguidores (ideal)`)
    } else if (leadFollowers < min) {
      followerScore = Math.max(0, leadFollowers / min) * 0.5
      signals.push(`${leadFollowers.toLocaleString()} seguidores (abaixo do ideal)`)
    } else {
      // Above max - diminishing returns
      followerScore = 0.7
      signals.push(`${leadFollowers.toLocaleString()} seguidores (acima do ideal)`)
    }
  }

  // 5. Engagement proxy (category match + bio richness)
  let engagementScore = 0
  const engagementSignals: string[] = []
  if (leadCategory && companyProfile.requiredCategories.length > 0) {
    const normCategory = normalizeText(leadCategory)
    const hasRequiredCat = companyProfile.requiredCategories.some(rc => normCategory.includes(normalizeText(rc)))
    if (hasRequiredCat) {
      engagementScore += 0.5
      engagementSignals.push(`Categoria: ${leadCategory}`)
    }
  }
  if (leadBio && leadBio.length > 100) {
    engagementScore += 0.3
    engagementSignals.push('Bio detalhada')
  }
  if (leadBio && leadBio.length > 500) {
    engagementScore += 0.2
  }
  engagementScore = Math.min(1, engagementScore)
  if (engagementSignals.length) signals.push(...engagementSignals)

  // 6. Semantic similarity (optional, requires embeddings)
  let semanticScore = 0
  if (leadEmbedding && companyProfile.embeddingVector && leadEmbedding.length === companyProfile.embeddingVector.length) {
    semanticScore = Math.max(0, cosineSimilarity(leadEmbedding, companyProfile.embeddingVector))
    if (semanticScore > 0.7) signals.push(`Similaridade semântica: ${Math.round(semanticScore * 100)}%`)
  }

  // 7. Weighted final score
  const finalScore =
    keywordScore * weights.keywordMatch +
    businessScore * weights.businessProfile +
    followerScore * weights.followerTier +
    engagementScore * weights.engagementProxy +
    semanticScore * weights.semanticSimilarity

  const clampedScore = Math.min(Math.max(Number(finalScore.toFixed(4)), 0), 1)

  return {
    score: clampedScore,
    breakdown: {
      keywordMatch: Number((keywordScore * weights.keywordMatch).toFixed(4)),
      businessProfile: Number((businessScore * weights.businessProfile).toFixed(4)),
      followerTier: Number((followerScore * weights.followerTier).toFixed(4)),
      engagementProxy: Number((engagementScore * weights.engagementProxy).toFixed(4)),
      semanticSimilarity: Number((semanticScore * weights.semanticSimilarity).toFixed(4)),
    },
    signals,
    matchedKeywords,
    excludedBy,
  }
}

// ============ Profile Builders ============

/**
 * Create an ICP profile from organization onboarding data.
 */
export function buildICPProfileFromOnboarding(data: {
  organizationId: string
  orgName: string
  nicho?: string | null
  description?: string | null
}): CompanyICPProfile {
  const keywords = extractKeywords(`${data.nicho || ''} ${data.description || ''}`, 3)
  return {
    organizationId: data.organizationId,
    name: data.orgName,
    keywords: keywords.slice(0, 50), // cap at 50
    negativeKeywords: [],
    idealFollowerRange: [500, 50_000],
    requiredCategories: [],
    weights: {},
    updatedAt: new Date(),
  }
}

/**
 * Merge user edits into existing profile (for settings UI).
 */
export function updateICPProfile(
  current: CompanyICPProfile,
  updates: Partial<CompanyICPProfile>
): CompanyICPProfile {
  return {
    ...current,
    ...updates,
    keywords: updates.keywords ?? current.keywords,
    negativeKeywords: updates.negativeKeywords ?? current.negativeKeywords,
    idealFollowerRange: updates.idealFollowerRange ?? current.idealFollowerRange,
    requiredCategories: updates.requiredCategories ?? current.requiredCategories,
    weights: { ...current.weights, ...updates.weights },
    updatedAt: new Date(),
  }
}