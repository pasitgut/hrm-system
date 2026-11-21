# Implementation specs

เอกสารนี้เป็นสารบัญรวบรวมงานที่ยังไม่เสร็จ ส่วนที่รอการตัดสินใจเชิงนโยบาย การตั้งค่าบริการภายนอก และการตรวจรับก่อน Production โดยแต่ละขอบเขตงานมี spec แยกไฟล์ของตัวเอง

## สรุปสถานะงานทั้งหมด

| หมวดหมู่ | Spec | สถานะ |
| :--- | :--- | :--- |
| **สิทธิ์และบทบาท (Auth & Roles)** | [บทบาทผู้ใช้ในระบบ (พนักงาน / HR / ผู้บริหาร)](user-roles-and-portals.md) | `implement แกนหลักแล้ว` (เหลือ Executive Dashboard UI) |
| **รายงาน (`/reports`)** | [ตัวเลือกงวดรายงานแบบกำหนดเอง](report-period-selection.md) | `ยังไม่ implement` (มี UI แต่ปิดส่งออก) |
| **รายงาน (`/reports`)** | [รายงานเบี้ยขยัน](bonus-report.md) | `รอการตัดสินใจ` / `ยังไม่ implement` |
| **รายงาน (`/reports`)** | [นโยบายข้อมูลและการคำนวณรายงาน OT](reporting-data-policy.md) | `รอการตัดสินใจ` (เวลาพัก OT, snapshot แผนก/ตำแหน่ง) |
| **เงินเดือน (`/payroll`)** | [ส่งออกรายงานประกันสังคม (สปส. 1-10)](social-security-export.md) | `รอการตัดสินใจ` / `ยังไม่ implement` (ลบ API เก่าที่ค้างแล้ว) |
| **เงินเดือน (`/payroll`)** | [การคำนวณเงินเดือนส่วนขยาย (หน่วยวัน/ชั่วโมง และวันลา)](payroll-variable-items-and-leave.md) | `รอการตัดสินใจ` / `ยังไม่ implement` |
| **เงินเดือน (`/payroll`)** | [เก็บกวาดระบบสลิปเงินเดือนแบบ Stateless และสิทธิ์เดิม](salary-slip-stateless-cleanup.md) | `เก็บกวาดโค้ดและ schema แล้ว` (เหลืออัปเดตเอกสาร) |
| **เงินเดือน (`/payroll`)** | [การเก็บไฟล์ต้นฉบับสลิปเงินเดือน](salary-slip-source-retention.md) | `รออัปเดตเอกสาร` (สลิปเปลี่ยนเป็น stateless แล้ว) |
| **ติดตามงาน (`/work-tracking`)** | [ฟอร์มสร้างรายการติดตามงานจาก UI](work-tracking-create-ui.md) | `รอการตัดสินใจ` (มี API `POST /api/work`, ไม่มีฟอร์ม UI) |
| **ฐานข้อมูล (Database Design)** | [ปรับปรุง DB Constraints และ Indexing (Quick Wins)](db-constraints-and-indexing.md) | `ยังไม่ implement` (พร้อมทำทันที) |
| **ฐานข้อมูล (Database Design)** | [ปรับปรุง Normalization และเก็บกวาด Schema เดิม](db-schema-cleanup-and-normalization.md) | `เก็บกวาด dead tables/columns แล้ว` (เหลือแยก `employee_document_shares`) |
| **ฐานข้อมูล (Database Design)** | [โครงสร้างข้อมูลประวัติย้อนหลังและการรองรับ Payroll ระยะยาว](db-historical-and-payroll-modeling.md) | `รอการตัดสินใจ` / `ยังไม่ implement` |
| **โครงสร้างพื้นฐาน & Deploy** | [บริการภายนอก Google Drive และ Cloudinary](external-service-integrations.md) | `รอตั้งค่า integration` (+ API Checker) |
| **โครงสร้างพื้นฐาน & Deploy** | [Deploy บน Vercel ด้วย Container และ Shared Supabase DB](vercel-deployment.md) | `รอตรวจ environment จริง` |
| **ตรวจรับ & Release** | [การตรวจสอบก่อน Production](production-verification.md) | `รอตรวจ environment จริง` |
| **ตรวจรับ & Release** | [เอกสารและความพร้อมก่อน Release](release-readiness.md) | `เก็บกวาด/refactor` |

อัปเดตล่าสุดวันที่ 2026-11-21 จากการสำรวจ repository ทั้งระบบ ขอบเขตหรือกติกาที่ระบุว่า `รอการตัดสินใจ` ให้ถือเป็น prerequisite และยังไม่ implement จนกว่าเจ้าของผลิตภัณฑ์จะยืนยันข้อสรุป
