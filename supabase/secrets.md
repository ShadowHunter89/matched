# Supabase Edge Function Secrets

Add these in Supabase Dashboard → Edge Functions → Manage Secrets:

| Secret Name | Value | Where to get it |
|-------------|-------|-----------------|
| OPENAI_API_KEY | sk-or-v1-... | OpenRouter dashboard |
| HUGGING_FACE_ACCESS_TOKEN | hf_... | huggingface.co/settings/tokens |
| RESEND_API_KEY | re_... | resend.com dashboard |
| STRIPE_SECRET_KEY | sk_test_... | Stripe → Developers → API keys |
| STRIPE_WEBHOOK_SECRET | whsec_... | Stripe → Webhooks → endpoint secret |
| APP_URL | https://matched-xxx.vercel.app | After Vercel deploy |
