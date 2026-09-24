"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  RiAddLine,
  RiCalendarTodoLine,
  RiDashboardLine,
  RiFileChartLine,
  RiLogoutBoxRLine,
  RiMoneyDollarCircleLine,
  RiMoonLine,
  RiNotification3Line,
  RiSettings4Line,
  RiShieldCheckLine,
  RiSunLine,
  RiTimerLine,
  RiUserLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cx } from "@/utils/cx";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { HrmSettingsDialog } from "@/components/hrm/HrmSettingsDialog";
import { canApproveOT, canManageSettings } from "@/lib/auth/permissions";
import { logoutAction } from "@/app/login/actions";

// Real session-backed role — no more manual toggle. `useHrmRole()` returns
// null while rendering outside an authenticated shell (i.e. on /login),
// though nothing there is expected to call it.
const RoleContext = createContext(null);

export function useHrmRole() {
  return useContext(RoleContext);
}

const sharedItems = [
  { key: "overview", label: "ภาพรวม", icon: RiDashboardLine, href: "/" },
  { key: "employees", label: "ข้อมูลพนักงาน", icon: RiUserLine, href: "/employees" },
  { key: "ot", label: "ระบบ OT", icon: RiTimerLine, href: "/ot" },
  { key: "payroll", label: "เงินเดือน", icon: RiMoneyDollarCircleLine, href: "/payroll" },
  { key: "leave", label: "ระบบวันลา", icon: RiCalendarTodoLine, href: "/leave" },
  { key: "reports", label: "รายงาน", icon: RiFileChartLine, href: "/reports" },
];

const titles = {
  "/": "ภาพรวม",
  "/employees": "ข้อมูลพนักงาน",
  "/ot": "ระบบ OT",
  "/payroll": "เงินเดือน",
  "/leave": "ระบบวันลา",
  "/approvals": "ระบบอนุมัติกลาง",
  "/reports": "รายงาน HR",
  "/settings": "ตั้งค่าระบบ",
};

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

function NavigationLink({ item, active, compact = false }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        compact && "shrink-0 whitespace-nowrap px-3",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
      {item.badge ? <Badge className="ml-auto border-transparent bg-background/15 px-1.5 py-0 text-[10px] text-current">{item.badge}</Badge> : null}
    </Link>
  );
}

