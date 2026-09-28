"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  RiCalendarTodoLine,
  RiDashboardLine,
  RiArchiveLine,
  RiFileChartLine,
  RiLogoutBoxRLine,
  RiMoneyDollarCircleLine,
  RiMoonLine,
  RiMenu2Line,
  RiSettings4Line,
  RiShieldCheckLine,
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
  RiSunLine,
  RiTimerLine,
  RiUserLine,
} from "@remixicon/react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cx } from "@/utils/cx";
import { canApproveOT, canManageSettings } from "@/lib/auth/permissions";
import { logoutAction } from "@/app/login/actions";

const RoleContext = createContext(null);

export function useHrmRole() {
  return useContext(RoleContext);
}

const baseGroups = [
  {
    label: "ภาพรวม",
    items: [{ key: "overview", label: "ภาพรวม", icon: RiDashboardLine, href: "/" }],
  },
  {
    label: "การทำงาน",
    items: [
      { key: "employees", label: "พนักงาน", icon: RiUserLine, href: "/employees" },
      { key: "ot", label: "เวลาล่วงเวลา", icon: RiTimerLine, href: "/ot" },
      { key: "leave", label: "วันลา", icon: RiCalendarTodoLine, href: "/leave" },
      { key: "assets", label: "ทรัพย์สิน", icon: RiArchiveLine, href: "/assets" },
    ],
  },
  {
    label: "ข้อมูลและรายงาน",
    items: [
      { key: "payroll", label: "เงินเดือน", icon: RiMoneyDollarCircleLine, href: "/payroll" },
      { key: "reports", label: "รายงาน", icon: RiFileChartLine, href: "/reports" },
    ],
  },
];

const roleLabels = {
  employee: "พนักงาน",
  supervisor: "หัวหน้างาน",
  ceo: "ผู้บริหาร",
};

function getInitials(name, email) {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part[0]).join("");
    if (initials) return initials.toUpperCase();
  }
  return (email || "??").slice(0, 2).toUpperCase();
}

