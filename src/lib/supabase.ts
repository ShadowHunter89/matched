import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || supabaseUrl === 'undefined') {
  console.warn('VITE_SUPABASE_URL is not set. Add it to your .env file.')
}
if (!supabaseAnonKey || supabaseAnonKey === 'undefined') {
  console.warn('VITE_SUPABASE_ANON_KEY is not set. Add it to your .env file.')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
)

export async function queryWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 8000
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Query timed out')), timeoutMs)
  )
  return Promise.race([promise, timeout])
}
