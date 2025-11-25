// --- Supabase Service Imports ---
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- Configuration ---
const SUPABASE_URL = 'https://wsgxvhcdpyrjxyuhlnnw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZ3h2aGNkcHlyanh5dWhsbm53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwMTI0OTQsImV4cCI6MjA3OTU4ODQ5NH0.jUvCn87qoitKsuITPZAf7Urph-H-ZHXn6Y_LOHcHZj8';

// --- Configuration Check ---
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Supabase configuration is missing. Check SUPABASE_URL and SUPABASE_ANON_KEY.");
    throw new Error("Supabase configuration error.");
}

// --- Initialize Supabase Client ---
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

// --- Exports ---
export { supabase, SUPABASE_URL, SUPABASE_ANON_KEY };
