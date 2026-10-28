"use client";

import { useMemo, useState } from "react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, SectionHeading } from "@/components/hrm/PageHeader";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/auth/permissions";
import { parseWorkers } from "@/lib/work-tracking/service";
import { useSubStatusUpdate, useWorkList } from "@/components/hrm/work-tracking/useWorkTracking";

const STATUS_OPTIONS = [
  { value: "in progress", label: "กำลังดำเนินงาน" },
  { value: "completed", label: "เสร็จแล้ว" },
  { value: "delivered", label: "ส่งมอบแล้ว" },
];

const STATUS_PRIORITY = { "in progress": 0, completed: 1, delivered: 2 };
const CATEGORY_OPTIONS = [
  { value: "all", label: "ทุกกำหนดส่ง" },
  { value: "overdue", label: "เกินกำหนด" },
  { value: "today", label: "ครบกำหนดวันนี้" },
];
const DEADLINE_LABELS = {
  overdue: "งานเกินกำหนดส่ง",
  today: "งานต้องส่งวันนี้",
  upcoming: "งานที่ยังไม่ถึงกำหนด",
};

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

function toApiDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function parseDate(value) {
  if (typeof value !== "string" || !value) return null;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const legacyMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const parts = isoMatch
    ? [Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])]
    : legacyMatch
      ? [Number(legacyMatch[3]), Number(legacyMatch[2]), Number(legacyMatch[1])]
      : null;
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateOrdinal(value) {
  const iso = parseDate(value);
  return iso ? Date.parse(`${iso}T00:00:00Z`) / 86_400_000 : Number.POSITIVE_INFINITY;
}

function formatDate(value) {
  const iso = parseDate(value);
  if (!iso) return "—";
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

function normalizeStatus(status) {
  return STATUS_PRIORITY[status] === undefined ? "in progress" : status;
}

function latestStatus(item) {
  return normalizeStatus(item.status);
}

function isNotDelivered(item) {
  if (Array.isArray(item.subStatuses) && item.subStatuses.length > 0) {
    return item.subStatuses.some((subStatus) => normalizeStatus(subStatus.status) !== "delivered");
  }
  return latestStatus(item) !== "delivered";
}

function deadlineBucket(deliveredDate) {
  const target = dateOrdinal(deliveredDate);
  if (!Number.isFinite(target)) return "upcoming";
  const today = dateOrdinal(localDateString(new Date()));
  if (target < today) return "overdue";
  if (target === today) return "today";
  return "upcoming";
}

function deliveredDateTone(value) {
  if (!parseDate(value)) return "text-muted-foreground";
  const diff = dateOrdinal(value) - dateOrdinal(localDateString(new Date()));
  if (diff < 0) return "text-status-danger";
  if (diff === 0) return "text-status-warning";
  return "text-status-success";
}

function statusLabel(status) {
  return STATUS_OPTIONS.find((option) => option.value === normalizeStatus(status))?.label ?? STATUS_OPTIONS[0].label;
}

function workStatusClassName(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "completed") return "border-work-status-completed-border bg-work-status-completed-bg text-work-status-completed";
  if (normalized === "delivered") return "border-work-status-delivered-border bg-work-status-delivered-bg text-work-status-delivered";
  return "border-work-status-progress-border bg-work-status-progress-bg text-work-status-progress";
}

function WorkStatusBadge({ status, children }) {
  return <Badge variant="caption" className={workStatusClassName(status)}>{children ?? statusLabel(status)}</Badge>;
}

function getWorkTitle(item) {
  return item.projectText || item.detail || "—";
}

function workerEntries(item) {
  const workers = parseWorkers(item.workersRaw);
  return Object.entries(workers).map(([code, sessions]) => {
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    return {
      code,
      name: safeSessions[0]?.nickname || safeSessions[0]?.name || code,
      sessions: safeSessions,
    };
  });
}

