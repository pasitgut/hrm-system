# Spec: การตรวจสอบก่อน Production

สถานะที่สำรวจ: มี unit/fixture verification สำหรับรายงาน แต่ผล live database smoke และ deployment smoke ยังต้องยืนยันตาม environment ที่จะปล่อยจริง

## เป้าหมาย

ตรวจความถูกต้องของ build, permission, database, integrations และ PDF ก่อน Production โดยไม่ reset, seed หรือแก้ข้อมูลจริงระหว่าง smoke test

## ขั้นตอนตรวจ

1. รัน typecheck, production build และ targeted unit/API tests ที่เกี่ยวข้องกับไฟล์ที่เปลี่ยน.
2. สร้าง PDF fixture สำหรับรายงานที่เปลี่ยน; ตรวจ PDF signature, ภาษาไทย, หลายหน้า, ยอดรวมและขอบเขตวัน.
3. รัน live smoke แบบ read-only กับฐานข้อมูลที่อนุมัติ: query รายงาน, ตรวจจำนวนผลลัพธ์และ metadata ของ PDF; ปิด connection เมื่อเสร็จ.
4. ตรวจ permission matrix สำหรับ login/session, employee, payroll, documents, OT, leave และ reports: 401, 403, self-only และการป้องกันการขอข้อมูลบุคคลอื่น.
5. ตรวจ migration บนสำเนาฐานข้อมูล/backup ก่อนใช้จริง; บันทึก migration version และผลตรวจ.
6. ตรวจ Vercel Preview: startup, `PORT`, static assets, session, database, export/download และ integrations ที่เปิดใช้.
7. บันทึกผล, commit/build identifier, ประเภท environment, คำสั่ง/การตรวจที่รัน และข้อจำกัด; ห้ามบันทึก secret หรือข้อมูลอ่อนไหวใน log.

## เกณฑ์ตรวจรับ

- ทุก check ที่เกี่ยวข้องผ่าน; หากล้มเหลว มี issue ที่ระบุผลกระทบและผู้รับผิดชอบก่อน Production.
- Live smoke ใช้ read-only access และไม่เรียก seed/reset/write route.
- Permission tests ปฏิเสธ user ที่ไม่มีสิทธิ์และป้องกันการเข้าถึงข้าม employee scope.
- PDF เปิดได้, ไม่มีข้อความไทยตัด/ทับ/หน้าเปล่าที่ไม่ตั้งใจ และยอดตรง fixture/source.
- มีบันทึกผลที่ทำซ้ำได้โดยไม่เปิดเผยข้อมูลลับ.
