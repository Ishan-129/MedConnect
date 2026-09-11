// Supabase Client Wrapper with Graceful Offline/Demo Mode

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('your-project')
);

export const getSupabaseConfig = () => ({
  url: supabaseUrl,
  isConfigured: isSupabaseConfigured
});
