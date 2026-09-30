"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  ScanEye,
  FileText,
  BookOpen,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/layout/Logo";
import { clearSession } from "@/lib/auth";
import { useLang } from "@/contexts/LanguageContext";

export type UserRole = "admin" | "inspector" | "manager";

type NavItem = {
  labelKey: "dashboard" | "hazard_analyzer" | "reports" | "ehss_knowledge" | "admin";
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
};

/** Hak akses sidebar per peran (lihat PRD bag. 3B). */
const NAV: NavItem[] = [
  {
    labelKey: "dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "inspector", "manager"],
  },
  {
    labelKey: "hazard_analyzer",
    href: "/analyzer",
    icon: ScanEye,
    roles: ["inspector"],
  },
  {
    labelKey: "reports",
    href: "/reports",
    icon: FileText,
    roles: ["admin", "inspector", "manager"],
  },
  {
    labelKey: "ehss_knowledge",
    href: "/ehss-knowledge",
    icon: BookOpen,
    roles: ["admin", "inspector", "manager"],
  },
  {
    labelKey: "admin",
    href: "/users",
    icon: Users,
    roles: ["admin"],
  },
];

export function Sidebar({ role = "admin" }: { role?: UserRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLang();
  const [collapsed, setCollapsed] = useState(false);
  const items = NAV.filter((item) => item.roles.includes(role));

  const handleLogout = () => {
    // Hapus cookie sesi FastAPI (sh_token/sh_role/sh_name), lalu ke /login.
    clearSession();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-[76px]" : "w-64"
      )}
    >
      {/* Header / Logo */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-border px-4",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        {collapsed ? <Logo showText={false} /> : <Logo />}
      </div>

      {/* Navigasi */}
      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
              <Link
              key={item.href}
              href={item.href}
              title={collapsed ? t.nav[item.labelKey] : undefined}
              className={cn(
                "group/navitem relative flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed && "justify-center",
                active
                  ? "bg-brand/10 text-brand"
                  : "text-muted hover:bg-foreground/5 hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "size-5 shrink-0",
                  active ? "text-brand" : "text-muted"
                )}
                strokeWidth={active ? 2.25 : 1.75}
              />
              {!collapsed && <span className="truncate">{t.nav[item.labelKey]}</span>}

              {/* Tooltip saat mode ringkas */}
              {collapsed && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/navitem:opacity-100 dark:bg-slate-700"
                >
                  {t.nav[item.labelKey]}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Area Logout */}
      <div className="p-3 border-t border-border">
        <button
          onClick={handleLogout}
          title={collapsed ? t.nav.logout : undefined}
          className={cn(
            "group/navitem relative flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-950/50",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="size-5 shrink-0" strokeWidth={1.75} />
          {!collapsed && <span>{t.nav.logout}</span>}

          {/* Tooltip Logout saat mode ringkas */}
          {collapsed && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/navitem:opacity-100 dark:bg-slate-700"
            >
              {t.nav.logout}
            </span>
          )}
        </button>
      </div>

      {/* Footer: toggle tema + toggle collapse */}
      <div
        className={cn(
          "flex items-center gap-2 border-t border-border p-3",
          collapsed ? "flex-col" : "justify-between"
        )}
      >
        <ThemeToggle collapsed={collapsed} />
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? t.nav.expand : t.nav.collapse}
          className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
          aria-label={collapsed ? t.nav.expand : t.nav.collapse}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-5" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="size-5" strokeWidth={1.75} />
          )}
        </button>
      </div>
    </aside>
  );
}

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme } = useTheme();
  const { t } = useLang();
  const [mounted, setMounted] = useState(false);

  // Hindari mismatch hydrasi: render placeholder sampai ter-mount.
  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? t.nav.light_mode : t.nav.dark_mode}
      className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
      aria-label="Toggle theme"
    >
      {!mounted ? (
        <Sun className="size-5" strokeWidth={1.75} />
      ) : isDark ? (
        <Sun className="size-5" strokeWidth={1.75} />
      ) : (
        <Moon className="size-5" strokeWidth={1.75} />
      )}
    </button>
  );
}