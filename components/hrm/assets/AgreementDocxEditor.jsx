"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  RiAlignCenter,
  RiAlignJustify,
  RiAlignLeft,
  RiAlignRight,
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiBold,
  RiCodeLine,
  RiFormatClear,
  RiFontColor,
  RiEyeLine,
  RiImageAddLine,
  RiItalic,
  RiLink,
  RiListCheck,
  RiListOrdered,
  RiListUnordered,
  RiMarkPenLine,
  RiPageSeparator,
  RiStrikethrough,
  RiTable2,
  RiTextSpacing,
  RiUnderline,
  RiZoomInLine,
  RiZoomOutLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { agreementDocumentHtml, sanitizeAgreementHtml } from "@/components/hrm/assets/agreementPrint";
import { uploadImage } from "@/lib/client/upload-image";

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
const signatureFieldTokens = {
  "{{signatureBorrower}}": { label: "ผู้ยืมลงชื่อ", x: 10, y: 72 },
  "{{signatureHandover}}": { label: "ผู้ส่งมอบลงชื่อ", x: 60, y: 72 },
  "{{signatureApprover}}": { label: "ผู้อนุมัติลงชื่อ", x: 60, y: 82 },
};

const pageBreakMarkup = '<hr data-agreement-page-break="true">';
const fontSizeCommands = { 8: "1", 10: "2", 12: "3", 14: "4", 16: "5", 18: "6", 24: "7" };
const legacyFontSizes = { 1: "8pt", 2: "10pt", 3: "12pt", 4: "14pt", 5: "16pt", 6: "18pt", 7: "24pt" };

function splitPageContent(html) {
  return String(html ?? "").split(/<hr\b[^>]*data-agreement-page-break[^>]*>/gi);
}

