"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function LineLinkButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  async function requestCode() {
    setOpen(true); setBusy(true); setError(""); setCode("");
    try {
      const response = await fetch("/api/account/line-link", { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      if (typeof payload.code !== "string") throw new Error();
      setCode(payload.code);
    } catch { setError("ระบบเชื่อม LINE ยังไม่พร้อม กรุณาลองใหม่หรือติดต่อ HR"); }
    finally { setBusy(false); }
  }
  return <>
    <Button type="button" variant="ghost" disabled={busy} onClick={requestCode}>เชื่อม LINE</Button>
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setCode(""); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>เชื่อมบัญชี LINE</DialogTitle><DialogDescription>ส่งข้อความด้านล่างในแชทส่วนตัวกับ LINE Bot ของบริษัท รหัสใช้ได้ครั้งเดียวภายใน 10 นาที และไม่ควรส่งให้ผู้อื่น</DialogDescription></DialogHeader>
        {busy ? <p role="status">กำลังขอรหัส...</p> : null}
        {code ? <p className="select-all break-all rounded-md border border-border bg-muted p-3 text-sm">ลงทะเบียน {code}</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  </>;
}
