# Spec: การเก็บไฟล์ต้นฉบับสลิปเงินเดือน

สถานะที่สำรวจ: ข้อมูลสลิปและประวัติ import เก็บใน PostgreSQL; ไฟล์ Excel ต้นฉบับบน Vercel เก็บในพื้นที่ชั่วคราว

## เป้าหมาย

กำหนดและทำให้การเก็บต้นฉบับ Excel สอดคล้องกับนโยบายการตรวจสอบย้อนหลังและการเก็บข้อมูลขององค์กร

## Prerequisite

เจ้าของผลิตภัณฑ์/Payroll/ผู้ดูแลข้อมูลต้องยืนยัน:

- ต้องเก็บไฟล์ต้นฉบับหรือไม่ และเก็บนานเท่าใด.
- ใครอ่าน/ดาวน์โหลดได้ และต้องบันทึก audit event ใด.
- เมื่อครบกำหนดจะลบอย่างไร และข้อกำหนด retention/legal hold ที่เกี่ยวข้อง.

## ข้อกำหนดหากต้องเก็บถาวร

- ใช้ object storage ที่ durable; ห้ามพึ่ง local container filesystem หรือ `/tmp`.
- บันทึก object key, checksum, original filename ที่ sanitize แล้ว, import ID, uploader และ timestamps ในฐานข้อมูล.
- ใช้ access control ฝั่ง server, encryption at rest/in transit, retention/lifecycle policy และ audit log.
- การดาวน์โหลดต้องตรวจ permission ก่อนส่งไฟล์; ห้ามเปิด public URL โดยตรง.
- รองรับ retry/recovery กรณี upload สำเร็จแต่ metadata transaction ล้มเหลว และลบ object ตามนโยบายเมื่อ import ถูกยกเลิก.

## ข้อกำหนดหากไม่เก็บถาวร

- แจ้งผู้ใช้ว่าไฟล์ต้นฉบับอาจหมดอายุ/ไม่พร้อมหลังประมวลผล; ข้อมูลยอดที่ commit และประวัติ revision อยู่ในฐานข้อมูล.
- ไม่แสดงการดาวน์โหลดต้นฉบับว่าใช้งานได้เมื่อไฟล์ไม่มี.

## เกณฑ์ตรวจรับ

- นโยบาย retention และ permission ได้รับอนุมัติและถูกบันทึกในคู่มือ.
- กรณีเก็บถาวร: file ยังคงอ่านได้หลัง restart/redeploy; checksum ตรง; ผู้ไม่มีสิทธิ์ถูกปฏิเสธ; cleanup ทำตาม retention.
- กรณีไม่เก็บถาวร: UI/API อธิบายสถานะและไม่ทำให้เข้าใจว่าไฟล์ยังอยู่.
