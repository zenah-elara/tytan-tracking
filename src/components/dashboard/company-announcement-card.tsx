import {
  clearCompanyAnnouncementAction,
  postCompanyAnnouncementAction,
} from "@/lib/announcements/actions";
import type { CompanyAnnouncement } from "@/lib/announcements/queries";

type CompanyAnnouncementCardProps = {
  announcements: CompanyAnnouncement[];
  editable?: boolean;
  success?: string;
  error?: string;
};

export function CompanyAnnouncementCard({
  announcements,
  editable = false,
  success,
  error,
}: CompanyAnnouncementCardProps) {
  if (!editable && announcements.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-lg border border-[#efe6b6] bg-white shadow-sm">
      <div className="border-b border-[#efe6b6] bg-[#fffdf2] px-5 py-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#001f4d]/60">
              Company Announcements
            </p>
            <h2 className="mt-1 text-lg font-black text-[#001f4d]">
              {editable ? "Post and manage updates" : "Latest updates"}
            </h2>
          </div>
          {announcements.length > 0 ? (
            <span className="w-fit rounded-full border border-[#f2d300] bg-[#fff7bf] px-3 py-1 text-xs font-bold text-[#001f4d]">
              {announcements.length} active
            </span>
          ) : null}
        </div>
      </div>

      {editable ? (
        <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-[#efe6b6] bg-[#fffdf2] p-5 lg:border-b-0 lg:border-r">
            <AnnouncementMessage success={success} error={error} />
            <p className="mb-4 text-sm text-zinc-600">
              Post updates that should appear on employee and manager dashboards.
            </p>
            <AnnouncementComposer />
          </div>
          <AnnouncementList announcements={announcements} editable />
        </div>
      ) : (
        <AnnouncementList announcements={announcements} />
      )}
    </section>
  );
}

function AnnouncementComposer() {
  return (
    <form action={postCompanyAnnouncementAction} className="grid gap-3">
      <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
        Title
        <input name="title" className={fieldClassName} required />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
        Message
        <textarea
          name="body"
          rows={3}
          className={`${fieldClassName} h-auto py-2`}
          required
        />
      </label>
      <button className="h-10 w-fit rounded-lg bg-[#f2d300] px-4 text-sm font-black text-[#001f4d] transition hover:bg-[#ffe44d]">
        Post announcement
      </button>
    </form>
  );
}

function AnnouncementList({
  announcements,
  editable = false,
}: {
  announcements: CompanyAnnouncement[];
  editable?: boolean;
}) {
  if (announcements.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-zinc-600">
        No active announcements.
      </p>
    );
  }

  return (
    <div className="grid gap-3 p-5">
      {announcements.map((announcement) => (
        <article
          key={announcement.id}
          className="rounded-lg border border-[#efe6b6] bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="font-black text-[#001f4d]">{announcement.title}</h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-700">
                {announcement.body}
              </p>
              <p className="mt-3 text-xs font-semibold text-zinc-500">
                Updated {formatDateTime(announcement.updated_at)}
              </p>
            </div>
            {editable ? (
              <form action={clearCompanyAnnouncementAction} className="shrink-0">
                <input
                  type="hidden"
                  name="announcement_id"
                  value={announcement.id}
                />
                <button className="h-9 rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-xs font-bold text-zinc-700 transition hover:border-red-300 hover:text-red-700">
                  Clear
                </button>
              </form>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function AnnouncementMessage({ success, error }: { success?: string; error?: string }) {
  if (!success && !error) return null;

  return (
    <p
      className={`mb-3 rounded-lg border px-4 py-3 text-sm ${
        error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {error ? getErrorMessage(error) : getSuccessMessage(success)}
    </p>
  );
}

function getSuccessMessage(success: string | undefined) {
  if (success === "cleared") return "Announcement cleared.";
  return "Announcement posted.";
}

function getErrorMessage(error: string | undefined) {
  switch (error) {
    case "missing-fields":
      return "Add a title and message before posting.";
    case "missing-announcement":
      return "Choose an announcement to clear.";
    case "not-authorized":
      return "Only admins can manage announcements.";
    case "clear-failed":
      return "Announcement could not be cleared.";
    case "save-failed":
    default:
      return "Announcement could not be saved. Confirm the announcement migration has been applied.";
  }
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const fieldClassName =
  "min-h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30";
