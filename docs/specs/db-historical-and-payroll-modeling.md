# Spec: โครงสร้างข้อมูลประวัติย้อนหลังและการรองรับ Payroll ระยะยาว

สถานะที่สำรวจ: ปัจจุบัน `employees` เก็บ `base_salary`, `payroll_data`, `ot_*_multiplier`, `department_id`, `position_id` เป็นค่าล่าสุดค่าเดียว (overwrite ทับ), ระบบเงินเดือน `/payroll` คำนวณแบบ preview สดโดยไม่ล็อกงวด, และโควตาวันลาเก็บเฉพาะระดับ global ใน `leave_types`

## เป้าหมาย

วางโครงสร้างฐานข้อมูลระยะยาวให้สามารถตรวจสอบย้อนหลัง (auditability) คำนวณเงินเดือน/รายงานย้อนหลังได้แม่นยำตามข้อมูล ณ เวลานั้น และรองรับการขยายตัวของระบบ Payroll และ Leave

## ขั้นตอน prerequisite

ต้องได้รับข้อสรุปเชิงนโยบายจากเจ้าของผลิตภัณฑ์/ฝ่ายบุคคลก่อนเริ่ม implement แต่ละส่วน:
1. ยืนยันความต้องการประวัติย้อนหลังของแผนก/ตำแหน่ง (เชื่อมโยงกับ [reporting-data-policy.md](reporting-data-policy.md))
2. ยืนยันว่าต้องการระบบปิดงวดเงินเดือน (Pay Run Lock / Archive) หรือยังคงรูปแบบ preview สด
3. ยืนยันความต้องการโควตาวันลารายบุคคล/รายปี และการยกยอดวันลาข้ามปี (carry-over)
4. ยืนยันโครงสร้างรายการเงินเดือนที่ต้อง query/สรุปยอด (เชื่อมโยงกับ [payroll-variable-items-and-leave.md](payroll-variable-items-and-leave.md) และ [social-security-export.md](social-security-export.md))

## ข้อกำหนดเชิงออกแบบ (แบ่งทำเป็นเฟสได้)

### เฟส A: ประวัติค่าตอบแทนและสังกัดแบบ Effective-Dated
- **`employee_compensation_history`**: เก็บ `employee_id`, `effective_from`, `effective_to`, `base_salary`, `ot_weekday_multiplier`, `ot_holiday_multiplier`, `work_hours_per_day`, `payroll_data`, `changed_by_user_id`, `reason`, `created_at`
- **`employee_assignment_history`**: เก็บ `employee_id`, `effective_from`, `effective_to`, `department_id`, `position_id`, `employment_status_id`, `employment_type_id`, `changed_by_user_id`, `created_at`
- บังคับไม่ให้ช่วง `effective_from`–`effective_to` ของพนักงานคนเดียวกันซ้อนทับกัน (PostgreSQL `EXCLUDE USING gist` หรือ application + transaction lock)

### เฟส B: การปิดงวดเงินเดือน (Payroll Runs) และแยกโครงสร้าง `payroll_data`
- **`payroll_runs`**: เก็บ `id`, `year`, `month`, `period_start`, `period_end`, `status` (`draft`, `locked`, `paid`), `locked_by_user_id`, `locked_at`, `created_at` (unique `(year, month)`)
- **`payroll_run_items`**: เก็บ snapshot รายพนักงาน ณ ตอนปิดงวด (เงินเดือนฐาน, ชม. OT วันธรรมดา/วันหยุด, ยอด OT, รายรับ/รายหักแยกหมวด, ยอดสุทธิ, ข้อมูลบัญชีธนาคาร) เพื่อให้ส่งออก Excel/สลิป/สปส. 1-10 ย้อนหลังได้ตรงเดิมเสมอ
- พิจารณาแยกข้อมูลบัญชีธนาคาร (`bank_name`, `bank_account_no`) และรายการประจำ (`employee_payroll_items`) ออกจาก JSONB `employees.payroll_data` หากต้องการสรุปรายงานหรือคำนวณประกันสังคม/ภาษีจาก SQL โดยตรง

### เฟส C: โควตาวันลารายบุคคลและรายปี
- **`employee_leave_quotas`**: เก็บ `(employee_id, leave_type_code, year)` เป็น unique key พร้อม `entitled_days`, `carry_over_days`, `adjusted_days`, `note`, `updated_by_user_id`, `updated_at`
- ทำให้การปรับ `leave_types.annual_quota_days` ในปีใหม่ไม่กระทบสิทธิ์วันลาของปีย้อนหลัง และรองรับการปรับโควตาเฉพาะรายบุคคล

### เฟส D: ทบทวนความซ้ำซ้อนในกลุ่ม `work_tracking_*`
- ระบุขอบเขตความรับผิดชอบให้ชัดระหว่าง `work_tracking_records` (มุมมองสรุปรายบ้าน/รอบสำหรับ HRM UI), `work_tracking_requests` (สถานะล่าสุดรายคำขอจาก LINE/Checker) และ `work_tracking_activities` (immutable event log) พร้อมเอกสารยืนยันว่าฟิลด์ที่ซ้ำกันใน `activities` เป็น intentional audit snapshot

## เกณฑ์ตรวจรับ

- แต่ละเฟสมี migration แบบ non-destructive, backfill strategy สำหรับข้อมูลเก่า และ rollback plan
- รายงานและเงินเดือนย้อนหลังอ่านค่าตรงตามช่วงเวลา (effective date หรือ locked pay run)
- มี automated tests ครอบคลุมการเปลี่ยนเงินเดือน/แผนกระหว่างปี, การปิดงวดเงินเดือน และการคำนวณโควตาวันลาข้ามปี
