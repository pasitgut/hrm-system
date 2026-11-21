# Spec: ปรับปรุง DB Constraints และ Indexing (Quick Wins)

สถานะล่าสุด (อัปเดต Migration `0028`): **ดำเนินการแล้วในส่วน `CHECK` constraints และปรับรหัสพนักงานเป็น `varchar(4)` ทุกตาราง** (`employees`, `overtime_requests`, `leave_requests`, `asset_requests`, `asset_agreements`, `work_tracking_requests`, `work_tracking_activities`); ส่วนหัวข้อที่ 3 (Missing Indexes) และหัวข้อที่ 4 (`updated_at` trigger) รวมถึง Partial Unique Index สำหรับ soft-deleted records ยังคงเป็นงานระยะถัดไป

---

*(ประวัติบริบทเดิมที่สำรวจก่อนหน้า: `employees.code` เดิมจำกัด `varchar(4)` ในขณะที่ตารางอื่นใช้ `varchar(20)` — ปัจจุบันมาตรฐานระบบกำหนดให้ **รหัสพนักงานมีขนาด 4 ตัวอักษร (`varchar(4)`)** เหมือนกันทุกตารางและตรวจ `char_length = 4` ในระดับฐานข้อมูลแล้ว)*

## เป้าหมาย

ยกระดับความถูกต้องของข้อมูล (data integrity) และประสิทธิภาพการ query ใน PostgreSQL โดยไม่กระทบ logic การทำงานของแอปพลิเคชันเดิม

## ข้อกำหนด

### 1. เพิ่ม `CHECK` Constraints ระดับฐานข้อมูล
- **`overtime_requests`:**
  - `overtime_requests_time_order`: `end_at > start_at`
- **`leave_requests`:**
  - `leave_requests_date_order`: `end_on >= start_on`
  - `leave_requests_session_valid`: `session IN ('full', 'am', 'pm')`
  - `leave_requests_half_day_single_day`: `session = 'full' OR start_on = end_on`
- **`employees`:**
  - `employees_date_order`: `end_date IS NULL OR end_date >= start_date`
  - `employees_base_salary_nonnegative`: `base_salary IS NULL OR base_salary >= 0`
  - `employees_work_hours_positive`: `work_hours_per_day > 0 AND work_hours_per_day <= 24`
  - `employees_ot_multipliers_valid`: `ot_weekday_multiplier > 0 AND ot_weekday_multiplier <= 10 AND ot_holiday_multiplier > 0 AND ot_holiday_multiplier <= 10`

> ก่อน apply migration บน production ต้องรัน query ตรวจสอบข้อมูลเดิมที่ไม่ผ่าน constraint (pre-flight audit) และแก้ไขข้อมูลผิดปกติให้เรียบร้อยก่อน

### 2. มาตรฐานรหัสพนักงาน `varchar(4)` และ Soft-Delete Uniqueness
- **[ดำเนินการแล้วใน Migration `0028`]** ปรับขนาดคอลัมน์รหัสพนักงานทุกตารางให้เป็น `varchar(4)` ตรงกันทั้งหมด (`employees.code`, `asset_requests.borrower_employee_code`, `asset_agreements.created_by_employee_code`, `work_tracking_requests.latest_employee_code`, `work_tracking_activities.employee_code`) พร้อม `CHECK` Constraint กำหนด `char_length = 4` (หรืออนุญาต `''` ในตารางที่รองรับค่าว่างเริ่มต้น)
- **[รอพิจารณา]** ทบทวน `UNIQUE` constraint บน `employees` (`email`, `line_uid`, `citizen_id`) สำหรับกรณีพนักงานพ้นสภาพ (`deleted_at IS NOT NULL`) แล้วกลับมาร่วมงานใหม่ — พิจารณาเปลี่ยนเป็น partial unique index (`WHERE deleted_at IS NULL`) สำหรับฟิลด์ที่อนุญาตให้ใช้ซ้ำเมื่อบัญชีเดิมถูก offboard แล้ว

### 3. เพิ่ม Missing Indexes
- `employees`: partial index สำหรับ active records (`WHERE deleted_at IS NULL`)
- `asset_requests`: partial index สำหรับ active records (`WHERE deleted_at IS NULL`)
- `asset_request_reads`: index บน `(employee_id, request_id)` เพื่อรองรับการเช็กคำขอที่ยังไม่อ่านรายบุคคล
- `employee_documents`: GIN index บน `shared_with_user_ids` (กรณีใช้งานระหว่างรอแยก junction table)
- `work_tracking_requests`: index บน `latest_employee_id` และ `last_event_id`
- `work_tracking_activities`: index บน `employee_id` และ `work_date`

### 4. Auto-update `updated_at` Trigger
- เพิ่ม shared PostgreSQL trigger function `set_updated_at()` (`BEFORE UPDATE`) กับตารางหลักที่มี `updated_at` เพื่อไม่ให้พึ่งพา application code เพียงอย่างเดียว

## เกณฑ์ตรวจรับ

- มี pre-flight SQL ตรวจสอบข้อมูลเดิมก่อนเพิ่ม `CHECK` constraints
- อัปเดต `lib/db/schema.ts` ให้ตรงกับ migration ใน `drizzle/` และ `npm run db:check` รวมถึง `npm run db:generate` รายงาน `No schema changes`
- ทดสอบ migration บน scratch database และรัน `npm test` ผ่านทั้งหมด
- มี unit/DB tests ยืนยันว่า DB ปฏิเสธข้อมูลผิดเงื่อนไข (เช่น `end_at <= start_at`, `end_on < start_on`, half-day หลายวัน, `base_salary < 0`)
