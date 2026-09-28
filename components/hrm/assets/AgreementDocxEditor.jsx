"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sanitizeAgreementHtml } from "@/components/hrm/assets/agreementPrint";

const fieldTokens = [
  ["ชื่อพนักงาน", "{{employeeName}}"],
  ["รหัสพนักงาน", "{{employeeCode}}"],
  ["ตำแหน่ง", "{{position}}"],
  ["แผนก", "{{department}}"],
  ["วันที่เอกสาร", "{{agreementDate}}"],
  ["รายการที่ยืม", "{{assetItems}}"],
  ["วันที่เริ่มยืม", "{{fromDate}}"],
  ["วันที่คืน", "{{toDate}}"],
  ["ผู้ยืมลงชื่อ", "{{signatureBorrower}}"],
  ["ผู้ส่งมอบลงชื่อ", "{{signatureHandover}}"],
  ["ผู้อนุมัติลงชื่อ", "{{signatureApprover}}"],
];

const formattingActions = [
  ["ตัวหนา", "bold"],
  ["ตัวเอียง", "italic"],
  ["ขีดเส้นใต้", "underline"],
  ["หัวข้อ", "formatBlock", "h2"],
  ["ย่อหน้า", "formatBlock", "p"],
  ["รายการ •", "insertUnorderedList"],
  ["รายการ 1.", "insertOrderedList"],
  ["ชิดซ้าย", "justifyLeft"],
  ["กึ่งกลาง", "justifyCenter"],
  ["ชิดขวา", "justifyRight"],
];

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function dateInputValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayThaiDate(value) {
  const normalized = dateInputValue(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day));
}

export function AgreementDocxEditor({
  requestId,
  body,
  title,
  documentDate,
  onBodyChange,
  onTitleChange,
  onDocumentDateChange,
  hideDocumentDate = false,
  readOnly = false,
}) {
  const editorRef = useRef(null);
  const titleId = useId();
  const dateId = useId();
  const [activeTab, setActiveTab] = useState("home");

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = sanitizeAgreementHtml(body);
  }, [requestId]);

  function runCommand(command, value) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, value);
    onBodyChange(editor.innerHTML);
  }

  function insertMarkup(markup) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand("insertHTML", false, markup);
    onBodyChange(editor.innerHTML);
  }

  function pasteSanitized(event) {
    const editor = editorRef.current;
    if (!editor) return;
    event.preventDefault();
    const clipboard = event.clipboardData;
    const html = clipboard.getData("text/html");
    const text = clipboard.getData("text/plain");
    const markup = sanitizeAgreementHtml(html || `<p>${escapeText(text).replace(/\r?\n/g, "<br>")}</p>`);
    document.execCommand("insertHTML", false, markup);
    onBodyChange(editor.innerHTML);
  }

  return (
    <section className="min-w-0" aria-label="ตัวแก้ไขเอกสาร Agreement">
      <div className="border-b border-border bg-card">
        <div role="tablist" aria-label="เมนูเครื่องมือเอกสาร" className="flex min-h-11 items-end gap-1 px-3">
          {[["home", "หน้าแรก"], ["insert", "แทรก"]].map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              disabled={readOnly}
              onClick={() => setActiveTab(tab)}
              className={`min-h-10 border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto hidden pb-2 text-xs text-muted-foreground sm:block">เครื่องมือเอกสาร</span>
        </div>

        {activeTab === "home" ? (
          <div role="toolbar" aria-label="จัดรูปแบบข้อความ" className="flex min-h-14 flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
            {formattingActions.map(([label, command, value]) => (
              <Button
                key={label}
                type="button"
                size="xs"
                variant="outline"
                aria-label={label}
                disabled={readOnly}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runCommand(command, value)}
              >
                {label}
              </Button>
            ))}
          </div>
        ) : (
          <div role="toolbar" aria-label="แทรกข้อมูลลงในเอกสาร" className="grid gap-2 border-t border-border px-3 py-2.5">
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={readOnly}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMarkup('<hr data-agreement-page-break="true" title="แบ่งหน้าเอกสาร"><p><br></p>')}
              >
                แบ่งหน้า
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {fieldTokens.map(([label, token]) => (
                <Button
                  key={token}
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={readOnly}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertMarkup(escapeText(token))}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={`grid gap-3 border-b border-border bg-background p-3 sm:px-5 ${hideDocumentDate ? "" : "sm:grid-cols-[minmax(0,1fr)_190px]"}`}>
        <Input id={titleId} label="ชื่อเอกสาร" value={title} onChange={onTitleChange} isDisabled={readOnly} />
        {!hideDocumentDate ? <div className="grid gap-1.5">
          <label htmlFor={dateId} className="text-sm font-medium text-foreground">วันที่ในเอกสาร</label>
          <Input id={dateId} type="date" value={dateInputValue(documentDate)} onChange={onDocumentDateChange} isDisabled={readOnly} />
        </div> : null}
      </div>

      <div className="asset-docx-workspace min-w-0 overflow-auto bg-muted px-3 py-5 sm:px-6 sm:py-8">
        <article className="asset-docx-page mx-auto min-h-[297mm] w-[210mm] max-w-none border border-border bg-background px-[23mm] pb-[24mm] pt-[13mm] text-foreground shadow-sm">
          <header className="asset-docx-header mb-[15mm] grid min-h-[25mm] grid-cols-[25mm_minmax(0,1fr)] items-center gap-4 border-b border-border pb-4">
            <img src="/download.png" alt="ตราบริษัท ต.จรัสชัย" className="h-[23mm] w-[23mm] object-contain" />
            <div className="text-right text-[10pt] leading-5 text-muted-foreground">
              <strong className="block text-[12pt] font-bold text-foreground">T.Jaruschai International Construction Co.,Ltd.</strong>
              2043 Soi Kanchanaphisek 008, Bangkae, Bangkae Bangkok 10160 Thailand
            </div>
          </header>
          <h1 className="mb-5 text-center text-[16pt] font-bold leading-7 text-foreground">{title || "ชื่อเอกสาร"}</h1>
          {!hideDocumentDate ? <p className="mb-7 text-right text-[12pt] text-foreground">วันที่ {displayThaiDate(documentDate) || "................................"}</p> : null}
          <div
            ref={editorRef}
            aria-label="เนื้อหาเอกสาร Agreement"
            aria-multiline="true"
            aria-readonly={readOnly}
            className="asset-docx-content min-h-[218mm] text-[16pt] leading-[1.45] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            contentEditable={!readOnly}
            role="textbox"
            suppressContentEditableWarning
            onInput={(event) => onBodyChange(event.currentTarget.innerHTML)}
            onPaste={pasteSanitized}
            spellCheck="true"
          />
        </article>
      </div>
    </section>
  );
}
