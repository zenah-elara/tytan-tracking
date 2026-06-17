"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const ADMIN_DASHBOARD_PATH = "/admin";
const DASHBOARD_PATHS = ["/admin", "/employee", "/manager"];

export async function postCompanyAnnouncementAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const profile = await getCurrentUserProfile();

  if (profile?.role !== "admin") {
    redirect(`${ADMIN_DASHBOARD_PATH}?announcement_error=not-authorized`);
  }

  if (!title || !body) {
    redirect(`${ADMIN_DASHBOARD_PATH}?announcement_error=missing-fields`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("company_announcements").insert({
    title,
    body,
    is_active: true,
    created_by_profile_id: profile.id,
  });

  if (error) {
    redirect(`${ADMIN_DASHBOARD_PATH}?announcement_error=save-failed`);
  }

  revalidateDashboards();
  redirect(`${ADMIN_DASHBOARD_PATH}?announcement_success=saved`);
}

export async function clearCompanyAnnouncementAction(formData: FormData) {
  const announcementId = String(formData.get("announcement_id") ?? "").trim();
  const profile = await getCurrentUserProfile();

  if (profile?.role !== "admin") {
    redirect(`${ADMIN_DASHBOARD_PATH}?announcement_error=not-authorized`);
  }

  if (!announcementId) {
    redirect(`${ADMIN_DASHBOARD_PATH}?announcement_error=missing-announcement`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_announcements")
    .update({ is_active: false })
    .eq("id", announcementId)
    .eq("is_active", true);

  if (error) {
    redirect(`${ADMIN_DASHBOARD_PATH}?announcement_error=clear-failed`);
  }

  revalidateDashboards();
  redirect(`${ADMIN_DASHBOARD_PATH}?announcement_success=cleared`);
}

function revalidateDashboards() {
  for (const path of DASHBOARD_PATHS) {
    revalidatePath(path);
  }
}
