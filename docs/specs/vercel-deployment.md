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

## Shared Supabase Database กับ `line-work-tracking`

- ทั้ง `hrm-system` (โปรเจกต์หลักบน Vercel) และ `line-work-tracking` (LINE Bot webhook บน Vercel แยกโปรเจกต์) ใช้ **Supabase PostgreSQL ฐานเดียวกัน**
- **`hrm-system` เป็นเจ้าของ schema และ migrations เพียงผู้เดียว** (`lib/db/schema.ts` + `drizzle/`): รัน `npm run db:migrate` จาก `hrm-system` โดยตั้ง `DIRECT_DATABASE_URL` ชี้ไปยัง Supabase Direct/Session Pooler (`:5432`)
- Runtime ของ `hrm-system` บน Vercel ตั้ง `DATABASE_URL` ชี้ไปยัง Supabase Transaction Pooler (`:6543`, `?pgbouncer=true`) ซึ่ง `lib/db/connection.ts` ปิด prepared statements (`prepare: false`) และบังคับ TLS (`ssl: "require"`) ให้อัตโนมัติ
- ทุกตารางใน schema `public` เปิด `ROW LEVEL SECURITY` โดยไม่มี policy สำหรับ `anon`/`authenticated`; `hrm-system` ใช้ direct Postgres connection ส่วน `line-work-tracking` ใช้ `SUPABASE_SECRET_KEY` (`service_role`) ผ่าน `@supabase/server` และเรียก RPC `public.save_line_work_batch` ที่จำกัดสิทธิ์เฉพาะ `service_role`
- Environment Variables แยกตาม Vercel project:
  - **`hrm-system`**: `DATABASE_URL`, `DIRECT_DATABASE_URL` (เฉพาะ release/migrate), `JWT_SECRET`, `SESSION_COOKIE_NAME`, `CHECKER_API_EMAIL`, `CHECKER_API_PASSWORD`, Google Drive / ImgBB secrets
  - **`line-work-tracking`**: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (จาก Supabase project เดียวกัน), `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `CHECKER_EMAIL` (หรือ `CHECKER_EMAIl`), `CHECKER_PASS`
