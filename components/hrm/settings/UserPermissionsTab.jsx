"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RiAlertLine,
  RiLayoutGridLine,
  RiSearchLine,
  RiShieldUserLine,
  RiTableLine,
  RiUserAddLine,
} from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import PageAccessMatrix from "@/components/hrm/settings/PageAccessMatrix";
import RolePermissionsMatrix from "@/components/hrm/settings/RolePermissionsMatrix";
import {
  applyPageAccessToggle,
  haveSameDeniedPages,
  isPageEnabledForDraft,
  PAGE_ACCESS_ITEMS,
} from "@/lib/auth/page-access";
import { haveSamePermissionSet, PERMISSIONS } from "@/lib/auth/permissions";
import {
  getRoleShortLabel,
  normalizeRole,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_META,
  USER_ROLES,
} from "@/lib/auth/roles";

const EMPTY_MISSING_ACCOUNTS = {
  eligibleCount: 0,
  missingEmailCount: 0,
  totalWithoutAccount: 0,
  missingEmailEmployees: [],
};

const EMPTY_ROLE_COUNTS = { employee: 0, hr: 0, executive: 0 };

const DEFAULT_ROLE_PERMISSIONS = {
  employee: [...ROLE_DEFAULT_PERMISSIONS.employee],
  hr: [...ROLE_DEFAULT_PERMISSIONS.hr],
  executive: [...ROLE_DEFAULT_PERMISSIONS.executive],
};

const EMPTY_ROLE_DENIED_PAGES = { employee: [], hr: [], executive: [] };

const SKIPPED_REASON_LABELS = {
  missing_email: "ยังไม่มีอีเมล",
  invalid_email: "รูปแบบอีเมลไม่ถูกต้อง",
  email_in_use: "อีเมลถูกใช้งานโดยบัญชีอื่นแล้ว",
};

function fullName(user) {
  return `${user.firstName} ${user.lastName}`.trim();
}

