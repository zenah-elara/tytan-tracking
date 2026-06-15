const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_ANON_KEY_ENV = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const SUPABASE_SERVICE_ROLE_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

export type SupabaseAdminConfig = {
  url: string;
  serviceRoleKey: string;
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

export function getSupabaseAdminConfigStatus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  return {
    isConfigured: Boolean(url && serviceRoleKey),
    missingKeys: [
      ...(url ? [] : [SUPABASE_URL_ENV]),
      ...(serviceRoleKey ? [] : [SUPABASE_SERVICE_ROLE_KEY_ENV]),
    ],
  };
}

export function getSupabaseAdminConfig(): SupabaseAdminConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error(
      `Supabase admin access is not configured. Add ${SUPABASE_SERVICE_ROLE_KEY_ENV} locally before running login provisioning. Do not expose or commit service role keys.`,
    );
  }

  return { url, serviceRoleKey };
}
