"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submitPassword(event) {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      let payload = {};
      try { payload = await response.json(); } catch { /* Use the fallback message below. */ }
      if (!response.ok) {
        setError(payload.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      setSuccess(true);
    } catch {
      setError("เปลี่ยนรหัสผ่านไม่สำเร็จ เพราะเชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">P</span>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">PeopleOS · ระบบงานบุคคล</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">ตั้งรหัสผ่านใหม่</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">เพื่อความปลอดภัย กรุณาเปลี่ยนรหัสผ่านเริ่มต้นก่อนเริ่มใช้งาน</p>
        </div>

        {success ? (
          <div className="space-y-4" role="status" aria-live="polite">
            <p className="rounded-md border border-status-success/30 bg-status-success/5 px-3 py-3 text-sm text-foreground">เปลี่ยนรหัสผ่านสำเร็จ บัญชีของคุณพร้อมใช้งานแล้ว</p>
            <Button asChild className="w-full"><a href="/">เข้าสู่ระบบ</a></Button>
          </div>
        ) : (
          <form onSubmit={submitPassword} className="space-y-4" noValidate>
            <Input label="รหัสผ่านใหม่" type="password" autoComplete="new-password" value={newPassword} onChange={setNewPassword} isRequired />
            <Input label="ยืนยันรหัสผ่านใหม่" type="password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} isRequired />
            <p className="text-xs leading-5 text-muted-foreground">กำหนดอย่างน้อย 8 ตัวอักษร</p>
            {error ? <p role="alert" className="rounded-md border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-sm text-status-danger">{error}</p> : null}
            <Button type="submit" className="w-full" isDisabled={saving}>
              {saving ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
