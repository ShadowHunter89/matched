export interface Profile {
  id: string
  user_id: string
  full_name: string | null
  role: 'professional' | 'client' | null
  onboarding_complete: boolean
  created_at: string
  updated_at: string
}

export interface ProfessionalProfile {
  id: string
  user_id: string
  headline: string | null
  bio: string | null
  years_experience: number | null
  hourly_rate_min: number | null  // stored in cents (e.g. 15000 = $150/hr)
  hourly_rate_max: number | null  // stored in cents
  availability_hours: number | null
  timezone: string | null
  remote_preference: 'remote_only' | 'hybrid' | 'onsite_only' | 'flexible' | null
  skills: string[]
  preferred_industries: string[]
  preferred_team_size: string | null
  is_paused: boolean
  created_at: string
  updated_at: string
}

export interface ClientProfile {
  id: string
  user_id: string
  company_name: string | null
  company_website: string | null
  company_size: string | null
  industry: string | null
  bio: string | null
  stripe_customer_id: string | null
  created_at: string
  updated_at: string
}

export interface Opportunity {
  id: string
  client_id: string
  title: string
  description: string | null
  required_skills: string[]
  budget_min: number | null  // stored in cents
  budget_max: number | null  // stored in cents
  hours_per_week: number | null
  duration_weeks: number | null
  remote_option: 'remote_only' | 'hybrid' | 'onsite_only' | 'flexible' | null
  timezone_requirements: string | null
  client_question: string | null  // one question the client wants professionals to answer
  status: 'open' | 'matching' | 'in_progress' | 'filled' | 'cancelled' | 'expired'
  created_at: string
  updated_at: string
  expires_at: string | null
}

export interface Match {
  id: string
  opportunity_id: string
  professional_id: string
  similarity_score: number | null
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'connected'
  professional_message: string | null
  responded_at: string | null
  accepted_at: string | null
  declined_at: string | null
  decline_reason: string | null
  client_viewed: boolean
  payment_status: string
  stripe_payment_intent_id: string | null
  reminder_sent: boolean
  created_at: string
  updated_at: string
}

// Extended types with joins
export interface MatchWithOpportunity extends Match {
  opportunities: Opportunity | null
}

export interface MatchWithProfessional extends Match {
  professional_profiles: ProfessionalProfile | null
  profiles: Profile | null
}

// ─── Network ─────────────────────────────────────────────────────────────────

export interface NetworkPost {
  id: string
  user_id: string
  type: 'insight' | 'question'
  content: string
  tags: string[]
  like_count: number
  created_at: string
}

export interface NetworkPostEnriched extends NetworkPost {
  authorName: string | null
  authorHeadline: string | null
  authorSkills: string[]
  isLiked: boolean
}

export interface NetworkAnswer {
  id: string
  post_id: string
  user_id: string
  content: string
  like_count: number
  created_at: string
}

export interface NetworkAnswerEnriched extends NetworkAnswer {
  authorName: string | null
  authorHeadline: string | null
  isLiked: boolean
}

export interface AvailabilityPost {
  id: string
  user_id: string
  hours_per_week: number | null
  available_from: string | null
  description: string | null
  skills: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AvailabilityPostEnriched extends AvailabilityPost {
  authorName: string | null
  authorHeadline: string | null
}

export interface Challenge {
  id: string
  title: string
  description: string
  category: string | null
  status: 'active' | 'voting' | 'closed'
  ends_at: string | null
  created_at: string
}

export interface ChallengeSubmission {
  id: string
  challenge_id: string
  user_id: string
  content: string
  vote_count: number
  is_featured: boolean
  created_at: string
}

export interface ChallengeSubmissionEnriched extends ChallengeSubmission {
  authorName: string | null
  authorHeadline: string | null
  isVoted: boolean
  isOwn: boolean
}