export default function UserPermissionsTab({ hideHeader = false }) {
  const router = useRouter();
  const [activeView, setActiveView] = useState("pages");
  const [users, setUsers] = useState([]);
  const [missingAccounts, setMissingAccounts] = useState(EMPTY_MISSING_ACCOUNTS);
  const [rolePermissions, setRolePermissions] = useState(DEFAULT_ROLE_PERMISSIONS);
  const [roleDeniedPages, setRoleDeniedPages] = useState(EMPTY_ROLE_DENIED_PAGES);
  const [roleCounts, setRoleCounts] = useState(EMPTY_ROLE_COUNTS);
  const [selectedId, setSelectedId] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [draftRole, setDraftRole] = useState("employee");
  const [draft, setDraft] = useState([]);
  const [draftDeniedPages, setDraftDeniedPages] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [provisionError, setProvisionError] = useState("");
  const [provisionNotice, setProvisionNotice] = useState("");

  const loadAccounts = useCallback(async ({ preserveSelection = true } = {}) => {
    const response = await fetch("/api/user-permissions");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "โหลดบัญชีผู้ใช้ไม่สำเร็จ");
    const nextUsers = payload.items || [];
    setUsers(nextUsers);
    setMissingAccounts(payload.missingAccounts ?? EMPTY_MISSING_ACCOUNTS);
    if (payload.rolePermissions) {
      setRolePermissions(payload.rolePermissions);
    }
    if (payload.roleDeniedPages) {
      setRoleDeniedPages(payload.roleDeniedPages);
    }
    if (payload.roleCounts) {
      setRoleCounts(payload.roleCounts);
    } else {
      const derived = { employee: 0, hr: 0, executive: 0 };
      for (const user of nextUsers) {
        derived[normalizeRole(user.role)] += 1;
      }
      setRoleCounts(derived);
    }
    setSelectedId((current) => (
      preserveSelection && current && nextUsers.some((item) => item.id === current)
        ? current
        : (nextUsers[0]?.id || "")
    ));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAccounts({ preserveSelection: false })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || "โหลดบัญชีผู้ใช้ไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadAccounts]);

  const selected = users.find((user) => user.id === selectedId) ?? null;
  useEffect(() => {
    setDraftRole(normalizeRole(selected?.role));
    setDraft(Array.isArray(selected?.permissions) ? selected.permissions : []);
    setDraftDeniedPages(Array.isArray(selected?.deniedPages) ? selected.deniedPages : []);
    setError("");
    setNotice("");
  }, [selectedId, selected?.role, selected?.permissions, selected?.deniedPages]);

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th");
    return users.filter((user) => {
      if (roleFilter !== "all" && normalizeRole(user.role) !== roleFilter) return false;
      if (!normalizedQuery) return true;
      return `${fullName(user)} ${user.email} ${user.employeeCode} ${getRoleShortLabel(user.role)}`
        .toLocaleLowerCase("th")
        .includes(normalizedQuery);
    });
  }, [users, query, roleFilter]);

  const dirty = selected && (
    draftRole !== normalizeRole(selected.role)
    || !haveSamePermissionSet(draft, selected.permissions)
    || !haveSameDeniedPages(draftDeniedPages, selected.deniedPages ?? [])
  );

  const currentRoleTemplate = useMemo(
    () => rolePermissions[draftRole] || ROLE_DEFAULT_PERMISSIONS[draftRole],
    [rolePermissions, draftRole],
  );
  const currentRoleDeniedTemplate = useMemo(
    () => roleDeniedPages[draftRole] || [],
    [roleDeniedPages, draftRole],
  );
  const draftMatchesRoleTemplate = haveSamePermissionSet(draft, currentRoleTemplate)
    && haveSameDeniedPages(draftDeniedPages, currentRoleDeniedTemplate);

  function handleDraftRoleChange(nextValue) {
    const nextRole = normalizeRole(nextValue);
    const prevPermsTemplate = rolePermissions[draftRole] || ROLE_DEFAULT_PERMISSIONS[draftRole];
    const prevDeniedTemplate = roleDeniedPages[draftRole] || [];
    const nextPermsTemplate = rolePermissions[nextRole] || ROLE_DEFAULT_PERMISSIONS[nextRole];
    const nextDeniedTemplate = roleDeniedPages[nextRole] || [];
    if (
      haveSamePermissionSet(draft, prevPermsTemplate)
      && haveSameDeniedPages(draftDeniedPages, prevDeniedTemplate)
    ) {
      setDraft([...nextPermsTemplate]);
      setDraftDeniedPages([...nextDeniedTemplate]);
    }
    setDraftRole(nextRole);
    setError("");
    setNotice("");
  }

  function applyRolePreset(role = draftRole) {
    const normalized = normalizeRole(role);
    const template = rolePermissions[normalized] || ROLE_DEFAULT_PERMISSIONS[normalized];
    const deniedTemplate = roleDeniedPages[normalized] || [];
    setDraft([...template]);
    setDraftDeniedPages([...deniedTemplate]);
    setError("");
    setNotice("");
  }

  function handleUserPageToggle(pageKey, enabled) {
    const next = applyPageAccessToggle(draft, draftDeniedPages, pageKey, enabled);
    setDraft(next.permissions);
    setDraftDeniedPages(next.deniedPages);
    setError("");
    setNotice("");
  }

  function toggle(permission, enabled) {
    setDraft((current) => enabled
      ? [...new Set([...current, permission])]
      : current.filter((value) => value !== permission));
    setError("");
    setNotice("");
  }

  function toggleGroup(group, enabled) {
    const groupKeys = PERMISSIONS.filter((permission) => permission.group === group).map(({ key }) => key);
    setDraft((current) => enabled
      ? [...new Set([...current, ...groupKeys])]
      : current.filter((value) => !groupKeys.includes(value)));
    setError("");
    setNotice("");
  }

  async function save() {
    if (!selected || !dirty) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/user-permissions/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: draftRole,
          permissions: draft,
          deniedPages: draftDeniedPages,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "บันทึกสิทธิ์ไม่สำเร็จ");
      await loadAccounts({ preserveSelection: true });
      setNotice("บันทึกบทบาท การเข้าถึงหน้า และสิทธิ์แล้ว");
      router.refresh();
    } catch (saveError) {
      setError(saveError.message || "บันทึกสิทธิ์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function provisionMissingAccounts() {
    if (provisioning) return;
    setProvisioning(true);
    setProvisionError("");
    setProvisionNotice("");
    try {
      const response = await fetch("/api/user-permissions/provision", {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "สร้างบัญชีผู้ใช้ไม่สำเร็จ");
      await loadAccounts({ preserveSelection: true });
      router.refresh();
      if ((payload.createdCount ?? 0) > 0) {
        const skippedNote = (payload.skippedCount ?? 0) > 0
          ? ` · ข้าม ${payload.skippedCount} คนที่ยังไม่มีอีเมลที่ถูกต้อง`
          : "";
        setProvisionNotice(`สร้างบัญชีผู้ใช้สำเร็จ ${payload.createdCount} บัญชี (รหัสผ่านเริ่มต้นคือรหัสพนักงาน 4 หลัก)${skippedNote}`);
      } else {
        setProvisionNotice("ไม่มีบัญชีที่สามารถสร้างเพิ่มได้ในขณะนี้");
      }
    } catch (err) {
      setProvisionError(err.message || "สร้างบัญชีผู้ใช้ไม่สำเร็จ");
    } finally {
      setProvisioning(false);
    }
  }

  async function handleRoleMatrixSaved() {
    await loadAccounts({ preserveSelection: true });
    router.refresh();
  }

  const groups = [...new Set(PERMISSIONS.map(({ group }) => group))];
  const showProvisionSection = !loading && (
    missingAccounts.totalWithoutAccount > 0 || Boolean(provisionNotice) || Boolean(provisionError)
  );

  return (
    <section aria-labelledby={hideHeader ? undefined : "user-permissions-title"} className="space-y-4">
      {!hideHeader ? (
        <div>
          <h2 id="user-permissions-title" className="text-base font-semibold text-foreground">จัดการสิทธิ์และการเข้าถึงหน้า</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            เปิดปิดการเข้าถึงแต่ละหน้าเมนู กำหนดสิทธิ์หลักตามบทบาท หรือปรับสิทธิ์เฉพาะบุคคลแยกเป็นรายบัญชี
          </p>
        </div>
      ) : null}

      {showProvisionSection ? (
        <div
          className={`space-y-2.5 rounded-lg border p-4 ${
            missingAccounts.totalWithoutAccount > 0
              ? "border-status-warning/30 bg-status-warning/10"
              : "border-border bg-card"
          }`}
        >
          {missingAccounts.eligibleCount > 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground tabular-nums">
                  <RiAlertLine className="size-4 shrink-0 text-status-warning" aria-hidden="true" />
                  <span>พบพนักงานที่ปฏิบัติงานอยู่แต่ยังไม่มีบัญชีผู้ใช้ {missingAccounts.eligibleCount} คน</span>
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  ระบบจะสร้างบัญชีบทบาท “พนักงาน” รหัสผ่านเริ่มต้นเป็นรหัสพนักงาน 4 หลัก และบังคับเปลี่ยนรหัสเมื่อเข้าสู่ระบบครั้งแรก
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                leadingIcon={RiUserAddLine}
                disabled={provisioning}
                onClick={provisionMissingAccounts}
              >
                {provisioning ? "กำลังสร้างบัญชีผู้ใช้…" : `สร้างบัญชีผู้ใช้ (${missingAccounts.eligibleCount} คน)`}
              </Button>
            </div>
          ) : null}

          {missingAccounts.missingEmailCount > 0 ? (
            <details className="rounded-md border border-border/70 bg-background/80 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium text-foreground tabular-nums">
                พนักงานที่ยังสร้างบัญชีไม่ได้ ({missingAccounts.missingEmailCount} คน)
              </summary>
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-muted-foreground">
                {missingAccounts.missingEmailEmployees.map((emp) => (
                  <li key={emp.id}>
                    <span className="font-medium text-foreground">{emp.code}</span> · {fullName(emp)} —{" "}
                    {SKIPPED_REASON_LABELS[emp.reason] ?? "ไม่สามารถสร้างบัญชีได้"}
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                <Link href="/employees" className="font-medium text-primary underline-offset-2 hover:underline">
                  ไปเติมอีเมลในทะเบียนพนักงาน
                </Link>
              </p>
            </details>
          ) : null}

          {provisionError ? (
            <p role="alert" className="text-sm text-status-danger">{provisionError}</p>
          ) : null}
          {provisionNotice ? (
            <p role="status" className="text-sm text-status-success">{provisionNotice}</p>
          ) : null}
        </div>
      ) : null}

      <Tabs selectedKey={activeView} onSelectionChange={(key) => setActiveView(String(key))}>
        <TabList aria-label="รูปแบบการจัดการสิทธิ์">
          <Tab id="pages" icon={RiLayoutGridLine}>การเข้าถึงหน้า (ตามบทบาท)</Tab>
          <Tab id="roles" icon={RiTableLine}>สิทธิ์รายละเอียด (ตาราง)</Tab>
          <Tab id="users" icon={RiShieldUserLine} count={users.length}>สิทธิ์รายบุคคล</Tab>
        </TabList>

        <TabPanel id="pages" className="pt-4">
          <PageAccessMatrix
            rolePermissions={rolePermissions}
            roleDeniedPages={roleDeniedPages}
            roleCounts={roleCounts}
            users={users}
            loading={loading}
            onSaved={handleRoleMatrixSaved}
          />
        </TabPanel>

        <TabPanel id="roles" className="pt-4">
          <RolePermissionsMatrix
            rolePermissions={rolePermissions}
            roleCounts={roleCounts}
            users={users}
            loading={loading}
            onSaved={handleRoleMatrixSaved}
          />
        </TabPanel>

        <TabPanel id="users" className="pt-4">
          <div className="grid gap-6 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.5fr)]">
            <div className="min-w-0">
              <label htmlFor="permission-user-search" className="mb-1.5 block text-xs font-medium text-foreground">ค้นหาบัญชี</label>
              <Input
                id="permission-user-search"
                value={query}
                onChange={setQuery}
                placeholder="ชื่อ อีเมล หรือรหัสพนักงาน"
                leadingIcon={RiSearchLine}
              />
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="กรองตามบทบาท">
                <Button
                  type="button"
                  size="xs"
                  variant={roleFilter === "all" ? "default" : "outline"}
                  aria-pressed={roleFilter === "all"}
                  onClick={() => setRoleFilter("all")}
                >
                  ทั้งหมด
                </Button>
                {USER_ROLES.map((roleKey) => (
                  <Button
                    key={roleKey}
                    type="button"
                    size="xs"
                    variant={roleFilter === roleKey ? "default" : "outline"}
                    aria-pressed={roleFilter === roleKey}
                    onClick={() => setRoleFilter(roleKey)}
                  >
                    {ROLE_META[roleKey].shortLabel}
                  </Button>
                ))}
              </div>
              <div role="group" aria-label="บัญชีผู้ใช้" className="mt-3 max-h-[32rem] overflow-y-auto border-y border-border">
                {loading ? <p className="px-3 py-5 text-sm text-muted-foreground">กำลังโหลดบัญชี…</p> : null}
                {!loading && visibleUsers.length === 0 ? (
                  <p className="px-3 py-5 text-sm text-muted-foreground">
                    {!query.trim() && roleFilter === "all" && missingAccounts.eligibleCount > 0
                      ? "ยังไม่มีบัญชีผู้ใช้ — กดปุ่ม “สร้างบัญชีผู้ใช้” ด้านบนเพื่อสร้างจากรายชื่อพนักงาน"
                      : "ไม่พบบัญชีผู้ใช้"}
                  </p>
                ) : null}
                {visibleUsers.map((user) => {
                  const userRole = normalizeRole(user.role);
                  const template = rolePermissions[userRole] || ROLE_DEFAULT_PERMISSIONS[userRole];
                  const deniedTemplate = roleDeniedPages[userRole] || [];
                  const isCustom = !haveSamePermissionSet(user.permissions, template)
                    || !haveSameDeniedPages(user.deniedPages ?? [], deniedTemplate);
                  return (
                    <button
                      type="button"
                      key={user.id}
                      onClick={() => setSelectedId(user.id)}
                      aria-pressed={selectedId === user.id}
                      className={`flex min-h-14 w-full flex-col items-start justify-center border-b border-border px-3 py-2 text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === user.id ? "bg-primary/5 text-primary" : "text-foreground hover:bg-muted"}`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium">{fullName(user)}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <Badge color={isCustom ? "warning" : "neutral"} variant="caption">
                            {isCustom ? "เฉพาะบุคคล" : getRoleShortLabel(userRole)}
                          </Badge>
                        </div>
                      </div>
                      <span className="max-w-full truncate text-xs text-muted-foreground">{user.employeeCode} · {user.email}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-foreground">{fullName(selected)}</h3>
                        <Badge color={draftMatchesRoleTemplate ? "neutral" : "warning"} variant="caption">
                          {draftMatchesRoleTemplate ? "ตามบทบาท" : "ปรับแต่งเฉพาะบุคคล"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{selected.email} · {selected.employeeCode}</p>
                    </div>
                    <Button type="button" onClick={save} disabled={!dirty || saving}>
                      {saving ? "กำลังบันทึก…" : "บันทึกสิทธิ์"}
                    </Button>
                  </div>

                  <div className="border-b border-border py-3">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-xs">
                        <label htmlFor="user-role-select" className="text-xs font-semibold text-muted-foreground">บทบาทในระบบ</label>
                        <Select
                          id="user-role-select"
                          aria-label="บทบาทในระบบ"
                          selectedKey={draftRole}
                          onSelectionChange={handleDraftRoleChange}
                        >
                          {USER_ROLES.map((roleKey) => (
                            <SelectItem key={roleKey} id={roleKey}>
                              {ROLE_META[roleKey].label}
                            </SelectItem>
                          ))}
                        </Select>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => applyRolePreset(draftRole)}>
                        ใช้สิทธิ์ตามบทบาทปัจจุบัน
                      </Button>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {ROLE_META[draftRole].portal} — {ROLE_META[draftRole].description}
                    </p>
                  </div>

                  <section aria-labelledby="user-page-access-heading" className="border-b border-border py-4">
                    <div className="mb-3">
                      <h4 id="user-page-access-heading" className="text-xs font-semibold text-foreground">
                        การเข้าถึงหน้าเมนู (เปิด/ปิดรายบุคคล)
                      </h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        ควบคุมว่าบัญชีนี้เข้าใช้งานหน้าใดได้บ้างแยกจากบทบาทหลัก
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {PAGE_ACCESS_ITEMS.map((page) => {
                        const userEnabled = isPageEnabledForDraft(draft, draftDeniedPages, page.key);
                        const templateEnabled = isPageEnabledForDraft(
                          currentRoleTemplate,
                          currentRoleDeniedTemplate,
                          page.key,
                        );
                        const pageDiff = userEnabled && !templateEnabled
                          ? "enabled"
                          : !userEnabled && templateEnabled
                            ? "disabled"
                            : null;
                        return (
                          <div
                            key={page.key}
                            className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-medium text-foreground">{page.label}</span>
                                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                                  {page.href}
                                </code>
                                {pageDiff === "enabled" ? (
                                  <Badge color="info" variant="caption">เปิดเฉพาะบุคคล</Badge>
                                ) : null}
                                {pageDiff === "disabled" ? (
                                  <Badge color="warning" variant="caption">ปิดเฉพาะบุคคล</Badge>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span
                                className={`w-7 text-right text-xs font-medium ${
                                  userEnabled ? "text-status-success" : "text-muted-foreground"
                                }`}
                              >
                                {userEnabled ? "เปิด" : "ปิด"}
                              </span>
                              <Switch
                                isSelected={userEnabled}
                                onChange={(next) => handleUserPageToggle(page.key, next)}
                                aria-label={`เปิดปิดหน้า ${page.label} สำหรับ ${fullName(selected)}`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <div className="divide-y divide-border">
                    {groups.map((group) => {
                      const groupPermissions = PERMISSIONS.filter((permission) => permission.group === group);
                      const selectedCount = groupPermissions.filter((permission) => draft.includes(permission.key)).length;
                      const allSelected = selectedCount === groupPermissions.length;
                      return (
                        <fieldset key={group} className="py-3 first:pt-2">
                          <legend className="sr-only">{group}</legend>
                          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-muted-foreground">
                              {group} <span className="font-normal tabular-nums">{selectedCount}/{groupPermissions.length}</span>
                            </span>
                            <Button type="button" variant="ghost" size="xs" onClick={() => toggleGroup(group, !allSelected)}>
                              {allSelected ? "ล้างทั้งหมวด" : "เลือกทั้งหมวด"}
                            </Button>
                          </div>
                          <div className="space-y-1">
                            {groupPermissions.map((permission) => {
                              const checked = draft.includes(permission.key);
                              const inTemplate = currentRoleTemplate.includes(permission.key);
                              const diffStatus = checked && !inTemplate
                                ? "added"
                                : !checked && inTemplate
                                  ? "removed"
                                  : null;
                              return (
                                <label key={permission.key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => toggle(permission.key, event.target.checked)}
                                    className="size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  />
                                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-primary" aria-hidden="true">
                                    <RiShieldUserLine className="size-4" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-2">
                                      <span className="text-sm font-medium text-foreground">{permission.label}</span>
                                      {diffStatus === "added" ? <Badge color="info" variant="caption">เพิ่มเฉพาะบุคคล</Badge> : null}
                                      {diffStatus === "removed" ? <Badge color="warning" variant="caption">ปิดเฉพาะบุคคล</Badge> : null}
                                    </span>
                                    <span className="block text-xs leading-5 text-muted-foreground">{permission.description}</span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="border-y border-border px-3 py-6 text-sm text-muted-foreground">เลือกบัญชีผู้ใช้เพื่อจัดการสิทธิ์</p>
              )}

              <div aria-live="polite" className="min-h-6 pt-2 text-sm">
                {error ? <p role="alert" className="text-status-danger">{error}</p> : null}
                {notice ? <p role="status" className="text-status-success">{notice}</p> : null}
              </div>
            </div>
          </div>
        </TabPanel>
      </Tabs>
    </section>
  );
}
