import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY!

// Server-only Supabase client (service role key)
export const supabase = createClient(supabaseUrl, supabaseKey)
