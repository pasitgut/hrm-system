# Spec: การเชื่อมต่อระบบสลิปเงินเดือน (Excel-First) เข้ากับระบบคำนวณเงินเดือน HRM

**สถานะ:** `วางแนวทางสถาปัตยกรรม` (ระบบปัจจุบันใช้งานสลิปจาก Excel เป็นหลักเท่านั้น)  
**ไฟล์ที่เกี่ยวข้องปัจจุบัน:**
- UI & Export: [components/hrm/payroll/PayrollModule.jsx](../../components/hrm/payroll/PayrollModule.jsx), [app/payroll/page.jsx](../../app/payroll/page.jsx)
- Stateless Excel Slip Engine (Active): `lib/salary-slips/*`, `app/api/salary-slips/parse/route.ts`, `app/api/salary-slips/export/route.ts`
- Internal DB Payroll Engine (Preserved for Phase 2): `lib/payroll/*`, `app/api/payroll/route.ts`
- เอกสารเกี่ยวข้อง: [db-historical-and-payroll-modeling.md](db-historical-and-payroll-modeling.md), [payroll-variable-items-and-leave.md](payroll-variable-items-and-leave.md), [social-security-export.md](social-security-export.md)

---

## 1. สถานะปัจจุบัน (Phase 1: Excel-First Salary Slips)

เพื่อความรวดเร็วและความถูกต้อง 100% ตามไฟล์ปิดงวดที่ฝ่ายบัญชี/HR ใช้งานจริงอยู่แล้ว หน้า **`/payroll` (สลิปเงินเดือน)** ถูกกำหนดให้ทำงานแบบ **Stateless Excel Import** เป็นหลัก:
1. ผู้ใช้เลือก **เดือน/ปี** และอัปโหลดไฟล์ Excel เงินเดือน (`.xlsx` ตั้งแต่เดือนมกราคมถึงเดือนปัจจุบัน หรือเลือกเดือนเดียวเพื่อตรวจสอบ/ออกสลิป)
2. ระบบอ่านไฟล์ผ่าน `/api/salary-slips/parse` เพื่อพรีวิวตรวจสอบยอดเงิน (หน่วยสตางค์ภายในระบบ) ก่อนสั่งออกสลิป
3. `/api/salary-slips/export` คำนวณ **ยอดสะสมรายปี (YTD)** สำหรับรายได้รวม, ภาษี, ประกันสังคม และกองทุนสำรองเลี้ยงชีพ แล้ว Stream ไฟล์ `.pdf` (ฟอนต์ไทย PDFMake) หรือ `.xlsx` ให้ดาวน์โหลดทันที **โดยไม่เขียนทับข้อมูลลงฐานข้อมูล**

ส่วนระบบคำนวณเงินเดือนภายในจากฐานข้อมูล (`lib/payroll/service.ts` + `/api/payroll`) ยังคงเก็บไว้ในโค้ดฝั่ง Backend เพื่อใช้เป็นรากฐานในเฟสถัดไปโดยไม่แสดงทับในหน้าหลักตอนนี้

---

## 2. เป้าหมายการเชื่อมต่อในอนาคต (Phase 2: Unified HRM Payroll ↔ Salary Slip)

เมื่อองค์กรพร้อมให้ HRM เป็นแหล่งคำนวณหลักและเชื่อมสลิปเงินเดือนเข้าด้วยกันอย่างสมบูรณ์ ควรเชื่อมตามลำดับดังนี้:

### ขั้นที่ 1: โหมดเปรียบเทียบ (Reconciliation Mode — Shadow Run)
- ให้หน้า `/payroll` มีแท็บ **"ตรวจสอบเทียบระบบ HRM"**:
  - ดึงยอดคำนวณจาก `createPayroll(year, month)` (เงินเดือนฐาน `employees.base_salary`, รายการประจำ `employees.payroll_data`, ค่า OT ที่อนุมัติแล้ว `overtime_requests`) มาเทียบกับแถวที่อ่านได้จาก Excel รายพนักงาน (จับคู่ด้วยรหัสพนักงาน 4 หลัก `employees.code`)
  - Highlight ส่วนต่าง (Variance) เช่น ชั่วโมง OT, เงินเดือน, รายการหักสาย/ขาดงาน, ภาษี, ประกันสังคม เพื่อช่วย HR ตรวจทานความถูกต้องก่อนทิ้งไฟล์ Excel เดิม

