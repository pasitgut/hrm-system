"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RiSearchLine, RiShieldUserLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  getRoleShortLabel,
  normalizeRole,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_META,
  USER_ROLES,
} from "@/lib/auth/roles";

function fullName(user) {
  return `${user.firstName} ${user.lastName}`.trim();
}

export default function UserPermissionsTab() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draftRole, setDraftRole] = useState("employee");
  const [draft, setDraft] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user-permissions")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "โหลดบัญชีผู้ใช้ไม่สำเร็จ");
        if (cancelled) return;
        setUsers(payload.items || []);
        setSelectedId(payload.items?.[0]?.id || "");
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || "โหลดบัญชีผู้ใช้ไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const selected = users.find((user) => user.id === selectedId) ?? null;
  useEffect(() => {
    setDraftRole(normalizeRole(selected?.role));
    setDraft(Array.isArray(selected?.permissions) ? selected.permissions : []);
    setError("");
    setNotice("");
  }, [selectedId, selected?.role, selected?.permissions]);

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th");
    if (!normalizedQuery) return users;
    return users.filter((user) => `${fullName(user)} ${user.email} ${user.employeeCode} ${getRoleShortLabel(user.role)}`.toLocaleLowerCase("th").includes(normalizedQuery));
  }, [users, query]);

  const dirty = selected && (
    draftRole !== normalizeRole(selected.role)
    || draft.length !== (selected.permissions?.length ?? 0)
    || draft.some((permission) => !selected.permissions?.includes(permission))
  );

  function applyRolePreset(role = draftRole) {
    setDraft([...ROLE_DEFAULT_PERMISSIONS[normalizeRole(role)]]);
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
        body: JSON.stringify({ role: draftRole, permissions: draft }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "บันทึกสิทธิ์ไม่สำเร็จ");
      setUsers((current) => current.map((user) => user.id === selected.id
        ? { ...user, role: payload.item.role, permissions: payload.item.permissions }
        : user));
      setNotice("บันทึกบทบาทและสิทธิ์แล้ว");
      router.refresh();
    } catch (saveError) {
      setError(saveError.message || "บันทึกสิทธิ์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const groups = [...new Set(PERMISSIONS.map(({ group }) => group))];

  return (
    <section aria-labelledby="user-permissions-title" className="space-y-4">
      <div>
        <h2 id="user-permissions-title" className="text-base font-semibold text-foreground">สิทธิ์การใช้งานรายบัญชี</h2>
        <p className="mt-1 text-sm text-muted-foreground">เลือกบัญชี แล้วกำหนดว่าพนักงานคนนั้นทำอะไรได้บ้าง</p>
      </div>

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
          <div role="group" aria-label="บัญชีผู้ใช้" className="mt-3 max-h-[32rem] overflow-y-auto border-y border-border">
            {loading ? <p className="px-3 py-5 text-sm text-muted-foreground">กำลังโหลดบัญชี…</p> : null}
            {!loading && visibleUsers.length === 0 ? <p className="px-3 py-5 text-sm text-muted-foreground">ไม่พบบัญชีผู้ใช้</p> : null}
            {visibleUsers.map((user) => (
              <button
                type="button"
                key={user.id}
                onClick={() => setSelectedId(user.id)}
                aria-pressed={selectedId === user.id}
                className={`flex min-h-14 w-full flex-col items-start justify-center border-b border-border px-3 py-2 text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === user.id ? "bg-primary/5 text-primary" : "text-foreground hover:bg-muted"}`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">{fullName(user)}</span>
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {getRoleShortLabel(user.role)}
                  </span>
                </div>
                <span className="max-w-full truncate text-xs text-muted-foreground">{user.employeeCode} · {user.email}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          {selected ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">{fullName(selected)}</h3>
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
                      onSelectionChange={(value) => {
                        setDraftRole(normalizeRole(value));
                        setError("");
                        setNotice("");
                      }}
                    >
                      {USER_ROLES.map((roleKey) => (
                        <SelectItem key={roleKey} id={roleKey}>
                          {ROLE_META[roleKey].label}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => applyRolePreset(draftRole)}>
                    ใช้สิทธิ์ตั้งต้นตามบทบาท
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {ROLE_META[draftRole].portal} — {ROLE_META[draftRole].description}
                </p>
              </div>

              <div className="divide-y divide-border">
                {groups.map((group) => {
                  const groupPermissions = PERMISSIONS.filter((permission) => permission.group === group);
                  const selectedCount = groupPermissions.filter((permission) => draft.includes(permission.key)).length;
                  const allSelected = selectedCount === groupPermissions.length;
                  return (
                  <fieldset key={group} className="py-3 first:pt-2">
                    <legend className="sr-only">{group}</legend>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">{group} <span className="font-normal">{selectedCount}/{groupPermissions.length}</span></span>
                      <Button type="button" variant="ghost" size="xs" onClick={() => toggleGroup(group, !allSelected)}>
                        {allSelected ? "ล้างทั้งหมวด" : "เลือกทั้งหมวด"}
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {groupPermissions.map((permission) => (
                        <label key={permission.key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                          <input
                            type="checkbox"
                            checked={draft.includes(permission.key)}
                            onChange={(event) => toggle(permission.key, event.target.checked)}
                            className="size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          />
                          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-primary" aria-hidden="true">
                            <RiShieldUserLine className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-foreground">{permission.label}</span>
                            <span className="block text-xs leading-5 text-muted-foreground">{permission.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );})}
              </div>
            </>
          ) : (
            <p className="border-y border-border px-3 py-6 text-sm text-muted-foreground">เลือกบัญชีผู้ใช้เพื่อจัดการสิทธิ์</p>
          )}

          <div aria-live="polite" className="min-h-6 pt-2 text-sm">
            {error ? <p className="text-status-danger">{error}</p> : null}
            {notice ? <p className="text-status-success">{notice}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
