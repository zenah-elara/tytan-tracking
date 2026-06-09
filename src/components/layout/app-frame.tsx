"use client";

import { useState } from "react";
import { NavLink } from "@/components/layout/nav-link";
import type { NavigationGroup } from "@/lib/navigation";

type AppFrameProps = {
  children: React.ReactNode;
  navigationGroups: NavigationGroup[];
};

const STORAGE_KEY = "tytan-sidebar-collapsed";
const GROUP_STORAGE_KEY = "tytan-nav-groups-collapsed";

export function AppFrame({ children, navigationGroups }: AppFrameProps) {
  const [isCollapsed, setIsCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem(STORAGE_KEY) === "true",
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(
    () => {
      if (typeof window === "undefined") return {};

      try {
        return JSON.parse(localStorage.getItem(GROUP_STORAGE_KEY) ?? "{}");
      } catch {
        return {};
      }
    },
  );

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
      className={`mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:px-8 ${
        isCollapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[240px_minmax(0,1fr)]"
      }`}
    >
      <aside className="h-fit rounded-lg border border-[#efe6b6] bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p
            className={`text-xs font-bold uppercase text-zinc-500 ${
              isCollapsed ? "sr-only" : "px-2"
            }`}
          >
            Navigation
          </p>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#efe6b6] bg-[#fffdf2] text-sm font-black text-[#001f4d] transition hover:border-[#f2d300]"
          >
            <ChevronIcon direction={isCollapsed ? "right" : "left"} />
          </button>
        </div>
        <nav
          className={`space-y-3 ${isCollapsed ? "mt-2" : "mt-3"}`}
          aria-label="Main navigation"
        >
          {navigationGroups.map((group) => (
            <section key={group.title}>
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                aria-expanded={!collapsedGroups[group.title]}
                aria-label={`${collapsedGroups[group.title] ? "Expand" : "Collapse"} ${group.title} navigation`}
                className={`flex w-full items-center rounded-md text-xs font-bold uppercase text-[#001f4d] transition hover:bg-[#fff7bf] ${
                  isCollapsed ? "justify-center px-2 py-2" : "justify-between px-2 py-1.5"
                }`}
              >
                <span className={isCollapsed ? "sr-only" : ""}>{group.title}</span>
                <ChevronIcon
                  direction={collapsedGroups[group.title] ? "right" : "down"}
                />
              </button>
              {collapsedGroups[group.title] ? null : (
                <div className="mt-2 grid gap-1">
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