### ขั้นที่ 2: โครงสร้างปิดงวดและบันทึกประวัติสลิป (`payroll_runs` + `payroll_run_items`)
- เพิ่มตารางตามแผนใน [db-historical-and-payroll-modeling.md](db-historical-and-payroll-modeling.md):
  - **`payroll_runs`**: `(id, year, month, period_start, period_end, status: 'draft' | 'locked' | 'paid', source: 'hrm' | 'excel_import', locked_by_user_id, locked_at)`
  - **`payroll_run_items`**: Snapshot รายพนักงานประจำงวด (ฐานเงินเดือน, OT, รายการรับ/หักทั้งหมดเป็น JSONB หรือตารางลูก, ข้อมูลบัญชีธนาคาร, รายได้/หักสะสม YTD)
- รองรับ **2 แหล่งข้อมูลเข้าสู่ `payroll_runs`**:
  1. **สร้างจากฐานข้อมูล HRM:** ดึงฐานเงินเดือน + OT อนุมัติ + วันลา + รายการผันแปร (เบี้ยขยัน, มาสาย, หักประกันสังคม, ภาษี) มาสร้างงวด `draft` ให้ HR แก้ไข/ปรับยอดก่อนกด `locked`
  2. **นำเข้าจากไฟล์ Excel เข้าเก็บเป็นงวดปิด (Backfill / Hybrid):** กรณีบางเดือนหรือปีย้อนหลังใช้ Excel ให้สามารถ Import ลง `payroll_run_items` เพื่อให้ยอด YTD และสลิปพนักงานดูย้อนหลังได้จากที่เดียว

### ขั้นที่ 3: สิทธิ์ดูสลิปของพนักงาน (Employee Self-Service Payslip)
- เฉพาะงวดที่ `payroll_runs.status IN ('locked', 'paid')` เท่านั้น จึงเปิดสิทธิ์ให้พนักงานดาวน์โหลดสลิป PDF ของตนเองผ่านเมนูเฉพาะ (ต้องเพิ่มสิทธิ์เช่น `salary_slips.view_self` และแยกจาก `employees.compensation.view` ของ HR)

---

## 3. จุดเชื่อมข้อมูลที่ต้องเตรียมให้ตรงกัน (Field Mapping)

| ฟิลด์ใน Excel Slip (`lib/salary-slips/model.ts`) | แหล่งข้อมูลใน HRM Database (`lib/db/schema.ts` & `lib/payroll/`) | หมายเหตุสำหรับ Phase 2 |
| :--- | :--- | :--- |
| `code` (4 หลัก) | `employees.code` (`varchar(4)`) | มาตรฐาน 4 ตัวอักษรตรงกันแล้ว (Migration `0028`) |
| `bank`, `bankAccount` | `employees.payroll_data.bankName` / `bankAccount` | พร้อมใช้งาน |
| `incomes.salary` | `employees.base_salary` | ต้องรองรับประวัติการปรับเงินเดือนแบบ Effective-dated |
| `incomes.ot` | คำนวณจาก `overtime_requests` (อนุมัติแล้ว) | ต้องสรุปนโยบายเวลาพัก OT และวันหยุดนักขัตฤกษ์ก่อน |
| `incomes.*` (`housing`, `phone`, `license`, ฯลฯ) | `employees.payroll_data.incomeItems` | ควรแยกฟิลด์ประจำกับรายการผันแปรรายเดือนให้ชัด |
| `deductions.social_security`, `tax` | ยังไม่คำนวณใน DB ปัจจุบัน | ต้องเพิ่มสูตรคำนวณประกันสังคม/ภาษี หัก ณ ที่จ่าย หรือรับจากป้อนรายเดือน |
| `deductions.leave`, `late`, `absence` | `leave_requests` + กติกาหักวันลา | อ้างอิง [payroll-variable-items-and-leave.md](payroll-variable-items-and-leave.md) |

---

## 4. สิ่งที่ต้องตัดสินใจก่อนเริ่ม Phase 2 (Prerequisites)
1. กติกาคำนวณ OT กับช่วงเวลาพัก และการใช้ค่าตำแหน่ง/แผนก ณ วันทำงานจริง ([reporting-data-policy.md](reporting-data-policy.md))
2. กติกาการหักเงินจากวันลา/ขาดงาน/มาสาย และวิธีกรอกรายการผันแปรรายงวด ([payroll-variable-items-and-leave.md](payroll-variable-items-and-leave.md))
3. สูตรคำนวณภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1) และประกันสังคม 5% เพดานค่าจ้าง รวมถึงรายงาน สปส. 1-10 ([social-security-export.md](social-security-export.md))
4. ช่วง Cutover สำหรับยอดยกมา YTD (เช่น ยกยอดสะสมจากไฟล์ Excel เดือน 1–N เข้า `payroll_run_items` ก่อนเริ่มคำนวณใน HRM)
