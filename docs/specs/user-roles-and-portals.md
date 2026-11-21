# Spec: บทบาทผู้ใช้ในระบบ (Roles & Portals)

สถานะที่สำรวจ: อัปเดตแกนหลักแล้ว — `users.role` ย้ายเป็น `varchar(20)` + `CHECK (role IN ('employee', 'hr', 'executive'))` (`drizzle/0025_user_roles.sql`), มี `lib/auth/roles.ts` พร้อม preset สิทธิ์ตั้งต้น, `dal.ts`/`layout.jsx`/`HrmShell.jsx` อ่านและส่งต่อ `role` สดจาก DB, และหน้าตั้งค่าสิทธิ์ผู้ใช้เลือกบทบาทพร้อมใช้สิทธิ์ตั้งต้นได้แล้ว (ยังเหลือการออกแบบหน้า Executive Dashboard เฉพาะของ `executive`)

## ข้อสรุปที่ยืนยันแล้ว

ระบบจะกำหนดบทบาทหลัก (**3 บทบาท**) และ **ไม่มีบทบาท Manager / ผู้จัดการ (MSS)**:

| Role Key | ชื่อบทบาท | พื้นที่ใช้งาน (Portal) | ขอบเขตหลัก |
| :--- | :--- | :--- | :--- |
| `employee` | **พนักงาน** | Employee Self Service (ESS) | ดูและจัดการข้อมูล/คำขอของตนเอง (วันลา, OT, ยืมคืนทรัพย์สิน, ติดตามงาน, เอกสารที่ได้รับสิทธิ์) |
| `hr` | **ฝ่ายทรัพยากรบุคคล (HR)** | HR Portal | จัดการงานบุคคลทั้งบริษัท (ทะเบียนพนักงาน, เอกสาร, อนุมัติ/จัดการวันลา–OT–ทรัพย์สิน, เงินเดือน/สลิป, รายงาน, ตั้งค่าระบบและสิทธิ์ผู้ใช้) |
| `executive` | **ผู้บริหาร** | Executive Dashboard | ดูภาพรวมระดับองค์กร (Executive Dashboard), รายงานสรุป, ติดตามภาพรวมงาน/ค่าตอบแทน/กำลังคน และร่วมอนุมัติคำขอตามสิทธิ์ที่กำหนด |

## ข้อกำหนดด้านฐานข้อมูลและการย้ายข้อมูล (Database & Migration)

- **คงคอลัมน์ `users.role` ไว้ใช้งานจริง** (ไม่ลบออก) และปรับค่าที่อนุญาตเป็น 3 ค่า: `'employee'`, `'hr'`, `'executive'` (ค่าเริ่มต้น `'employee'`)
- แนะนำเปลี่ยนชนิดคอลัมน์จาก `pgEnum("user_role", ...)` เป็น `varchar(20) NOT NULL DEFAULT 'employee'` พร้อม `CHECK (role IN ('employee', 'hr', 'executive'))` (หรือปรับ enum ผ่าน migration) และลบ `user_role` enum เดิมเมื่อย้ายเสร็จ
- **แนวทาง Backfill ข้อมูลเดิมในฐานข้อมูล:**
  - `employee` → `employee`
  - `ceo` → `executive`
  - `supervisor` → `hr` (ให้ผู้ดูแลระบบทบทวนรายบัญชีอีกครั้งหลัง migrate)

## ข้อกำหนดด้านสิทธิ์และการแสดงผล (Permissions & UI)

- **ความสัมพันธ์ระหว่าง `role` กับ `permissions`:**
  - `role` กำหนดบทบาทหลัก, ชุดสิทธิ์ตั้งต้น (Default Permission Preset) ตอนสร้างบัญชีหรือเปลี่ยนบทบาท, และหน้าหลัก/Portal ที่ผู้ใช้เห็น (เช่น หน้าแรก `/` สำหรับ `executive` แสดง Executive Dashboard, สำหรับ `hr` แสดง HR Portal, สำหรับ `employee` แสดง ESS)
  - `users.permissions` ยังคงทำหน้าที่เป็น fine-grained override รายบัญชี และยังคงตรวจสิทธิ์ฝั่ง server ผ่าน `lib/auth/dal.ts` ทุกคำขอ
- **หน้าตั้งค่าสิทธิ์ผู้ใช้ (`components/hrm/settings/UserPermissionsTab.jsx`):**
  - เพิ่มตัวเลือกกำหนดบทบาท (`พนักงาน` / `HR` / `ผู้บริหาร`) ให้แต่ละบัญชี พร้อมปุ่มหรือการทำงานที่ตั้งค่า default permissions ตามบทบาทที่เลือกได้
- **Auth & Context:**
  - ส่ง `role` ที่อ่านล่าสุดจาก DB ผ่าน `lib/auth/dal.ts` ไปยัง `HrmShell` (`RoleContext`) เพื่อใช้สลับมุมมอง Portal และเมนูให้เหมาะกับบทบาท
  - ลบค่า legacy `supervisor` / `ceo` ออกจาก `lib/auth/rolePermissionAccess.ts`, `tests/setup/permissions.ts` และ seed scripts

## การตัดสินใจเพิ่มเติมที่ต้องยืนยันก่อน implement UI

- ยืนยันรายละเอียด **Default Permission Preset** ของ `hr` กับ `executive` ให้ชัดเจน (เช่น `executive` อนุมัติคำขอ OT/ลา/ทรัพย์สินได้หรือไม่, แก้ไขข้อมูลเงินเดือนหรือตั้งค่าระบบได้หรือไม่)
- ยืนยัน widget/ตัวชี้วัดที่ต้องการให้แสดงบนหน้า **Executive Dashboard** ของบทบาท `executive`

## เกณฑ์ตรวจรับ

- ฐานข้อมูลรองรับเฉพาะ 3 บทบาท (`employee`, `hr`, `executive`) และไม่มีค่า `supervisor`/`ceo` ค้างอยู่
- ผู้ดูแลระบบสามารถกำหนด/เปลี่ยนบทบาทให้บัญชีผู้ใช้ได้จากหน้าตั้งค่า พร้อมอัปเดตสิทธิ์ตั้งต้นตามบทบาท
- ระบบแสดง Portal/หน้าภาพรวมตรงตามบทบาทของผู้ใช้ และฝั่ง API ยังคงบังคับตรวจสิทธิ์อย่างถูกต้อง (`401`/`403`)
- `npm run db:check`, `npm run typecheck` และ `npm test` ผ่านทั้งหมด
