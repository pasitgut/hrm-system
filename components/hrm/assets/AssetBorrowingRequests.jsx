"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RiAddLine, RiCheckLine, RiCloseLine, RiDeleteBinLine, RiFileList3Line, RiRefreshLine, RiSearchLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cx } from "@/utils/cx";
import { canExportAgreementDocument, isAssetFormOnly, matchesAssetAgreementFilter } from "@/asset-borrowing/domain/asset";
import { agreementBodyPreviewText, agreementDocumentHtml, downloadAgreementDocument } from "@/components/hrm/assets/agreementPrint";
import { uploadImage } from "@/lib/client/upload-image";

const statusLabels = {
  pending: "รออนุมัติ",
  approved: "กำลังยืม",
  rejected: "ไม่อนุมัติ",
  returnPending: "รอตรวจรับคืน",
  returned: "คืนแล้ว",
  unknown: "ไม่ทราบสถานะ",
};

const agreementFilterLabels = {
  all: "ทั้งหมด",
  waitingHandover: "รอผู้ส่งมอบ",
  waitingEmployee: "รอผู้รับมอบ",
  waitingAdmin: "รอผู้อนุมัติ",
  returnPending: "รอคืน",
};

function dateText(value) {
  if (!value) return "ไม่ระบุ";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

async function uploadAssetImage(file, scope = "asset") {
  return uploadImage(file, {
    scope,
    maxBytes: 8 * 1024 * 1024,
    maxDimension: 2400,
  });
}

function SignaturePad({ onChange, label = "ลงลายมือชื่อ", large = false }) {
  const uploadId = useId();
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [method, setMethod] = useState("draw");
  const [typedName, setTypedName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim() || getComputedStyle(document.body).color;
  }, []);

  function point(event) {
    const bounds = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function start(event) {
    event.preventDefault();
    setUploadError("");
    onChange("");
    const canvas = canvasRef.current;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext("2d");
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
    drawingRef.current = true;
  }

  function move(event) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const current = point(event);
    const context = canvasRef.current.getContext("2d");
    context.lineTo(current.x, current.y);
    context.stroke();
    hasInkRef.current = true;
  }

  async function uploadSignature(blob, fileName) {
    setUploading(true);
    setUploadError("");
    try {
      const url = await uploadAssetImage(new File([blob], fileName, { type: blob.type || "image/png" }), "signature");
      onChange(url);
    } catch (error) {
      onChange("");
      setUploadError(error instanceof Error ? error.message : "อัปโหลดลายเซ็นไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  function finish() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (!hasInkRef.current) {
      onChange("");
      return;
    }
    canvasRef.current.toBlob((blob) => {
      if (blob) void uploadSignature(blob, `asset-signature-${Date.now()}.png`);
      else setUploadError("สร้างไฟล์ลายเซ็นไม่สำเร็จ กรุณาลองใหม่");
    }, "image/png");
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    onChange("");
  }

  function setSignatureMethod(nextMethod) {
    setMethod(nextMethod);
    setUploadError("");
    clear();
  }

  function useTypedSignature() {
    const value = typedName.trim();
    if (!value) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = "italic 30px cursive";
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim() || "#202a35";
    context.fillText(value.slice(0, 48), 10, 68, Math.max(100, canvas.clientWidth - 20));
    hasInkRef.current = true;
    canvas.toBlob((blob) => {
      if (blob) void uploadSignature(blob, `asset-signature-${Date.now()}.png`);
      else setUploadError("สร้างไฟล์ลายเซ็นไม่สำเร็จ กรุณาลองใหม่");
    }, "image/png");
  }

  async function handleSignatureFile(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("รองรับเฉพาะไฟล์รูปลายเซ็น");
      return;
    }
    if (file.size > 32 * 1024 * 1024) {
      setUploadError("ไฟล์รูปภาพต้องมีขนาดไม่เกิน 32 MB");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      onChange(await uploadAssetImage(file, "signature"));
    } catch (error) {
      onChange("");
      setUploadError(error instanceof Error ? error.message : "อัปโหลดลายเซ็นไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        {method === "draw" ? <Button type="button" size="xs" variant="ghost" onClick={clear}>ล้างลายเซ็น</Button> : null}
      </div>
      <div role="group" aria-label="วิธีลงลายเซ็น" className="flex flex-wrap gap-1 border-b border-border">
        {[ ["draw", "วาด"], ["type", "พิมพ์ชื่อ"], ["upload", "อัปโหลดรูป"] ].map(([id, text]) => <button key={id} type="button" aria-pressed={method === id} onClick={() => setSignatureMethod(id)} className={cx("min-h-10 border-b-2 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", method === id ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{text}</button>)}
      </div>
      <canvas
        ref={canvasRef}
        aria-label={`${label} พื้นที่วาดลายเซ็น`}
        hidden={method !== "draw"}
        className={cx("w-full touch-none rounded-sm border border-input bg-background", large ? "h-52 sm:h-64" : "h-28")}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
      />
      {method === "type" ? <div className="flex flex-col gap-2 sm:flex-row sm:items-end"><Input label="ชื่อสำหรับลายเซ็น" value={typedName} onChange={setTypedName} maxLength={48} /><Button type="button" variant="outline" disabled={!typedName.trim() || uploading} onClick={useTypedSignature}>ใช้ชื่อลายเซ็น</Button></div> : null}
      {method === "upload" ? <div className="grid gap-1.5"><label htmlFor={uploadId} className="text-sm font-medium">เลือกรูปลายเซ็น</label><input id={uploadId} type="file" accept="image/*" disabled={uploading} onChange={handleSignatureFile} className="block min-h-10 w-full text-sm text-muted-foreground file:mr-3 file:min-h-10 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div> : null}
      {method === "draw" ? <p className="text-xs leading-5 text-muted-foreground">ใช้นิ้วหรือเมาส์ลงชื่อในกรอบด้านบน</p> : null}
      {uploading ? <p role="status" className="text-xs text-muted-foreground">กำลังอัปโหลดลายเซ็น…</p> : null}
      {uploadError ? <p role="alert" className="text-xs text-status-danger">{uploadError}</p> : null}
    </div>
  );
}

function statusLabel(status) {
  return statusLabels[status] || status;
}

function agreementLabel(status) {
  return ({
    waitingHandover: "รอลงชื่อผู้ส่งมอบ",
    waitingEmployee: "รอลงชื่อผู้ยืม",
    waitingAdmin: "รอผู้อนุมัติลงชื่อ",
    completed: "ลงชื่อครบแล้ว",
  })[status] || "ไม่มีข้อตกลง";
}

function cleanHtml(value) {
  return String(value || "")
    .replace(/<hr\b[^>]*data-agreement-page-break[^>]*>/gi, "\n──────────\n")
    .replace(/<\/(p|li|h[1-6])\s*>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function AssetRequestCard({ item, isManager, employeeCode, agreementTemplates = [], onRefresh }) {
  const [open, setOpen] = useState(false);
  const [signing, setSigning] = useState(null);
  const [signature, setSignature] = useState("");
  const [inspection, setInspection] = useState("");
  const [returnCondition, setReturnCondition] = useState("original");
  const [returnImageUrl, setReturnImageUrl] = useState("");
  const [agreementReadConfirmed, setAgreementReadConfirmed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportingAgreement, setExportingAgreement] = useState(false);
  const [uploadingReturnImage, setUploadingReturnImage] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const borrowerOwns = String(item.employeeCode || "").trim().toLowerCase() === String(employeeCode || "").trim().toLowerCase();
  const agreement = item.agreement;
  const assetFormOnly = isAssetFormOnly(agreement);
  const itemDetails = Array.isArray(item.itemDetails) ? item.itemDetails : [];
  const signedReturnByEmployee = agreement?.signatureBoxes?.find((box) => box.id === "employee")?.returnSignatureData;
  const signedReturnByAdmin = agreement?.signatureBoxes?.find((box) => box.id === "admin")?.returnSignatureData;
  const returnSignaturesReady = assetFormOnly || Boolean(signedReturnByEmployee && signedReturnByAdmin);
  const requiresAgreementWorkflow = Boolean(agreement);
  const canManagerDecide = isManager && item.status === "pending" && !requiresAgreementWorkflow && !item.borrowerSignatureData;
  const showHandoverSign = isManager && agreement?.status === "waitingHandover";
  const showEmployeeSign = borrowerOwns && agreement?.status === "waitingEmployee";
  const showAdminSign = isManager && agreement?.status === "waitingAdmin" && !assetFormOnly;
  const showFormApproval = isManager && item.status === "pending" && !agreement && Boolean(item.borrowerSignatureData);
  const showReturnEmployeeSign = borrowerOwns && item.status === "returnPending" && agreement && !assetFormOnly && !signedReturnByEmployee;
  const showReturnAdminSign = isManager && item.status === "returnPending" && agreement && !assetFormOnly && signedReturnByEmployee && !agreement.signatureBoxes.find((box) => box.id === "admin")?.returnSignatureData;
  const hasSignedAgreement = Boolean(agreement?.signatureBoxes?.some((box) => box.status === "signed"));
  const canEditDetails = isManager && agreement && (agreement.status === "waitingHandover" || (agreement.status === "waitingEmployee" && !hasSignedAgreement));
  const pendingAgreementSignature = showHandoverSign || showEmployeeSign || showAdminSign;
  const canExport = !agreement || Boolean(!assetFormOnly && canExportAgreementDocument(agreement.signatureBoxes));
  const signingTitle = ({
    "agreement:handover": "ลงชื่อผู้ส่งมอบ",
    "agreement:employee": "ลงชื่อผู้ยืม",
    "agreement:admin": "ลงชื่อผู้อนุมัติ",
    formApproval: "ลงชื่อและอนุมัติคำขอ",
    "return:employee": "ลงชื่อส่งคืน",
    "return:admin": "ลงชื่อรับคืน",
  })[signing];

  useEffect(() => {
    setAgreementReadConfirmed(false);
  }, [item.id, agreement?.status]);

  function startSigning(target) {
    setSigning(target);
    setSignature("");
    setActionError("");
  }

  async function action(body, method = "PATCH") {
    setBusy(true);
    setActionError("");
    try {
      const response = await fetch(`/api/asset-requests/${item.id}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionError(payload.error || "ทำรายการไม่สำเร็จ กรุณาลองใหม่");
        return false;
      }
      setSigning(null);
      setSignature("");
      setInspection("");
      await onRefresh();
      return true;
    } catch {
      setActionError("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitSignature() {
    if (!signature) {
      setActionError("กรุณาลงลายมือชื่อก่อนยืนยัน");
      return;
    }
    if (signing === "formApproval") {
      if (await action({ action: "approveFormRequest", signatureData: signature })) setSigning(null);
      return;
    }
    if (signing?.startsWith("return:")) {
      const signer = signing.slice("return:".length);
      if (await action({ action: "signReturn", signer, signatureData: signature })) setSigning(null);
      return;
    }
    const signer = signing?.slice("agreement:".length);
    if (signer && await action({ action: "signAgreement", signer, signatureData: signature })) setSigning(null);
  }

  async function requestReturn() {
    await action({ action: "transition", status: "returnPending" });
  }

  async function confirmReturn() {
    if (!inspection.trim()) {
      setActionError("กรุณาระบุผลการตรวจสภาพก่อนยืนยันรับคืน");
      return;
    }
    if (agreement && !assetFormOnly && !returnSignaturesReady) {
      setActionError("กรุณาให้ผู้ยืมและผู้รับคืนลงชื่อก่อนยืนยันรับคืน");
      return;
    }
    if (!agreement) {
      await action({ action: "transition", status: "returned", returnInspection: inspection.trim(), imageUrl: returnImageUrl.trim() });
      return;
    }
    await action({
      action: "confirmReturn",
      agreement: { ...agreement, returnCondition },
      returnInspection: inspection.trim(),
      imageUrl: returnImageUrl.trim(),
    });
  }

  async function exportAgreement() {
    setActionError("");
    setExportingAgreement(true);
    try {
      if (!await downloadAgreementDocument(item)) throw new Error("ไม่สามารถสร้างเอกสารได้");
    } catch (error) {
      setOpen(true);
      setActionError(error?.name === "AgreementFontLoadError"
        ? "โหลดฟอนต์เอกสารไม่สำเร็จ กรุณาลองอีกครั้ง"
        : "สร้างไฟล์ PDF ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setExportingAgreement(false);
    }
  }

  return (
    <>
    <article className="border-b border-border last:border-0">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{item.employeeName}</h3>
            <span className="text-xs text-muted-foreground">{item.employeeCode}</span>
            <StatusBadge status={item.status === "returnPending" ? "pending" : item.status === "unknown" ? "unknown" : item.status}>
              {statusLabel(item.status)}
            </StatusBadge>
            {agreement ? <span className="text-xs text-muted-foreground">{agreementLabel(agreement.status)}</span> : null}
            {!agreement ? <span className="text-xs text-muted-foreground">แบบฟอร์มยืม</span> : null}
          </div>
          <p className="mt-1 truncate text-xs leading-5 text-muted-foreground">
            {itemDetails.map((detail) => `${detail.name} × ${detail.quantity}`).join(", ") || "ไม่พบรายการทรัพย์สิน"}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {dateText(item.fromDate)} – {dateText(item.toDate)} · ยื่น {dateText(item.formDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExport ? <Button type="button" size="xs" variant="outline" leadingIcon={RiFileList3Line} disabled={busy || exportingAgreement} onClick={() => void exportAgreement()}>{exportingAgreement ? "กำลังสร้าง PDF…" : "ส่งออก PDF"}</Button> : null}
          {canManagerDecide ? <>
            <Button type="button" size="xs" variant="secondary" leadingIcon={RiCheckLine} disabled={busy} onClick={() => action({ action: "transition", status: "approved" })}>อนุมัติ</Button>
            <Button type="button" size="xs" variant="outline" leadingIcon={RiCloseLine} disabled={busy} onClick={() => action({ action: "transition", status: "rejected" })}>ไม่อนุมัติ</Button>
          </> : null}
          {borrowerOwns && item.status === "approved" && (!agreement || agreement.status === "completed") ? <Button type="button" size="xs" variant="secondary" disabled={busy} onClick={requestReturn}>แจ้งส่งคืน</Button> : null}
          <Button type="button" size="xs" variant="ghost" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            {open ? "ซ่อนรายละเอียด" : "รายละเอียด"}
          </Button>
        </div>
      </div>
      {open ? (
        <div className="grid gap-5 border-t border-border bg-muted/30 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]">
          <div className="min-w-0 space-y-4">
            <div>
              <h4 className="text-sm font-semibold">รายการที่ขอยืม</h4>
              <div className="mt-2 overflow-x-auto rounded-sm border border-border bg-card">
                <table className="w-full min-w-[420px] text-left text-xs">
                  <thead className="bg-muted text-muted-foreground"><tr><th className="px-3 py-2 font-medium">ทรัพย์สิน</th><th className="w-20 px-3 py-2 font-medium">จำนวน</th><th className="px-3 py-2 font-medium">หมายเหตุ</th></tr></thead>
                  <tbody>{itemDetails.map((detail, index) => <tr key={`${detail.name}-${index}`} className="border-t border-border"><td className="px-3 py-2">{detail.name}</td><td className="px-3 py-2 tabular-nums">{detail.quantity}</td><td className="px-3 py-2 text-muted-foreground">{detail.note || "—"}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
            <dl className="grid gap-3 text-xs sm:grid-cols-2">
              <div><dt className="text-muted-foreground">แผนก / ตำแหน่ง</dt><dd className="mt-1">{[item.department, item.position].filter(Boolean).join(" · ") || "—"}</dd></div>
              <div><dt className="text-muted-foreground">วัตถุประสงค์</dt><dd className="mt-1 whitespace-pre-wrap">{item.reason || "—"}</dd></div>
              <div><dt className="text-muted-foreground">หมายเหตุ</dt><dd className="mt-1 whitespace-pre-wrap">{item.remarks || "—"}</dd></div>
              <div><dt className="text-muted-foreground">ผู้อนุมัติ</dt><dd className="mt-1">{item.approvedBorrowBy || "—"}</dd></div>
            </dl>
            {item.imageUrl || item.additionalImages?.length ? <div className="flex flex-wrap gap-2 text-xs">
              {item.imageUrl ? <a className="text-primary underline-offset-4 hover:underline" href={item.imageUrl} target="_blank" rel="noreferrer">เปิดรูปแนบ</a> : null}
              {item.additionalImages?.map((url, index) => <a key={`${url}-${index}`} className="text-primary underline-offset-4 hover:underline" href={url} target="_blank" rel="noreferrer">รูปเพิ่มเติม {index + 1}</a>)}
            </div> : null}
            {item.returnInspection ? <div className="rounded-sm border border-border bg-card p-3 text-xs"><strong>ผลตรวจคืน</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.returnInspection}</p></div> : null}
          </div>
          <div className="min-w-0 space-y-4">
            {agreement ? <section className="rounded-sm border border-border bg-card p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">{agreement.title}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{agreementLabel(agreement.status)}</p>
                  {item.agreementId ? <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">Agreement ID · {item.agreementId}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {agreement.returnCondition ? <StatusBadge status={agreement.returnCondition}>{({ original: "สภาพปกติ", damaged: "ชำรุด", lost: "สูญหาย" })[agreement.returnCondition]}</StatusBadge> : null}
                  {!assetFormOnly ? <Button type="button" size="xs" variant="outline" leadingIcon={RiFileList3Line} onClick={() => setPreviewOpen(true)}>ดูเอกสาร</Button> : null}
                </div>
              </div>
              <details className="mt-3" open={pendingAgreementSignature}>
                <summary className="min-h-10 cursor-pointer py-2 text-xs font-medium text-primary">อ่านเงื่อนไขข้อตกลง</summary>
                <div className="whitespace-pre-wrap break-words border-t border-border pt-3 text-sm leading-7 text-foreground">{cleanHtml(agreementBodyPreviewText(item))}</div>
              </details>
              <ul className="mt-3 divide-y divide-border border-t border-border text-xs">
                {agreement.signatureBoxes.map((box) => <li key={box.id} className="flex flex-wrap items-center justify-between gap-3 py-2"><span>{box.label}{box.name ? ` · ${box.name}` : ""}</span><span className={cx("shrink-0", box.status === "signed" ? "text-status-success" : "text-muted-foreground")}>{box.status === "signed" ? "ลงชื่อแล้ว" : "รอลงชื่อ"}</span>{box.signatureData ? <img src={box.signatureData} alt={`ลายเซ็น ${box.label}`} className="max-h-12 max-w-40 object-contain" /> : null}{box.returnSignatureData ? <img src={box.returnSignatureData} alt={`ลายเซ็นรับคืน ${box.label}`} className="max-h-12 max-w-40 object-contain" /> : null}</li>)}
              </ul>
              {canExport ? <p className="mt-2 text-xs text-muted-foreground">ส่งออก PDF ได้หลังผู้ยืมลงชื่อ Agreement</p> : null}
              {canEditDetails ? <div className="mt-3 border-t border-border pt-3">
                <Link href={`/assets/requests/${item.id}/agreement/edit`} className="inline-flex min-h-10 items-center rounded-sm border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  แก้ไขเอกสาร
                </Link>
              </div> : null}
            </section> : <div className="space-y-3">
              <p className="text-xs text-muted-foreground">ไม่มี Agreement · ส่งออกได้เฉพาะแบบฟอร์มยืมหน้าแรก</p>
              {isManager && item.status === "pending" && item.borrowerSignatureData ? <section className="grid gap-3 rounded-sm border border-border bg-card p-3 sm:p-4">
                <h4 className="text-sm font-semibold">เพิ่ม Agreement ให้คำขอนี้</h4>
                <p className="text-xs leading-5 text-muted-foreground">เลือกเอกสารเพิ่มเติมได้ก่อนเริ่มลงนาม หากไม่เลือก สามารถอนุมัติจากแบบฟอร์มยืมหน้าแรกได้เลย</p>
                <div className="grid gap-1.5">
                  <label htmlFor={`asset-agreement-template-${item.id}`} className="text-sm font-medium">Agreement</label>
                  <select id={`asset-agreement-template-${item.id}`} value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className="min-h-10 w-full rounded-sm border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="">เลือก Agreement</option>
                    {agreementTemplates.filter((template) => template.isActive).map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
                  </select>
                </div>
                <Button type="button" variant="outline" disabled={busy || !selectedTemplateId} onClick={() => action({ action: "attachAgreementTemplate", templateId: selectedTemplateId })}>แนบ Agreement และเริ่มลงนาม</Button>
              </section> : null}
            </div>}

            {pendingAgreementSignature ? <label className="flex items-start gap-2 rounded-sm border border-border bg-muted/40 p-3 text-xs leading-5">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" checked={agreementReadConfirmed} onChange={(event) => setAgreementReadConfirmed(event.target.checked)} />
              <span>ฉันได้อ่าน Agreement และยืนยันขั้นตอนลงชื่อแล้ว</span>
            </label> : null}
            {showHandoverSign ? <Button type="button" className="w-full" disabled={!agreementReadConfirmed || busy} onClick={() => startSigning("agreement:handover")}>ลงชื่อผู้ส่งมอบ</Button> : null}
            {showEmployeeSign ? <Button type="button" className="w-full" disabled={!agreementReadConfirmed || busy} onClick={() => startSigning("agreement:employee")}>ลงชื่อผู้ยืม</Button> : null}
            {showAdminSign ? <Button type="button" className="w-full" disabled={!agreementReadConfirmed || busy} onClick={() => startSigning("agreement:admin")}>ลงชื่อผู้อนุมัติ</Button> : null}
            {showFormApproval ? <Button type="button" className="w-full" onClick={() => startSigning("formApproval")}>ลงชื่อและอนุมัติคำขอ</Button> : null}
            {isManager && item.status === "pending" && !agreement ? <Button type="button" className="w-full" variant="outline" disabled={busy} onClick={() => action({ action: "transition", status: "rejected" })}>ไม่อนุมัติคำขอ</Button> : null}
            {showReturnEmployeeSign ? <Button type="button" className="w-full" variant="secondary" onClick={() => startSigning("return:employee")}>ลงชื่อส่งคืน</Button> : null}
            {showReturnAdminSign ? <Button type="button" className="w-full" variant="secondary" onClick={() => startSigning("return:admin")}>ลงชื่อรับคืน</Button> : null}

            {isManager && item.status === "returnPending" ? <section className="grid gap-3 rounded-sm border border-border bg-card p-3 sm:p-4">
              <h4 className="text-sm font-semibold">ตรวจสภาพและยืนยันรับคืน</h4>
              {agreement ? <div className="grid gap-1.5"><label htmlFor={`return-condition-${item.id}`} className="text-sm font-medium">สภาพทรัพย์สิน</label><select id={`return-condition-${item.id}`} value={returnCondition} onChange={(event) => setReturnCondition(event.target.value)} className="h-10 rounded-sm border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="original">สภาพปกติ</option><option value="damaged">ชำรุด</option><option value="lost">สูญหาย</option></select></div> : null}
              <Textarea label="ผลการตรวจสภาพ" rows={3} value={inspection} onChange={(event) => setInspection(event.target.value)} />
              <Input label="ลิงก์รูปสภาพตอนคืน (ถ้ามี)" type="url" value={returnImageUrl} onChange={setReturnImageUrl} placeholder="https://…" />
              <div className="grid gap-1.5"><label htmlFor={`return-image-${item.id}`} className="text-sm font-medium">หรืออัปโหลดรูปสภาพ</label><input id={`return-image-${item.id}`} type="file" accept="image/*" disabled={uploadingReturnImage} onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                setUploadingReturnImage(true);
                setActionError("");
                try { setReturnImageUrl(await uploadAssetImage(file)); }
                catch (error) { setActionError(error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ"); }
                finally { setUploadingReturnImage(false); }
              }} className="block min-h-10 w-full text-sm text-muted-foreground file:mr-3 file:min-h-10 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
              {uploadingReturnImage ? <p role="status" className="text-xs text-muted-foreground">กำลังอัปโหลดรูป…</p> : null}
              {actionError ? <p role="alert" className="text-xs leading-5 text-status-danger">{actionError}</p> : null}
              {agreement && !returnSignaturesReady ? <p className="text-xs leading-5 text-muted-foreground">ต้องลงชื่อส่งคืนและลงชื่อรับคืนให้ครบก่อนปิดรายการ</p> : null}
              <Button type="button" disabled={busy || uploadingReturnImage || Boolean(agreement && !returnSignaturesReady)} onClick={confirmReturn}>ยืนยันรับคืน</Button>
            </section> : null}

            {isManager && (item.status === "rejected" || item.status === "returned") ? <div className="flex justify-end border-t border-border pt-3">
              <Button type="button" size="xs" variant="ghost" leadingIcon={RiDeleteBinLine} disabled={busy} onClick={() => {
                if (window.confirm("ต้องการซ่อนคำขอนี้จากรายการหรือไม่? ประวัติยังคงอยู่ในระบบ")) void action({}, "DELETE");
              }}>นำออกจากรายการ</Button>
            </div> : null}
          </div>
          {actionError && !signing && !(isManager && item.status === "returnPending") ? <p role="alert" className="text-xs leading-5 text-status-danger lg:col-span-2">{actionError}</p> : null}
        </div>
      ) : null}
      </article>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="h-[90dvh] max-w-5xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{agreement ? "ตัวอย่างเอกสาร Agreement" : "ตัวอย่างแบบฟอร์มยืม"}</DialogTitle>
            <DialogDescription>{item.employeeName} · {item.employeeCode} · {agreement ? "ดาวน์โหลดเอกสาร Agreement เป็นไฟล์ PDF" : "เอกสารนี้มีเฉพาะแบบฟอร์มยืมหน้าแรก"}</DialogDescription>
          </DialogHeader>
          <iframe
            title={`ตัวอย่างเอกสาร Agreement ของ ${item.employeeName}`}
            sandbox="allow-same-origin"
            srcDoc={agreementDocumentHtml(item, typeof window === "undefined" ? "" : window.location.origin)}
            className="min-h-0 w-full flex-1 rounded-sm border border-border bg-muted"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>ปิด</Button>
            {canExport ? <Button type="button" leadingIcon={RiFileList3Line} disabled={exportingAgreement} onClick={() => void exportAgreement()}>{exportingAgreement ? "กำลังสร้าง PDF…" : "ส่งออก PDF"}</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(signing)} onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) {
          setSigning(null);
          setSignature("");
          setActionError("");
        }
      }}>
        <DialogContent className="h-[min(88dvh,48rem)] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{signingTitle}</DialogTitle>
            <DialogDescription>ลงชื่อด้วยการวาด พิมพ์ชื่อ หรืออัปโหลดรูปลายเซ็น</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SignaturePad key={`${item.id}-${signing}`} onChange={setSignature} label={signingTitle} large />
            {signature ? <img src={signature} alt="ตัวอย่างลายเซ็น" className="mt-3 max-h-24 max-w-64 object-contain" /> : null}
            {actionError ? <p role="alert" className="mt-2 text-xs leading-5 text-status-danger">{actionError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => {
              setSigning(null);
              setSignature("");
              setActionError("");
            }}>ยกเลิก</Button>
            <Button type="button" disabled={busy || !signature} onClick={submitSignature}>{busy ? "กำลังบันทึก…" : "ยืนยันลายเซ็น"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AssetBorrowingRequests({ isManager = false, canViewCompany = isManager, employeeCode, createOpen = false, onCreateClose = () => {} }) {
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [agreementTemplates, setAgreementTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [borrowers, setBorrowers] = useState([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [additionalImages, setAdditionalImages] = useState("");
  const [assetItems, setAssetItems] = useState([{ name: "", quantity: "1", note: "" }]);
  const [borrowerSignature, setBorrowerSignature] = useState("");
  const [agreementTemplateId, setAgreementTemplateId] = useState("");

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/asset-requests");
      if (!response.ok) throw new Error("Unable to load requests");
      const payload = await response.json();
      const requests = payload.items || [];
      setItems(requests);
      const unseen = requests.filter((item) => !item.seen).map((item) => item.id);
      if (unseen.length) {
        void fetch("/api/asset-requests/seen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: unseen }),
        }).catch(() => undefined);
        setItems(requests.map((item) => ({ ...item, seen: true })));
      }
    } catch {
      setLoadError("ไม่สามารถโหลดคำขอยืมคืนได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    function handleRequestUpdate() { void refresh(); }
    window.addEventListener("asset-requests:refresh", handleRequestUpdate);
    return () => window.removeEventListener("asset-requests:refresh", handleRequestUpdate);
  }, []);

  useEffect(() => {
    if (!isManager) return;
    let cancelled = false;
    fetch("/api/employees")
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => { if (!cancelled) setEmployees(payload.items || []); })
      .catch(() => { if (!cancelled) setEmployees([]); });
    return () => { cancelled = true; };
  }, [isManager]);

  useEffect(() => {
    if (!isManager) return;
    let cancelled = false;
    fetch("/api/asset-agreement-templates")
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload) => { if (!cancelled) setAgreementTemplates(payload.items || []); })
      .catch(() => { if (!cancelled) setAgreementTemplates([]); });
    return () => { cancelled = true; };
  }, [isManager]);

  const counts = useMemo(() => ({
    all: items.length,
    pending: items.filter((item) => item.status === "pending").length,
    approved: items.filter((item) => item.status === "approved").length,
    rejected: items.filter((item) => item.status === "rejected").length,
    returnPending: items.filter((item) => item.status === "returnPending").length,
    returned: items.filter((item) => item.status === "returned").length,
    unknown: items.filter((item) => item.status === "unknown").length,
  }), [items]);
  const agreementFilterCounts = useMemo(() => Object.fromEntries(
    Object.keys(agreementFilterLabels).map((filter) => [
      filter,
      filter === "all" ? items.length : items.filter((item) => matchesAssetAgreementFilter(item, filter)).length,
    ]),
  ), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const matchesStatus = canViewCompany
      ? statusFilter === "all" || matchesAssetAgreementFilter(item, statusFilter)
      : statusFilter === "all" || item.status === statusFilter;
    const searchText = `${item.employeeName} ${item.employeeCode} ${item.department} ${item.position} ${item.reason} ${(item.itemDetails || []).map((detail) => `${detail.name} ${detail.note}`).join(" ")}`.toLocaleLowerCase();
    return matchesStatus && searchText.includes(query.trim().toLocaleLowerCase());
  }), [items, canViewCompany, statusFilter, query]);

  function updateItem(index, key, value) {
    setAssetItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  function resetForm() {
    setBorrowers([]);
    setFromDate("");
    setToDate("");
    setReason("");
    setRemarks("");
    setImageUrl("");
    setAdditionalImages("");
    setAssetItems([{ name: "", quantity: "1", note: "" }]);
    setBorrowerSignature("");
    setAgreementTemplateId("");
    setFormError("");
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    const itemPayload = assetItems.map((item) => ({ name: item.name.trim(), quantity: Number(item.quantity), note: item.note.trim() }));
    if (itemPayload.some((item) => !item.name || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      setFormError("กรุณากรอกชื่อและจำนวนของทรัพย์สินแต่ละรายการให้ถูกต้อง");
      setSubmitting(false);
      return;
    }
    if (toDate && fromDate && toDate < fromDate) {
      setFormError("วันที่คืนต้องไม่ก่อนวันที่ยืม");
      setSubmitting(false);
      return;
    }
    const flow = isManager ? "admin-managed" : "self-service";
    if (!isManager && !borrowerSignature) {
      setFormError("กรุณาลงลายมือชื่อผู้ยืมก่อนส่งคำขอ");
      setSubmitting(false);
      return;
    }
    const body = {
      flow,
      employeeIds: isManager ? borrowers : undefined,
      fromDate,
      toDate: toDate || null,
      items: itemPayload,
      reason,
      remarks,
      imageUrl,
      additionalImages: additionalImages.split(/\r?\n/).map((url) => url.trim()).filter(Boolean),
      borrowerSignature: isManager ? undefined : borrowerSignature,
      agreementTemplateId: isManager ? agreementTemplateId || undefined : undefined,
    };
    try {
      const response = await fetch("/api/asset-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormError(payload.error || "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      resetForm();
      onCreateClose();
      setNotice(isManager ? "บันทึกคำขอสำหรับพนักงานแล้ว" : "ส่งคำขอยืมทรัพย์สินแล้ว");
      await refresh();
    } catch {
      setFormError("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  const employeeTabs = [
    { id: "all", label: "ทั้งหมด" },
    { id: "pending", label: "รออนุมัติ" },
    { id: "approved", label: "กำลังยืม" },
    { id: "returnPending", label: "รอตรวจรับคืน" },
    { id: "returned", label: "คืนแล้ว" },
    { id: "rejected", label: "ไม่อนุมัติ" },
  ].map((tab) => ({ ...tab, count: counts[tab.id] }));
  const managerTabs = Object.entries(agreementFilterLabels)
    .filter(([id]) => !["waitingHandover", "waitingEmployee"].includes(id) || agreementFilterCounts[id] > 0)
    .map(([id, label]) => ({ id, label, count: agreementFilterCounts[id] }));
  const tabs = canViewCompany ? managerTabs : employeeTabs;

  return (
    <div className="space-y-4">
      {notice ? <div role="status" className="flex items-center justify-between gap-3 border border-status-success/20 bg-status-success/5 px-4 py-3 text-sm text-status-success"><span>{notice}</span><Button type="button" size="xs" variant="ghost" onClick={() => setNotice("")}>ปิด</Button></div> : null}

      {createOpen ? <form className="grid gap-4 border border-border bg-card p-4 sm:p-5" onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-base font-semibold">{isManager ? "สร้างรายการยืมแทนพนักงาน" : "สร้างคำขอยืมทรัพย์สิน"}</h2><p className="mt-1 text-xs text-muted-foreground">เพิ่มทรัพย์สินได้สูงสุด 10 รายการต่อคำขอ</p></div>
          <Button type="button" size="icon" variant="ghost" aria-label="ปิดแบบฟอร์ม" onClick={() => { onCreateClose(); resetForm(); }}><RiCloseLine aria-hidden /></Button>
        </div>
        {isManager ? <div className="grid gap-1.5">
          <label htmlFor="asset-borrowers" className="text-sm font-medium">ผู้ยืม</label>
          <select id="asset-borrowers" multiple size={Math.min(6, Math.max(3, employees.length))} value={borrowers} onChange={(event) => setBorrowers(Array.from(event.target.selectedOptions, (option) => option.value))} className="min-h-24 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName} · {employee.code}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">เลือกพนักงานหนึ่งคนหรือหลายคน แล้วส่งคำขอแยกให้แต่ละคน</p>
        </div> : null}
        {isManager ? <div className="grid gap-1.5">
          <label htmlFor="asset-create-agreement-template" className="text-sm font-medium">Agreement (ไม่บังคับ)</label>
          <select id="asset-create-agreement-template" value={agreementTemplateId} onChange={(event) => setAgreementTemplateId(event.target.value)} className="min-h-10 w-full rounded-sm border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">ไม่แนบ Agreement · ใช้แบบฟอร์มยืมหน้าแรก</option>
            {agreementTemplates.filter((template) => template.isActive).map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
          </select>
          {!agreementTemplates.some((template) => template.isActive) ? <p className="text-xs text-muted-foreground">ยังไม่มี Agreement ที่ใช้งานได้ <Link className="text-primary underline-offset-4 hover:underline" href="/assets/agreements">จัดการ Agreement</Link></p> : null}
        </div> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input type="date" label="วันที่เริ่มยืม" value={fromDate} onChange={setFromDate} isRequired />
          <Input type="date" label="วันที่กำหนดคืน" value={toDate} onChange={setToDate} />
        </div>
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">รายการที่ขอยืม</h3><Button type="button" size="xs" variant="outline" leadingIcon={RiAddLine} disabled={assetItems.length >= 10} onClick={() => setAssetItems((current) => [...current, { name: "", quantity: "1", note: "" }])}>เพิ่มรายการ</Button></div>
          {assetItems.map((item, index) => <div key={index} className="grid gap-2 border border-border p-3 sm:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)_40px] sm:items-end">
            <Input label={`ชื่อทรัพย์สิน ${index + 1}`} value={item.name} onChange={(value) => updateItem(index, "name", value)} placeholder="เช่น โน้ตบุ๊ก" isRequired />
            <Input label="จำนวน" type="number" min="1" step="1" value={item.quantity} onChange={(value) => updateItem(index, "quantity", value)} isRequired />
            <Input label="หมายเหตุ" value={item.note} onChange={(value) => updateItem(index, "note", value)} placeholder="รุ่นหรือรายละเอียดเพิ่มเติม" />
            <Button type="button" size="icon" variant="ghost" aria-label={`ลบรายการ ${index + 1}`} disabled={assetItems.length === 1} onClick={() => setAssetItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><RiDeleteBinLine aria-hidden /></Button>
          </div>)}
        </div>
        <Textarea label="วัตถุประสงค์" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        <Textarea label="หมายเหตุเพิ่มเติม" rows={2} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="ลิงก์รูปหลัก (ถ้ามี)" type="url" value={imageUrl} onChange={setImageUrl} placeholder="https://…" />
          <Textarea label="ลิงก์รูปเพิ่มเติม (หนึ่งลิงก์ต่อบรรทัด)" rows={2} value={additionalImages} onChange={(event) => setAdditionalImages(event.target.value)} placeholder="https://…" />
        </div>
        <div className="grid gap-1.5"><label htmlFor="asset-request-images" className="text-sm font-medium">หรืออัปโหลดรูปประกอบ</label><input id="asset-request-images" type="file" accept="image/*" multiple disabled={uploadingImage} onChange={async (event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (!files.length) return;
          const existingAdditional = additionalImages.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
          if (files.length + existingAdditional.length + Number(Boolean(imageUrl)) > 11) {
            setFormError("แนบรูปได้ไม่เกิน 11 รูป");
            return;
          }
          setUploadingImage(true);
          setFormError("");
          try {
            const uploaded = [];
            for (const file of files) uploaded.push(await uploadAssetImage(file));
            const extras = imageUrl ? uploaded : uploaded.slice(1);
            if (!imageUrl && uploaded[0]) setImageUrl(uploaded[0]);
            if (extras.length) setAdditionalImages([...existingAdditional, ...extras].join("\n"));
          } catch (error) {
            setFormError(error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ");
          } finally {
            setUploadingImage(false);
          }
        }} className="block min-h-10 w-full text-sm text-muted-foreground file:mr-3 file:min-h-10 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
        {uploadingImage ? <p role="status" className="text-xs text-muted-foreground">กำลังอัปโหลดรูป…</p> : null}
        {!isManager ? <div className="max-w-xl rounded-sm border border-border p-3 sm:p-4"><SignaturePad label="ลายเซ็นผู้ยืม" onChange={setBorrowerSignature} />{borrowerSignature ? <img src={borrowerSignature} alt="ตัวอย่างลายเซ็นผู้ยืม" className="mt-2 max-h-16 max-w-48 object-contain" /> : null}</div> : null}
        {formError ? <p role="alert" className="text-sm text-status-danger">{formError}</p> : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" disabled={submitting} onClick={() => { onCreateClose(); resetForm(); }}>ยกเลิก</Button>
          <Button type="submit" disabled={submitting || uploadingImage || (isManager && !borrowers.length)}>{submitting ? "กำลังบันทึก…" : isManager ? "สร้างคำขอและอนุมัติ" : "ส่งคำขอ"}</Button>
        </div>
      </form> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="กรองสถานะคำขอยืม" className="flex max-w-full gap-1 overflow-x-auto border-b border-border">
          {tabs.map((tab) => <button
            key={tab.id}
            type="button"
            aria-pressed={statusFilter === tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={cx("min-h-10 shrink-0 border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", statusFilter === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >{tab.label}<span className="ml-2 text-xs tabular-nums">{tab.count}</span></button>)}
        </div>
        <div className="flex items-center gap-2">
          <Input aria-label="ค้นหาคำขอยืม" placeholder="ค้นหาผู้ยืมหรือทรัพย์สิน" value={query} onChange={setQuery} leadingIcon={RiSearchLine} className="min-w-0 flex-1 sm:w-56" />
          <Button type="button" size="icon" variant="ghost" leadingIcon={RiRefreshLine} aria-label="รีเฟรชรายการ" disabled={loading} onClick={() => void refresh()} />
        </div>
      </div>
      {loadError ? <p role="alert" className="text-sm text-status-danger">{loadError}</p> : null}
      <section className="overflow-hidden border border-border bg-card" aria-label="รายการคำขอยืมทรัพย์สิน">
        <div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(200px,1.5fr)_minmax(150px,1fr)_170px] gap-4 border-b border-border bg-muted px-5 py-2.5 text-xs font-medium text-muted-foreground lg:grid">
          <span>ผู้ยืม</span><span>ทรัพย์สิน</span><span>วันที่ยืม – คืน</span><span>สถานะ</span>
        </div>
        {filtered.map((item) => <AssetRequestCard key={item.id} item={item} isManager={isManager} employeeCode={employeeCode} agreementTemplates={agreementTemplates} onRefresh={refresh} />)}
        {!loading && !filtered.length ? <div className="grid min-h-36 place-content-center gap-1 px-4 text-center"><RiFileList3Line className="mx-auto size-5 text-muted-foreground" aria-hidden /><p className="text-sm font-medium">ไม่พบคำขอในสถานะนี้</p><p className="text-xs text-muted-foreground">คำขอใหม่และประวัติการยืมจะแสดงที่นี่</p></div> : null}
        {loading ? <p className="p-8 text-center text-sm text-muted-foreground">กำลังโหลดรายการ…</p> : null}
      </section>
    </div>
  );
}
