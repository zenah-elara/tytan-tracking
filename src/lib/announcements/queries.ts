import { createClient } from "@/lib/supabase/server";

export type CompanyAnnouncement = {
  id: string;
  title: string;
  body: string;
  updated_at: string;
  created_at: string;
};

export async function getActiveCompanyAnnouncements() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_announcements")
    .select("id,title,body,updated_at,created_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) {
    return [];
  }

  return (data ?? []) as CompanyAnnouncement[];
}
