export async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function explainFailure(raw, fallback) {
  if (!raw || typeof raw !== "string") return fallback;
  if (/รหัสพนักงาน .*ซ้ำกับ|รหัสพนักงาน .*ถูกใช้แล้ว/.test(raw)) return raw;
  if (/email is required for an employee with a login account/i.test(raw)) return "พนักงานที่มีบัญชีเข้าสู่ระบบต้องมีอีเมล";
  if (/^email is required/i.test(raw)) return "กรุณากรอกอีเมลเพื่อใช้เป็นชื่อเข้าสู่ระบบของพนักงาน";
  if (/invalid email/i.test(raw)) return "รูปแบบอีเมลไม่ถูกต้อง";
  if (/endDate cannot be before startDate/i.test(raw)) return "วันที่สิ้นสุดการทำงานต้องไม่อยู่ก่อนวันที่เริ่มงาน";
  if (/endDate must be a YYYY-MM-DD date/i.test(raw)) return "รูปแบบวันที่สิ้นสุดการทำงานไม่ถูกต้อง";
  if (/former employees must have an end date/i.test(raw)) return "กรุณาระบุวันที่สิ้นสุดการทำงานของพนักงานพ้นสภาพ";
  if (/already exists|already in use|unique field/i.test(raw)) return "มีข้อมูลชื่อนี้หรือรหัสนี้อยู่แล้ว กรุณาตรวจสอบก่อนบันทึก";
  if (/ยังมีข้อมูลอ้างอิง|still referenced|still in use/i.test(raw)) return raw;
  if (/foreign key|referenced ids|does not exist/i.test(raw)) return "รายการที่เลือกไม่มีอยู่ในระบบ กรุณาโหลดรายการใหม่แล้วลองอีกครั้ง";
  if (/not found/i.test(raw)) return "ไม่พบข้อมูลที่ต้องการ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง";
  if (/invalid|is required|must be|no fields to update/i.test(raw)) return "ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง กรุณาตรวจสอบข้อมูลในแบบฟอร์ม";
  if (/forbidden|unauthorized/i.test(raw)) return "บัญชีนี้ไม่มีสิทธิ์ทำรายการดังกล่าว";
  if (/off-boarded/i.test(raw)) return "พนักงานพ้นสภาพแล้ว จึงทำรายการนี้ซ้ำไม่ได้";
  return `ระบบแจ้งว่า: ${raw}`;
}
