# Matched — Where Work Finds You

A reverse professional matching platform. Clients post opportunities and the system delivers them to only the top 3–5 matching professionals using AI-powered vector similarity search. No public job board. No applying. No searching.

---

## What It Does

**For professionals:** Build your profile once. When a client posts an opportunity that fits your skills, rate, and availability — it comes to you. Accept or decline in one click.

**For clients:** Post what you need. Our AI matches it against every professional in the network and delivers your top 3–5 fits within hours. Pay $150 to unlock contact details when someone interests you.

---

## Live Demo

**Production URL:** https://matched-nf1mn6cc1-haideralik583-5221s-projects.vercel.app

**Test accounts:**

| Email | Password | Role |
|-------|----------|------|
| sarah.kim@test.com | testpass123 | Professional (Fractional CTO) |
| marcus.webb@test.com | testpass123 | Professional (Growth Engineer) |
| priya.nair@test.com | testpass123 | Professional (Fractional CFO) |
| tom.farrell@test.com | testpass123 | Professional (Head of Product) |
| lin.zhao@test.com | testpass123 | Professional (Brand Designer) |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Backend | Supabase (PostgreSQL + Edge Functions) |
| Vector Search | pgvector (cosine similarity) |
| Embeddings | OpenRouter (openai/text-embedding-3-small) + HuggingFace fallback |
| Auth | Supabase Auth |
| Payments | Stripe ($150 per connection) |
| Email | Resend |
| Deployment | Vercel (frontend) + Supabase (backend) |

---

## How the Matching Works

1. Professional completes profile → system generates a 1536-dimension embedding vector from their headline, bio, skills, rate, and preferences
2. Client posts opportunity → system generates embedding from title, description, required skills, and budget
3. Vector similarity search (cosine distance) finds the closest professional profiles to the opportunity
4. Top 3–5 matches are delivered to those professionals only
5. Professionals accept or decline — clients only see interested ones
6. Client pays $150 to unlock contact details

**Fallback:** If embeddings are unavailable, skill-based scoring (overlap, rate, availability, remote preference) is used automatically.

---

## Project Structure

```
matched/
├── src/
│   ├── pages/
│   │   ├── Landing.tsx                  # Public landing page
│   │   ├── Auth.tsx                     # Sign in / Sign up
│   │   ├── Role.tsx                     # Professional or Client
│   │   ├── onboarding/
│   │   │   ├── Professional.tsx
│   │   │   └── Client.tsx
│   │   ├── dashboard/
│   │   │   ├── ProfessionalDashboard.tsx
│   │   │   └── ClientDashboard.tsx
│   │   ├── NewOpportunity.tsx
│   │   ├── Profile.tsx
│   │   ├── Analytics.tsx
│   │   ├── AdminDiagnostics.tsx
│   │   └── admin/Seed.tsx
│   ├── components/
│   │   ├── PaymentDialog.tsx             # Stripe payment flow
│   │   └── layout/DashboardLayout.tsx   # Nav + notification badges
│   ├── hooks/
│   │   └── useAuth.ts                   # Auth state listener
│   ├── store/
│   │   └── authStore.ts                 # Zustand auth store
│   └── lib/
│       ├── supabase.ts                  # Supabase client
│       └── types.ts                     # Shared TypeScript types
├── supabase/
│   ├── functions/
│   │   ├── generate-embedding/          # OpenRouter + HuggingFace
│   │   ├── embed-professional/          # Profile → vector
│   │   ├── match-professionals/         # Vector search + fallback
│   │   ├── send-match-email/            # Notify professional
│   │   ├── send-client-notification/    # Notify client
│   │   ├── create-payment-intent/       # Stripe intent
│   │   ├── stripe-webhook/              # Payment confirmation
│   │   └── seed-professionals/          # Test data
│   ├── schema.sql                       # All tables, indexes, RPCs
│   └── rls.sql                          # Row Level Security policies
└── README.md
```

---

## Database Schema

```sql
profiles              -- user role + onboarding status
professional_profiles -- skills, rate, availability, embedding vector
client_profiles       -- company info, Stripe customer ID
opportunities         -- posted roles with embedding vector
matches               -- professional ↔ opportunity with similarity score
```

---

## Edge Functions

