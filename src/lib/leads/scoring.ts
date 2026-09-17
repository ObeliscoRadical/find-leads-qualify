export interface ScoringInput {
  companyNiche?: string | null
  companyDescription?: string | null
  leadBio?: string | null
  leadCategory?: string | null
  leadFollowers?: number | null
  leadIsBusiness?: boolean | null
}

export function calculateICPScore(input: ScoringInput): number {
  let score = 0.5 // Baseline score

  const nicheWords = (input.companyNiche || '')
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length > 2)
  const descWords = (input.companyDescription || '')
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length > 3)

  const targetWords = Array.from(new Set([...nicheWords, ...descWords]))

  const leadText = `${input.leadBio || ''} ${input.leadCategory || ''}`.toLowerCase()

  if (targetWords.length > 0 && leadText) {
    let matches = 0
    for (const word of targetWords) {
      if (leadText.includes(word)) {
        matches++
      }
    }
    const matchRatio = matches / targetWords.length
    score += matchRatio * 0.3
  }

  // Adjust for business profile
  if (input.leadIsBusiness) {
    score += 0.1
  }

  // Adjust for follower count (micro to mid-tier targets)
  if (input.leadFollowers) {
    if (input.leadFollowers >= 500 && input.leadFollowers <= 50000) {
      score += 0.1
    } else if (input.leadFollowers > 50000) {
      score += 0.05
    }
  }

  // Clamp between 0.00 and 1.00
  return Math.min(Math.max(Number(score.toFixed(2)), 0), 1)
}