function Header({ user, displayName, initials }) {
  const pathname = usePathname();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [payrollDialogOpen, setPayrollDialogOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const isPayrollPage = pathname === "/payroll";
  const title = titles[pathname] || "ภาพรวม";

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

  return (
    <>
      <a href="#main-content" className="sr-only z-50 rounded-md bg-background px-4 py-2 text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        ข้ามไปยังเนื้อหาหลัก
      </a>
      <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur sm:flex-nowrap sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground lg:hidden" aria-hidden="true">
            <RiUserLine className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="hidden text-xs text-muted-foreground sm:block lg:hidden">PeopleOS</p>
            <p className="truncate text-sm font-semibold sm:text-base">{title}</p>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <IconButton icon={darkMode ? RiSunLine : RiMoonLine} aria-label={darkMode ? "ใช้ธีมสว่าง" : "ใช้ธีมมืด"} onClick={toggleTheme} />
          <IconButton icon={RiSettings4Line} aria-label="ตั้งค่าระบบ" onClick={() => setSettingsOpen(true)} />
          <IconButton icon={RiNotification3Line} aria-label="การแจ้งเตือน" onClick={() => setNotificationsOpen(true)} />
          <Avatar initials={initials} color="lime" size="sm" aria-label={displayName} className="hidden sm:flex" />
          {isPayrollPage ? (
            <>
              <Button className="hidden sm:inline-flex" onClick={() => setPayrollDialogOpen(true)} size="sm">
                <RiAddLine aria-hidden="true" />สร้างรายการ
              </Button>
              <Button className="sm:hidden" onClick={() => setPayrollDialogOpen(true)} size="icon" aria-label="สร้างรายการเงินเดือน">
                <RiAddLine aria-hidden="true" />
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/ot"><RiTimerLine aria-hidden="true" />สร้างคำขอ OT</Link>
              </Button>
              <Button asChild size="icon" className="sm:hidden">
                <Link href="/ot" aria-label="สร้างคำขอ OT"><RiTimerLine aria-hidden="true" /></Link>
              </Button>
            </>
          )}
          <form action={logoutAction}>
            <IconButton icon={RiLogoutBoxRLine} aria-label="ออกจากระบบ" type="submit" />
          </form>
        </div>
      </header>
      <HrmDialog
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        title="การแจ้งเตือน"
        description="รายการล่าสุดจากระบบ HRM"
        footer={<Button onClick={() => setNotificationsOpen(false)}>รับทราบ</Button>}
      >
        <div className="space-y-3">
          <article className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-medium">มีคำขอรออนุมัติ 4 รายการ</p>
            <p className="mt-1 text-sm text-muted-foreground">ตรวจสอบคำขอลาของทีมก่อนสิ้นวัน</p>
          </article>
          <article className="rounded-lg border p-4">
            <p className="text-sm font-medium">ส่งคำขอ OT สำเร็จ</p>
            <p className="mt-1 text-sm text-muted-foreground">ระบบส่งรายการ OT ให้หัวหน้างานแล้ว</p>
          </article>
        </div>
      </HrmDialog>
      <HrmSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HrmDialog
        open={payrollDialogOpen}
        onClose={() => setPayrollDialogOpen(false)}
        title="สร้างรายการเงินเดือน"
        description="ตัวอย่างหน้าจอสำหรับเริ่มรอบเงินเดือน"
        footer={<Button onClick={() => setPayrollDialogOpen(false)}>รับทราบ</Button>}
      >
        <p className="text-sm leading-6 text-muted-foreground">รอบเงินเดือนนี้เป็น Mockup และยังไม่บันทึกหรือส่งข้อมูลจริง</p>
      </HrmDialog>
    </>
  );
}

export default function HrmShell({ children, user = null, employeeName = null }) {
  const pathname = usePathname();
  const role = user?.role ?? null;
  const active = pathname === "/ot" ? "ot" : pathname === "/payroll" ? "payroll" : pathname === "/leave" ? "leave" : pathname === "/employees" ? "employees" : pathname === "/approvals" ? "approvals" : pathname === "/reports" ? "reports" : pathname === "/settings" ? "settings" : "overview";
  const items = useMemo(() => {
    const list = role && canApproveOT(role)
      ? [{ key: "approvals", label: "รออนุมัติ", icon: RiShieldCheckLine, href: "/approvals", badge: 4 }, ...sharedItems]
      : sharedItems;
    return role && canManageSettings(role)
      ? [...list, { key: "settings", label: "ตั้งค่าระบบ", icon: RiSettings4Line, href: "/settings" }]
      : list;
  }, [role]);
  const roleContextValue = useMemo(
    () => (user ? { role: user.role, employeeId: user.employeeId, email: user.email } : null),
    [user],
  );
  const displayName = employeeName || user?.email || "";
  const initials = getInitials(employeeName, user?.email);

  // Login and forced password setup are standalone screens without app chrome.
  if (!user || user.mustChangePassword) {
    return <>{children}</>;
  }

  return (
    <RoleContext.Provider value={roleContextValue}>
      <div className="min-h-dvh bg-background">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card px-3 py-4 lg:flex">
          <Link href="/" className="mb-7 flex items-center gap-3 rounded-lg px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><RiUserLine className="size-5" aria-hidden="true" /></span>
            <span className="min-w-0"><strong className="block text-sm font-semibold">PeopleOS</strong><span className="block text-xs text-muted-foreground">จัดการงานบุคคล</span></span>
          </Link>
          <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">พื้นที่ทำงาน</p>
          <nav aria-label="เมนูหลัก" className="flex-1 space-y-1 overflow-y-auto">
            {items.map((item) => <NavigationLink key={item.key} item={item} active={active === item.key} />)}
          </nav>
          <div className="mt-4 flex items-center gap-3 border-t px-2 pt-4">
            <Avatar initials={initials} color="lime" size="md" />
            <div className="min-w-0"><strong className="block truncate text-sm font-medium">{displayName}</strong><span className="block truncate text-xs text-muted-foreground">{user.email === "admin@peopleos.co" ? "ผู้ดูแลระบบ" : roleLabels[user.role] || user.role}</span></div>
          </div>
        </aside>
        <div className="min-h-dvh lg:pl-64">
          <Header user={user} displayName={displayName} initials={initials} />
      <nav aria-label="เมนูหลักบนมือถือ" className="flex gap-1 overflow-x-auto border-b bg-background px-3 py-2 lg:hidden">
            {items.map((item) => <NavigationLink key={item.key} item={item} active={active === item.key} compact />)}
          </nav>
          <main id="main-content" className="mx-auto w-full max-w-screen-2xl min-w-0 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </RoleContext.Provider>
  );
}
