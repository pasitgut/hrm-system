# Spec / Problem Record: โครงสร้าง JSONB ใน `work_tracking_records`

**สถานะ:** `บันทึกปัญหาเพื่อพิจารณาในเฟสถัดไป` (ยังไม่แก้ไขโครงสร้างตารางเพื่อให้สอดคล้องกับ Google Sheet / LINE Webhook ปัจจุบัน)  
**ตารางที่เกี่ยวข้อง:** `work_tracking_records` (เปรียบเทียบกับ `work_tracking_requests`, `work_tracking_activities`) — อ้างอิง [lib/db/schema.ts](../../lib/db/schema.ts) และ [docs/database.dbml](../database.dbml)

---

## 1. บริบทปัจจุบัน

ตาราง `work_tracking_records` ทำหน้าที่เก็บสถานะงานตรวจบ้านระดับ `(house_no, round, event_date)` สำหรับหน้า `/work-tracking` โดยเก็บรายละเอียด 3 คอลัมน์ในรูป `jsonb`:
- `report_statuses` (`Record<string, string>`)
- `sub_statuses` (`Array<{ detail, status, reportStatuses? }>`)
- `workers` (`Record<employeeCode, Array<{ date, time, name, nickname?, items }>>`)

ข้อดีในระยะเริ่มต้นคือตรงกับโครงสร้างแท็บ `ข้อมูลงาน` ใน Google Sheet และ Payload จาก API Checker แบบ 1:1 ทำให้ Query หน้าปฏิทิน/รายการรายเดือนทำได้เร็วโดยไม่ต้อง Join หลายตาราง และรันได้ทันทีโดยคงความเข้ากันได้กับฟังก์ชัน `save_line_work_batch`

---

## 2. ปัญหาและข้อจำกัดที่พบจริง

1. **คิวรีวิเคราะห์เชิงลึกด้วย SQL / BI ทำได้ยากและช้า**
   - ไม่สามารถเขียน SQL `GROUP BY` นับชั่วโมงทำงานรายช่าง, รายรอบตรวจ หรือนับงานค้างตามรายจุดบกพร่อง (`sub_statuses`) ได้ตรงไปตรงมา ต้องใช้ JSONB path operators หรือดึงมาคำนวณใน Node.js
   - ทำ Index เฉพาะรายพนักงาน (`workers -> '<code_or_item>'`) หรือกรองสถานะย่อยได้จำกัด
2. **ไม่มี Foreign Key Integrity ภายในก้อน JSONB**
   - `workers` ใช้ `employeeCode` เป็น Key ของ Object โดยไม่ได้ผูก FK กับ `employees.id` หรือ `employees.code`
   - หากมีรหัสทดสอบ/รหัสชั่วคราว (เช่น `7777` ในข้อมูลจริง `THOME-Appsheet-1.xlsx`) หรือรหัสพนักงานเปลี่ยน ฐานข้อมูลไม่สามารถตรวจความสัมพันธ์ย้อนหลังได้อัตโนมัติ
3. **ความเสี่ยงด้าน Concurrency (Lost Update)**
   - การอัปเดตสถานะย่อยจุดเดียว (`/api/work/sub-status`) หรือบันทึกกิจกรรมจาก `line-work-tracking` (`save_line_work_batch`) ต้องอ่านก้อน JSONB ทั้งแถวมาแก้ไขแล้วเขียนทับทั้งก้อน หากมีการแก้ไขพร้อมกันหลายคนมีโอกาสเขียนทับสถานะย่อยของอีกฝั่ง
4. **ความซับซ้อนในการซิงก์ข้อมูลระหว่าง 3 ตาราง (`work_tracking_*`)**
   - ปัจจุบันมีทั้ง `work_tracking_records` (JSONB สรุปรายบ้าน/รอบ), `work_tracking_requests` (สถานะล่าสุดรายคำขอ LINE/Checker) และ `work_tracking_activities` (immutable log รายกิจกรรม) ซึ่งบางส่วนซ้ำซ้อนกันและต้องรักษาให้ตรงกันผ่าน PostgreSQL RPC `save_line_work_batch`
