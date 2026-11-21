function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function readJsonSafe(response) {
  return response.json().catch(() => ({}));
}

export async function uploadEmployeeDocument(employeeId, file, { onProgress, signal } = {}) {
  const headerSlice = await file.slice(0, 16).arrayBuffer();
  const headerBase64 = bytesToBase64(new Uint8Array(headerSlice));

  const initResponse = await fetch(`/api/employees/${employeeId}/documents/upload/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      headerBase64,
    }),
    signal,
  });

  const initPayload = await readJsonSafe(initResponse);
  if (!initResponse.ok) {
    throw new Error(initPayload.error || "เริ่มอัปโหลดเอกสารไม่สำเร็จ");
  }

  const { uploadToken, chunkSize } = initPayload;
  if (!uploadToken || !Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("ข้อมูลเซสชันอัปโหลดไม่ถูกต้อง");
  }

  let offset = 0;
  onProgress?.({ loaded: 0, total: file.size, percent: 0 });

  while (offset < file.size) {
    const sliceEnd = Math.min(offset + chunkSize, file.size);
    const chunk = file.slice(offset, sliceEnd);

    const chunkResponse = await fetch(`/api/employees/${employeeId}/documents/upload/chunk`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Upload-Token": uploadToken,
        "X-Chunk-Start": String(offset),
        "X-Chunk-End": String(sliceEnd - 1),
      },
      body: chunk,
      signal,
    });

    const chunkPayload = await readJsonSafe(chunkResponse);
    if (!chunkResponse.ok) {
      if (chunkResponse.status === 413) {
        throw new Error("ชิ้นส่วนไฟล์มีขนาดใหญ่เกินกว่าที่เซิร์ฟเวอร์รองรับ");
      }
      throw new Error(chunkPayload.error || "อัปโหลดเอกสารไม่สำเร็จ");
    }

    const percent = Math.min(100, Math.round((sliceEnd / file.size) * 100));
    onProgress?.({ loaded: sliceEnd, total: file.size, percent });

    if (chunkPayload.done) {
      return chunkPayload.item;
    }

    const nextByte = chunkPayload.nextByte;
    if (!Number.isInteger(nextByte) || nextByte <= offset) {
      throw new Error("การอัปโหลดแบบแบ่งส่วนไม่คืบหน้า กรุณาลองใหม่");
    }
    offset = nextByte;
  }

  throw new Error("อัปโหลดเอกสารไม่เสร็จสมบูรณ์ กรุณาลองใหม่");
}
