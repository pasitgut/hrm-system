"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RiAddLine,
  RiDeleteBinLine,
  RiEditLine,
  RiRestartLine,
  RiShieldCheckLine,
} from "@remixicon/react";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function formatBaht(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatThaiDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y + 543}`;
}

function computeMaxContribution(maxWageBase, ratePercent) {
  const wage = Number(maxWageBase);
  const rate = Number(ratePercent);
  if (!Number.isFinite(wage) || !Number.isFinite(rate) || wage < 0 || rate < 0) return 0;
  return Math.round(wage * (rate / 100));
}

const EMPTY_FORM = {
  id: "",
  effectiveFrom: new Date().toISOString().slice(0, 10),
  label: "",
  employeeRatePercent: "5",
  employerRatePercent: "5",
  minWageBase: "1650",
  maxWageBase: "17500",
  note: "",
};

export function SocialSecuritySettingsTab() {
  const [items, setItems] = useState([]);
  const [activeRule, setActiveRule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/social-security", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "โหลดตารางอัตราประกันสังคมไม่สำเร็จ");
        if (!cancelled) {
          setItems(payload.items ?? []);
          setActiveRule(payload.activeRule ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "โหลดตารางอัตราประกันสังคมไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function openCreateDialog() {
    setForm({
      ...EMPTY_FORM,
      effectiveFrom: new Date().toISOString().slice(0, 10),
    });
    setFormError("");
    setDialogOpen(true);
  }

  function openEditDialog(item) {
    setForm({
      id: item.id || "",
      effectiveFrom: item.effectiveFrom || "",
      label: item.label || "",
      employeeRatePercent: String(item.employeeRatePercent ?? 5),
      employerRatePercent: String(item.employerRatePercent ?? 5),
      minWageBase: String(item.minWageBase ?? 1650),
      maxWageBase: String(item.maxWageBase ?? 17500),
      note: item.note || "",
    });
    setFormError("");
    setDialogOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    setError("");
    setNotice("");

    const employeeRatePercent = Number(form.employeeRatePercent);
    const employerRatePercent = Number(form.employerRatePercent);
    const minWageBase = Number(form.minWageBase);
    const maxWageBase = Number(form.maxWageBase);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.effectiveFrom)) {
      setFormError("กรุณาระบุวันที่มีผลบังคับใช้ให้ถูกต้อง");
      return;
    }
    if (!form.label.trim()) {
      setFormError("กรุณาระบุชื่อช่วงหรือระยะของอัตราประกันสังคม");
      return;
    }
    if (![employeeRatePercent, employerRatePercent].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) {
      setFormError("อัตราเงินสมทบต้องอยู่ระหว่าง 0 ถึง 100%");
      return;
    }
    if (!Number.isFinite(minWageBase) || !Number.isFinite(maxWageBase) || minWageBase < 0 || maxWageBase < minWageBase) {
      setFormError("เพดานค่าจ้างสูงสุดต้องมากกว่าหรือเท่ากับฐานค่าจ้างขั้นต่ำ");
      return;
    }

    setBusy(true);
    try {
      const isEdit = Boolean(form.id);
      const url = isEdit ? `/api/settings/social-security/${form.id}` : "/api/settings/social-security";
      const response = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          effectiveFrom: form.effectiveFrom,
          label: form.label.trim(),
          employeeRatePercent,
          employerRatePercent,
          minWageBase,
          maxWageBase,
          note: form.note.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "บันทึกอัตราประกันสังคมไม่สำเร็จ");

      setItems(payload.items ?? []);
      setActiveRule(payload.activeRule ?? null);
      setDialogOpen(false);
      setNotice(isEdit ? "อัปเดตอัตราประกันสังคมเรียบร้อยแล้ว" : "เพิ่มช่วงอัตราประกันสังคมใหม่แล้ว");
    } catch (err) {
      setFormError(err.message || "บันทึกอัตราประกันสังคมไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(item) {
    if (!item.id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/settings/social-security/${item.id}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "ลบอัตราประกันสังคมไม่สำเร็จ");
      setItems(payload.items ?? []);
      setActiveRule(payload.activeRule ?? null);
      setNotice(`ลบช่วงอัตรา "${item.label}" แล้ว`);
    } catch (err) {
      setError(err.message || "ลบอัตราประกันสังคมไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetDefaults() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings/social-security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_defaults" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "คืนค่าอัตราตามกฎกระทรวงไม่สำเร็จ");
      setItems(payload.items ?? []);
      setActiveRule(payload.activeRule ?? null);
      setNotice("คืนค่าตารางอัตราประกันสังคมตามกฎกระทรวง พ.ศ. 2568 (2563–2575+) เรียบร้อยแล้ว");
    } catch (err) {
      setError(err.message || "คืนค่าอัตราตามกฎกระทรวงไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const previewEmployeeMax = computeMaxContribution(form.maxWageBase, form.employeeRatePercent);
  const previewEmployerMax = computeMaxContribution(form.maxWageBase, form.employerRatePercent);

  return (
    <section aria-labelledby="sso-settings-title" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 id="sso-settings-title" className="text-base font-semibold text-foreground">
            อัตราและเพดานประกันสังคม (มาตรา 33)
          </h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            ระบบเลือกใช้อัตราและเพดานค่าจ้างตามวันที่ของงวดเงินเดือนโดยอัตโนมัติ (รองรับกฎกระทรวง พ.ศ. 2568 แบบขั้นบันได
            พ.ศ. 2569–2575+ และสามารถเพิ่มหรือปรับแก้ได้ทันทีหากมีการเปลี่ยนแปลงอัตราในอนาคต)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            leadingIcon={RiRestartLine}
            disabled={busy || loading}
            onClick={handleResetDefaults}
          >
            คืนค่ามาตรฐานตามกฎหมาย
          </Button>
          <Button
            type="button"
            size="sm"
            leadingIcon={RiAddLine}
            disabled={busy || loading}
            onClick={openCreateDialog}
          >
            เพิ่มช่วงอัตราใหม่
          </Button>
        </div>
      </div>

      {activeRule ? (
        <Card className="border-primary/25 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <RiShieldCheckLine className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">อัตราที่บังคับใช้ปัจจุบัน: {activeRule.label}</span>
                  <Badge color="success" variant="caption">มีผลตั้งแต่ {formatThaiDate(activeRule.effectiveFrom)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  ลูกจ้าง {activeRule.employeeRatePercent}% · นายจ้าง {activeRule.employerRatePercent}% · ฐานค่าจ้าง{" "}
                  {formatBaht(activeRule.minWageBase)} – {formatBaht(activeRule.maxWageBase)} บาท · เงินสมทบสูงสุด{" "}
                  <strong className="text-foreground">
                    {formatBaht(computeMaxContribution(activeRule.maxWageBase, activeRule.employeeRatePercent))} บาท/เดือน
                  </strong>
                </p>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <div aria-live="polite" className="empty:hidden text-sm">
        {error ? <p role="alert" className="text-status-danger">{error}</p> : null}
        {notice ? <p role="status" className="text-status-success">{notice}</p> : null}
      </div>

      <Card className="min-w-0 overflow-hidden">
        <div className="hrm-table-shell border-y-0">
          <table className="hrm-data-table min-w-[780px]">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th>วันที่มีผล</th>
                <th>ชื่อช่วง / ระยะ</th>
                <th className="text-right">ลูกจ้าง (%)</th>
                <th className="text-right">นายจ้าง (%)</th>
                <th className="text-right">ฐานขั้นต่ำ (บาท)</th>
                <th className="text-right">เพดานสูงสุด (บาท)</th>
                <th className="text-right">สมทบสูงสุด/เดือน</th>
                <th className="text-center">สถานะ</th>
                <th className="text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    กำลังโหลดตารางอัตราประกันสังคม…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    ยังไม่มีรายการอัตราประกันสังคม
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const isActive = activeRule && item.effectiveFrom === activeRule.effectiveFrom;
                  const isFuture = item.effectiveFrom > today;
                  const maxEmp = computeMaxContribution(item.maxWageBase, item.employeeRatePercent);
                  const maxEmpr = computeMaxContribution(item.maxWageBase, item.employerRatePercent);
                  return (
                    <tr key={item.id || item.effectiveFrom}>
                      <td className="font-mono text-xs tabular-nums">{formatThaiDate(item.effectiveFrom)}</td>
                      <td>
                        <p className="font-medium text-foreground">{item.label}</p>
                        {item.note ? <p className="text-[11px] text-muted-foreground">{item.note}</p> : null}
                      </td>
                      <td className="text-right tabular-nums">{item.employeeRatePercent}%</td>
                      <td className="text-right tabular-nums">{item.employerRatePercent}%</td>
                      <td className="text-right tabular-nums">{formatBaht(item.minWageBase)}</td>
                      <td className="text-right font-medium tabular-nums text-foreground">{formatBaht(item.maxWageBase)}</td>
                      <td className="text-right font-semibold tabular-nums text-primary">
                        {maxEmp === maxEmpr
                          ? `${formatBaht(maxEmp)} บาท`
                          : `${formatBaht(maxEmp)} / ${formatBaht(maxEmpr)} บาท`}
                      </td>
                      <td className="text-center">
                        {isActive ? (
                          <Badge color="success" variant="caption">ใช้งานอยู่</Badge>
                        ) : isFuture ? (
                          <Badge color="info" variant="caption">มีผลในอนาคต</Badge>
                        ) : (
                          <Badge color="neutral" variant="caption">อัตราเดิม</Badge>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            leadingIcon={RiEditLine}
                            disabled={busy}
                            onClick={() => openEditDialog(item)}
                          >
                            แก้ไข
                          </Button>
                          {items.length > 1 && item.id ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              leadingIcon={RiDeleteBinLine}
                              disabled={busy}
                              onClick={() => handleDelete(item)}
                              aria-label={`ลบ ${item.label}`}
                            >
                              ลบ
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <HrmDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        size="md"
        title={form.id ? "แก้ไขอัตราประกันสังคม" : "เพิ่มช่วงอัตราประกันสังคมใหม่"}
        description="กำหนดวันที่มีผลบังคับใช้ อัตราร้อยละ และเพดานค่าจ้าง ระบบจะนำไปคำนวณให้อัตโนมัติในทุกงวดเงินเดือนตั้งแต่วันที่มีผล"
        footer={(
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" form="sso-rate-form" size="sm" disabled={busy}>
              {busy ? "กำลังบันทึก…" : "บันทึกอัตราประกันสังคม"}
            </Button>
          </div>
        )}
      >
        <form id="sso-rate-form" onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="วันที่มีผลบังคับใช้ (ค.ศ.)"
              type="date"
              value={form.effectiveFrom}
              onChange={(val) => setForm((prev) => ({ ...prev, effectiveFrom: val }))}
              isRequired
            />
            <Input
              label="ชื่อช่วง / ระยะ"
              placeholder="เช่น ปรับลดอัตราชั่วคราว 2570"
              value={form.label}
              onChange={(val) => setForm((prev) => ({ ...prev, label: val }))}
              isRequired
            />
            <Input
              label="อัตราลูกจ้าง (%)"
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={form.employeeRatePercent}
              onChange={(val) => setForm((prev) => ({ ...prev, employeeRatePercent: val }))}
              isRequired
            />
            <Input
              label="อัตรานายจ้าง (%)"
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={form.employerRatePercent}
              onChange={(val) => setForm((prev) => ({ ...prev, employerRatePercent: val }))}
              isRequired
            />
            <Input
              label="ฐานค่าจ้างขั้นต่ำ (บาท)"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={form.minWageBase}
              onChange={(val) => setForm((prev) => ({ ...prev, minWageBase: val }))}
              isRequired
            />
            <Input
              label="เพดานค่าจ้างสูงสุด (บาท)"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={form.maxWageBase}
              onChange={(val) => setForm((prev) => ({ ...prev, maxWageBase: val }))}
              isRequired
            />
          </div>

          <Input
            label="หมายเหตุ (ไม่บังคับ)"
            placeholder="เช่น อ้างอิงกฎกระทรวง หรือประกาศลดอัตราเงินสมทบ"
            value={form.note}
            onChange={(val) => setForm((prev) => ({ ...prev, note: val }))}
          />

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            ตัวอย่างคำนวณเงินสมทบสูงสุดต่อเดือน:{" "}
            <strong className="text-foreground">ลูกจ้าง {formatBaht(previewEmployeeMax)} บาท</strong> ·{" "}
            <strong className="text-foreground">นายจ้าง {formatBaht(previewEmployerMax)} บาท</strong>
          </div>

          {formError ? <p role="alert" className="text-xs text-status-danger">{formError}</p> : null}
        </form>
      </HrmDialog>
    </section>
  );
}