function WorkStatusControl({ item, subStatus, canUpdate, updating, onChange }) {
  const currentStatus = normalizeStatus(subStatus.status);
  const hasDetail = Boolean(subStatus.detail && subStatus.detail !== "-");
  const tone = workStatusClassName(currentStatus);

  if (!canUpdate) {
    return (
      <span className={cn("inline-flex min-h-9 w-fit min-w-0 max-w-full shrink-0 flex-nowrap items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium leading-4", tone)}>
        {hasDetail ? <><span title={subStatus.detail} className="min-w-0 max-w-40 truncate whitespace-nowrap">{subStatus.detail}</span><span className="shrink-0" aria-hidden="true">—</span></> : null}
        <span className="shrink-0 whitespace-nowrap font-semibold">{statusLabel(subStatus.status)}</span>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex min-h-9 w-fit min-w-0 max-w-full shrink-0 flex-nowrap items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium leading-4", tone)}>
      {hasDetail ? <><span title={subStatus.detail} className="min-w-0 max-w-40 truncate whitespace-nowrap">{subStatus.detail}</span><span className="shrink-0" aria-hidden="true">—</span></> : null}
      <Select
        aria-label={`สถานะ${subStatus.detail && subStatus.detail !== "-" ? ` ${subStatus.detail}` : "งานย่อย"} ของบ้านเลขที่ ${item.houseNo} รอบ ${item.round}`}
        selectedKey={currentStatus}
        isDisabled={updating}
        onSelectionChange={(status) => onChange(item, subStatus.detail, status)}
        className="h-8 w-auto min-w-0 shrink-0 whitespace-nowrap border-0 bg-transparent px-0 py-0 text-xs font-semibold text-inherit"
      >
        {STATUS_OPTIONS.map((option) => <SelectItem key={option.value} id={option.value}>{option.label}</SelectItem>)}
      </Select>
    </span>
  );
}

function WorkerButtons({ item, onSelect }) {
  const entries = workerEntries(item);
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((worker) => (
        <Button
          key={worker.code}
          type="button"
          variant="outline"
          size="sm"
          className="max-w-48 justify-start truncate"
          aria-label={`ดูรายละเอียดการทำงานของ ${worker.name}`}
          onClick={() => onSelect(worker.name, worker.sessions)}
        >
          {worker.name}
        </Button>
      ))}
    </div>
  );
}

