import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nkipkczsxkxdxgjdaelh.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raXBrY3pza3hrZHhnamRhZWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjY1NzYsImV4cCI6MjA5NzMwMjU3Nn0.MCn9P4PHuiHq84RZvoSdyDfZ22xAVs99UF0sa7Bc77w'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