| Function | Purpose |
|----------|---------|
| `generate-embedding` | Converts text to 1536-dim vector via OpenRouter/HuggingFace |
| `embed-professional` | Builds profile text and stores embedding |
| `match-professionals` | Vector similarity search with skill-based fallback |
| `send-match-email` | Notifies professional of new match via Resend |
| `send-client-notification` | Notifies client when professional accepts |
| `create-payment-intent` | Creates Stripe payment intent ($150) |
| `stripe-webhook` | Marks match as connected after payment |
| `seed-professionals` | Creates 5 test professionals with embeddings |

---

## Local Development

### Prerequisites

- Node.js 18+
- Supabase CLI
- A Supabase project with pgvector enabled

### Setup

```bash
# Clone the repo
git clone https://github.com/ShadowHunter89/matched
cd matched

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

Edit `.env` with your values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Run the database migrations

In Supabase SQL Editor, run in order:
1. `supabase/schema.sql`
2. `supabase/rls.sql`

### Deploy edge functions

```bash
supabase link --project-ref your-project-ref
supabase functions deploy --all
```

### Add Supabase secrets

In Supabase Dashboard → Edge Functions → Manage Secrets:

```
OPENAI_API_KEY              # OpenRouter key (sk-or-v1-...)
HUGGING_FACE_ACCESS_TOKEN   # HuggingFace token (hf_...)
RESEND_API_KEY              # Resend API key
STRIPE_SECRET_KEY           # Stripe secret key
STRIPE_WEBHOOK_SECRET       # Stripe webhook signing secret
APP_URL                     # Your deployed frontend URL
```

### Start development server

```bash
npm run dev
```

Visit http://localhost:5173

---

## Deployment

### Frontend (Vercel)

```bash
npm run build
vercel --prod
```

Add environment variables in Vercel dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`

### Stripe Webhook

Set webhook endpoint in Stripe Dashboard to:

```
https://your-supabase-project.supabase.co/functions/v1/stripe-webhook
```

Listen for: `payment_intent.succeeded`

---

## Testing

### Seed test data

Visit `/admin/seed` while logged in to create 5 test professionals with pre-generated embeddings.

### Run diagnostics

Visit `/admin/diagnostics` while logged in to verify all 8 system components are working:

- Database connection
- Professional profiles count
- Embeddings populated
- `generate-embedding` function
- Opportunities exist
- `match-professionals` function
- Matches in database
- RLS policies

### Test payment flow

Use Stripe test cards:

| Card | Result |
|------|--------|
| 4242 4242 4242 4242 | Success |
| 4000 0000 0000 0002 | Declined |
| 4000 0025 0000 3155 | Requires authentication |

Use any future expiry date and any 3-digit CVC.

---

## Key Design Decisions

**Why reverse matching?** Traditional job boards create noise for both sides. Professionals waste time applying to irrelevant roles. Clients waste time reading 200 applications. By delivering only top matches to professionals — and only showing clients who is interested — both sides save significant time.

**Why vector embeddings?** Keyword matching misses semantic similarity. A "Head of Engineering" and a "VP of Technology" are the same role. Vector similarity captures meaning, not just words. This produces significantly better matches than tag-based systems.

**Why $150 per connection?** The value of a successful professional hire is typically $10,000–50,000+. $150 is less than 1% of that value, making it easy to justify. It also filters out clients who aren't serious, improving response quality for professionals.

---

## Roadmap

- [ ] In-app messaging between connected parties
- [ ] LinkedIn profile import for professionals
- [ ] Team/project-based matching (multiple professionals for one project)
- [ ] Mobile app (React Native)
- [ ] Industry-specific matching models
- [ ] Analytics dashboard with match quality trends
- [ ] API for enterprise clients
- [ ] Subscription tier for professionals (priority matching)

---

## Built With

- [Supabase](https://supabase.com) — database, auth, edge functions
- [pgvector](https://github.com/pgvector/pgvector) — vector similarity search
- [OpenRouter](https://openrouter.ai) — AI model routing
- [Stripe](https://stripe.com) — payments
- [Resend](https://resend.com) — transactional email
- [Vercel](https://vercel.com) — frontend deployment
- [Tailwind CSS](https://tailwindcss.com) — styling
- [Vite](https://vitejs.dev) — build tool

---

## License

MIT License — see [LICENSE](LICENSE) file for details.

---

Built by [Haider Ali Khan](https://github.com/ShadowHunter89)