function splitInitialPages(html) {
  const body = String(html ?? "");
  const pages = splitPageContent(body);
  if (pages.length > 1) return pages;
  const legacyBreak = body.search(/<p\b[^>]*>\s*(?:<strong>)?2\.3\b/i);
  return legacyBreak > 0 ? [body.slice(0, legacyBreak), body.slice(legacyBreak)] : pages;
}

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
  const parts = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric" })
    .formatToParts(new Date(year, month - 1, day));
  const part = (type) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("day")} เดือน ${part("month")} พ.ศ. ${part("year")}`;
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
  hideDocumentDateInput = false,
  readOnly = false,
  previewItem = null,
}) {
  const titleEditorRef = useRef(null);
  const dateId = useId();
  const [zoom, setZoom] = useState(100);
  const [fontFamily, setFontFamily] = useState("TH Sarabun New");
  const [fontSize, setFontSize] = useState("16");
  const [lineHeight, setLineHeight] = useState("1.45");
  const [heading, setHeading] = useState("p");
  const [textColor, setTextColor] = useState("#172033");
  const [fieldSelectKey, setFieldSelectKey] = useState(0);
  const [toolbarError, setToolbarError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const imageInputRef = useRef(null);
  const savedSelection = useRef(null);
  const signatureFieldDrag = useRef(null);
  const initialPages = useRef(null);
  if (!initialPages.current) initialPages.current = splitInitialPages(body);
  const [pageIds, setPageIds] = useState(() => initialPages.current.map((_, index) => index));
  const pageIdsRef = useRef(pageIds);
  const manualPageIds = useRef(new Set(pageIds.slice(1)));
  const pageHtmlRef = useRef(null);
  if (!pageHtmlRef.current) pageHtmlRef.current = new Map(pageIds.map((id, index) => [id, sanitizeAgreementHtml(initialPages.current[index])]));
  const initializedPageIds = useRef(null);
  if (!initializedPageIds.current) initializedPageIds.current = new Set();
  const pageEditorRefs = useRef(null);
  if (!pageEditorRefs.current) pageEditorRefs.current = new Map();
  const pageEditorCallbacks = useRef(null);
  if (!pageEditorCallbacks.current) pageEditorCallbacks.current = new Map();
  const activePageId = useRef(pageIds[0]);
  const nextPageId = useRef(pageIds.length);
  const pendingPageFocusId = useRef(null);
  const pendingPageFocusAtEnd = useRef(false);
  const normalizedRequestId = useRef(null);
  const showDocumentDateInput = !hideDocumentDate && !hideDocumentDateInput;

  useEffect(() => {
    if (titleEditorRef.current) titleEditorRef.current.innerText = title;
  }, [requestId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let changed = false;
      const firstId = pageIdsRef.current[0];
      const firstEditor = pageEditorRefs.current.get(firstId);
      const normalizeInitialPages = normalizedRequestId.current !== requestId;
      normalizedRequestId.current = requestId;
      const nextId = pageIdsRef.current[1];
      if (firstEditor && nextId !== undefined && isPageEmpty(firstEditor)
        && (normalizeInitialPages || !manualPageIds.current.has(nextId))
        && pullPageContentForward(firstId, firstEditor)) changed = true;
      for (const id of pageIdsRef.current) {
        const editor = pageEditorRefs.current.get(id);
        if (editor && moveOverflowForward(id, editor, pendingPageFocusAtEnd.current)) changed = true;
      }
      if (changed) onBodyChange(serializePages());

      const id = pendingPageFocusId.current;
      if (id === null) return;
      const editor = pageEditorRefs.current.get(id);
      if (!editor) return;
      const focusAtEnd = pendingPageFocusAtEnd.current;
      placeCaret(editor, id, focusAtEnd ? editor.lastChild : editor.firstChild, focusAtEnd);
      pendingPageFocusAtEnd.current = false;
      pendingPageFocusId.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [pageIds, onBodyChange]);

  function bindPageEditor(id) {
    if (pageEditorCallbacks.current.has(id)) return pageEditorCallbacks.current.get(id);
    const callback = (editor) => {
      if (!editor) {
        pageEditorRefs.current.delete(id);
        return;
      }
      pageEditorRefs.current.set(id, editor);
      if (initializedPageIds.current.has(id)) return;
      editor.innerHTML = sanitizeAgreementHtml(pageHtmlRef.current.get(id) || "");
      initializedPageIds.current.add(id);
    };
    pageEditorCallbacks.current.set(id, callback);
    return callback;
  }

  function serializePages(ids = pageIdsRef.current) {
    return ids.map((id) => pageHtmlRef.current.get(id) || "").join(pageBreakMarkup);
  }

  function placeCaret(editor, id, target, atEnd) {
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(target || editor);
    range.collapse(!atEnd);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    activePageId.current = id;
    savedSelection.current = { id, range: range.cloneRange() };
  }

  function isAtEditorStart(editor, range) {
    if (!range?.collapsed || !editor.contains(range.startContainer)) return false;
    const beforeCaret = document.createRange();
    beforeCaret.selectNodeContents(editor);
    beforeCaret.setEnd(range.startContainer, range.startOffset);
    const contentBeforeCaret = beforeCaret.cloneContents();
    return !contentBeforeCaret.textContent && !contentBeforeCaret.querySelector("br,hr,img,video,audio,iframe,svg,canvas");
  }

  function isPageEmpty(editor) {
    return !editor.textContent?.trim() && !editor.querySelector("img,table,hr,ul,ol,video,audio,iframe,svg,canvas,[data-agreement-signature-field]");
  }

  function editorNodeBounds(node) {
    if (node.nodeType === Node.ELEMENT_NODE) return node.getBoundingClientRect();
    const range = document.createRange();
    range.selectNode(node);
    return range.getBoundingClientRect();
  }

  function hasEditorOverflow(editor) {
    const bottom = editor.getBoundingClientRect().bottom;
    return Array.from(editor.childNodes).some((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute("data-agreement-signature-field")) return false;
      return editorNodeBounds(node).bottom > bottom + 1;
    });
  }

  function removePage(id) {
    const nextIds = pageIdsRef.current.filter((pageId) => pageId !== id);
    if (nextIds.length === pageIdsRef.current.length || !nextIds.length) return false;
    pageIdsRef.current = nextIds;
    pageHtmlRef.current.delete(id);
    manualPageIds.current.delete(id);
    initializedPageIds.current.delete(id);
    pageEditorRefs.current.delete(id);
    pageEditorCallbacks.current.delete(id);
    setPageIds(nextIds);
    return true;
  }

  function pullPageContentForward(id, editor) {
    if (hasEditorOverflow(editor)) return false;
    let changed = false;
    let pageIndex = pageIdsRef.current.indexOf(id);
    let nextId = pageIdsRef.current[pageIndex + 1];
    const pullAcrossManualBreak = isPageEmpty(editor);
    while (nextId !== undefined && (!manualPageIds.current.has(nextId) || pullAcrossManualBreak)) {
      const nextEditor = pageEditorRefs.current.get(nextId);
      if (!nextEditor) break;
      if (isPageEmpty(nextEditor)) {
        removePage(nextId);
        changed = true;
        pageIndex = pageIdsRef.current.indexOf(id);
        nextId = pageIdsRef.current[pageIndex + 1];
        continue;
      }

      while (nextEditor.firstChild) {
        const node = nextEditor.firstChild;
        editor.appendChild(node);
        if (hasEditorOverflow(editor)) {
          nextEditor.insertBefore(node, nextEditor.firstChild);
          break;
        }
        changed = true;
      }
      pageHtmlRef.current.set(id, editor.innerHTML);
      pageHtmlRef.current.set(nextId, nextEditor.innerHTML);
      if (!isPageEmpty(nextEditor)) break;
      removePage(nextId);
      pageIndex = pageIdsRef.current.indexOf(id);
      nextId = pageIdsRef.current[pageIndex + 1];
    }
    return changed;
  }

  function mergePageBackward(id, editor) {
    const currentIds = pageIdsRef.current;
    const pageIndex = currentIds.indexOf(id);
    const previousId = currentIds[pageIndex - 1];
    const previousEditor = pageEditorRefs.current.get(previousId);
    if (pageIndex <= 0 || !previousEditor) return false;

    const previousLastChild = previousEditor.lastChild;
    while (editor.firstChild) previousEditor.appendChild(editor.firstChild);
    pageHtmlRef.current.set(previousId, previousEditor.innerHTML);
    removePage(id);
    placeCaret(previousEditor, previousId, previousLastChild || previousEditor.firstChild, Boolean(previousLastChild));
    moveOverflowForward(previousId, previousEditor, false);
    onBodyChange(serializePages());
    return true;
  }

  function handleBackspace(event, id) {
    if (readOnly || event.key !== "Backspace") return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !isAtEditorStart(event.currentTarget, selection.getRangeAt(0))) return;
    if (mergePageBackward(id, event.currentTarget)) event.preventDefault();
  }

  function rememberEditorSelection() {
    const id = activePageId.current;
    if (id === null) return;
    const editor = pageEditorRefs.current.get(id);
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.startContainer) && editor.contains(range.endContainer)) {
      savedSelection.current = { id, range: range.cloneRange() };
    }
  }

  function restoreEditorSelection(editor, id) {
    editor.focus();
    const saved = savedSelection.current;
    if (!saved || saved.id !== id || !editor.contains(saved.range.startContainer) || !editor.contains(saved.range.endContainer)) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(saved.range);
  }

  function preserveEditorSelection(event) {
    rememberEditorSelection();
    event.preventDefault();
  }

  function normalizeFontMarkup(editor) {
    editor.querySelectorAll("font").forEach((font) => {
      const span = document.createElement("span");
      const legacySize = font.getAttribute("size");
      const family = font.getAttribute("face");
      if (legacySize && legacyFontSizes[legacySize]) span.style.fontSize = legacyFontSizes[legacySize];
      if (family) span.style.fontFamily = family;
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    });
  }

  function moveOverflowForward(id, editor, focusOnNewPage = true) {
    if (!hasEditorOverflow(editor)) return false;
    const editorBottom = editor.getBoundingClientRect().bottom;
    const children = Array.from(editor.childNodes);
    if (!children.length) return false;
    const overflowIndex = children.findIndex((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute("data-agreement-signature-field")) return false;
      return editorNodeBounds(node).bottom > editorBottom + 1;
    });
    if (overflowIndex < 0) return false;
    const firstMovingIndex = overflowIndex;
    const firstMovingNode = children[firstMovingIndex];
    const firstMovingRect = editorNodeBounds(firstMovingNode);
    if (firstMovingRect.height > editor.clientHeight) return false;

    const selection = window.getSelection();
    const caretRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const movedCount = children.length - firstMovingIndex;
    const caretAtMovedRoot = caretRange?.startContainer === editor && caretRange.startOffset >= firstMovingIndex;
    const currentIds = pageIdsRef.current;
    const pageIndex = currentIds.indexOf(id);
    const nextId = currentIds[pageIndex + 1];
    const fragment = document.createDocumentFragment();
    for (let node = firstMovingNode; node;) {
      const next = node.nextSibling;
      fragment.appendChild(node);
      node = next;
    }
    pageHtmlRef.current.set(id, editor.innerHTML);

    if (nextId !== undefined) {
      const nextEditor = pageEditorRefs.current.get(nextId);
      if (nextEditor) {
        nextEditor.insertBefore(fragment, nextEditor.firstChild);
        pageHtmlRef.current.set(nextId, nextEditor.innerHTML);
        if (caretRange && nextEditor.contains(caretRange.startContainer) && nextEditor.contains(caretRange.endContainer)) {
          nextEditor.focus();
          selection?.removeAllRanges();
          selection?.addRange(caretRange);
          activePageId.current = nextId;
          savedSelection.current = { id: nextId, range: caretRange.cloneRange() };
        } else if (caretAtMovedRoot) {
          const movedRange = document.createRange();
          const lastMoved = nextEditor.childNodes[Math.min(movedCount, nextEditor.childNodes.length) - 1];
          movedRange.selectNodeContents(lastMoved || nextEditor);
          movedRange.collapse(true);
          nextEditor.focus();
          selection?.removeAllRanges();
          selection?.addRange(movedRange);
          activePageId.current = nextId;
          savedSelection.current = { id: nextId, range: movedRange.cloneRange() };
        }
        moveOverflowForward(nextId, nextEditor, focusOnNewPage);
      } else {
        const wrapper = document.createElement("div");
        wrapper.appendChild(fragment);
        pageHtmlRef.current.set(nextId, `${wrapper.innerHTML}${pageHtmlRef.current.get(nextId) || ""}`);
      }
      return true;
    }

    const nextPageIdValue = nextPageId.current++;
    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment);
    pageHtmlRef.current.set(nextPageIdValue, wrapper.innerHTML);
    const nextIds = [...currentIds, nextPageIdValue];
    pageIdsRef.current = nextIds;
    if (focusOnNewPage && (pendingPageFocusId.current === null || pendingPageFocusAtEnd.current)) {
      pendingPageFocusId.current = nextPageIdValue;
      pendingPageFocusAtEnd.current = true;
    }
    setPageIds(nextIds);
    return true;
  }

  function persistPage(id, editor, inputType = "") {
    const currentIds = pageIdsRef.current;
    const pageIndex = currentIds.indexOf(id);
    if (pageIndex < 0) return;
    let pageRemoved = false;

    const pageParts = splitPageContent(editor.innerHTML);
    if (pageParts.length > 1) {
      pageHtmlRef.current.set(id, pageParts[0]);
      editor.innerHTML = pageParts[0];
      const addedIds = pageParts.slice(1).map(() => nextPageId.current++);
      pageParts.slice(1).forEach((html, index) => {
        pageHtmlRef.current.set(addedIds[index], html);
        manualPageIds.current.add(addedIds[index]);
      });
      const nextIds = [...currentIds.slice(0, pageIndex + 1), ...addedIds, ...currentIds.slice(pageIndex + 1)];
      pageIdsRef.current = nextIds;
      pendingPageFocusId.current = addedIds[0];
      pendingPageFocusAtEnd.current = false;
      setPageIds(nextIds);
    } else {
      pageHtmlRef.current.set(id, editor.innerHTML);
    }

    if (inputType.startsWith("delete")) {
      const currentIndex = pageIdsRef.current.indexOf(id);
      if (currentIndex > 0 && isPageEmpty(editor)) {
        const previousId = pageIdsRef.current[currentIndex - 1];
        const previousEditor = pageEditorRefs.current.get(previousId);
        if (previousEditor) {
          pageRemoved = removePage(id);
          placeCaret(previousEditor, previousId, previousEditor.lastChild || previousEditor, true);
          pullPageContentForward(previousId, previousEditor);
        }
      } else {
        pullPageContentForward(id, editor);
      }
    }
    if (!pageRemoved) moveOverflowForward(id, editor);
    onBodyChange(serializePages());
  }

  function getActiveEditor() {
    const id = activePageId.current;
    if (id === null) return null;
    return [pageEditorRefs.current.get(id), pageEditorRefs.current.get(pageIdsRef.current[0])].find(Boolean);
  }

  function runCommand(command, value) {
    const editor = getActiveEditor();
    if (!editor) return;
    activePageId.current = Number(editor.dataset.pageId);
    restoreEditorSelection(editor, activePageId.current);
    document.execCommand(command, false, value);
    normalizeFontMarkup(editor);
    persistPage(activePageId.current, editor);
  }

  function applyFontSize(size) {
    const editor = getActiveEditor();
    if (!editor) return;
    const pageId = Number(editor.dataset.pageId);
    restoreEditorSelection(editor, pageId);
    document.execCommand("fontSize", false, fontSizeCommands[size] || "5");
    editor.querySelectorAll("font[size]").forEach((font) => {
      const legacySize = font.getAttribute("size");
      const span = document.createElement("span");
      span.style.fontSize = legacyFontSizes[legacySize] || `${size}pt`;
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    });
    setFontSize(String(size));
    persistPage(pageId, editor);
  }

  function applyLineHeight(value) {
    const editor = getActiveEditor();
    if (!editor) return;
    const pageId = Number(editor.dataset.pageId);
    restoreEditorSelection(editor, pageId);
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const block = element?.closest("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div");
    if (!block || !editor.contains(block)) return;
    block.style.lineHeight = value;
    setLineHeight(value);
    persistPage(pageId, editor);
  }

  function insertMarkup(markup) {
    const editor = getActiveEditor();
    if (!editor) return;
    activePageId.current = Number(editor.dataset.pageId);
    restoreEditorSelection(editor, activePageId.current);
    document.execCommand("insertHTML", false, markup);
    persistPage(activePageId.current, editor);
  }

  function insertSignatureField(token) {
    const config = signatureFieldTokens[token];
    const editor = getActiveEditor();
    if (!config || !editor) return;
    const pageId = Number(editor.dataset.pageId);
    activePageId.current = pageId;
    restoreEditorSelection(editor, pageId);
    const selection = window.getSelection();
    if (!selection) return;
    let range = selection.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    range.deleteContents();
    const field = document.createElement("span");
    field.className = "asset-docx-signature-field";
    field.setAttribute("data-agreement-signature-field", token.slice(2, -2));
    field.setAttribute("data-label", config.label);
    field.setAttribute("data-x", String(config.x));
    field.setAttribute("data-y", String(config.y));
    field.contentEditable = "false";
    field.tabIndex = 0;
    field.setAttribute("aria-label", `${config.label} กล่องข้อความ ลากเพื่อย้ายตำแหน่ง`);
    field.style.cssText = `position:absolute;left:${config.x}%;top:${config.y}%;width:34%`;
    range.insertNode(field);
    range.setStartAfter(field);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    savedSelection.current = { id: pageId, range: range.cloneRange() };
    persistPage(pageId, editor);
  }

  function moveSignatureField(field, page, x, y) {
    const pageBounds = page.getBoundingClientRect();
    const fieldBounds = field.getBoundingClientRect();
    const maxX = Math.max(0, 100 - (fieldBounds.width / pageBounds.width) * 100);
    const signatureOffset = (16 / 841.89) * pageBounds.height;
    const maxY = Math.max(0, 100 - ((fieldBounds.height + signatureOffset) / pageBounds.height) * 100);
    const nextX = Math.max(0, Math.min(maxX, x));
    const nextY = Math.max(0, Math.min(maxY, y));
    field.dataset.x = nextX.toFixed(2);
    field.dataset.y = nextY.toFixed(2);
    field.style.left = `${field.dataset.x}%`;
    field.style.top = `${field.dataset.y}%`;
  }

  function startSignatureFieldDrag(event, id) {
    if (readOnly || !(event.target instanceof Element)) return;
    const field = event.target.closest("[data-agreement-signature-field]");
    const page = field?.closest(".asset-docx-page");
    if (!field || !page) return;
    event.preventDefault();
    field.focus({ preventScroll: true });
    const bounds = field.getBoundingClientRect();
    signatureFieldDrag.current = {
      editor: event.currentTarget,
      field,
      id,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      page,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSignatureFieldDrag(event) {
    const drag = signatureFieldDrag.current;
    if (!drag) return;
    const bounds = drag.page.getBoundingClientRect();
    const signatureOffset = (16 / 841.89) * bounds.height;
    const x = ((event.clientX - drag.offsetX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - drag.offsetY - bounds.top - signatureOffset) / bounds.height) * 100;
    moveSignatureField(drag.field, drag.page, x, y);
  }

  function finishSignatureFieldDrag(event) {
    const drag = signatureFieldDrag.current;
    if (!drag) return;
    signatureFieldDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    persistPage(drag.id, drag.editor);
  }

  function handleEditorKeyDown(event, id) {
    if (event.target instanceof Element) {
      const field = event.target.closest("[data-agreement-signature-field]");
      if (field && !readOnly) {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          const page = field.closest(".asset-docx-page");
          if (!page) return;
          const x = Number(field.dataset.x) || 0;
          const y = Number(field.dataset.y) || 0;
          const step = event.shiftKey ? 5 : 1;
          moveSignatureField(
            field,
            page,
            x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
            y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
          );
          persistPage(id, event.currentTarget);
        } else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          field.remove();
          persistPage(id, event.currentTarget);
        }
        return;
      }
    }
    handleBackspace(event, id);
  }

  function pasteSanitized(event, id) {
    const editor = event.currentTarget;
    event.preventDefault();
    const clipboard = event.clipboardData;
    const html = clipboard.getData("text/html");
    const text = clipboard.getData("text/plain");
    const markup = sanitizeAgreementHtml(html || `<p>${escapeText(text).replace(/\r?\n/g, "<br>")}</p>`);
    document.execCommand("insertHTML", false, markup);
    persistPage(id, editor);
  }

  function pasteTitleText(event) {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    onTitleChange(event.currentTarget.innerText.replace(/\r/g, ""));
  }

  function insertLink() {
    const value = window.prompt("URL ของลิงก์");
    if (!value?.trim()) return;
    try {
      const url = new URL(value.trim(), window.location.origin);
      if (!["http:", "https:", "mailto:"].includes(url.protocol)) throw new Error("invalid protocol");
      runCommand("createLink", url.href);
      setToolbarError("");
    } catch {
      setToolbarError("ลิงก์ต้องเป็น URL ของเว็บหรืออีเมล");
    }
  }

  async function insertImage(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    const maxInputBytes = file.type === "image/gif" ? 1 * 1024 * 1024 : 15 * 1024 * 1024;
    if (!allowedTypes.includes(file.type) || file.size > maxInputBytes) {
      setToolbarError(
        file.type === "image/gif"
          ? "รูป GIF ต้องมีขนาดไม่เกิน 1 MB"
          : "เลือกรูป PNG, JPG, GIF หรือ WebP ขนาดไม่เกิน 15 MB",
      );
      return;
    }
    try {
      const imageUrl = await uploadImage(file, {
        scope: "agreement",
        maxBytes: 2 * 1024 * 1024,
        maxDimension: 1400,
      });
      const editor = getActiveEditor();
      if (!editor) return;
      const pageId = Number(editor.dataset.pageId);
      setToolbarError("");
      restoreEditorSelection(editor, pageId);
      document.execCommand("insertImage", false, imageUrl);
      const image = Array.from(editor.querySelectorAll("img")).find((candidate) => candidate.getAttribute("src") === imageUrl);
      if (image) image.alt = file.name.replace(/\.[^.]+$/, "");
      persistPage(pageId, editor);
    } catch (error) {
      setToolbarError(error instanceof Error ? error.message : "อัปโหลดรูปภาพไม่สำเร็จ");
    }
  }

  function openPreview() {
    const source = previewItem || {};
    const sampleDate = dateInputValue(new Date());
    const sampleName = "ตัวอย่างพนักงาน";
    const sourceAgreement = source.agreement || {};
    const previewAgreement = {
      ...sourceAgreement,
      title,
      body,
      documentDate: documentDate || sourceAgreement.documentDate || sampleDate,
      signatureBoxes: sourceAgreement.signatureBoxes?.length
        ? sourceAgreement.signatureBoxes
        : [{ id: "employee", name: sampleName, role: "พนักงานผู้รับมอบ" }],
    };
    const item = {
      ...source,
      id: source.id || requestId,
      formDate: source.formDate || sampleDate,
      employeeName: source.employeeName || sampleName,
      employeeCode: source.employeeCode || "0000",
      position: source.position || "พนักงาน",
      department: source.department || "แผนกตัวอย่าง",
      fromDate: source.fromDate || sampleDate,
      toDate: source.toDate || null,
      itemDetails: source.itemDetails?.length ? source.itemDetails : [{ name: "ตัวอย่างรายการ", quantity: 1, note: "" }],
      agreement: previewAgreement,
    };
    setPreviewHtml(agreementDocumentHtml(item, window.location.origin));
    setPreviewOpen(true);
  }

  function toolbarButton(label, Icon, onClick, extra = {}) {
    return (
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="size-10 px-0"
        aria-label={label}
        title={label}
        disabled={readOnly}
        onMouseDown={preserveEditorSelection}
        onClick={onClick}
        {...extra}
      >
        <Icon aria-hidden="true" />
      </Button>
    );
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm" aria-label="ตัวแก้ไขเอกสาร Agreement">
      <div className="shrink-0 border-b border-border bg-background">
        <div role="toolbar" aria-label="เครื่องมือแก้ไขเอกสาร" className="flex h-[52px] min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap px-2">
          <div className="flex shrink-0 items-center gap-0.5">
            {toolbarButton("ย่อหน้ากระดาษ", RiZoomOutLine, () => setZoom((value) => Math.max(50, value - 10)), { disabled: false })}
            <span className="w-10 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">{zoom}%</span>
            {toolbarButton("ขยายหน้ากระดาษ", RiZoomInLine, () => setZoom((value) => Math.min(200, value + 10)), { disabled: false })}
          </div>
          <span className="mx-1 h-7 w-px shrink-0 bg-border" aria-hidden="true" />
          {toolbarButton("ย้อนกลับ", RiArrowGoBackLine, () => runCommand("undo"))}
          {toolbarButton("ทำซ้ำ", RiArrowGoForwardLine, () => runCommand("redo"))}

          <Select selectedKey={heading} onSelectionChange={(value) => { setHeading(value); runCommand("formatBlock", value); }} isDisabled={readOnly} size="sm" aria-label="รูปแบบย่อหน้า" className="w-[106px] shrink-0 border-transparent px-2">
            <SelectItem id="p">Paragraph</SelectItem>
            <SelectItem id="h1">Heading 1</SelectItem>
            <SelectItem id="h2">Heading 2</SelectItem>
            <SelectItem id="h3">Heading 3</SelectItem>
            <SelectItem id="blockquote">Quote</SelectItem>
            <SelectItem id="pre">Code block</SelectItem>
          </Select>
          <Select selectedKey={fontFamily} onSelectionChange={(value) => { setFontFamily(value); runCommand("fontName", value); }} isDisabled={readOnly} size="sm" aria-label="แบบอักษร" className="w-[132px] shrink-0 border-transparent px-2">
            <SelectItem id="TH Sarabun New">TH Sarabun</SelectItem>
            <SelectItem id="Noto Sans Thai">Noto Sans Thai</SelectItem>
          </Select>
          <Select selectedKey={fontSize} onSelectionChange={applyFontSize} isDisabled={readOnly} size="sm" aria-label="ขนาดตัวอักษร" className="w-[58px] shrink-0 border-transparent px-2">
            {[8, 10, 12, 14, 16, 18, 24].map((size) => <SelectItem key={size} id={String(size)}>{size}</SelectItem>)}
          </Select>

          <span className="mx-1 h-7 w-px shrink-0 bg-border" aria-hidden="true" />
          {toolbarButton("ตัวหนา", RiBold, () => runCommand("bold"))}
          {toolbarButton("ตัวเอียง", RiItalic, () => runCommand("italic"))}
          {toolbarButton("ขีดทับ", RiStrikethrough, () => runCommand("strikeThrough"))}
          {toolbarButton("ขีดเส้นใต้", RiUnderline, () => runCommand("underline"))}
          {toolbarButton("บล็อกโค้ด", RiCodeLine, () => runCommand("formatBlock", "pre"))}
          {toolbarButton("ล้างรูปแบบ", RiFormatClear, () => runCommand("removeFormat"))}
          <label className="relative inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring" title="สีตัวอักษร">
            <RiFontColor aria-hidden="true" className="size-4" />
            <input aria-label="สีตัวอักษร" type="color" value={textColor} disabled={readOnly} className="absolute inset-0 size-full cursor-pointer opacity-0" onMouseDown={rememberEditorSelection} onChange={(event) => { setTextColor(event.target.value); runCommand("foreColor", event.target.value); }} />
          </label>
          {toolbarButton("เน้นข้อความ", RiMarkPenLine, () => runCommand("hiliteColor", "#fff2a8"))}

          <span className="mx-1 h-7 w-px shrink-0 bg-border" aria-hidden="true" />
          {toolbarButton("แทรกลิงก์", RiLink, insertLink)}
          <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={insertImage} />
          {toolbarButton("แทรกรูปภาพ", RiImageAddLine, () => imageInputRef.current?.click())}

          <span className="mx-1 h-7 w-px shrink-0 bg-border" aria-hidden="true" />
          {toolbarButton("รายการหัวข้อย่อย", RiListUnordered, () => runCommand("insertUnorderedList"))}
          {toolbarButton("รายการลำดับเลข", RiListOrdered, () => runCommand("insertOrderedList"))}
          {toolbarButton("รายการตรวจสอบ", RiListCheck, () => insertMarkup("<ul><li>☐&nbsp;</li></ul>"))}
          {toolbarButton("แทรกตาราง 3 คอลัมน์ 3 แถว", RiTable2, () => insertMarkup('<table><tbody><tr><th>&nbsp;</th><th>&nbsp;</th><th>&nbsp;</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>'))}
          {toolbarButton("ชิดซ้าย", RiAlignLeft, () => runCommand("justifyLeft"))}
          {toolbarButton("กึ่งกลาง", RiAlignCenter, () => runCommand("justifyCenter"))}
          {toolbarButton("ชิดขวา", RiAlignRight, () => runCommand("justifyRight"))}
          {toolbarButton("จัดแนวเต็มบรรทัด", RiAlignJustify, () => runCommand("justifyFull"))}
          <RiTextSpacing aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <Select selectedKey={lineHeight} onSelectionChange={applyLineHeight} isDisabled={readOnly} size="sm" aria-label="ระยะห่างบรรทัด" className="w-[90px] shrink-0 border-transparent px-2">
            <SelectItem id="1">1.0</SelectItem>
            <SelectItem id="1.15">1.15</SelectItem>
            <SelectItem id="1.45">1.45</SelectItem>
            <SelectItem id="1.5">1.5</SelectItem>
            <SelectItem id="2">2.0</SelectItem>
          </Select>

          <span className="mx-1 h-7 w-px shrink-0 bg-border" aria-hidden="true" />
          {toolbarButton("ขึ้นหน้าใหม่", RiPageSeparator, () => insertMarkup(`${pageBreakMarkup}<p><br></p>`))}
          <Select key={fieldSelectKey} defaultSelectedKey={null} placeholder="แทรกข้อมูล" onMouseDown={rememberEditorSelection} onSelectionChange={(token) => { if (signatureFieldTokens[token]) insertSignatureField(token); else insertMarkup(escapeText(token)); setFieldSelectKey((key) => key + 1); }} isDisabled={readOnly} size="sm" aria-label="แทรกข้อมูลในเอกสาร" className="w-[120px] shrink-0 border-transparent px-2">
            {fieldTokens.map(([label, token]) => <SelectItem key={token} id={token}>{label}</SelectItem>)}
          </Select>
          <span className="mx-1 h-7 w-px shrink-0 bg-border" aria-hidden="true" />
          <Button type="button" size="xs" variant="outline" leadingIcon={RiEyeLine} className="min-h-10 shrink-0" onClick={openPreview}>ดู Preview PDF</Button>
        </div>
        {toolbarError ? <p className="px-3 pb-2 text-xs text-status-danger" role="alert">{toolbarError}</p> : null}
      </div>

      {showDocumentDateInput ? (
        <div className="grid shrink-0 gap-3 border-b border-border bg-background p-3 sm:px-5">
          <label htmlFor={dateId} className="text-sm font-medium text-foreground">วันที่ในเอกสาร</label>
          <Input id={dateId} type="date" value={dateInputValue(documentDate)} onChange={onDocumentDateChange} isDisabled={readOnly} />
        </div>
      ) : null}

      <div className="asset-docx-workspace min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-muted px-3 py-5 sm:px-6 sm:py-8">
        <div className="flex min-w-0 flex-col items-center gap-4" style={{ zoom: zoom / 100 }}>
          {pageIds.map((id, index) => (
            <article key={id} data-page-index={index} className="asset-docx-page relative mx-auto h-[297mm] w-[210mm] max-w-none flex-none overflow-hidden border border-border bg-background text-foreground shadow-sm">
              <header className="asset-docx-header">
                <img src="/download.png" alt="ตราบริษัท ต.จรัสชัย" />
                <div className="asset-docx-header-copy">
                  <strong>T.Jaruschai International Construction Co.,Ltd.</strong>
                  <span>2043 Soi Kanchanaphisek 008, Bangkae, Bangkae Bangkok 10160 Thailand</span>
                </div>
              </header>
              {index === 0 ? (
                <>
                  <h1
                    ref={titleEditorRef}
                    aria-label="ชื่อเอกสาร Agreement"
                    aria-multiline="true"
                    aria-readonly={readOnly}
                    className="asset-docx-title whitespace-pre-line text-foreground outline-none focus:outline-none focus:shadow-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    contentEditable={!readOnly}
                    role="textbox"
                    suppressContentEditableWarning
                    onInput={(event) => onTitleChange(event.currentTarget.innerText.replace(/\r/g, ""))}
                    onFocus={() => { activePageId.current = null; }}
                    onPaste={pasteTitleText}
                    spellCheck="true"
                  />
                  {!hideDocumentDate ? <p className="asset-docx-date text-foreground">วันที่ {displayThaiDate(documentDate) || "................................"}</p> : null}
                </>
              ) : null}
              <div
                ref={bindPageEditor(id)}
                data-page-id={id}
                aria-label={`เนื้อหาเอกสาร Agreement หน้า ${index + 1}`}
                aria-multiline="true"
                aria-readonly={readOnly}
                className="asset-docx-content text-foreground outline-none focus:outline-none focus:shadow-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                contentEditable={!readOnly}
                role="textbox"
                suppressContentEditableWarning
                onFocus={() => { activePageId.current = id; }}
                onKeyDown={(event) => handleEditorKeyDown(event, id)}
                onKeyUp={rememberEditorSelection}
                onMouseUp={rememberEditorSelection}
                onInput={(event) => persistPage(id, event.currentTarget, event.nativeEvent.inputType)}
                onPointerDown={(event) => startSignatureFieldDrag(event, id)}
                onPointerMove={moveSignatureFieldDrag}
                onPointerUp={finishSignatureFieldDrag}
                onPointerCancel={finishSignatureFieldDrag}
                onPaste={(event) => pasteSanitized(event, id)}
                spellCheck="true"
              />
            </article>
          ))}
        </div>
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="h-[90dvh] max-w-6xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Preview เอกสาร PDF</DialogTitle>
            <DialogDescription>แสดงหน้ากระดาษและตำแหน่งลายเซ็นจากตัวสร้าง PDF จริง{previewItem ? "" : " โดยใช้ข้อมูลตัวอย่าง"}</DialogDescription>
          </DialogHeader>
          <iframe title="Preview เอกสาร PDF Agreement" sandbox="allow-same-origin" srcDoc={previewHtml} className="min-h-0 w-full flex-1 border border-border bg-muted" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>ปิด Preview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
