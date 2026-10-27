export async function readResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "ทำรายการไม่สำเร็จ กรุณาลองใหม่");
  return body;
}
export async function downloadSlips({ ids, year, format, acknowledgeMissing = false }) {
  const response = await fetch("/api/salary-slips/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, year, format, acknowledgeMissing }) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (body.missing) return { missing: body.missing };
    throw new Error(body.error || "สร้างไฟล์ไม่สำเร็จ กรุณาลองใหม่");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url; link.download = `salary-slips-${year}.${format}`;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return {};
}
