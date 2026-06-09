import { createClient } from "@/lib/supabase/server";
import type { AppRole, AuthUserProfile } from "@/types/auth";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

const APP_ROLE_VALUES = ["employee", "manager", "admin"] as const;

export async function getCurrentUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,is_active,created_at,updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapProfileRow(data as ProfileRow);
}

export function isAppRole(value: unknown): value is AppRole {
  return (
    typeof value === "string" &&
    APP_ROLE_VALUES.includes(value as (typeof APP_ROLE_VALUES)[number])
  );
}

function mapProfileRow(row: ProfileRow): AuthUserProfile | null {
  if (!isAppRole(row.role)) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name ?? row.email,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