function WorkerDetailDialog({ worker, onOpenChange }) {
  return (
    <Dialog open={Boolean(worker)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{worker?.name || "รายละเอียดผู้ปฏิบัติงาน"}</DialogTitle>
          <DialogDescription>วันที่ เวลา และรายการงานของผู้ปฏิบัติงาน</DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {!worker?.sessions?.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">ไม่มีข้อมูลการทำงาน</p>
          ) : worker.sessions.map((session, index) => (
            <article key={`${session.date}-${session.time}-${index}`} className="border-b border-border pb-3 last:border-0">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <p><span className="text-muted-foreground">วันที่ </span><span className="font-medium">{session.date || "—"}</span></p>
                <p><span className="text-muted-foreground">เวลา </span><span className="font-medium">{session.time || "—"}</span></p>
              </div>
              <ul className="mt-2 space-y-1">
                {(Array.isArray(session.items) ? session.items : []).map((item, itemIndex) => (
                  <li key={`${item}-${itemIndex}`} className="text-sm text-muted-foreground">• {item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeadlineDetailDialog({ type, items, onOpenChange }) {
  const visible = type !== null;
  return (
    <Dialog open={visible} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{type ? DEADLINE_LABELS[type] : "กำหนดส่ง"}</DialogTitle>
          <DialogDescription>รายการที่ยังมีงานย่อยไม่ครบสถานะส่งมอบ</DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">ไม่มีรายการ</p>
          ) : items.map((item, index) => (
            <article key={`${item.houseNo}-${item.round}-${item.eventDate}-${index}`} className="border-b border-border pb-3 last:border-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-medium">{getWorkTitle(item)}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">บ้านเลขที่ {item.houseNo} · รอบ {item.round}</p>
                </div>
                <WorkStatusBadge status={latestStatus(item)}>{statusLabel(item.status)}</WorkStatusBadge>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>วันที่ตรวจ: {formatDate(item.eventDate)}</span>
                <span>กำหนดส่ง: <span className={deliveredDateTone(item.deliveredDate)}>{formatDate(item.deliveredDate)}</span></span>
              </div>
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function WorkOverviewPage() {
  const [dateRange, setDateRange] = useState(() => {
    const today = localDateString(new Date());
    return { from: addDays(today, -4), to: today };
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [deadlineDialog, setDeadlineDialog] = useState(null);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const { permissions = [] } = useHrmRole() ?? {};
  const canUpdate = hasPermission(permissions, "work.status.update");

  const startDate = dateRange.from ? toApiDate(dateRange.from) : "";
  const endDate = dateRange.to ? toApiDate(dateRange.to) : "";
  const { data: allRecords, loading, error, refresh, updateSubStatusInList } = useWorkList(startDate, endDate);
  const statusUpdate = useSubStatusUpdate();

  const recordsByBucket = useMemo(() => {
    const buckets = { overdue: [], today: [], upcoming: [] };
    for (const record of allRecords) buckets[deadlineBucket(record.deliveredDate)].push(record);
    return buckets;
  }, [allRecords]);

  const outstandingByBucket = useMemo(() => ({
    overdue: recordsByBucket.overdue.filter(isNotDelivered),
    today: recordsByBucket.today.filter(isNotDelivered),
    upcoming: recordsByBucket.upcoming.filter(isNotDelivered),
  }), [recordsByBucket]);

  const filteredItems = useMemo(() => {
    let items = allRecords;
    if (categoryFilter === "overdue" || categoryFilter === "today") items = recordsByBucket[categoryFilter];
    if (statusFilter !== "all") items = items.filter((item) => latestStatus(item) === statusFilter);
    return [...items].sort((a, b) => {
      const priorityDiff = STATUS_PRIORITY[latestStatus(a)] - STATUS_PRIORITY[latestStatus(b)];
      return priorityDiff || dateOrdinal(a.deliveredDate) - dateOrdinal(b.deliveredDate);
    });
  }, [allRecords, categoryFilter, recordsByBucket, statusFilter]);

  const totalOutstanding = allRecords.filter(isNotDelivered).length;
  const hasActiveFilters = statusFilter !== "all" || categoryFilter !== "all";

  function clearFilters() {
    setStatusFilter("all");
    setCategoryFilter("all");
  }

  function handleStartDateChange(value) {
    const from = value?.toString() || "";
    setDateRange((current) => ({
      from,
      to: from && current.to && current.to < from ? from : current.to,
    }));
  }

  async function handleSubStatusChange(item, detail, status) {
    if (!canUpdate || normalizeStatus(status) === normalizeStatus(item.subStatuses.find((subStatus) => subStatus.detail === detail)?.status)) return;
    setFeedback(null);
    try {
      await statusUpdate.update({
        houseNo: item.houseNo,
        round: item.round,
        date: item.eventDate,
        detail,
        status,
      });
      updateSubStatusInList({
        houseNo: item.houseNo,
        round: item.round,
        date: item.eventDate,
        detail,
        status,
      });
      setFeedback({ type: "success", message: "อัปเดตสถานะงานย่อยแล้ว" });
    } catch (cause) {
      setFeedback({ type: "error", message: cause instanceof Error ? cause.message : "อัปเดตสถานะไม่สำเร็จ" });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="ติดตามงาน"
        description="ตรวจสอบกำหนดส่ง สถานะงานย่อย และรายละเอียดผู้ปฏิบัติงาน"
        actions={<Button type="button" variant="outline" disabled={loading || statusUpdate.updating} onClick={() => { setFeedback(null); refresh(); }}>รีเฟรชรายการ</Button>}
      />

      <section aria-label="ช่วงวันที่ค้นหา" className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        <DatePickerField
          label="ตั้งแต่วันที่"
          value={dateRange.from}
          onChange={handleStartDateChange}
          max={dateRange.to || undefined}
        />
        <DatePickerField
          label="ถึงวันที่"
          value={dateRange.to}
          onChange={(value) => setDateRange((current) => ({ ...current, to: value?.toString() || "" }))}
          min={dateRange.from || undefined}
        />
      </section>

      <section aria-label="สรุปกำหนดส่ง" className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-card sm:grid-cols-4">
        <div className="border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
          <p className="text-xs text-muted-foreground">งานที่ยังไม่ส่งมอบ</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{loading ? "—" : totalOutstanding}</p>
        </div>
        {(["overdue", "today", "upcoming"]).map((type, index) => (
          <button
            key={type}
            type="button"
            onClick={() => setDeadlineDialog(type)}
            className={cn(
              "min-h-20 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              index < 2 && "border-b border-border sm:border-b-0",
              index === 0 && "sm:border-r",
              index === 1 && "sm:border-r",
            )}
          >
            <span className="block text-xs text-muted-foreground">{DEADLINE_LABELS[type]}</span>
            <span className={cn(
              "mt-1 block text-2xl font-semibold tabular-nums",
              type === "overdue" && "text-status-danger",
              type === "today" && "text-status-warning",
              type === "upcoming" && "text-status-info",
            )}>{loading ? "—" : outstandingByBucket[type].length}</span>
          </button>
        ))}
      </section>

      <section className="space-y-3" aria-labelledby="work-list-title">
        <SectionHeading
          id="work-list-title"
          title="รายการงาน"
          description={loading ? "กำลังโหลดรายการ…" : `พบ ${filteredItems.length.toLocaleString("th-TH")} รายการ`}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-44">
              <label id="work-category-label" className="mb-1.5 block text-xs font-medium text-muted-foreground">กำหนดส่ง</label>
              <Select aria-labelledby="work-category-label" selectedKey={categoryFilter} onSelectionChange={setCategoryFilter}>
                {CATEGORY_OPTIONS.map((option) => <SelectItem key={option.value} id={option.value}>{option.label}</SelectItem>)}
              </Select>
            </div>
            <div className="min-w-44">
              <label id="work-status-label" className="mb-1.5 block text-xs font-medium text-muted-foreground">สถานะงาน</label>
              <Select aria-labelledby="work-status-label" selectedKey={statusFilter} onSelectionChange={setStatusFilter}>
                <SelectItem id="all">ทุกสถานะ</SelectItem>
                {STATUS_OPTIONS.map((option) => <SelectItem key={option.value} id={option.value}>{option.label}</SelectItem>)}
              </Select>
            </div>
          </div>
          {hasActiveFilters ? <Button type="button" variant="ghost" onClick={clearFilters}>ล้างตัวกรอง</Button> : null}
        </div>

        {hasActiveFilters ? (
          <div className="flex flex-wrap items-center gap-2" aria-label="ตัวกรองที่เลือก">
            <span className="text-xs text-muted-foreground">ตัวกรอง:</span>
            {categoryFilter !== "all" ? <Badge color="info">{CATEGORY_OPTIONS.find((option) => option.value === categoryFilter)?.label}</Badge> : null}
            {statusFilter !== "all" ? <Badge color="neutral">{statusLabel(statusFilter)}</Badge> : null}
          </div>
        ) : null}

        {feedback ? <p role={feedback.type === "error" ? "alert" : "status"} className={cn("text-sm", feedback.type === "error" ? "text-status-danger" : "text-status-success")}>{feedback.message}</p> : null}
        {error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-4 text-sm">
            <p className="text-status-danger">โหลดรายการงานไม่สำเร็จ: {error}</p>
            <Button type="button" variant="outline" disabled={loading} onClick={refresh}>ลองอีกครั้ง</Button>
          </div>
        ) : loading ? (
          <div role="status" className="space-y-3 border-y border-border py-4 text-sm text-muted-foreground">
            <p>กำลังโหลดรายการงาน…</p>
            <div className="h-10 rounded-sm bg-muted" />
            <div className="h-10 rounded-sm bg-muted" />
          </div>
        ) : !startDate || !endDate ? (
          <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">เลือกวันที่เริ่มต้นและสิ้นสุดเพื่อดูรายการงาน</p>
        ) : filteredItems.length === 0 ? (
          <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">ไม่มีรายการที่ตรงกับช่วงวันที่และตัวกรองนี้</p>
        ) : (
          <>
            <div className="hidden lg:block">
              <Table className="min-w-[960px] table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[24%]">สถานะงานย่อย</TableHead>
                    <TableHead className="w-[32%]">รายละเอียด</TableHead>
                    <TableHead className="w-[12%]">บ้านเลขที่</TableHead>
                    <TableHead className="w-[6%]">รอบ</TableHead>
                    <TableHead className="w-[9%]">วันที่ตรวจ</TableHead>
                    <TableHead className="w-[9%]">กำหนดส่ง</TableHead>
                    <TableHead className="w-[8%]">ผู้ทำรายงาน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item, index) => (
                    <TableRow key={`${item.houseNo}-${item.round}-${item.eventDate}-${index}`}>
                      <TableCell>
                        {item.subStatuses.length ? (
                          <div className="flex min-w-48 flex-wrap content-start gap-1.5">
                            {item.subStatuses.map((subStatus, subIndex) => (
                              <WorkStatusControl key={`${subStatus.detail}-${subIndex}`} item={item} subStatus={subStatus} canUpdate={canUpdate} updating={statusUpdate.updating} onChange={handleSubStatusChange} />
                            ))}
                          </div>
                        ) : <WorkStatusBadge status={latestStatus(item)}>{statusLabel(item.status)}</WorkStatusBadge>}
                      </TableCell>
                      <TableCell><span className="block max-w-full break-words font-medium">{getWorkTitle(item)}</span></TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <span>{item.houseNo || "—"}</span>
                          {item.itemCount > 1 ? <Badge color="info">{item.itemCount} รายการ</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{item.round || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(item.eventDate)}</TableCell>
                      <TableCell className={cn("whitespace-nowrap font-medium", deliveredDateTone(item.deliveredDate))}>{formatDate(item.deliveredDate)}</TableCell>
                      <TableCell><WorkerButtons item={item} onSelect={(name, sessions) => setSelectedWorker({ name, sessions })} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y divide-border border-y border-border lg:hidden">
              {filteredItems.map((item, index) => (
                <article key={`${item.houseNo}-${item.round}-${item.eventDate}-${index}`} className="space-y-3 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 flex-1 break-words text-sm font-medium">{getWorkTitle(item)}</h3>
                    <WorkStatusBadge status={latestStatus(item)}>{statusLabel(item.status)}</WorkStatusBadge>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div><dt className="text-muted-foreground">บ้านเลขที่</dt><dd className="mt-0.5 flex flex-wrap items-center gap-1.5 font-medium">{item.houseNo || "—"}{item.itemCount > 1 ? <Badge color="info">{item.itemCount} รายการ</Badge> : null}</dd></div>
                    <div><dt className="text-muted-foreground">รอบ</dt><dd className="mt-0.5 tabular-nums">{item.round || "—"}</dd></div>
                    <div><dt className="text-muted-foreground">วันที่ตรวจ</dt><dd className="mt-0.5">{formatDate(item.eventDate)}</dd></div>
                    <div><dt className="text-muted-foreground">กำหนดส่ง</dt><dd className={cn("mt-0.5 font-medium", deliveredDateTone(item.deliveredDate))}>{formatDate(item.deliveredDate)}</dd></div>
                  </dl>
                  {item.subStatuses.length ? (
                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="text-xs font-medium text-muted-foreground">สถานะงานย่อย <span className="font-normal">· {item.subStatuses.length} รายการ</span></p>
                      <div className="flex flex-wrap items-start gap-1.5">
                        {item.subStatuses.map((subStatus, subIndex) => (
                          <WorkStatusControl key={`${subStatus.detail}-${subIndex}`} item={item} subStatus={subStatus} canUpdate={canUpdate} updating={statusUpdate.updating} onChange={handleSubStatusChange} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="border-t border-border pt-3">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">ผู้ทำรายงาน</p>
                    <WorkerButtons item={item} onSelect={(name, sessions) => setSelectedWorker({ name, sessions })} />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <DeadlineDetailDialog
        type={deadlineDialog}
        items={deadlineDialog ? outstandingByBucket[deadlineDialog] : []}
        onOpenChange={(open) => { if (!open) setDeadlineDialog(null); }}
      />
      <WorkerDetailDialog worker={selectedWorker} onOpenChange={(open) => { if (!open) setSelectedWorker(null); }} />
    </div>
  );
}
