"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import {
  applyPageAccessToggle,
  haveSameDeniedPages,
  isPageEnabledForDraft,
  PAGE_ACCESS_ITEMS,
} from "@/lib/auth/page-access";
import { haveSamePermissionSet } from "@/lib/auth/permissions";
import { normalizeRole, ROLE_DEFAULT_PERMISSIONS, ROLE_META, USER_ROLES } from "@/lib/auth/roles";

const PAGE_GROUPS = [...new Set(PAGE_ACCESS_ITEMS.map(({ group }) => group))];

function clonePermsMap(source) {
  return {
    employee: [...(source?.employee ?? ROLE_DEFAULT_PERMISSIONS.employee)],
    hr: [...(source?.hr ?? ROLE_DEFAULT_PERMISSIONS.hr)],
    executive: [...(source?.executive ?? ROLE_DEFAULT_PERMISSIONS.executive)],
  };
}

function cloneDeniedMap(source) {
  return {
    employee: [...(source?.employee ?? [])],
    hr: [...(source?.hr ?? [])],
    executive: [...(source?.executive ?? [])],
  };
}

export default function PageAccessMatrix({
  rolePermissions,
  roleDeniedPages = { employee: [], hr: [], executive: [] },
  roleCounts = { employee: 0, hr: 0, executive: 0 },
  users = [],
  loading = false,
  onSaved = undefined,
}) {
  const savedPerms = useMemo(() => clonePermsMap(rolePermissions), [rolePermissions]);
  const savedDenied = useMemo(() => cloneDeniedMap(roleDeniedPages), [roleDeniedPages]);

  const [draftPerms, setDraftPerms] = useState(() => clonePermsMap(rolePermissions));
  const [draftDenied, setDraftDenied] = useState(() => cloneDeniedMap(roleDeniedPages));
  const [syncMode, setSyncMode] = useState("matching");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setDraftPerms(clonePermsMap(rolePermissions));
    setDraftDenied(cloneDeniedMap(roleDeniedPages));
  }, [rolePermissions, roleDeniedPages]);

  const changedRoles = useMemo(
    () =>
      USER_ROLES.filter(
        (role) =>
          !haveSamePermissionSet(draftPerms[role], savedPerms[role])
          || !haveSameDeniedPages(draftDenied[role], savedDenied[role]),
      ),
    [draftPerms, draftDenied, savedPerms, savedDenied],
  );
  const dirty = changedRoles.length > 0;

  const customPageCountsByRole = useMemo(() => {
    const counts = { employee: 0, hr: 0, executive: 0 };
    for (const user of users) {
      const roleKey = normalizeRole(user.role);
      const userPerms = Array.isArray(user.permissions) ? user.permissions : [];
      const userDenied = Array.isArray(user.deniedPages) ? user.deniedPages : [];
      const differsFromRole = PAGE_ACCESS_ITEMS.some(
        (page) =>
          isPageEnabledForDraft(userPerms, userDenied, page.key)
          !== isPageEnabledForDraft(savedPerms[roleKey], savedDenied[roleKey], page.key),
      );
      if (differsFromRole) counts[roleKey] += 1;
    }
    return counts;
  }, [users, savedPerms, savedDenied]);

  function handleToggle(role, pageKey, enabled) {
    const next = applyPageAccessToggle(
      draftPerms[role] || [],
      draftDenied[role] || [],
      pageKey,
      enabled,
    );
    setDraftPerms((currentPerms) => ({
      ...currentPerms,
      [role]: next.permissions,
    }));
    setDraftDenied((currentDenied) => ({
      ...currentDenied,
      [role]: next.deniedPages,
    }));
    setError("");
    setNotice("");
  }

  function resetToDefaults() {
    setDraftPerms(clonePermsMap(ROLE_DEFAULT_PERMISSIONS));
    setDraftDenied({ employee: [], hr: [], executive: [] });
    setError("");
    setNotice("");
  }

  function discardChanges() {
    setDraftPerms(clonePermsMap(savedPerms));
    setDraftDenied(cloneDeniedMap(savedDenied));
    setError("");
    setNotice("");
  }

  async function saveMatrix() {
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const rolePermissionUpdates = {};
      const roleDeniedUpdates = {};
      for (const role of changedRoles) {
        rolePermissionUpdates[role] = draftPerms[role];
        roleDeniedUpdates[role] = draftDenied[role];
      }
      const response = await fetch("/api/role-permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rolePermissions: rolePermissionUpdates,
          roleDeniedPages: roleDeniedUpdates,
          syncMode,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "บันทึกการเข้าถึงหน้าไม่สำเร็จ");
      }
      const syncedCount = payload.syncedUserCount ?? 0;
      const syncText = syncMode === "none"
        ? "บันทึกสิทธิ์การเข้าถึงหน้าของบทบาทแล้ว (คงสิทธิ์บัญชีเดิมทั้งหมด)"
        : `บันทึกสิทธิ์การเข้าถึงหน้าแล้ว · อัปเดต ${syncedCount} บัญชี`;
      setNotice(syncText);
      await onSaved?.(payload);
    } catch (saveError) {
      setError(saveError.message || "บันทึกการเข้าถึงหน้าไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        กำลังโหลดตารางการเข้าถึงหน้าตามบทบาท…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {USER_ROLES.map((role) => {
          const meta = ROLE_META[role];
          const enabledCount = PAGE_ACCESS_ITEMS.filter((page) =>
            isPageEnabledForDraft(draftPerms[role], draftDenied[role], page.key),
          ).length;
          const accountCount = roleCounts?.[role] ?? 0;
          const customCount = customPageCountsByRole[role] ?? 0;
          const roleChanged = changedRoles.includes(role);
          return (
            <article
              key={role}
              className="flex flex-col justify-between gap-2 rounded-lg border border-border bg-card p-3.5"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm font-semibold text-foreground">{meta.label}</strong>
                  {roleChanged ? <Badge color="info" variant="caption">รอการบันทึก</Badge> : null}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{meta.portal}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground tabular-nums">
                <span>{accountCount} บัญชี</span>
                <span className="font-medium text-foreground">เข้าถึงได้ {enabledCount}/{PAGE_ACCESS_ITEMS.length} หน้า</span>
              </div>
              {customCount > 0 ? (
                <p className="text-[11px] leading-4 text-status-warning tabular-nums">
                  กำหนดการเข้าถึงหน้าเฉพาะบุคคล {customCount} บัญชี
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        หน้าภาพรวม (<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/</code>) เปิดให้ทุกบทบาทเข้าใช้งานเป็นหน้าหลัก ส่วนหน้าสิทธิ์การเข้าถึง (<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/settings/permissions</code>) ควบคุมผ่านสิทธิ์ “จัดการสิทธิ์ผู้ใช้” เพื่อป้องกันการล็อกตัวเองออกจากหน้าตั้งค่า
      </p>

      <div
        className="overflow-x-auto rounded-lg border border-border bg-card"
        role="region"
        aria-label="ตารางเปิดปิดการเข้าถึงแต่ละหน้าตามบทบาท"
      >
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead className="border-b border-border bg-muted">
            <tr>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                หน้า / เมนูในระบบ
              </th>
              {USER_ROLES.map((role) => {
                const enabledCount = PAGE_ACCESS_ITEMS.filter((page) =>
                  isPageEnabledForDraft(draftPerms[role], draftDenied[role], page.key),
                ).length;
                const roleChanged = changedRoles.includes(role);
                return (
                  <th
                    key={role}
                    scope="col"
                    className="w-36 px-3 py-3 text-center text-xs font-semibold text-foreground"
                  >
                    <span className="block">{ROLE_META[role].shortLabel}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground tabular-nums">
                      {enabledCount}/{PAGE_ACCESS_ITEMS.length} หน้า
                      {roleChanged ? " · แก้ไข" : ""}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PAGE_GROUPS.map((group) => {
              const groupPages = PAGE_ACCESS_ITEMS.filter((item) => item.group === group);
              return (
                <Fragment key={group}>
                  <tr className="border-y border-border bg-muted/45">
                    <th scope="row" colSpan={4} className="px-4 py-2 text-xs font-semibold text-foreground">
                      {group}
                    </th>
                  </tr>
                  {groupPages.map((page) => (
                    <tr key={page.key} className="border-b border-border last:border-b-0 hover:bg-muted/25">
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{page.label}</span>
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {page.href}
                          </code>
                        </div>
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{page.description}</p>
                        <p className="text-[11px] leading-4 text-muted-foreground">
                          สิทธิ์ขั้นต่ำเมื่อเปิด: {page.minimumPermissionsLabel}
                        </p>
                      </td>
                      {USER_ROLES.map((role) => {
                        const enabled = isPageEnabledForDraft(draftPerms[role], draftDenied[role], page.key);
                        const wasEnabled = isPageEnabledForDraft(savedPerms[role], savedDenied[role], page.key);
                        const cellChanged = enabled !== wasEnabled;
                        return (
                          <td
                            key={`${page.key}-${role}`}
                            className={`px-3 py-2 text-center align-middle ${cellChanged ? "bg-primary/5" : ""}`}
                          >
                            <div className="inline-flex min-h-10 items-center justify-center gap-2">
                              <Switch
                                isSelected={enabled}
                                onChange={(next) => handleToggle(role, page.key, next)}
                                aria-label={`เปิดปิดหน้า ${page.label} (${ROLE_META[role].shortLabel})`}
                              />
                              <span
                                className={`w-7 text-left text-xs font-medium ${
                                  enabled ? "text-status-success" : "text-muted-foreground"
                                }`}
                              >
                                {enabled ? "เปิด" : "ปิด"}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid min-w-0 flex-1 gap-1.5 lg:max-w-lg">
          <label htmlFor="page-access-sync-mode" className="text-xs font-semibold text-foreground">
            การอัปเดตบัญชีผู้ใช้เดิมเมื่อบันทึกการเข้าถึงหน้า
          </label>
          <Select
            id="page-access-sync-mode"
            aria-label="การอัปเดตบัญชีผู้ใช้เดิม"
            selectedKey={syncMode}
            onSelectionChange={(value) => setSyncMode(String(value))}
          >
            <SelectItem id="matching">อัปเดตเฉพาะบัญชีที่ใช้สิทธิ์ตามบทบาท (คงสิทธิ์เฉพาะบุคคลไว้)</SelectItem>
            <SelectItem id="all">อัปเดตทุกบัญชีในบทบาทที่แก้ไข (เขียนทับสิทธิ์เฉพาะบุคคล)</SelectItem>
            <SelectItem id="none">บันทึกเป็นค่าตั้งต้นของบทบาทเท่านั้น (ไม่เปลี่ยนบัญชีเดิม)</SelectItem>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={resetToDefaults} disabled={saving}>
            คืนค่าตั้งต้นระบบ
          </Button>
          <Button type="button" variant="ghost" onClick={discardChanges} disabled={!dirty || saving}>
            ยกเลิกการแก้ไข
          </Button>
          <Button type="button" onClick={saveMatrix} disabled={!dirty || saving}>
            {saving ? "กำลังบันทึก…" : "บันทึกการเข้าถึงหน้า"}
          </Button>
        </div>
      </div>

      <div aria-live="polite" className="min-h-6 text-sm">
        {error ? <p role="alert" className="text-status-danger">{error}</p> : null}
        {notice ? <p role="status" className="text-status-success">{notice}</p> : null}
      </div>
    </div>
  );
}
