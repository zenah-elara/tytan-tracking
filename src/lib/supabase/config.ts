const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_ANON_KEY_ENV = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

export function getSupabaseConfigStatus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  return {
    isConfigured: Boolean(url && anonKey),
    missingKeys: [
      ...(url ? [] : [SUPABASE_URL_ENV]),
      ...(anonKey ? [] : [SUPABASE_ANON_KEY_ENV]),
    ],
  };
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error(
      `Supabase is not configured. Add ${SUPABASE_URL_ENV} and ${SUPABASE_ANON_KEY_ENV} to .env.local locally before enabling auth. Do not commit real keys.`,
    );
  }

  return { url, anonKey };
}
