import { COMPANY_APPROVER_NAME, COMPANY_BORROW_AGREEMENT, COMPANY_HANDOVER_NAME } from "@/asset-borrowing/presets/companyAgreements";

const ASSET_FORM_ROWS = 10;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function thaiDate(value, options = { day: "numeric", month: "short", year: "numeric" }) {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat("th-TH", options).format(date) : "ไม่ระบุ";
}

function thaiFormalDate(value) {
  const date = parseDate(value);
  if (!date) return "ไม่ระบุ";
  const parts = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric" }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return `${day} เดือน ${month} พ.ศ. ${year}`;
}

function safeUrl(value) {
  let url = String(value || "").trim();
  const markdownLink = url.match(/^\[[^\]]*\]\((https?:\/\/[^\s)]+)\)$/i);
  if (markdownLink) url = markdownLink[1];
  if (!url || /^(?:javascript|vbscript):/i.test(url)) return "";
  if (/^data:/i.test(url) && !/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(url)) return "";
  return url;
}

export function sanitizeAgreementHtml(html) {
  if (typeof DOMParser === "undefined") {
    return String(html)
      .replace(/<\s*(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s+(href|src)\s*=\s*(["'])\s*(?:javascript|vbscript):[\s\S]*?\2/gi, "");
  }

  const parsed = new DOMParser().parseFromString(`<main>${String(html)}</main>`, "text/html");
  const container = parsed.querySelector("main");
  if (!container) return "";
  container.querySelectorAll("script, style, iframe, object, embed, form, [data-signature-block]").forEach((node) => node.remove());
  container.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        node.removeAttribute(attribute.name);
      } else if (name === "href" || name === "src") {
        const url = safeUrl(attribute.value);
        if (url) node.setAttribute(attribute.name, url);
        else node.removeAttribute(attribute.name);
      } else if (name === "style") {
        const style = attribute.value.split(";").map((rule) => rule.trim()).filter((rule) => {
          const [property, ...valueParts] = rule.split(":");
          const value = valueParts.join(":").trim();
          return /^(text-align|text-indent|margin-left|margin-right|font-size|font-family|font-weight|font-style|text-decoration|line-height)$/i.test(property?.trim() || "") &&
            value && !/(?:url\s*\(|expression\s*\(|javascript:|vbscript:)/i.test(value);
        }).join(";");
        if (style) node.setAttribute("style", style);
        else node.removeAttribute("style");
      }
    });
  });
  return container.innerHTML;
}

function fillAgreementBody(item) {
  const values = {
    "{{agreementDate}}": thaiFormalDate(item.agreement?.documentDate),
    "{{employeeName}}": item.employeeName,
    "{{employeeCode}}": item.employeeCode,
    "{{department}}": item.department || "-",
    "{{position}}": item.position || "-",
    "{{handoverName}}": COMPANY_HANDOVER_NAME,
    "{{approverName}}": COMPANY_APPROVER_NAME,
    "{{assetItems}}": (item.itemDetails || []).map((asset) => `${asset.name} × ${asset.quantity}${asset.note ? ` · ${asset.note}` : ""}`).join(", ") || "-",
    "{{fromDate}}": thaiDate(item.fromDate),
    "{{toDate}}": item.toDate ? thaiDate(item.toDate) : "ไม่ระบุวันสิ้นสุด",
    "{{reason}}": item.reason || "-",
    "{{remarks}}": item.remarks || "-",
  };
  const raw = String(item.agreement?.body || "");
  let body = /<[a-z][\s\S]*>/i.test(raw)
    ? raw
    : raw.split(/\n\s*\n/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  for (const [token, value] of Object.entries(values)) body = body.split(token).join(escapeHtml(value));
  const signatureLabels = {
    "{{signatureBorrower}}": "ผู้ยืม",
    "{{signatureHandover}}": "ผู้ส่งมอบ",
    "{{signatureApprover}}": "ผู้อนุมัติ",
  };
  for (const [token, label] of Object.entries(signatureLabels)) {
    body = body.split(token).join(`<span class="signature-placeholder"><span>(ลงชื่อ) .........................................</span><strong>${label}</strong></span>`);
  }

  const marker = "<!--AGREEMENT_PAGE_BREAK-->";
  const split = body.replace(/<hr\b[^>]*data-agreement-page-break[^>]*>/gi, marker).split(marker);
  if (split.length > 1) return split.slice(0, 2).map(sanitizeAgreementHtml);
  const clean = sanitizeAgreementHtml(body);
  const legacyBreak = clean.search(/<p\b[^>]*>\s*(?:<strong>)?2\.3\b/i);
  return legacyBreak > 0 ? [clean.slice(0, legacyBreak), clean.slice(legacyBreak)] : [clean, ""];
}

function publicAssetUrl(fileName, origin) {
  const base = String(origin || "").replace(/\/+$/, "");
  return `${base}/${fileName}`;
}

function companyHeader(origin) {
  return `<header class="form-header"><img alt="ตราบริษัท ต.จรัสชัย" src="${escapeHtml(publicAssetUrl("download.png", origin))}"><strong>T.Jaruschai International Construction Co.,Ltd.</strong><span>2043 Soi Kanchanaphisek 008, Bangkae, Bangkae Bangkok 10160 Thailand</span></header>`;
}

function agreementHeader(agreement, origin) {
  const raw = String(agreement?.header || "").trim();
  const isCompanyHeader = !raw || raw === COMPANY_BORROW_AGREEMENT.header;
  if (isCompanyHeader) {
    return `<header class="agreement-header"><img alt="ตราบริษัท ต.จรัสชัย" src="${escapeHtml(publicAssetUrl("download.png", origin))}"><strong>T.Jaruschai International Construction Co.,Ltd.</strong><span>2043 Soi Kanchanaphisek 008, Bangkae, Bangkae Bangkok 10160 Thailand</span></header>`;
  }
  return `<header class="agreement-header agreement-header-custom">${sanitizeAgreementHtml(raw)}</header>`;
}

function signatureBox(box, name, role, signatureKey = "signatureData", dateKey = "signedAt", useStoredRole = true) {
  if (!box) return `<div aria-hidden="true" class="asset-signature-empty"></div>`;
  const image = safeUrl(box?.[signatureKey]);
  const signerName = box?.name || name || ".........................................";
  const signerRole = useStoredRole ? box?.role || role : role;
  const signedAt = box?.[dateKey];
  return `<div class="fixed-signature"><div class="asset-signature-line-row"><span class="sign-label">ลงชื่อ</span><span class="signature-line">${image ? `<img src="${escapeHtml(image)}" alt="" aria-hidden="true">` : ""}</span></div><span class="signer-name">( ${escapeHtml(signerName)} )</span><strong>${escapeHtml(signerRole)}</strong><small>${signedAt ? `วันที่ ${escapeHtml(thaiFormalDate(signedAt))}` : "วันที่ .... เดือน ........ พ.ศ. ........"}</small></div>`;
}

function buildSignatureLayer(item) {
  const boxes = item.agreement?.signatureBoxes || [];
  return boxes.filter((box) => ["employee", "handover", "admin"].some((id) => box.id === id || box.id.startsWith(`${id}-`))).map((box) => {
    const employee = box.id === "employee" || box.id.startsWith("employee-");
    const handover = box.id === "handover" || box.id.startsWith("handover-");
    const fallbackName = employee ? item.employeeName : handover ? COMPANY_HANDOVER_NAME : COMPANY_APPROVER_NAME;
    const fallbackRole = employee ? "พนักงานผู้รับมอบ" : handover ? "ผู้ส่งมอบ" : "ผู้มีอำนาจอนุมัติ";
    const defaultX = handover ? 60 : 10;
    const isDefaultAdmin = box.id === "admin" && box.x === 10 && [72, 78, 84].includes(box.y);
    const x = isDefaultAdmin ? 60 : Number.isFinite(box.x) ? Math.min(64, box.x) : defaultX;
    const y = isDefaultAdmin ? 82 : Number.isFinite(box.y) ? Math.min(94, box.y) : 72;
    const returned = box.returnSignatureData
      ? `<div class="return-signature">${signatureBox(box, fallbackName, `${fallbackRole} · รับคืน`, "returnSignatureData", "returnSignedAt")}</div>`
      : "";
    return `<div class="agreement-signature" style="left:${x}%;top:${y}%">${signatureBox(box, fallbackName, fallbackRole)}${returned}</div>`;
  }).join("");
}

export function agreementDocumentHtml(item, origin = "") {
  const agreement = item.agreement;
  const boxes = agreement?.signatureBoxes || [];
  const employee = boxes.find((box) => box.id === "employee");
  const admin = boxes.find((box) => box.id === "admin");
  const borrowerSignature = employee?.signatureData || item.borrowerSignatureData || "";
  const approverSignature = admin?.signatureData || item.approvedBorrowSignatureData || "";
  const requestEmployee = {
    name: employee?.name || item.employeeName,
    signatureData: borrowerSignature,
    signedAt: borrowerSignature ? employee?.signedAt || item.formDate : null,
  };
  const requestApprover = {
    name: admin?.name || item.approvedBorrowBy || COMPANY_APPROVER_NAME,
    signatureData: approverSignature,
    signedAt: approverSignature ? admin?.signedAt || item.approvedBorrowDate : null,
  };
  const rows = Array.from({ length: ASSET_FORM_ROWS }, (_, index) => {
    const detail = item.itemDetails?.[index];
    return `<tr><td>${detail ? index + 1 : ""}</td><td>${escapeHtml(detail?.name || "")}</td><td>${detail ? escapeHtml(String(detail.quantity)) : ""}</td><td>${escapeHtml(detail?.note || "")}</td></tr>`;
  }).join("");
  const condition = agreement?.returnCondition;
  const conditionMark = (value) => condition === value ? "☑" : "□";
  const [agreementPageTwoWithDate, agreementPageThree] = agreement ? fillAgreementBody(item) : ["", ""];
  const agreementPageTwo = agreementPageTwoWithDate.replace(/<p\b[^>]*>\s*วันที่\s*[\s\S]*?<\/p>/i, "");
  const title = escapeHtml(String(agreement?.title || "").replace(/\s+และ/u, "\nและ")).replace(/\n/g, "<br>");
  const regularFont = escapeHtml(publicAssetUrl("THSarabunNew.ttf", origin));
  const boldFont = escapeHtml(publicAssetUrl("THSarabunNew-Bold.ttf", origin));
  const italicFont = escapeHtml(publicAssetUrl("THSarabunNew-Italic.ttf", origin));
  const boldItalicFont = escapeHtml(publicAssetUrl("THSarabunNew-BoldItalic.ttf", origin));
  const css = `@font-face{font-family:"TH Sarabun New";src:url("${regularFont}") format("truetype");font-style:normal;font-weight:400;font-display:swap}@font-face{font-family:"TH Sarabun New";src:url("${boldFont}") format("truetype");font-style:normal;font-weight:700;font-display:swap}@font-face{font-family:"TH Sarabun New";src:url("${italicFont}") format("truetype");font-style:italic;font-weight:400;font-display:swap}@font-face{font-family:"TH Sarabun New";src:url("${boldItalicFont}") format("truetype");font-style:italic;font-weight:700;font-display:swap}@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;width:210mm;background:#fff;color:#172033;font-family:"TH Sarabun New",serif;font-size:13pt;font-weight:400}.page{position:relative;width:210mm;height:297mm;margin:12px auto;background:#fff;page-break-after:always;break-after:page;overflow:hidden;box-shadow:0 2px 12px #0002}.page:last-child{page-break-after:auto;break-after:auto}.form-header,.agreement-header{position:absolute;inset:0 auto auto 0;width:100%;height:105pt}.form-header img,.agreement-header img{position:absolute;left:66pt;top:28.5pt;width:66pt;height:65.2pt;object-fit:contain}.form-header strong{position:absolute;left:292.7pt;top:54.2pt;width:238pt;text-align:left;font-size:16pt;line-height:18pt;font-weight:700}.agreement-header strong{position:absolute;left:292.7pt;top:49.7pt;width:238pt;text-align:left;font-size:16pt;line-height:18pt;font-weight:700}.form-header span{position:absolute;left:220.5pt;top:76.2pt;width:312pt;text-align:right;font-size:14pt;line-height:16pt}.agreement-header span{position:absolute;left:217.2pt;top:75.5pt;width:312pt;text-align:right;font-size:14pt;line-height:16pt}.request-title{position:absolute;left:66.8pt;top:121.5pt;width:462.4pt;margin:0;text-align:center;font-size:15pt;line-height:19pt;font-weight:400}.request-date{position:absolute;left:66.8pt;top:153.5pt;width:462.4pt;margin:0;text-align:right;font-size:12pt;line-height:16pt}.request-intro{position:absolute;left:66.8pt;top:178.8pt;width:462.4pt;margin:0;font-size:13pt;line-height:16.5pt}.items{position:absolute;left:66.8pt;top:219.7pt;width:462.4pt;height:217pt;border-collapse:collapse;table-layout:fixed;font-size:13pt;line-height:16pt}.items col:nth-child(1){width:56.5pt}.items col:nth-child(2){width:226pt}.items col:nth-child(3){width:65pt}.items col:nth-child(4){width:114.9pt}.items th,.items td{height:19.72pt;border:.6pt solid #222;padding:1pt 4pt;vertical-align:middle;font-weight:400}.items th{text-align:center;white-space:nowrap}.items td:nth-child(1),.items td:nth-child(3){text-align:center}.responsibility{position:absolute;left:66.8pt;top:442.8pt;width:462.4pt;margin:0;font-size:13pt;line-height:16pt}.request-signatures{position:absolute;left:66.8pt;top:504pt;width:462.4pt;height:78pt}.request-signatures>.fixed-signature{position:absolute;top:0;width:151pt}.request-signatures>.fixed-signature:first-child{left:22pt}.request-signatures>.fixed-signature:last-child{left:300pt}.fixed-signature{width:100%;height:100%;display:flex;flex-direction:column;align-items:stretch;text-align:center;font-size:12pt;line-height:14pt}.asset-signature-line-row{height:25pt;display:flex;align-items:flex-end;width:100%;padding:0 3pt}.sign-label{width:21pt;flex:none;text-align:left}.signature-line{position:relative;flex:1;height:20pt;display:flex;align-items:flex-end;justify-content:center;border-bottom:.6pt dotted #152033}.signature-line img{position:absolute;bottom:1pt;max-width:90%;max-height:27pt;object-fit:contain}.signer-name{margin-top:3pt;white-space:nowrap}.fixed-signature strong{font-weight:400}.fixed-signature small{font-size:12pt;line-height:14pt}.request-signatures .fixed-signature strong{margin-top:5pt}.request-signatures .fixed-signature small{margin-top:4pt}.company-return{position:absolute;left:66.4pt;top:604.1pt;width:462.7pt;height:198.8pt;border:1pt solid #222}.return-top{position:absolute;left:5.5pt;right:5.5pt;top:4pt;height:83.1pt;font-size:13pt;line-height:19pt}.return-top strong{display:block;text-decoration:underline;font-weight:400}.return-top p{margin:2pt 0}.return-top p:first-of-type{margin-top:0}.condition-row{display:flex;justify-content:flex-start;gap:23pt;height:19pt}.return-top .condition-row{margin-top:2.2pt}.return-note{white-space:nowrap;margin-top:-3.8pt}.return-divider{position:absolute;left:0;right:0;top:87.1pt;border-top:1pt solid #222}.return-signatures{position:absolute;left:14pt;right:14pt;top:110.2pt;height:82pt;display:grid;grid-template-columns:1fr 1fr;column-gap:35pt}.return-signatures .asset-signature-line-row{height:24pt}.return-signatures .signer-name{margin-top:6pt}.return-signatures strong{margin-top:6pt}.return-signatures small{margin-top:3pt}.return-signatures .signer-name,.return-signatures strong,.return-signatures small{line-height:14pt}.agreement-title{position:absolute;left:66.8pt;top:161pt;width:462.4pt;height:48pt;margin:0;text-align:center;font-size:16pt;line-height:22.8pt;font-weight:700}.agreement-title strong{font-weight:700}.agreement-date{position:absolute;left:66.8pt;top:240.3pt;width:462.4pt;margin:0;text-align:right;font-size:16pt;line-height:20pt}.agreement-body{position:absolute;left:66.8pt;top:281.8pt;width:462.4pt;height:534.2pt;overflow:hidden;font-size:16pt;line-height:1.45;font-weight:400;overflow-wrap:anywhere}.agreement-page-three .agreement-body{top:123.2pt;height:504.3pt;line-height:22.5pt}.agreement-body p{margin:0 0 6pt}.agreement-page-two .agreement-body p{margin-bottom:5.3pt}.agreement-page-three .agreement-body p{margin-bottom:6.6pt}.agreement-page-three .agreement-body p:first-child{line-height:23.2pt}.agreement-body h2,.agreement-body h3{margin:10pt 0 5pt}.agreement-body img{max-width:100%;height:auto}.agreement-body table{border-collapse:collapse;max-width:100%}.agreement-body td,.agreement-body th{border:1px solid #777;padding:4pt}.agreement-body ul,.agreement-body ol{padding-left:22pt}.agreement-body hr{display:none}.signature-placeholder{display:inline-flex;flex-direction:column;align-items:center;min-width:60mm;margin:8pt}.signature-placeholder strong{font-weight:400}.agreement-signature-layer{position:absolute;inset:0;pointer-events:none}.agreement-signature{position:absolute;width:34%;text-align:center;font-size:16pt;line-height:18pt;transform:translateY(-.7pt)}.agreement-signature .fixed-signature{height:112pt;font-size:16pt;line-height:18pt}.agreement-signature .asset-signature-line-row{height:46pt;padding-left:21.7pt;padding-right:3pt;flex:none}.agreement-signature .signer-name{margin-top:2pt}.agreement-signature .fixed-signature strong{margin-top:.4pt;font-weight:700}.agreement-signature .fixed-signature small{margin-top:.9pt;font-size:16pt;line-height:18pt}.agreement-signature .signature-line{height:20pt}.document-footer{position:absolute;left:66.8pt;right:66.8pt;bottom:24pt;font-size:10pt}@media print{html,body{width:auto;background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}.page{margin:0;box-shadow:none}}`;
  const customHeaderCss = `.agreement-header-custom{left:66.8pt;top:24pt;width:462.4pt;height:88pt;display:flex;align-items:center;justify-content:space-between;gap:16pt;padding:8pt 0}.agreement-header-custom img{position:static;flex:0 0 60pt;width:60pt;height:60pt}.agreement-header-custom p{position:static;flex:1;margin:0;text-align:right;font-size:12pt;line-height:15pt}.agreement-header-custom p strong{position:static;display:block;width:auto;font-size:15pt;line-height:18pt}.agreement-header-custom span{position:static;width:auto}`;
  const base = origin ? `<base href="${escapeHtml(`${String(origin).replace(/\/+$/, "")}/`)}">` : "";
  const formHeader = companyHeader(origin);
  const contractHeader = agreement ? agreementHeader(agreement, origin) : "";
  const agreementDate = agreement ? `<p class="agreement-date">วันที่ ${escapeHtml(thaiFormalDate(agreement.documentDate))}</p>` : "";
  const agreementPages = agreement ? `
    <section class="page agreement-page-two">${contractHeader}<h1 class="agreement-title">${title}</h1>${agreementDate}<main class="agreement-body">${agreementPageTwo || "<p></p>"}</main></section>
    <section class="page agreement-page-three">${contractHeader}<main class="agreement-body">${agreementPageThree || "<p></p>"}</main><div class="agreement-signature-layer">${buildSignatureLayer(item)}</div>${agreement.footer ? `<footer class="document-footer">${sanitizeAgreementHtml(agreement.footer)}</footer>` : ""}</section>` : "";
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">${base}<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(agreement?.title || "แบบฟอร์มการขอยืมทรัพย์สิน")}</title><style>${css}</style><style>${customHeaderCss}</style></head><body>
    <section class="page request-page">${formHeader}<h1 class="request-title">แบบฟอร์มการขอยืมทรัพย์สิน/วัสดุ ของบริษัท</h1><p class="request-date">วันที่ ${escapeHtml(thaiFormalDate(item.formDate))}</p><p class="request-intro">ข้าพเจ้า <strong>นาย ${escapeHtml(item.employeeName)}</strong> ตำแหน่ง <strong>${escapeHtml(item.position || "-")}</strong> รหัสพนักงาน <strong>${escapeHtml(item.employeeCode)}</strong> มีความประสงค์ จะขอยืมทรัพย์สิน/วัสดุของบริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด เพื่อนำไปใช้ <strong>ตั้งแต่วันที่ ${escapeHtml(thaiDate(item.fromDate))}${item.toDate ? ` ถึง ${escapeHtml(thaiDate(item.toDate))}` : " เป็นต้นไป"}</strong> ตามรายการดังนี้</p><table class="items"><colgroup><col><col><col><col></colgroup><thead><tr><th>ลำดับ</th><th>รายการทรัพย์สิน/วัสดุ</th><th>จำนวน</th><th>หมายเหตุ</th></tr></thead><tbody>${rows}</tbody></table><p class="responsibility">รวมทั้งสิ้น <strong>${item.itemDetails?.filter((detail) => detail.name.trim()).length || 0}</strong> รายการ โดยหากมีความเสียหายใด ๆ หรือมีการสูญหายเกิดขึ้น ข้าพเจ้าจะขอรับผิดชอบทั้งหมดทุกกรณีโดยไม่มีเงื่อนไข โดยจัดทำการซ่อมแซมให้ใช้การได้ดังเดิมหรือจัดหาทดแทนให้ครบตามจำนวนที่ยืม</p><div class="request-signatures">${signatureBox(requestEmployee, item.employeeName, "ผู้ยืม", "signatureData", "signedAt", false)}${signatureBox(requestApprover, COMPANY_APPROVER_NAME, "ผู้อนุมัติ", "signatureData", "signedAt", false)}</div><section class="company-return"><div class="return-top"><strong>สำหรับบริษัท</strong><p>ข้าพเจ้าได้รับทรัพย์สิน/วัสดุ/อุปกรณ์ ที่ได้ทำการยืม</p><div class="condition-row"><span>${conditionMark("original")} อยู่ในสภาพเดิม</span><span>${conditionMark("damaged")} ชำรุด</span><span>${conditionMark("lost")} สูญหาย</span></div><div class="return-note">หมายเหตุ ........................................................................................................................................</div></div><div class="return-divider"></div><div class="return-signatures">${signatureBox(employee, item.employeeName, "ผู้ยืม", "returnSignatureData", "returnSignedAt", false)}${signatureBox(admin, COMPANY_APPROVER_NAME, "ผู้อนุมัติ", "returnSignatureData", "returnSignedAt", false)}</div></section></section>
    ${agreementPages}
  </body></html>`;
}

function waitForImage(image) {
  if (image.complete) return image.decode?.().catch(() => undefined) || Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", resolve, { once: true });
  });
}

async function waitForAgreementFonts(document) {
  const fontLoadError = () => Object.assign(new Error("Agreement fonts failed to load"), { name: "AgreementFontLoadError" });
  if (!document.fonts) throw fontLoadError();

  const fonts = [
    '400 13pt "TH Sarabun New"',
    '700 16pt "TH Sarabun New"',
    'italic 400 16pt "TH Sarabun New"',
    'italic 700 16pt "TH Sarabun New"',
  ];
  const loadedFaces = await Promise.all(fonts.map((font) => document.fonts.load(font, "ภาษาไทย")));
  if (loadedFaces.some((faces) => !faces.length || faces.some((face) => face.status !== "loaded"))) {
    throw fontLoadError();
  }

  await document.fonts.ready;
}

export async function downloadAgreementDocument(item) {
  if (typeof window === "undefined") return false;

  const frame = document.createElement("iframe");
  frame.title = "ตัวสร้างไฟล์ PDF แบบฟอร์มยืม";
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "210mm",
    height: "297mm",
    border: "0",
    pointerEvents: "none",
  });

  try {
    const frameReady = new Promise((resolve, reject) => {
      frame.addEventListener("load", resolve, { once: true });
      frame.addEventListener("error", reject, { once: true });
    });
    frame.srcdoc = agreementDocumentHtml(item, window.location.origin);
    document.body.append(frame);
    await frameReady;

    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error("Agreement document could not be loaded");

    const pdfStyles = frameDocument.createElement("style");
    pdfStyles.textContent = `html,body{width:210mm!important;margin:0!important}.page{margin:0!important;box-shadow:none!important}`;
    frameDocument.head.append(pdfStyles);

    await Promise.all([
      // html2canvas creates its render canvas in the parent document.
      waitForAgreementFonts(document),
      waitForAgreementFonts(frameDocument),
      ...Array.from(frameDocument.images, waitForImage),
    ]);

    const itemTable = frameDocument.querySelector(".items");
    const requestPage = itemTable?.closest(".page");
    const tableTextCells = [];
    if (itemTable && requestPage) {
      const pageBounds = requestPage.getBoundingClientRect();
      Array.from(itemTable.rows).forEach((row) => {
        Array.from(row.cells).forEach((cell) => {
          const cellBounds = cell.getBoundingClientRect();
          const cellStyle = frame.contentWindow.getComputedStyle(cell);
          tableTextCells.push({
            text: cell.textContent || "",
            left: cellBounds.left - pageBounds.left,
            top: cellBounds.top - pageBounds.top,
            width: cellBounds.width,
            height: cellBounds.height,
            paddingLeft: Number.parseFloat(cellStyle.paddingLeft),
            paddingRight: Number.parseFloat(cellStyle.paddingRight),
            borderLeft: Number.parseFloat(cellStyle.borderLeftWidth),
            borderRight: Number.parseFloat(cellStyle.borderRightWidth),
            borderTop: Number.parseFloat(cellStyle.borderTopWidth),
            borderBottom: Number.parseFloat(cellStyle.borderBottomWidth),
            fontFamily: cellStyle.fontFamily,
            fontSize: cellStyle.fontSize,
            fontWeight: cellStyle.fontWeight,
            color: cellStyle.color,
          });
        });
      });
    }

    if (tableTextCells.length) {
      const hideCellText = frameDocument.createElement("style");
      hideCellText.textContent = ".items th,.items td{color:transparent!important}";
      frameDocument.head.append(hideCellText);
    }

    const filenameParts = [item.employeeCode, item.agreement?.documentDate || item.formDate]
      .filter(Boolean)
      .map((value) => String(value).slice(0, 10).replace(/[^\w-]/g, ""));
    const filename = `agreement-${filenameParts.join("-") || item.id}.pdf`;
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const pages = Array.from(frameDocument.querySelectorAll(".page"));
    if (!pages.length) throw new Error("Agreement pages were not found");

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    for (const [index, page] of pages.entries()) {
      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        width: page.offsetWidth,
        height: page.offsetHeight,
        windowWidth: frame.contentWindow?.innerWidth || page.offsetWidth,
        windowHeight: frame.contentWindow?.innerHeight || page.offsetHeight,
        scrollX: 0,
        scrollY: 0,
      });

      if (page === requestPage && tableTextCells.length) {
        const textCanvas = frameDocument.createElement("canvas");
        textCanvas.width = canvas.width;
        textCanvas.height = canvas.height;
        const context = textCanvas.getContext("2d");
        const outputContext = canvas.getContext("2d");
        if (!context || !outputContext) throw new Error("Unable to align Agreement table text");

        const scaleX = canvas.width / page.offsetWidth;
        const scaleY = canvas.height / page.offsetHeight;
        context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
        context.textBaseline = "middle";
        for (const cell of tableTextCells) {
          if (!cell.text) continue;
          const contentLeft = cell.left + cell.borderLeft + cell.paddingLeft;
          const contentTop = cell.top + cell.borderTop;
          const contentWidth = cell.width - cell.borderLeft - cell.borderRight - cell.paddingLeft - cell.paddingRight;
          const contentHeight = cell.height - cell.borderTop - cell.borderBottom;
          context.save();
          context.beginPath();
          context.rect(contentLeft, contentTop, contentWidth, contentHeight);
          context.clip();
          context.font = `${cell.fontWeight} ${cell.fontSize} ${cell.fontFamily}`;
          context.fillStyle = cell.color;
          context.textAlign = "center";
          context.fillText(cell.text, contentLeft + contentWidth / 2, cell.top + cell.height / 2, contentWidth);
          context.restore();
        }
        outputContext.setTransform(1, 0, 0, 1, 0, 0);
        outputContext.drawImage(textCanvas, 0, 0);
      }

      if (index > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, 210, 297, undefined, "FAST");
    }

    pdf.save(filename);

    return true;
  } finally {
    frame.remove();
  }
}
