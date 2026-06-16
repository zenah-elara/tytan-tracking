"use client";

import { useEffect, useState } from "react";
import { NavLink } from "@/components/layout/nav-link";
import type { NavigationGroup } from "@/lib/navigation";

type AppFrameProps = {
  children: React.ReactNode;
  navigationGroups: NavigationGroup[];
};

const STORAGE_KEY = "tytan-sidebar-collapsed";
const GROUP_STORAGE_KEY = "tytan-nav-groups-collapsed";

export function AppFrame({ children, navigationGroups }: AppFrameProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsCollapsed(localStorage.getItem(STORAGE_KEY) === "true");

      try {
        setCollapsedGroups(JSON.parse(localStorage.getItem(GROUP_STORAGE_KEY) ?? "{}"));
      } catch {
        setCollapsedGroups({});
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function toggleSidebar() {
    setIsCollapsed((current) => {
      const next = !current;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  function toggleGroup(groupTitle: string) {
    setCollapsedGroups((current) => {
      const next = {
        ...current,
        [groupTitle]: !current[groupTitle],
      };
      localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <div
      className={`mx-auto grid max-w-7xl gap-3 px-4 py-5 sm:px-6 lg:gap-4 lg:px-6 ${
        isCollapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[224px_minmax(0,1fr)]"
      }`}
    >
      <aside className="h-fit rounded-xl border border-[#cdbf73] bg-white p-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-[#001f4d] p-2">
          <p
            className={`text-xs font-black uppercase tracking-[0.14em] text-white/75 ${
              isCollapsed ? "sr-only" : "px-2"
            }`}
          >
            Navigation
          </p>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-sm font-black text-[#f2d300] transition hover:bg-white/20"
          >
            <ChevronIcon direction={isCollapsed ? "right" : "left"} />
          </button>
        </div>
        <nav
          className={`space-y-1.5 ${isCollapsed ? "mt-2" : "mt-3"}`}
          aria-label="Main navigation"
        >
          {navigationGroups.map((group) => (
            <section
              key={group.title}
              className={`rounded-lg ${collapsedGroups[group.title] ? "" : "bg-[#fffdf2]"}`}
            >
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                aria-expanded={!collapsedGroups[group.title]}
                aria-label={`${collapsedGroups[group.title] ? "Expand" : "Collapse"} ${group.title} navigation`}
                className={`flex w-full items-center rounded-lg border text-[11px] font-black uppercase tracking-[0.12em] text-[#001f4d] transition hover:bg-[#fff7bf] ${
                  collapsedGroups[group.title]
                    ? "border-transparent"
                    : "border-[#efe6b6] bg-white shadow-sm"
                } ${
                  isCollapsed ? "justify-center px-2 py-2" : "justify-between px-2.5 py-2"
                }`}
              >
                <span className={`flex items-center gap-2 ${isCollapsed ? "" : "min-w-0"}`}>
                  <GroupIcon title={group.title} />
                  <span className={isCollapsed ? "sr-only" : "truncate"}>
                    {group.title}
                  </span>
                </span>
                {isCollapsed ? null : (
                  <ChevronIcon
                    direction={collapsedGroups[group.title] ? "right" : "down"}
                  />
                )}
              </button>
              {collapsedGroups[group.title] ? null : (
                <div
                  className={`mt-1.5 grid gap-0.5 border-l border-[#f2d300]/60 ${
                    isCollapsed ? "border-l-0 pl-0" : "ml-3 pl-2"
                  }`}
                >
                  {group.links.map((link) => (
                    <NavLink
                      key={link.href}
                      href={link.href}
                      label={link.label}
                      collapsed={isCollapsed}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" | "down" }) {
  const path = {
    left: "M15 18l-6-6 6-6",
    right: "M9 18l6-6-6-6",
    down: "M6 9l6 6 6-6",
  }[direction];

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d={path} />
    </svg>
  );
}

function GroupIcon({ title }: { title: string }) {
  const path = getGroupIconPath(title);

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d={path} />
    </svg>
  );
}

function getGroupIconPath(title: string) {
  if (title === "Employee") return "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21a8 8 0 0 1 16 0";
  if (title === "Manager") return "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87";
  if (title === "Admin") return "M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z";
  if (title === "People") return "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87";
  if (title === "Leave") return "M4 19c4-8 10-12 16-14-2 8-6 12-14 14H4z";
  if (title === "Attendance") return "M8 7h8 M8 12h8 M8 17h5 M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2";
  if (title === "Reports") return "M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 M14 3v6h6";
  if (title === "Relations") return "M12 21s-7-4.35-9.33-8.66C.7 8.7 2.5 5 6.2 5c2 0 3.2 1.1 3.8 2 0.6-0.9 1.8-2 3.8-2 3.7 0 5.5 3.7 3.53 7.34C19 16.65 12 21 12 21z";
  return "M3 12h18 M12 3v18";
}
