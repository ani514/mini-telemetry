import { createClient } from '@supabase/supabase-js';

// '!' is telling TypeScript that we are sure these environment variables will be defined at runtime.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);