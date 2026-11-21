# Spec: เก็บกวาดระบบสลิปเงินเดือนแบบ Stateless และสิทธิ์เดิม

สถานะที่สำรวจ: **ดำเนินการเก็บกวาดโค้ดและ schema แล้ว** (ก่อน deploy production) — เหลือเฉพาะการอัปเดตเอกสารอ้างอิงเดิม (`docs/SALARY_SLIPS_LOCAL.md`, `docs/specs/salary-slip-source-retention.md`) ให้สอดคล้องทั้งหมด

สิ่งที่เก็บกวาดเรียบร้อยแล้ว:
- นำสิทธิ์ `salary_slips.import` และ `salary_slips.replace` รวมถึง `LEGACY_PERMISSION_EXPANSIONS` ออกจาก `lib/auth/permissions.ts` และปรับคำอธิบาย `salary_slips.view`
- ลบตาราง `salary_slip_imports`, `salary_slips`, `salary_slip_versions` ผ่าน migration `drizzle/0026_clean_legacy_schema.sql`
- ลบ route redirect เดิม `/salary-slips` และ `/salary-slips/import`, ลบ dead helpers (`ImportFile`, `sameData`) ใน `lib/salary-slips/model.ts` และลบ `app/api/payroll/social-security/export/route.ts` ที่อ้างอิงตาราง `salary_slips` เดิม

## เป้าหมาย

ลดความสับสนของผู้ดูแลระบบและนักพัฒนา โดยเก็บกวาดสิทธิ์ เอกสาร และโค้ดค้างจากระบบ import สลิปเงินเดือนเดิมอย่างปลอดภัยโดยไม่กระทบการออกสลิปแบบ stateless ใน `/payroll`

## งานเอกสารที่เหลือ

1. **อัปเดตเอกสาร:**
   - อัปเดต `docs/specs/salary-slip-source-retention.md` และ `docs/SALARY_SLIPS_LOCAL.md` ให้สะท้อนสถานะปัจจุบัน (stateless upload → export, ไม่เก็บไฟล์ต้นฉบับหรือยอดสลิปลงฐานข้อมูล)

## เกณฑ์ตรวจรับ

- หน้าตั้งค่าสิทธิ์ผู้ใช้ไม่แสดงสิทธิ์ที่ไม่มีฟีเจอร์รองรับแล้ว
- `npm run typecheck`, `npm run db:check`, `npm run db:generate` และ `npm test` ผ่านทั้งหมด
- เอกสารสลิปเงินเดือนทุกไฟล์สอดคล้องกับการทำงานจริงของโค้ด
