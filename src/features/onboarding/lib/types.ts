export interface OnboardingAnswers {
  productDescription: string
  targetCustomer: string
  competitors: string[]
}

export interface GeneratedKeywords {
  keywords: string[]
  subreddits: string[]
  competitorKeywords: string[]
}

export interface OnboardingStep {
  step: 1 | 2 | 3
  heading: string
  placeholder: string
  skipLabel?: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    step: 1,
    heading: "What does your product do?",
    placeholder: "e.g., AI-powered CRM for freelancers",
  },
  {
    step: 2,
    heading: "Who is your ideal customer?",
    placeholder: "e.g., Solo founders looking for their first 100 users",
  },
  {
    step: 3,
    heading: "Any competitors?",
    placeholder: "e.g., HubSpot, Pipedrive",
    skipLabel: "Skip for now",
  },
]
