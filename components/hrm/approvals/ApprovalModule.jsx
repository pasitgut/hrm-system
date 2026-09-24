"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RiArrowRightLine,
  RiCalendarTodoLine,
  RiCheckLine,
  RiCloseLine,
  RiFileList3Line,
  RiTimerLine,
} from "@remixicon/react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { Tabs, TabList, Tab } from "@/components/ui/tabs";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { canApproveLeave, canApproveOT } from "@/lib/auth/permissions";
import { cx } from "@/utils/cx";

const iconByType = { ot: RiTimerLine, leave: RiCalendarTodoLine };
const chipByType = { ot: "cyan", leave: "rose" };
const typeLabel = { ot: "OT", leave: "ลา" };
const statusColor = { pending: "yellow", approved: "lime", rejected: "rose", cancelled: "gray" };

const DECISION_ENDPOINT = {
  ot: (id) => `/api/ot/${id}/decision`,
  leave: (id) => `/api/leave/${id}/decision`,
};

const submittedFormatter = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatSubmittedAt(iso) {
  try {
    return submittedFormatter.format(new Date(iso));
  } catch {
    return iso;
  }
}

function getInitials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]).join("");
  return (initials || "?").toUpperCase();
}

// OT and leave permissions stay separate so their access rules can diverge.
function canApproveRequest(role, type) {
  if (type === "ot") return canApproveOT(role);
  if (type === "leave") return canApproveLeave(role);
  return false;
}

function RequestCard({ request, canApprove, busy, onAction, onOpen }) {
  const Icon = iconByType[request.type] || RiFileList3Line;
  const pending = request.statusCode === "pending";
  return (
    <article className={cx("rounded-xl border p-4 transition-colors", pending ? "border-border bg-card" : "border-border bg-muted/60")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar initials={getInitials(request.employeeName)} color={chipByType[request.type]} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm font-medium leading-5 text-foreground">{request.employeeName}</strong>
              <Chip variant="caption" color={chipByType[request.type]}>{request.kind}</Chip>
              <span className="text-[11px] leading-4 text-muted-foreground">{typeLabel[request.type] || request.type}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{request.detail}</p>
            <p className="mt-1 text-xs leading-4 text-muted-foreground">
              {request.reason ? `${request.reason} · ` : ""}ส่งเมื่อ {formatSubmittedAt(request.submittedAt)}
            </p>
          </div>
          <Icon className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <Chip variant="caption" color={statusColor[request.statusCode] || "gray"}>{request.statusName}</Chip>
          <Button size="xs" variant="ghost" trailingIcon={RiArrowRightLine} onClick={() => onOpen(request)}>ดูรายละเอียด</Button>
        </div>
      </div>
      {pending && canApprove ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
          <Button size="small" leadingIcon={RiCheckLine} disabled={busy} onClick={() => onAction(request, "approved")}>อนุมัติ</Button>
          <Button size="small" variant="secondary" leadingIcon={RiCloseLine} disabled={busy} onClick={() => onAction(request, "rejected")}>ไม่อนุมัติ</Button>
        </div>
      ) : null}
    </article>
  );
}

