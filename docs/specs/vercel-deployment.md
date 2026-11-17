# Spec: Deploy บน Vercel ด้วย Container

สถานะที่สำรวจ: เพิ่ม `Dockerfile.vercel` และ `.dockerignore` แล้ว แต่ยังไม่มีผลยืนยัน image build หรือ Vercel deployment จริง

## เป้าหมาย

สร้างและ deploy HRM เป็น Next.js production container บน Vercel โดยใช้ PostgreSQL ภายนอกและ secrets ที่ตั้งใน Vercel เท่านั้น

## ข้อกำหนด

- เก็บ `Dockerfile.vercel` ที่ root; ใช้ lockfile ผ่าน `npm ci`, แยก dependency/build/runtime stages ตามความเหมาะสม และรัน Next.js production server.
- Runtime ต้อง bind `0.0.0.0` และใช้ `PORT` ที่ Vercel ส่งให้; ห้ามสมมติว่าพอร์ตคงที่.
- `.dockerignore` ต้องกัน `.env`, credentials, `.git`, `node_modules`, `.next`, local data และ output ที่ไม่ต้องใช้.
- ห้ามฝัง `DATABASE_URL`, `JWT_SECRET`, OAuth/API keys หรือข้อมูล environment ลง Dockerfile, image หรือ client bundle.
- ตั้งค่าอย่างน้อย `DATABASE_URL`, `JWT_SECRET`, `SESSION_COOKIE_NAME`; เพิ่ม integration secrets เฉพาะบริการที่เปิดใช้.
- ใช้ PostgreSQL ภายนอกที่รับ connection จาก Vercel; container filesystem และ `/tmp` ไม่ใช่ durable storage.
- Migration เป็น release step ที่ควบคุมครั้งเดียว ไม่รันพร้อมกันจากทุก container ตอน startup.
- ตรวจ config, Next.js build/runtime dependencies, static assets, API routes, session cookies และไฟล์ที่ Next.js ต้องใช้ใน final image.
- มีแผน backup/restore และ rollback ที่เข้ากับลำดับ migration; migration production ต้องไม่ทำลายข้อมูลเดิมโดยไม่มีอนุมัติ.

## วิธีตรวจรับ

1. Build image ใน environment ที่เทียบเท่า CI ด้วย `docker build -f Dockerfile.vercel .`.
2. รัน image โดยกำหนด `PORT` และ environment test แล้วตรวจ HTTP response, asset loading, login/session และ API ที่อ่านฐานข้อมูล.
3. Deploy Vercel Preview และตรวจ login, permission, report PDF, salary export, upload/download ที่เปิดใช้งาน.
4. ตรวจ image/build artifacts ว่าไม่มี secret หรือ local data.
5. หลัง Preview ผ่าน ให้บันทึก migration version, backup, rollback และผล smoke ก่อน Production deploy.

## เกณฑ์ตรวจรับ

- Build ผ่านด้วย package lock ปัจจุบันและ server เริ่มบนพอร์ตจาก runtime.
- Vercel Preview ผ่าน functional smoke โดยไม่มี secret ใน logs/artifacts.
- Database migration ทำครั้งเดียวและ application version ที่ deploy ใช้งาน schema ได้.
- มีบันทึกผล deployment, environment ที่ตรวจ (ไม่บันทึกค่าลับ), rollback plan และผู้อนุมัติ production.

## ข้อจำกัด

การมี Dockerfile อย่างเดียวไม่ถือว่า deploy เสร็จ ต้องผ่าน Preview และตรวจ production environment variables, database connectivity และ migration ด้วย
