"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { RiSearchLine } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { haveSamePermissionSet, PERMISSIONS } from "@/lib/auth/permissions";
import { ROLE_DEFAULT_PERMISSIONS, ROLE_META, USER_ROLES } from "@/lib/auth/roles";

const ALL_GROUPS = [...new Set(PERMISSIONS.map(({ group }) => group))];

function cloneRoleMap(source) {
  return {
    employee: [...(source?.employee ?? ROLE_DEFAULT_PERMISSIONS.employee)],
    hr: [...(source?.hr ?? ROLE_DEFAULT_PERMISSIONS.hr)],
    executive: [...(source?.executive ?? ROLE_DEFAULT_PERMISSIONS.executive)],
  };
}

export default function RolePermissionsMatrix({
  rolePermissions,
  roleCounts = { employee: 0, hr: 0, executive: 0 },
  users = [],
  loading = false,
  onSaved = undefined,
}) {
  const saved = useMemo(() => cloneRoleMap(rolePermissions), [rolePermissions]);
  const [draft, setDraft] = useState(() => cloneRoleMap(rolePermissions));
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [syncMode, setSyncMode] = useState("matching");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setDraft(cloneRoleMap(rolePermissions));
  }, [rolePermissions]);

  const customCountsByRole = useMemo(() => {
    const counts = { employee: 0, hr: 0, executive: 0 };
    for (const user of users) {
      const roleKey = USER_ROLES.includes(user.role) ? user.role : "employee";
      if (!haveSamePermissionSet(user.permissions, saved[roleKey])) {
        counts[roleKey] += 1;
      }
    }
    return counts;
  }, [users, saved]);

  const changedRoles = useMemo(
    () => USER_ROLES.filter((role) => !haveSamePermissionSet(draft[role], saved[role])),
    [draft, saved],
  );
  const dirty = changedRoles.length > 0;

  const filteredPermissions = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("th");
    return PERMISSIONS.filter((permission) => {
      if (selectedGroup !== "all" && permission.group !== selectedGroup) return false;
      if (!q) return true;
      return `${permission.group} ${permission.label} ${permission.description} ${permission.key}`
        .toLocaleLowerCase("th")
        .includes(q);
    });
  }, [search, selectedGroup]);

  const visibleGroups = useMemo(
    () => [...new Set(filteredPermissions.map(({ group }) => group))],
    [filteredPermissions],
  );

  function toggleCell(role, permissionKey, enabled) {
    setDraft((current) => {
      const prevList = current[role] || [];
      const nextList = enabled
        ? [...new Set([...prevList, permissionKey])]
        : prevList.filter((key) => key !== permissionKey);
      return { ...current, [role]: nextList };
    });
    setError("");
    setNotice("");
  }

  function toggleGroupForRole(role, group, enabled) {
    const groupKeys = PERMISSIONS.filter((p) => p.group === group).map(({ key }) => key);
    setDraft((current) => {
      const prevList = current[role] || [];
      const nextList = enabled
        ? [...new Set([...prevList, ...groupKeys])]
        : prevList.filter((key) => !groupKeys.includes(key));
      return { ...current, [role]: nextList };
    });
    setError("");
    setNotice("");
  }

  function resetToDefaults() {
    setDraft(cloneRoleMap(ROLE_DEFAULT_PERMISSIONS));
    setError("");
    setNotice("");
  }

  function discardChanges() {
    setDraft(cloneRoleMap(saved));
    setError("");
    setNotice("");
  }

  async function saveMatrix() {
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const roleUpdates = {};
      for (const role of changedRoles) {
        roleUpdates[role] = draft[role];
      }
      const response = await fetch("/api/role-permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rolePermissions: roleUpdates, syncMode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "บันทึกสิทธิ์ตามบทบาทไม่สำเร็จ");
      }
      const syncedCount = payload.syncedUserCount ?? 0;
      const syncText = syncMode === "none"
        ? "บันทึกเป็นค่าตั้งต้นของบทบาทแล้ว (คงสิทธิ์บัญชีเดิมทั้งหมด)"
        : `บันทึกสิทธิ์ตามบทบาทแล้ว · อัปเดต ${syncedCount} บัญชี`;
      setNotice(syncText);
      await onSaved?.(payload);
    } catch (saveError) {
      setError(saveError.message || "บันทึกสิทธิ์ตามบทบาทไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        กำลังโหลดตารางสิทธิ์ตามบทบาท…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {USER_ROLES.map((role) => {
          const meta = ROLE_META[role];
          const enabledCount = draft[role]?.length ?? 0;
          const accountCount = roleCounts?.[role] ?? 0;
          const customCount = customCountsByRole[role] ?? 0;
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
                <span className="font-medium text-foreground">{enabledCount}/{PERMISSIONS.length} สิทธิ์</span>
              </div>
              {customCount > 0 ? (
                <p className="text-[11px] leading-4 text-status-warning tabular-nums">
                  ปรับแต่งเฉพาะบุคคล {customCount} บัญชี
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:max-w-xs">
            <label htmlFor="role-matrix-search" className="sr-only">ค้นหาสิทธิ์การใช้งาน</label>
            <Input
              id="role-matrix-search"
              value={search}
              onChange={setSearch}
              placeholder="ค้นหาสิทธิ์ เช่น OT, อนุมัติ, เงินเดือน"
              leadingIcon={RiSearchLine}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="กรองตามหมวดหมู่สิทธิ์">
            <Button
              type="button"
              size="xs"
              variant={selectedGroup === "all" ? "default" : "outline"}
              aria-pressed={selectedGroup === "all"}
              onClick={() => setSelectedGroup("all")}
            >
              ทั้งหมด
            </Button>
            {ALL_GROUPS.map((group) => (
              <Button
                key={group}
                type="button"
                size="xs"
                variant={selectedGroup === group ? "default" : "outline"}
                aria-pressed={selectedGroup === group}
                onClick={() => setSelectedGroup(group)}
              >
                {group}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="overflow-x-auto rounded-lg border border-border bg-card"
        role="region"
        aria-label="ตารางกำหนดสิทธิ์ตามบทบาท"
      >
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead className="border-b border-border bg-muted">
            <tr>
              <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                หมวดหมู่ / สิทธิ์การใช้งาน
              </th>
              {USER_ROLES.map((role) => {
                const roleChanged = changedRoles.includes(role);
                return (
                  <th
                    key={role}
                    scope="col"
                    className="w-32 px-3 py-3 text-center text-xs font-semibold text-foreground"
                  >
                    <span className="block">{ROLE_META[role].shortLabel}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground tabular-nums">
                      {draft[role]?.length ?? 0}/{PERMISSIONS.length}
                      {roleChanged ? " · แก้ไข" : ""}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map((group) => {
              const allGroupPerms = PERMISSIONS.filter((p) => p.group === group);
              const visibleGroupPerms = filteredPermissions.filter((p) => p.group === group);
              return (
                <Fragment key={group}>
                  <tr className="border-y border-border bg-muted/45">
                    <th scope="row" className="px-4 py-2 text-xs font-semibold text-foreground">
                      <span>{group}</span>
                      <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                        ({allGroupPerms.length} สิทธิ์)
                      </span>
                    </th>
                    {USER_ROLES.map((role) => {
                      const enabledInGroup = allGroupPerms.filter((p) => draft[role]?.includes(p.key)).length;
                      const allSelected = enabledInGroup === allGroupPerms.length;
                      return (
                        <td key={`${group}-${role}`} className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleGroupForRole(role, group, !allSelected)}
                            aria-label={`${allSelected ? "ล้าง" : "เลือก"}สิทธิ์หมวด ${group} ทั้งหมดสำหรับ ${ROLE_META[role].shortLabel}`}
                            className="inline-flex min-h-8 items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="tabular-nums text-foreground">{enabledInGroup}/{allGroupPerms.length}</span>
                            <span>· {allSelected ? "ล้าง" : "ทั้งหมด"}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                  {visibleGroupPerms.map((permission) => (
                    <tr key={permission.key} className="border-b border-border last:border-b-0 hover:bg-muted/25">
                      <td className="px-4 py-2.5 align-middle">
                        <span className="block text-sm font-medium text-foreground">{permission.label}</span>
                        <span className="block text-xs leading-5 text-muted-foreground">{permission.description}</span>
                      </td>
                      {USER_ROLES.map((role) => {
                        const checked = Boolean(draft[role]?.includes(permission.key));
                        const wasChecked = Boolean(saved[role]?.includes(permission.key));
                        const cellChanged = checked !== wasChecked;
                        return (
                          <td
                            key={`${permission.key}-${role}`}
                            className={`px-2 py-2 text-center align-middle ${cellChanged ? "bg-primary/5" : ""}`}
                          >
                            <label className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-md hover:bg-muted">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => toggleCell(role, permission.key, event.target.checked)}
                                aria-label={`${permission.label} (${ROLE_META[role].shortLabel})`}
                                className="size-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {visibleGroups.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  ไม่พบสิทธิ์การใช้งานที่ตรงกับคำค้นหา
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid min-w-0 flex-1 gap-1.5 lg:max-w-lg">
          <label htmlFor="role-sync-mode" className="text-xs font-semibold text-foreground">
            การอัปเดตบัญชีผู้ใช้เดิมเมื่อบันทึกตารางบทบาท
          </label>
          <Select id="role-sync-mode" aria-label="การอัปเดตบัญชีผู้ใช้เดิม" selectedKey={syncMode} onSelectionChange={(value) => setSyncMode(String(value))}>
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
            {saving ? "กำลังบันทึก…" : "บันทึกสิทธิ์ตามบทบาท"}
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
