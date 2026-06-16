"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLinkProps = {
  href: string;
  label: string;
  collapsed?: boolean;
};

export function NavLink({ href, label, collapsed = false }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-current={isActive ? "page" : undefined}
      className={
        isActive
          ? `flex items-center gap-2 rounded-lg border border-[#f2d300] bg-[#001f4d] px-2 py-1.5 text-[13px] font-black text-white shadow-sm ${collapsed ? "justify-center" : ""}`
          : `flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-[13px] font-semibold text-zinc-600 transition hover:border-[#efe6b6] hover:bg-white hover:text-[#001f4d] ${collapsed ? "justify-center" : ""}`
      }
    >
      <NavIcon label={label} />
      {collapsed ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </Link>
  );
}

function NavIcon({ label }: { label: string }) {
  const path = getIconPath(label);

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

function getIconPath(label: string) {
  if (label.includes("Clock")) return "M12 6v6l4 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0";
  if (label.includes("Attendance")) return "M8 7h8 M8 12h8 M8 17h5 M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2";
  if (label.includes("Day-Off")) return "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 M9 15h6";
  if (label.includes("Leave")) return "M4 19c4-8 10-12 16-14-2 8-6 12-14 14H4z";
  if (label.includes("People") || label.includes("Team")) return "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75";
  if (label.includes("Schedule")) return "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2";
  if (label.includes("Reports")) return "M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 M14 3v6h6 M8 17h8 M8 13h8";
  if (label.includes("Relations")) return "M12 21s-7-4.35-9.33-8.66C.7 8.7 2.5 5 6.2 5c2 0 3.2 1.1 3.8 2 0.6-0.9 1.8-2 3.8-2 3.7 0 5.5 3.7 3.53 7.34C19 16.65 12 21 12 21z";
  return "M3 12h18 M12 3v18";
}
