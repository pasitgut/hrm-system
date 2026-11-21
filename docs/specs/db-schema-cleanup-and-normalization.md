# Spec: ปรับปรุงโครงสร้าง Normalization และเก็บกวาด Schema เดิม

สถานะที่สำรวจ: **ดำเนินการเก็บกวาด dead tables และ legacy columns แล้ว** (`drizzle/0026_clean_legacy_schema.sql` ลบ `skills`, `employee_skills`, `salary_slip_*` และ `employee_documents.file_data` พร้อมบังคับ `drive_file_id NOT NULL` และย้าย `users.role` เป็น 3 บทบาทใน `0025_user_roles.sql`) — คงเหลือการแยก `employee_document_shares` แทน `uuid[]` และการปรับ timestamp ของ `asset_agreements`

## เป้าหมาย

ลด schema debt, ป้องกัน orphan references และทำให้โครงสร้างฐานข้อมูลสะท้อนการใช้งานจริงของระบบ

## ขั้นตอน prerequisite

1. ตรวจสอบและ backup ฐานข้อมูลก่อนทำ migration (หากมีข้อมูลทดสอบที่ต้องการเก็บไว้)

## ข้อกำหนด

### 1. แยก Junction Table สำหรับการแชร์เอกสารพนักงาน
- สร้างตาราง `employee_document_shares`:
  - `document_id uuid NOT NULL REFERENCES employee_documents(id) ON DELETE CASCADE`
  - `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `PRIMARY KEY (document_id, user_id)` และ index `(user_id, document_id)`
- Backfill ข้อมูลจาก `employee_documents.shared_with_user_ids` (กรองเฉพาะ `user_id` ที่ยังมีอยู่ใน `users`)
- ปรับ API และ query ใน `app/api/employee-documents/**` และ `lib/employee-documents.ts` ให้ใช้ `employee_document_shares` จากนั้นจึง drop คอลัมน์ `shared_with_user_ids`

### 2. สถานะการล้าง Dead Tables และ Legacy Columns (ทำแล้ว)
- **Dead tables:** ลบ `employee_skills`, `skills`, `salary_slip_versions`, `salary_slips` และ `salary_slip_imports` เรียบร้อยแล้ว (`0026_clean_legacy_schema.sql`)
- **ปรับปรุง `users.role`:** คงคอลัมน์ `users.role` ไว้ใช้งานจริงและปรับเป็น 3 บทบาทใหม่ `('employee', 'hr', 'executive')` แล้ว (`0025_user_roles.sql`) ตาม [user-roles-and-portals.md](user-roles-and-portals.md)
- **Legacy `employee_documents.file_data`:** ลบคอลัมน์ `file_data` และสคริปต์ migration ชั่วคราวแล้ว ปรับ `drive_file_id` เป็น `NOT NULL` (`0026_clean_legacy_schema.sql`)

### 3. ความสม่ำเสมอของ Schema (Schema Hygiene)
- เพิ่ม `created_at timestamptz NOT NULL DEFAULT now()` ใน `asset_agreements` และทำให้ `updated_at` เป็น `NOT NULL DEFAULT now()` ให้ตรงกับตารางอื่น
- กำหนดมาตรฐานรูปแบบ status ของตารางใหม่ในอนาคตให้ใช้ `varchar + CHECK constraint` หรือ lookup table แทน `pgEnum` เพื่อให้แก้ไข/เพิ่มสถานะใน migration ได้ง่าย

## เกณฑ์ตรวจรับ

- มี backup และแผน rollback ก่อนทำ destructive migration
- การแชร์เอกสารพนักงานทำงานผ่าน `employee_document_shares` โดยมี FK enforcement จริงและไม่มี orphan UUID
- `npm run typecheck`, `npm run db:check`, `npm run db:generate` (No schema changes) และ `npm test` ผ่านทั้งหมด
