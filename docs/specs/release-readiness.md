# Spec: เอกสารและความพร้อมก่อน Release

สถานะที่สำรวจ: พบเอกสารรายงานบางส่วนไม่ตรง implementation และมี working tree changes ที่ต้อง review ก่อน release

## ปรับเอกสาร

- ปรับ `docs/OT_REPORTS_PLAN.md`: ปัจจุบันยังบอกว่า PDF เป็น placeholder และไม่มี API ทั้งที่ implementation มีแล้ว.
- ปรับ `docs/OT_REPORTS_LOCAL.md`: ปัจจุบันยังบอกว่ารายงานวันลาไม่พร้อม ทั้งที่มี API, PDF และคู่มือวันลา.
- อัปเดต README/product overview หากมีเอกสารหลักของผลิตภัณฑ์; ห้ามสร้างคำกล่าวอ้างว่า feature production-ready หากยังไม่ได้ deploy/ตรวจจริง.
- ใช้สถานะที่แยกจากกัน: `ยังไม่ implement`, `รอตั้งค่า integration`, `รอตรวจ environment จริง`, `รอการตัดสินใจ`.
- เมื่อปรับตัวเลือกงวดหรือ implement bonus report ให้อัปเดต usage, API, permission, calculation rules และ verification record ใน spec/คู่มือรายงานนั้น.

## ทบทวน working tree

จากการตรวจพบไฟล์เปลี่ยนแปลงที่ยังไม่ commit: `docker-compose.yml`, `next-env.d.ts`, `next.config.mjs`, `Dockerfile.vercel` และ `.dockerignore`.

- Review diff ของทุกไฟล์ก่อน release; ห้าม reset หรือทิ้งการเปลี่ยนแปลงของผู้ใช้โดยไม่ตรวจ.
- ตรวจ `docker-compose.yml` ว่า external volume มีจริง, พอร์ต bind ตามต้องการ และค่าพัฒนาจะไม่ถูกใช้เป็น production secret.
- `next-env.d.ts` เป็นไฟล์ generated; ยืนยันว่ารูปแบบมาจาก Next.js version ที่ติดตั้ง ไม่แก้ด้วยมือเพื่อปิด type errors.
- ตรวจ next config dev origins ว่าตั้งใจและจำกัดเฉพาะ host ที่ต้องใช้.

## เกณฑ์ตรวจรับ

- เอกสารไม่มีสถานะที่ขัดกับ implementation; ทุก gap มี spec/สถานะ/ผู้รับผิดชอบ.
- Working tree diff ผ่าน review; ไม่มี generated file ผิดสถานะหรือ dev secret ที่จะถูก deploy.
- Compose/build ที่ทีมใช้ผ่านการตรวจตามวัตถุประสงค์ก่อน merge.
- Release note ระบุฟีเจอร์ที่เปิดจริง, integration ที่ตั้งค่าแล้ว, ข้อจำกัดและ migration.
