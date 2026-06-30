"use server";

import { redirect } from "next/navigation";
import { getDefaultRouteForRole } from "@/lib/auth/permissions";
import { isAppRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const LOGIN_PATH = "/login";
const ACCOUNT_SECURITY_PATH = "/account-security";

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

export async function updatePasswordAction(formData: FormData) {
  const currentPassword = String(formData.get("current_password") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!currentPassword || !password || !confirmPassword) {
    redirectWithAccountStatus("error", "missing-password");
  }

  if (password.length < 8) {
    redirectWithAccountStatus("error", "password-too-short");
  }

  if (password !== confirmPassword) {
    redirectWithAccountStatus("error", "password-mismatch");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect(LOGIN_PATH);
  }

  const { error: reauthenticationError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (reauthenticationError) {
    redirectWithAccountStatus("error", "current-password-invalid");
  }

  const { data: updatedUserData, error: updateError } =
    await supabase.auth.updateUser({ password });

  if (updateError || !updatedUserData.user) {
    const { error: verificationError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (verificationError) {
      redirectWithAccountStatus("error", "update-failed");
    }
  }

  redirectWithAccountStatus("success", "password-updated");
}

function redirectWithLoginError(code: LoginErrorCode): never {
  redirect(`${LOGIN_PATH}?error=${code}`);
}

function redirectWithAccountStatus(type: "success" | "error", code: string): never {
  redirect(`${ACCOUNT_SECURITY_PATH}?${type}=${code}`);
}
