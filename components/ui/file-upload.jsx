"use client";

import { useId, useState } from "react";
import { RiAttachment2, RiCheckLine, RiUpload2Line } from "@remixicon/react";
import { cx } from "@/utils/cx";

export function FileUpload({ allowedExtensions = [], maxBytes, onUploadComplete, className }) {
  const id = useId();
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const accept = allowedExtensions.map((extension) => `.${extension}`).join(",");

  function handleChange(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (maxBytes && file.size > maxBytes) {
      setError(`ไฟล์ต้องมีขนาดไม่เกิน ${Math.round(maxBytes / (1024 * 1024))} MB`);
      setFileName("");
      return;
    }
    setError("");
    setFileName(file.name);
    onUploadComplete?.(file);
  }

  return (
    <div className={cx("grid gap-2", className)}>
      <label htmlFor={id} className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-background px-4 py-5 text-center transition-colors hover:bg-accent/50 focus-within:ring-2 focus-within:ring-ring">
        {fileName ? <RiCheckLine className="size-5 text-primary" aria-hidden="true" /> : <RiUpload2Line className="size-5 text-muted-foreground" aria-hidden="true" />}
        <span className="text-sm font-medium">{fileName || "เลือกไฟล์แนบ"}</span>
        <span className="text-xs text-muted-foreground">{allowedExtensions.join(", ").toUpperCase()} · สูงสุด {Math.round((maxBytes || 0) / (1024 * 1024))} MB</span>
      </label>
      <input id={id} className="sr-only" type="file" accept={accept} onChange={handleChange} />
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : fileName ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><RiAttachment2 className="size-3.5" aria-hidden="true" />{fileName}</p> : null}
    </div>
  );
}

export function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
