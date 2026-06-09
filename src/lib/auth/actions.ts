"use server";

import { redirect } from "next/navigation";
import { getDefaultRouteForRole } from "@/lib/auth/permissions";
import { isAppRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const LOGIN_PATH = "/login";

type LoginErrorCode =
  | "invalid_credentials"
  | "missing_fields"
  | "profile_missing"
  | "account_inactive"
  | "profile_invalid";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirectWithLoginError("missing_fields");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirectWithLoginError("invalid_credentials");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirectWithLoginError("invalid_credentials");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    redirectWithLoginError("profile_missing");
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    redirectWithLoginError("account_inactive");
  }

  if (!isAppRole(profile.role)) {
    await supabase.auth.signOut();
    redirectWithLoginError("profile_invalid");
  }

  redirect(getDefaultRouteForRole(profile.role));
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}

function redirectWithLoginError(code: LoginErrorCode): never {
  redirect(`${LOGIN_PATH}?error=${code}`);
}
