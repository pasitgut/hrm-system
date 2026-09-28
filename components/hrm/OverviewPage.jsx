"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RiArrowRightLine,
  RiCalendarTodoLine,
  RiFileChartLine,
  RiTimerLine,
  RiUserSharedLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { LeaveSummaryView } from "@/components/hrm/leave/LeaveSummaryView";
import { PageHeader, SectionHeading } from "@/components/hrm/PageHeader";

function QuickLinks({ role }) {
  const items = [
    { label: "จัดการคำขอลา", description: "ยื่นคำขอและตรวจสอบสิทธิ์วันลา", icon: RiCalendarTodoLine, href: "/leave" },
    { label: "จัดการคำขอ OT", description: "ยื่นคำขอและดูชั่วโมงที่อนุมัติ", icon: RiTimerLine, href: "/ot" },
    { label: "ดูรายงาน", description: "กำหนดช่วงเวลาและรูปแบบรายงาน", icon: RiFileChartLine, href: "/reports" },
    ...(role === "supervisor" || role === "ceo"
      ? [{ label: "คิวอนุมัติ", description: "พิจารณาคำขอลาและ OT ของทีม", icon: RiUserSharedLine, href: "/approvals" }]
      : []),
  ];

  return (
    <nav aria-label="ทางลัด" className="divide-y divide-border border-y border-border">
      {items.map(({ label, description, icon: Icon, href }) => (
        <Link
          href={href}
          key={href}
          className="group flex min-h-14 items-center gap-3 py-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong className="block text-sm font-medium text-foreground">{label}</strong>
            <span className="block text-xs text-muted-foreground">{description}</span>
          </span>
          <RiArrowRightLine className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}

export default function OverviewPage() {
  const router = useRouter();
  const { role } = useHrmRole();

  return (
    <div className="hrm-page">
      <PageHeader
        eyebrow="PeopleOS · พื้นที่ทำงาน"
        title="ภาพรวม"
        description="ติดตามสิทธิ์วันลาและไปยังงานที่ต้องทำได้จากจุดเดียว"
        actions={(
          <>
            <Button variant="outline" leadingIcon={RiFileChartLine} onClick={() => router.push("/reports")}>
              ดูรายงาน
            </Button>
            <Button leadingIcon={RiTimerLine} onClick={() => router.push("/ot")}>
              ยื่นคำขอ OT
            </Button>
          </>
        )}
      />

      <section aria-labelledby="overview-leave-heading" className="min-w-0">
        <SectionHeading
          id="overview-leave-heading"
          title="สิทธิ์วันลาของฉัน"
          description="ยอดคงเหลือล่าสุดจากระบบวันลา"
          actions={<Button asChild size="xs" variant="ghost"><Link href="/leave">ดูรายละเอียด</Link></Button>}
        />
        <div className="mt-3">
          <LeaveSummaryView />
        </div>
      </section>

      <section aria-labelledby="overview-quick-links-heading" className="min-w-0">
        <SectionHeading
          id="overview-quick-links-heading"
          title="ไปยังงาน"
          description="เปิด workflow ที่ใช้บ่อย"
          className="mb-3"
        />
        <QuickLinks role={role} />
      </section>
    </div>
  );
}
