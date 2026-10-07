"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RiSearchLine, RiShieldUserLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";

function fullName(user) {
  return `${user.firstName} ${user.lastName}`.trim();
}

export default function UserPermissionsTab() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
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
    setDraft(Array.isArray(selected?.permissions) ? selected.permissions : []);
    setError("");
    setNotice("");
  }, [selectedId, selected?.permissions]);

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th");
    if (!normalizedQuery) return users;
    return users.filter((user) => `${fullName(user)} ${user.email} ${user.employeeCode}`.toLocaleLowerCase("th").includes(normalizedQuery));
  }, [users, query]);

  const dirty = selected && (
    draft.length !== (selected.permissions?.length ?? 0)
    || draft.some((permission) => !selected.permissions?.includes(permission))
  );

  function toggle(permission, enabled) {
    setDraft((current) => enabled
      ? [...new Set([...current, permission])]
      : current.filter((value) => value !== permission));
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
        body: JSON.stringify({ permissions: draft }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "บันทึกสิทธิ์ไม่สำเร็จ");
      setUsers((current) => current.map((user) => user.id === selected.id
        ? { ...user, permissions: payload.item.permissions }
        : user));
      setNotice("บันทึกสิทธิ์แล้ว");
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
                <span className="max-w-full truncate text-sm font-medium">{fullName(user)}</span>
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

              <div className="divide-y divide-border">
                {groups.map((group) => (
                  <fieldset key={group} className="py-3 first:pt-2">
                    <legend className="mb-1 text-xs font-semibold text-muted-foreground">{group}</legend>
                    <div className="space-y-1">
                      {PERMISSIONS.filter((permission) => permission.group === group).map((permission) => (
                        <label key={permission.key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                          <input
                            type="checkbox"
                            checked={hasPermission(draft, permission.key)}
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
                ))}
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
