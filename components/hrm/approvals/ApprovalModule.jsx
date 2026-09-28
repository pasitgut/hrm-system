"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RiCheckLine,
  RiCloseLine,
} from "@remixicon/react";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Select, SelectItem } from "@/components/ui/select";
import { Tabs, TabList, Tab } from "@/components/ui/tabs";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { PageHeader } from "@/components/hrm/PageHeader";
import { canApproveAssetLoan, canApproveLeave, canApproveOT } from "@/lib/auth/permissions";
import { cx } from "@/utils/cx";

const typeLabel = { ot: "OT", leave: "ลา", asset: "ทรัพย์สิน" };

const DECISION_ENDPOINT = {
  ot: (id) => `/api/ot/${id}/decision`,
  leave: (id) => `/api/leave/${id}/decision`,
  asset: (id) => `/api/asset-requests/${id}`,
};

const submittedFormatter = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const submittedDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatSubmittedAt(iso) {
  try {
    return submittedFormatter.format(new Date(iso));
  } catch {
    return iso;
  }
}

function submittedDateKey(iso) {
  try {
    const parts = Object.fromEntries(submittedDateFormatter.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return "";
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
  if (type === "asset") return canApproveAssetLoan(role);
  return false;
}

function RequestActions({ request, canApprove, busy, onAction, onOpen, expanded = false }) {
  const pending = request.statusCode === "pending";
  const needsAssetWorkflow = pending && canApprove && request.requiresAssetWorkflow;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button type="button" size="xs" variant="ghost" aria-expanded={expanded} aria-controls="selected-request-details" onClick={() => onOpen(expanded ? null : request)}>
        {expanded ? "ซ่อน" : "รายละเอียด"}
      </Button>
      {needsAssetWorkflow ? (
        <Button asChild type="button" size="xs" variant="outline">
          <a href="/assets">ดำเนินการในหน้าทรัพย์สิน</a>
        </Button>
      ) : null}
      {pending && canApprove && !request.requiresAssetWorkflow ? (
        <>
          <Button type="button" size="xs" leadingIcon={RiCheckLine} disabled={busy} onClick={() => onAction(request, "approved")}>
            {busy ? "กำลังบันทึก" : "อนุมัติ"}
          </Button>
          <Button type="button" size="xs" variant="outline" leadingIcon={RiCloseLine} disabled={busy} onClick={() => onAction(request, "rejected")}>
            ไม่อนุมัติ
          </Button>
        </>
      ) : null}
    </div>
  );
}

export default function ApprovalModule() {
  const { role } = useHrmRole();
  const canApproveAny = canApproveOT(role) || canApproveLeave(role) || canApproveAssetLoan(role);
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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

  const visible = useMemo(
    () => requests.filter((request) => {
      if (statusFilter !== "all" && request.statusCode !== statusFilter) return false;
      const submittedOn = submittedDateKey(request.submittedAt);
      if (dateFrom && (!submittedOn || submittedOn < dateFrom)) return false;
      if (dateTo && (!submittedOn || submittedOn > dateTo)) return false;
      return true;
    }),
    [requests, statusFilter, dateFrom, dateTo],
  );
  const pendingCount = useMemo(() => requests.filter((request) => request.statusCode === "pending").length, [requests]);
  const approvedCount = useMemo(() => requests.filter((request) => request.statusCode === "approved").length, [requests]);
  const leaveCount = useMemo(() => requests.filter((request) => request.type === "leave").length, [requests]);
  const otCount = useMemo(() => requests.filter((request) => request.type === "ot").length, [requests]);
  const assetCount = useMemo(() => requests.filter((request) => request.type === "asset").length, [requests]);

  async function takeAction(request, decision) {
    setActionError("");
    setBusyId(request.id);
    try {
      const buildUrl = DECISION_ENDPOINT[request.type];
      const actionBody = request.type === "asset"
        ? { action: "transition", status: decision }
        : { decision };
      const response = await fetch(buildUrl(request.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actionBody),
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
    <div className="hrm-page">
      <PageHeader
        eyebrow="การทำงาน · อนุมัติคำขอ"
        title="คิวอนุมัติ"
      description="ตรวจสอบคำขอลา OT และยืมทรัพย์สิน พร้อมดูเหตุผลและตัดสินใจจากรายการเดียว"
        actions={<span className="text-xs text-muted-foreground">{canApproveAny ? "มุมมองหัวหน้างาน" : "ประวัติคำขอของฉัน"}</span>}
      />
      {notice ? (
        <div role="status" className="hrm-inline-feedback border-status-success bg-status-success/5 text-status-success">
          <span>{notice}</span>
        </div>
      ) : null}
      {actionError ? (
        <div role="alert" className="hrm-inline-feedback border-status-danger bg-status-danger/5 text-status-danger">
          <span>{actionError}</span>
          <Button type="button" size="xs" variant="ghost" className="ml-auto" onClick={() => setActionError("")}>ปิด</Button>
        </div>
      ) : null}
      <section aria-label="สรุปคำขอที่ตรงกับตัวกรอง" className="grid grid-cols-2 gap-x-5 gap-y-3 border-y border-border py-3 sm:grid-cols-5">
        {[
          ["รอตรวจสอบ", pendingCount],
          ["อนุมัติแล้ว", approvedCount],
          ["วันลา", leaveCount],
          ["OT", otCount],
          ["ทรัพย์สิน", assetCount],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-2">
            <strong className="hrm-numeric text-lg font-semibold leading-6 text-foreground">{value}</strong>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </section>
      <section aria-labelledby="approval-queue-heading" className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="approval-queue-heading" className="hrm-section-title">รายการคำขอ</h2>
            <p className="hrm-section-description">ดูข้อมูลสำคัญก่อนพิจารณา รายการที่รออนุมัติมีปุ่มดำเนินการในแถวเดียวกัน</p>
          </div>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {loading ? "กำลังโหลดรายการ…" : `${visible.length} รายการ`}
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-3 border-b border-border pb-3 xl:flex-row xl:items-end xl:justify-between">
          <Tabs selectedKey={filter} onSelectionChange={(key) => setFilter(String(key))} className="w-auto">
            <TabList aria-label="กรองประเภทคำขอ">
              <Tab id="all">ทั้งหมด</Tab>
              <Tab id="leave">วันลา</Tab>
              <Tab id="ot">OT</Tab>
              <Tab id="asset">ทรัพย์สิน</Tab>
            </TabList>
          </Tabs>
          <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:items-end">
            <label className="grid min-w-36 gap-1 text-xs font-medium text-muted-foreground">
              สถานะ
              <Select
                aria-label="สถานะ"
                selectedKey={statusFilter}
                onSelectionChange={(key) => setStatusFilter(String(key))}
              >
                <SelectItem id="all">ทุกสถานะ</SelectItem>
                <SelectItem id="pending">รอตรวจสอบ</SelectItem>
                <SelectItem id="approved">อนุมัติแล้ว</SelectItem>
                <SelectItem id="rejected">ไม่อนุมัติ</SelectItem>
                <SelectItem id="cancelled">ยกเลิก</SelectItem>
                <SelectItem id="return_pending">รอตรวจรับคืน</SelectItem>
                <SelectItem id="returned">คืนแล้ว</SelectItem>
                <SelectItem id="unknown">ไม่ทราบสถานะ</SelectItem>
              </Select>
            </label>
            <DatePickerField
              className="min-w-36"
              label="ตั้งแต่วันที่"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(date) => setDateFrom(date?.toString() || "")}
            />
            <DatePickerField
              className="min-w-36"
              label="ถึงวันที่"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(date) => setDateTo(date?.toString() || "")}
            />
            {statusFilter !== "all" || dateFrom || dateTo ? (
              <Button type="button" size="xs" variant="ghost" className="self-end" onClick={() => { setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}>
                ล้างตัวกรอง
              </Button>
            ) : null}
          </div>
        </div>
        {loadError ? <p role="alert" className="hrm-inline-feedback mt-3 border-status-danger bg-status-danger/5 text-status-danger">{loadError}</p> : null}

        <div className="mt-3 hidden lg:block">
          <div className="hrm-table-shell">
            <table className="hrm-data-table min-w-[1050px]">
              <thead>
                <tr>
                  <th scope="col">ผู้ขอ</th>
                  <th scope="col">คำขอ</th>
                  <th scope="col">เหตุผล</th>
                  <th scope="col">ส่งเมื่อ</th>
                  <th scope="col">สถานะ</th>
                  <th scope="col" className="text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((request) => (
                  <tr key={request.id} className={cx(selected?.id === request.id && "bg-primary/5")}>
                    <td>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar initials={getInitials(request.employeeName)} color="neutral" size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{request.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{request.kind} · {typeLabel[request.type] || request.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-64">{request.detail || "-"}</td>
                    <td className="max-w-56 text-muted-foreground">{request.reason || "-"}</td>
                    <td className="whitespace-nowrap text-muted-foreground">{formatSubmittedAt(request.submittedAt)}</td>
                    <td><StatusBadge status={request.statusCode}>{request.statusName}</StatusBadge></td>
                    <td>
                      <RequestActions
                        request={request}
                        canApprove={canApproveRequest(role, request.type)}
                        busy={busyId === request.id}
                        onAction={takeAction}
                        onOpen={setSelected}
                        expanded={selected?.id === request.id}
                      />
                    </td>
                  </tr>
                ))}
                {loading ? Array.from({ length: 3 }, (_, index) => (
                  <tr key={`loading-${index}`} aria-hidden="true"><td colSpan={6}><div className="h-5 animate-pulse bg-muted" /></td></tr>
                )) : null}
              </tbody>
            </table>
            {!loading && visible.length === 0 ? (
              <div className="hrm-empty-state">
                <strong className="text-sm font-medium text-foreground">ไม่มีคำขอในหมวดนี้</strong>
                <span className="text-xs">เลือกตัวกรองอื่นเพื่อดูรายการเพิ่มเติม</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 divide-y divide-border border-y border-border lg:hidden">
          {visible.map((request) => (
            <article key={request.id} className="py-3 first:pt-3 last:pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar initials={getInitials(request.employeeName)} color="neutral" size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{request.employeeName}</p>
                    <p className="text-xs text-muted-foreground">{request.kind} · {typeLabel[request.type] || request.type}</p>
                  </div>
                </div>
                <StatusBadge status={request.statusCode}>{request.statusName}</StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-5 text-foreground">{request.detail || "-"}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">เหตุผล: {request.reason || "-"}</p>
              <p className="mt-1 text-xs text-muted-foreground">ส่งเมื่อ {formatSubmittedAt(request.submittedAt)}</p>
              <div className="mt-2">
                <RequestActions
                  request={request}
                  canApprove={canApproveRequest(role, request.type)}
                  busy={busyId === request.id}
                  onAction={takeAction}
                  onOpen={setSelected}
                  expanded={selected?.id === request.id}
                />
              </div>
            </article>
          ))}
          {loading ? <div className="space-y-2 py-4" aria-label="กำลังโหลดรายการ">{[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse bg-muted" />)}</div> : null}
          {!loading && visible.length === 0 ? (
            <div className="hrm-empty-state">
              <strong className="text-sm font-medium text-foreground">ไม่มีคำขอในหมวดนี้</strong>
              <span className="text-xs">เลือกตัวกรองอื่นเพื่อดูรายการเพิ่มเติม</span>
            </div>
          ) : null}
        </div>

        {selected ? (
          <section id="selected-request-details" aria-labelledby="selected-request-heading" className="mt-4 border-t border-border pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">รายละเอียดคำขอ · {typeLabel[selected.type] || selected.type}</p>
                <h3 id="selected-request-heading" className="mt-1 text-sm font-semibold text-foreground">{selected.kind} · {selected.employeeName}</h3>
              </div>
              <Button type="button" size="xs" variant="outline" onClick={() => setSelected(null)}>ปิดรายละเอียด</Button>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-3 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-4">
              <div><dt className="text-xs text-muted-foreground">ช่วงเวลา / รายละเอียด</dt><dd className="mt-1 text-sm text-foreground">{selected.detail || "-"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">เหตุผล</dt><dd className="mt-1 text-sm text-foreground">{selected.reason || "-"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">ส่งคำขอเมื่อ</dt><dd className="mt-1 text-sm text-foreground">{formatSubmittedAt(selected.submittedAt)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">สถานะ</dt><dd className="mt-1"><StatusBadge status={selected.statusCode}>{selected.statusName}</StatusBadge></dd></div>
            </dl>
            {selected.assetItems?.length ? <div className="mt-4 border-t border-border pt-3">
              <h4 className="text-xs font-semibold text-foreground">รายการทรัพย์สิน</h4>
              <ul className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                {selected.assetItems.map((item, index) => <li key={`${item.name}-${index}`}>{item.name} × {item.quantity}{item.note ? ` · ${item.note}` : ""}</li>)}
              </ul>
            </div> : null}
          </section>
        ) : null}
      </section>
    </div>
  );
}