5. **ความผิดเพี้ยนจากข้อมูลนำเข้า Excel / Google Sheet ที่พบบ่อย**
   - ในไฟล์จริง (`THOME-Appsheet-1.xlsx`) พบปัญหาเลขที่บ้านถูก Excel แปลงเป็นวันที่ (`1/8` → `2026-08-01`) และพบแถวที่มีข้อมูลซ้อนคอลัมน์ H–N จนตัวนำเข้า (`lib/migration/appsheet.ts`) ต้องกู้คืนเลขที่บ้านจากการเทียบคำใน `workers[*].items` ก่อนบันทึก

---

## 3. แนวทางลดผลกระทบในระบบปัจจุบัน (Mitigations Implemented)

- ใช้ PostgreSQL `CHECK` Constraints บังคับชนิด JSONB (`report_statuses` เป็น `'object'`, `sub_statuses` เป็น `'array'`, `workers` เป็น `'object'`) และบังคับ `UNIQUE (house_no, round, event_date)`
- เพิ่มความยาว `employee_code` เป็น `varchar(4)` ใน `work_tracking_requests` และ `work_tracking_activities` (Migration `0028`) พร้อม `CHECK` Constraint
- ในขั้นตอนนำเข้าจาก Google Sheet (`lib/migration/appsheet.ts`) มีกลไกกู้คืนเลขที่บ้านวันที่ Excel, รวมคีย์ `(house_no, round, event_date)` ที่ซ้ำ และ Sanitize โครงสร้าง JSON ของ `sub_statuses` และ `workers` ก่อนลงฐานข้อมูล

---

## 4. แนวทางปรับโครงสร้างระยะยาว (Phase 2 Normalization Roadmap)

เมื่อระบบนิ่งและพร้อมแยกโครงสร้างออกจากรูปแบบสเปรดชีตเดิม ควรแตก JSONB ออกเป็นตาราง Relational โดยใช้ Pattern **Dual-Read / Dual-Write** แล้วค่อย Deprecate JSONB:

1. **เพิ่มตาราง `work_tracking_sub_items`**
   - Columns: `id (uuid pk)`, `record_id (fk -> work_tracking_records.id on delete cascade)`, `position (smallint)`, `detail (text)`, `status (work_status)`, `report_statuses (jsonb)`, `updated_at (timestamptz)`
   - ช่วยให้ `/api/work/sub-status` อัปเดตเฉพาะแถวย่อยแบบ Row-level lock ได้ ไม่ทับแถวอื่น
2. **เพิ่มตาราง `work_tracking_worker_sessions`**
   - Columns: `id (uuid pk)`, `record_id (fk -> work_tracking_records.id on delete cascade)`, `employee_id (uuid fk nullable -> employees.id)`, `employee_code (varchar(4))`, `work_date (date)`, `start_time`, `end_time`, `action_items (text[])`, `source_activity_id (fk nullable -> work_tracking_activities.activity_id)`
   - ทำให้สร้างรายงานสรุปชั่วโมงตรวจงานรายพนักงาน / คำนวณค่าคอมมิชชันหรือเบี้ยขยันจาก SQL ได้โดยตรง
3. **กลยุทธ์การย้ายข้อมูล**
   - เขียน SQL Backfill จาก `work_tracking_records.sub_statuses` และ `workers` ลง 2 ตารางใหม่
   - อัปเดต `save_line_work_batch` และ API Route ให้เขียนลงตารางลูกเป็นหลัก
   - คง View หรือ DTO (`toWorkTrackingApiRecord`) ให้คืนค่าโครงสร้างเดิม เพื่อไม่ให้ UI `/work-tracking` และ API Checker ต้องเปลี่ยนสัญญาพร้อมกัน