function NavigationLink({ item, active, collapsed = false, onNavigate }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={cx(
        "group relative flex min-h-10 min-w-0 items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary bg-primary/5 text-primary"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className={cx("min-w-0 truncate", collapsed && "lg:sr-only")}>{item.label}</span>
    </Link>
  );
}

function NavigationGroups({ groups, active, collapsed = false, onNavigate, mobile = false }) {
  return (
    <nav aria-label={mobile ? "เมนูหลักบนมือถือ" : "เมนูหลัก"} className={cx("min-w-0", mobile && "grid grid-cols-2 gap-x-2 gap-y-1")}>
      {groups.map((group) => (
        <section key={group.label} className={cx("min-w-0", mobile ? "contents" : "mb-5 last:mb-0")}>
          <h2 className={cx("px-3 pb-1 text-[11px] font-medium leading-5 text-muted-foreground", mobile && "col-span-2 pt-2 first:pt-0", collapsed && !mobile && "lg:sr-only")}>
            {group.label}
          </h2>
          <div className={cx("space-y-0.5", mobile && "contents")}>
            {group.items.map((item) => (
              <NavigationLink
                key={item.key}
                item={item}
                active={active === item.key}
                collapsed={collapsed && !mobile}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}

function Header({ displayName, darkMode, onToggleTheme, collapsed, onToggleSidebar, mobileMenuOpen, onToggleMobileMenu }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4 sm:px-6">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        aria-label={collapsed ? "ขยายเมนูด้านข้าง" : "ย่อเมนูด้านข้าง"}
        aria-expanded={!collapsed}
        onClick={onToggleSidebar}
      >
        {collapsed ? <RiSidebarUnfoldLine aria-hidden="true" /> : <RiSidebarFoldLine aria-hidden="true" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label={mobileMenuOpen ? "ปิดเมนูหลัก" : "เปิดเมนูหลัก"}
        aria-controls="mobile-navigation"
        aria-expanded={mobileMenuOpen}
        onClick={onToggleMobileMenu}
      >
        <RiMenu2Line aria-hidden="true" />
      </Button>
      <div className="flex min-w-0 items-center gap-2 lg:hidden">
        <span className="grid size-8 place-items-center rounded-md bg-muted text-primary" aria-hidden="true">
          <RiUserLine className="size-4" />
        </span>
        <span className="truncate text-sm font-semibold">PeopleOS</span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <span className="hidden max-w-48 truncate text-xs text-muted-foreground sm:inline" title={displayName}>{displayName}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={darkMode ? "ใช้ธีมสว่าง" : "ใช้ธีมมืด"}
          onClick={onToggleTheme}
        >
          {darkMode ? <RiSunLine aria-hidden="true" /> : <RiMoonLine aria-hidden="true" />}
        </Button>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="icon" aria-label="ออกจากระบบ">
            <RiLogoutBoxRLine aria-hidden="true" />
          </Button>
        </form>
      </div>
    </header>
  );
}

export default function HrmShell({ children, user = null, employeeName = null, employeeCode = null }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const role = user?.role ?? null;
  const active = pathname === "/ot" ? "ot"
    : pathname === "/payroll" ? "payroll"
      : pathname === "/leave" ? "leave"
        : pathname === "/assets" ? "assets"
        : pathname === "/employees" ? "employees"
          : pathname === "/approvals" ? "approvals"
            : pathname === "/reports" ? "reports"
              : pathname === "/settings" ? "settings"
                : "overview";
  const groups = useMemo(() => {
    const nextGroups = baseGroups.map((group) => ({ ...group, items: [...group.items] }));
    if (role && canApproveOT(role)) {
      nextGroups[1].items.push({ key: "approvals", label: "รออนุมัติ", icon: RiShieldCheckLine, href: "/approvals" });
    }
    if (role && canManageSettings(role)) {
      nextGroups.push({
        label: "ระบบ",
        items: [{ key: "settings", label: "ตั้งค่า", icon: RiSettings4Line, href: "/settings" }],
      });
    }
    return nextGroups;
  }, [role]);
  const roleContextValue = useMemo(
    () => (user ? { role: user.role, employeeId: user.employeeId, employeeCode, email: user.email } : null),
    [user, employeeCode],
  );
  const displayName = employeeName || user?.email || "";
  const initials = getInitials(employeeName, user?.email);

  useEffect(() => {
    const stored = window.localStorage.getItem("peopleos-theme");
    const dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
    setDarkMode(dark);
  }, []);

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("peopleos-theme", next ? "dark" : "light");
    setDarkMode(next);
  }

  // Login and forced password setup are standalone screens without app chrome.
  if (!user || user.mustChangePassword) {
    return <>{children}</>;
  }

  // Agreement editing uses its own full-screen document workspace.
  if (pathname.startsWith("/assets/agreements/") || pathname.startsWith("/assets/requests/")) {
    return <RoleContext.Provider value={roleContextValue}>{children}</RoleContext.Provider>;
  }

  return (
    <RoleContext.Provider value={roleContextValue}>
      <div className="min-h-dvh bg-background">
        <aside
          className={cx(
            "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-card px-2 py-4 transition-[width] duration-150 lg:flex",
            collapsed ? "w-16" : "w-60",
          )}
        >
          <Link href="/" className={cx("mb-6 flex min-h-10 items-center gap-3 rounded-md px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", collapsed && "justify-center px-0")}>
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-primary" aria-hidden="true">
              <RiUserLine className="size-4" />
            </span>
            <span className={cx("min-w-0", collapsed && "lg:sr-only")}>
              <strong className="block truncate text-sm font-semibold">PeopleOS</strong>
              <span className="block truncate text-[11px] leading-4 text-muted-foreground">จัดการงานบุคคล</span>
            </span>
          </Link>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <NavigationGroups groups={groups} active={active} collapsed={collapsed} />
          </div>
          <div className={cx("mt-4 flex min-w-0 items-center gap-2 border-t border-border px-2 pt-3", collapsed && "justify-center px-0")}>
            <Avatar initials={initials} color="neutral" size="sm" />
            <div className={cx("min-w-0", collapsed && "lg:sr-only")}>
              <strong className="block truncate text-xs font-medium">{displayName}</strong>
              <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                {user.email === "admin@peopleos.co" ? "ผู้ดูแลระบบ" : roleLabels[user.role] || user.role}
              </span>
            </div>
          </div>
        </aside>
        <div className={cx("min-h-dvh transition-[padding] duration-150", collapsed ? "lg:pl-16" : "lg:pl-60")}>
          <a href="#main-content" className="sr-only z-50 rounded-md bg-background px-4 py-2 text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-2">
            ข้ามไปยังเนื้อหาหลัก
          </a>
          <Header
            displayName={displayName}
            darkMode={darkMode}
            onToggleTheme={toggleTheme}
            collapsed={collapsed}
            onToggleSidebar={() => setCollapsed((value) => !value)}
            mobileMenuOpen={mobileMenuOpen}
            onToggleMobileMenu={() => setMobileMenuOpen((value) => !value)}
          />
          {mobileMenuOpen ? (
            <div id="mobile-navigation" className="border-b border-border bg-card px-4 py-3 lg:hidden sm:px-6">
              <NavigationGroups groups={groups} active={active} mobile onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          ) : null}
          <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-screen-2xl min-w-0 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
            {children}
          </main>
        </div>
      </div>
    </RoleContext.Provider>
  );
}
