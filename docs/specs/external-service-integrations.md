# Spec: Google Drive และ ImgBB integrations

สถานะที่สำรวจ: employee documents อาศัย Google Drive; image upload ของ asset requests ตอบ unavailable เมื่อไม่มี `IMGBB_API_KEY`

## เป้าหมาย

ตั้งค่าและตรวจ external services ที่ระบบพึ่งพา โดยเก็บ credentials ฝั่ง server และให้ผู้ใช้ได้รับ feedback ที่ชัดเจนเมื่อบริการใช้งานไม่ได้

## Google Drive: เอกสารพนักงาน

- ตั้ง Google Drive API, OAuth consent/client และ offline refresh token ที่มี scope `drive.file` ตาม [คู่มือ Google Drive](../GOOGLE_DRIVE_STORAGE.md).
- เก็บ `GOOGLE_DRIVE_OAUTH_CLIENT_ID`, `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN` ใน secret manager ของแต่ละ environment; ห้ามใช้ `NEXT_PUBLIC_*` หรือ commit secrets.
- ตรวจว่าการสร้าง HRM folder, upload, download ผ่าน HRM API, token refresh และ error handling ทำงาน.
- Download ต้องตรวจ permission ใน HRM ก่อนอ่าน file ID; ห้ามสร้าง public Drive link หรือให้สิทธิ์ Drive แก่ผู้ใช้ HRM โดยอัตโนมัติ.
- Apply migrations ก่อนเปิด upload. ก่อนย้าย binary เก่าจาก PostgreSQL ให้ backup, รัน `npm run db:migrate-employee-documents-drive`, ตรวจจำนวน, checksum/metadata และการดาวน์โหลด; migration ต้องรันซ้ำได้หากถูกขัดจังหวะ.
- Google OAuth consent ต้องออกจาก Testing mode สำหรับ token production ตามนโยบาย Google.

## ImgBB: รูปคำขอทรัพย์สิน

- กำหนด `IMGBB_API_KEY` ฝั่ง server เมื่อเปิดใช้งาน.
- ตรวจ upload success, ไฟล์ชนิด/ขนาดไม่รองรับ, provider error, timeout, key หาย และการจำกัด rate.
- API key ต้องไม่ส่งไป browser, response หรือ log.
- UI แสดงผลสำเร็จ/ล้มเหลวและช่วยให้ผู้ใช้ลองใหม่ได้; config ขาดต้องไม่ทำให้ workflow ส่วนอื่นล้ม.

## เกณฑ์ตรวจรับร่วม

- มี runbook ตั้งค่าและหมุนเวียน credentials ต่อ environment.
- มี tests สำหรับ config ขาด, provider errors, unauthorized document access และ upload/download สำเร็จ.
- Logs มีข้อมูลวินิจฉัยที่พอใช้แต่ไม่เก็บ token, key, file content หรือข้อมูลส่วนบุคคลเกินจำเป็น.
- บริการที่ยังไม่ได้ตั้งค่าถูกแสดงสถานะชัดเจน ไม่แสดงว่าพร้อมใช้งาน.
