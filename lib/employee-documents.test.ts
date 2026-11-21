import { describe, expect, it } from "vitest";
import {
  MAX_EMPLOYEE_DOCUMENT_BYTES,
  MAX_EMPLOYEE_DOCUMENT_MB,
  resolveEmployeeDocumentMimeType,
  validateEmployeeDocumentHeader,
} from "@/lib/employee-documents";

describe("employee document validation", () => {
  it("configures a 50 MB document size limit", () => {
    expect(MAX_EMPLOYEE_DOCUMENT_MB).toBe(50);
    expect(MAX_EMPLOYEE_DOCUMENT_BYTES).toBe(50 * 1024 * 1024);
  });

  it("resolves MIME types by extension and checks declared types", () => {
    expect(resolveEmployeeDocumentMimeType("contract.pdf", "application/pdf")).toEqual({
      ok: true,
      mimeType: "application/pdf",
    });
    expect(resolveEmployeeDocumentMimeType("contract.pdf", "")).toEqual({
      ok: true,
      mimeType: "application/pdf",
    });
    expect(resolveEmployeeDocumentMimeType("contract.pdf", "application/octet-stream")).toEqual({
      ok: true,
      mimeType: "application/pdf",
    });
    expect(resolveEmployeeDocumentMimeType("contract.pdf", "image/png").ok).toBe(false);
    expect(resolveEmployeeDocumentMimeType("script.exe", "application/octet-stream").ok).toBe(false);
  });

  it("validates 16-byte magic headers for PDF, PNG, JPEG, DOC, and DOCX", () => {
    expect(validateEmployeeDocumentHeader("a.pdf", "application/pdf", Buffer.from("%PDF-1.7\n1234567")).ok).toBe(true);
    expect(validateEmployeeDocumentHeader("a.png", "image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])).ok).toBe(true);
    expect(validateEmployeeDocumentHeader("a.jpg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])).ok).toBe(true);
    expect(validateEmployeeDocumentHeader("a.doc", "application/msword", Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])).ok).toBe(true);
    expect(validateEmployeeDocumentHeader("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])).ok).toBe(true);

    expect(validateEmployeeDocumentHeader("fake.pdf", "application/pdf", Buffer.from("not-a-pdf-header")).ok).toBe(false);
    expect(validateEmployeeDocumentHeader("tiny.pdf", "application/pdf", Buffer.from("%PD")).ok).toBe(false);
  });
});
