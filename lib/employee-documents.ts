export const MAX_EMPLOYEE_DOCUMENT_BYTES = 15 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}

export function sanitizeDocumentName(value: string): string {
  const basename = value.replace(/[\\/]/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return Array.from(basename || "document").slice(0, 255).join("");
}

export function validateEmployeeDocument(
  fileName: string,
  declaredMimeType: string,
  data: Buffer,
): { ok: true; mimeType: string } | { ok: false; message: string } {
  const extension = fileName.split(".").at(-1)?.toLocaleLowerCase("en-US") ?? "";
  const mimeType = Object.prototype.hasOwnProperty.call(MIME_BY_EXTENSION, extension) ? MIME_BY_EXTENSION[extension] : undefined;
  if (!mimeType) return { ok: false, message: "รองรับ PDF, Word, Excel, JPG และ PNG เท่านั้น" };

  if (declaredMimeType && declaredMimeType !== "application/octet-stream" && declaredMimeType !== mimeType) {
    return { ok: false, message: "ชนิดไฟล์ไม่ตรงกับนามสกุลไฟล์" };
  }

  const startsWith = (signature: number[]) => signature.every((byte, index) => data[index] === byte);
  const validSignature = extension === "pdf"
    ? data.subarray(0, 5).toString("ascii") === "%PDF-"
    : extension === "png"
      ? startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : extension === "jpg" || extension === "jpeg"
        ? startsWith([0xff, 0xd8, 0xff])
        : extension === "doc" || extension === "xls"
          ? startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
          : startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06]);

  if (!validSignature) return { ok: false, message: "เนื้อหาไฟล์ไม่ตรงกับชนิดเอกสารที่เลือก" };
  return { ok: true, mimeType };
}

export function contentDisposition(fileName: string): string {
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encodedName = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}