export default function ApprovalModule() {
  const { role } = useHrmRole();
  const canApproveAny = canApproveOT(role) || canApproveLeave(role);
  const [filter, setFilter] = useState("all");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);

  async function loadRequests() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/approvals?type=${filter}`);
      if (!response.ok) throw new Error("failed to load");
      const payload = await response.json();
      setRequests(payload.items || []);
    } catch {
      setLoadError("ไม่สามารถโหลดรายการคำขอได้ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    fetch(`/api/approvals?type=${filter}`)
      .then((response) => {
        if (!response.ok) throw new Error("failed to load");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setRequests(payload.items || []);
      })
      .catch(() => {
        if (!cancelled) setLoadError("ไม่สามารถโหลดรายการคำขอได้ กรุณาลองใหม่");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const visible = requests;
  const pendingCount = useMemo(() => requests.filter((request) => request.statusCode === "pending").length, [requests]);
  const approvedCount = useMemo(() => requests.filter((request) => request.statusCode === "approved").length, [requests]);
  const leaveCount = useMemo(() => requests.filter((request) => request.type === "leave").length, [requests]);

  async function takeAction(request, decision) {
    setActionError("");
    setBusyId(request.id);
    try {
      const buildUrl = DECISION_ENDPOINT[request.type];
      const response = await fetch(buildUrl(request.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setActionError(payload.error || "ไม่สามารถบันทึกผลการพิจารณาได้ กรุณาลองใหม่");
        await loadRequests();
        return;
      }

      setNotice(decision === "approved" ? "อนุมัติคำขอเรียบร้อยแล้ว" : "ส่งเหตุผลการไม่อนุมัติให้ผู้ขอแล้ว");
      await loadRequests();
      setSelected((current) => (current && current.id === request.id ? null : current));
    } catch {
      setActionError("ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-primary">People operations · Workflow</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight leading-tight text-foreground sm:text-3xl">ระบบอนุมัติกลาง</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">รวมคำขอลาและ OT ไว้ให้หัวหน้างานตรวจสอบจากที่เดียว</p>
        </div>
        <Chip color={canApproveAny ? "cyan" : "soft"} variant="caption">{canApproveAny ? "มุมมองหัวหน้างาน" : "ประวัติคำขอของฉัน"}</Chip>
      </section>
      {notice ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-status-success/25 bg-status-success/10 px-4 py-3 text-xs leading-5 text-status-success">
          <span>{notice}</span>
          <Button size="xs" variant="ghost" onClick={() => setNotice("")}>ปิด</Button>
        </div>
      ) : null}
      {actionError ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-status-danger/25 bg-status-danger/10 px-4 py-3 text-xs leading-5 text-status-danger">
          <span>{actionError}</span>
          <Button size="xs" variant="ghost" onClick={() => setActionError("")}>ปิด</Button>
        </div>
      ) : null}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <span className="text-xs leading-4 text-muted-foreground">รอดำเนินการ</span>
          <p className="mt-3 text-2xl font-semibold tracking-tight leading-tight text-foreground">{pendingCount}</p>
          <span className="text-[11px] leading-4 text-muted-foreground">ต้องจัดการวันนี้</span>
        </article>
        <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <span className="text-xs leading-4 text-muted-foreground">อนุมัติแล้ว</span>
          <p className="mt-3 text-2xl font-semibold tracking-tight leading-tight text-foreground">{approvedCount}</p>
          <span className="text-[11px] leading-4 text-muted-foreground">เดือนกันยายน</span>
        </article>
        <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <span className="text-xs leading-4 text-muted-foreground">ลางาน</span>
          <p className="mt-3 text-2xl font-semibold tracking-tight leading-tight text-foreground">{leaveCount}</p>
          <span className="text-[11px] leading-4 text-muted-foreground">คำขอทั้งหมด</span>
        </article>
        <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <span className="text-xs leading-4 text-muted-foreground">เวลาตอบเฉลี่ย</span>
          <p className="mt-3 text-2xl font-semibold tracking-tight leading-tight text-foreground">1.8</p>
          <span className="text-[11px] leading-4 text-muted-foreground">ชั่วโมง</span>
        </article>
      </section>
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight leading-6 text-foreground">คิวคำขอ</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">กดอนุมัติหรือไม่อนุมัติได้ทันที รายการจะถูกบันทึกในประวัติ</p>
          </div>
          <Badge color="primary">{pendingCount} รออนุมัติ</Badge>
        </div>
        <Tabs selectedKey={filter} onSelectionChange={(key) => setFilter(String(key))} className="mt-5">
          <TabList aria-label="กรองคำขอ">
            <Tab id="all">ทั้งหมด</Tab>
            <Tab id="leave">วันลา</Tab>
            <Tab id="ot">OT</Tab>
          </TabList>
        </Tabs>
        {loadError ? <p className="mt-4 text-xs leading-5 text-status-danger">{loadError}</p> : null}
        <div className="mt-4 space-y-3">
          {visible.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              canApprove={canApproveRequest(role, request.type)}
              busy={busyId === request.id}
              onAction={takeAction}
              onOpen={setSelected}
            />
          ))}
          {!loading && visible.length === 0 ? <p className="py-8 text-center text-xs leading-5 text-muted-foreground">ไม่มีรายการในหมวดนี้</p> : null}
          {loading ? <p className="py-8 text-center text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p> : null}
        </div>
      </section>
      {selected ? (
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-primary">รายละเอียดคำขอ · {typeLabel[selected.type] || selected.type}</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight leading-6 text-foreground">{selected.kind} · {selected.employeeName}</h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{selected.detail}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">เหตุผล: {selected.reason || "-"}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">สถานะ: {selected.statusName}</p>
            </div>
            <Button size="small" variant="secondary" onClick={() => setSelected(null)}>ปิดรายละเอียด</Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
