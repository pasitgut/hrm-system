# คู่มือการ Deploy ระบบ HRM ขึ้น Production

เอกสารนี้สรุปสถาปัตยกรรม สภาพแวดล้อมที่ต้องเตรียม การตั้งค่า Environment Variables การ Run Database Migration และขั้นตอนการ Deploy ระบบ `hrm-system` ขึ้น **Vercel** (แนะนำ) หรือ **Docker Container** สำหรับใช้งานจริง

> [!IMPORTANT]
> ระบบใช้ **PostgreSQL (Supabase)** ร่วมกับบริการภายนอก **Google Drive** (เก็บเอกสารพนักงานสูงสุด 50 MB) และ **Cloudinary** (เก็บรูปภาพทั้งหมด) โดยไม่มีการเก็บไฟล์ Binary ลงใน Database และระบบได้รับการออกแบบให้เลี่ยงข้อจำกัด Payload **4.5 MB ของ Vercel** แล้ว

---

## 1. ภาพรวมสถาปัตยกรรม (Architecture Overview)

| ส่วนประกอบ | หน้าที่ | รายละเอียดสำคัญ |
| :--- | :--- | :--- |
| **Next.js App (`hrm-system`)** | Web UI + API Routes | Region เริ่มต้น `sin1` (Singapore) ตาม [vercel.json](../vercel.json) |
| **PostgreSQL (Supabase)** | ฐานข้อมูลหลัก (29 ตาราง, 8 Enums) | เปิด RLS ทุกตาราง `public`; ใช้ Transaction Pooler `:6543` สำหรับ Runtime และ Session Pooler `:5432` สำหรับ Migration ([database.dbml](./database.dbml)) |
| **LINE Leave & Calendar Bot (ใน `hrm-system`)** | ยื่น/อนุมัติวันลาและนัดหมาย Google Calendar ผ่าน LINE 1:1 | Webhook `POST /api/line/webhook` + Retry Worker `POST /api/internal/integrations/retry` (ควบคุมด้วย `LINE_BOT_ENABLED`, ดู [line-cutover.md](./runbooks/line-cutover.md)) |
| **Companion (`line-work-tracking`)** | LINE Webhook & Sync Worker งานตรวจบ้าน/OT | แชร์ฐานข้อมูล Supabase เดียวกัน เรียก RPC `save_line_work_batch` อัปเดต `work_tracking_records`, `work_tracking_requests`, `work_tracking_activities` และ `overtime_requests` เชื่อมสองทางกับหน้า `/work-tracking` ([vercel-deployment.md](./specs/vercel-deployment.md)) |
| **Google Drive API** | เก็บไฟล์เอกสารพนักงาน | OAuth2 (`drive.file` scope) + Resumable Chunked Upload ผ่าน `/api/employees/[id]/documents/upload/{init,chunk}` |
| **Cloudinary** | เก็บรูปโปรไฟล์, รูปทรัพย์สิน, ลายเซ็น, รูปในสัญญา | Direct Signed Upload ผ่าน `/api/media/signature` + Auto-migrate ลิงก์ `ibb.co` เดิมอัตโนมัติ |
| **API Checker** | เชื่อมต่อสถานะงานตรวจบ้าน | ยืนยันตัวตนด้วย `CHECKER_API_EMAIL` และ `CHECKER_API_PASSWORD` |

---

## 2. การเตรียมบริการภายนอกก่อน Deploy (Prerequisites)

### 2.1 Supabase (PostgreSQL)
1. สร้างโปรเจกต์บน Supabase (แนะนำ Region **Singapore `ap-southeast-1`** ให้ตรงกับ Vercel `sin1`).
2. เตรียม Connection String **2 เส้น** จาก **Connect → Connection String** โดยเลือก **Pooler (`*.pooler.supabase.com`)** และใช้ Username รูปแบบ `postgres.<project-ref>`:
   - **Transaction Pooler (Port `6543` พร้อม `?pgbouncer=true`)** → ใช้เป็น `DATABASE_URL` สำหรับ Serverless Runtime (`lib/db/connection.ts` จะปิด `prepare` statement, เปิด `ssl: "require"`, และจำกัด pool `{ max: 5, idle_timeout: 20, connect_timeout: 15 }` ให้อัตโนมัติ)
   - **Session Pooler (Port `5432` บน `*.pooler.supabase.com`)** → ใช้เป็น `DIRECT_DATABASE_URL` สำหรับการรัน Drizzle Migration อัตโนมัติตอนเริ่มเซิร์ฟเวอร์ (`instrumentation.ts` / `lib/db/auto-migrate.ts`) และ `npm run db:migrate`

> [!WARNING]
> **ข้อควรระวังสำคัญสำหรับ Vercel + Supabase (IPv4 vs IPv6):**
> โดเมน Direct Connection ของ Supabase (`db.<project-ref>.supabase.co:5432`) รองรับเฉพาะ **IPv6** เท่านั้น แต่ Vercel Runtime ใช้ **IPv4** เป็นหลัก — หากใส่ `db.<project-ref>.supabase.co` จะเกิดอาการเชื่อมต่อฐานข้อมูลไม่ได้ (`ENETUNREACH`) และสร้างตารางไม่สำเร็จ ให้ใช้ **Pooler Host (`aws-0-<region>.pooler.supabase.com`)** เท่านั้น ทั้ง Transaction Pooler (`6543`) และ Session Pooler (`5432`) พร้อมตรวจสอบว่าเข้ารหัสอักขระพิเศษในรหัสผ่าน (`@`, `#`, `?`, `/`) ด้วย URL-encoding แล้ว

3. ตรวจสอบว่า **RLS (Row Level Security)** เปิดครบทั้ง 29 ตารางใน schema `public` (รวม 4 ตารางของ LINE Bot ใน Migration `0029` และ `role_permissions` ใน Migration `0030`) เพื่อป้องกันการเข้าถึงตรงผ่าน PostgREST โดยไม่ผ่าน Server API ของระบบ (ดูรายละเอียดใน [vercel-deployment.md](./specs/vercel-deployment.md))
4. หากใช้งานร่วมกับ `line-work-tracking` ให้ตั้งค่า Environment Variables ของฝั่งนั้นแยกต่างหากตามสเปก (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `CHECKER_EMAIL`, `CHECKER_PASS`)

### 2.2 Google Drive OAuth (สำหรับเอกสารพนักงาน)
1. ตั้งค่า Google Cloud Project, เปิด **Google Drive API**, และขอ OAuth Client ID + Offline Refresh Token (scope `drive.file`) ตามขั้นตอนใน [GOOGLE_DRIVE_STORAGE.md](./GOOGLE_DRIVE_STORAGE.md)
2. **สำคัญมากสำหรับ Production:** ต้องกด **Publish App** ใน OAuth Consent Screen ให้ออกจากโหมด `Testing` มิฉะนั้น Refresh Token จะหมดอายุทุก 7 วัน
3. เก็บค่า `GOOGLE_DRIVE_OAUTH_CLIENT_ID`, `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN` ไว้ใน Environment Variables ฝั่ง Server เท่านั้น (ห้ามใช้ prefix `NEXT_PUBLIC_`)

### 2.3 Cloudinary (สำหรับรูปภาพทั้งหมด)
1. สมัครและเปิดใช้งานบัญชี Cloudinary แล้วคัดลอก **Cloud Name**, **API Key**, **API Secret** จาก Dashboard
2. ตั้งค่าเป็น `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (หรือ `CLOUDINARY_URL` ค่าเดียว ระบบใน `lib/cloudinary.ts` รองรับทั้ง 2 รูปแบบ)
3. ห้ามเปิดเผย `CLOUDINARY_API_SECRET` ออกไปยัง Client/Browser (ฝั่ง Client ใช้การขอ Signature จาก `/api/media/signature` แล้วอัปโหลดตรงไป Cloudinary)

### 2.4 Security Secret (`JWT_SECRET`)
สร้าง Secret แบบสุ่มที่มีความยาวและ Entropy สูงสำหรับลงนาม Session Cookie และเข้ารหัส Upload Token (`lib/upload-token.ts`):
```bash
openssl rand -base64 32
```

### 2.5 LINE Bot (ลางาน/นัดหมาย) และ Google Calendar Service Account *(เปิดใช้เมื่อพร้อม)*
1. สร้าง LINE Messaging API Channel ใน LINE Developers Console แล้วเก็บ **Channel Secret** (`LINE_CHANNEL_SECRET`) และ **Channel Access Token** (`LINE_CHANNEL_ACCESS_TOKEN`)
2. สร้าง Bearer Secret แบบสุ่มสำหรับ `LINE_INTEGRATION_SECRET` (เช่น `openssl rand -base64 32`) แล้วตั้งค่า Scheduler (เช่น Supabase `pg_cron`+`pg_net` หรือ External Cron) ให้ยิง `POST https://<your-domain>/api/internal/integrations/retry` พร้อม Header `Authorization: Bearer <LINE_INTEGRATION_SECRET>` ทุก **5 นาที**
3. สำหรับการซิงก์วันลา/นัดหมายเข้า Google Calendar ให้สร้าง **Google Cloud Service Account** แยกจาก Google Drive OAuth, แชร์ปฏิทินเป้าหมาย (`GOOGLE_CALENDAR_ID`) ให้กับอีเมล Service Account (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) พร้อมสิทธิ์แก้ไขกิจกรรม และใส่ PKCS8 private key ใน `GOOGLE_PRIVATE_KEY` (รองรับ `\n` แบบ escaped)
4. ตั้งค่า `LINE_BOT_ENABLED=false` ไว้ก่อนจนกว่า Migration `0029`, Secret ทั้งหมด และ Scheduler จะพร้อม แล้วจึงเปลี่ยนเป็น `true` และชี้ LINE Webhook URL มาที่ `https://<your-domain>/api/line/webhook` (ดูขั้นตอน Cutover ฉบับเต็มใน [docs/runbooks/line-cutover.md](./runbooks/line-cutover.md))

> [!WARNING]
> **ห้ามใช้ LINE Webhook URL ทับกับ `line-work-tracking` โดยไม่ตรวจสอบก่อน:** หากบริษัทใช้งาน `line-work-tracking` (ส่งงาน/OT ผ่านกลุ่ม LINE) อยู่บน LINE OA เดียวกัน ให้แยก LINE OA คนละตัวสำหรับบอทลางาน หรือเตรียม Router ก่อนเปลี่ยน Webhook URL มิฉะนั้นคำสั่งส่งงานเดิมจะไม่ถูกส่งไปยัง `line-work-tracking`

---

## 3. รายการ Environment Variables ทั้งหมด

อ้างอิงจาก [.env.example](../.env.example):

| ตัวแปร | จำเป็น | ใช้ใน | คำอธิบาย |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | จำเป็น | Runtime (Vercel / Server) | Supabase Transaction Pooler (`aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true`) |
| `DIRECT_DATABASE_URL` | แนะนำ (Migration) | Startup Auto-Migrate / CLI | Supabase Session Pooler (`aws-0-<region>.pooler.supabase.com:5432/postgres`) สำหรับรัน `drizzle/` Migration (รองรับ IPv4 บน Supabase Free ไม่ต้องใช้ `db.*.supabase.co`) |
| `TEST_DATABASE_URL` | เฉพาะ Test | Local / CI Test | ฐานข้อมูลแยกสำหรับการทดสอบ **ห้ามชี้ไปที่ Production** |
| `JWT_SECRET` | จำเป็น | Runtime (Server) | คีย์ลับสำหรับ JWT Session และ Upload Token |
| `ADMIN_PASSWORD` | แนะนำ (Security) | Runtime (Server) | รหัสผ่านของบัญชีผู้ดูแลระบบกลาง (`admin`) — หากไม่ตั้งค่า ระบบจะใช้ค่าเริ่มต้น `admin` |
| `ADMIN_USERNAME` | ไม่บังคับ | Runtime (Server) | ชื่อผู้ใช้ของบัญชีผู้ดูแลระบบกลาง (ค่าเริ่มต้น `admin`) |
| `ADMIN_EMAIL` | ไม่บังคับ | Runtime (Server) | อีเมลอ้างอิงของบัญชีผู้ดูแลระบบกลาง (ค่าเริ่มต้น `admin@peopleos.co`) |
| `SESSION_COOKIE_NAME` | ไม่บังคับ | Runtime (Server) | ชื่อ Cookie ของ Session (กรณีต้องการกำหนดเอง) |
| `CHECKER_API_EMAIL` | จำเป็น (ถ้าใช้ Work Tracking) | Runtime (Server) | อีเมลสำหรับเชื่อมต่อ API Checker |
| `CHECKER_API_PASSWORD` | จำเป็น (ถ้าใช้ Work Tracking) | Runtime (Server) | รหัสผ่านสำหรับเชื่อมต่อ API Checker |
| `GOOGLE_DRIVE_OAUTH_CLIENT_ID` | จำเป็น (Documents) | Runtime (Server) | OAuth Client ID ของ Google Drive |
| `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET` | จำเป็น (Documents) | Runtime (Server) | OAuth Client Secret ของ Google Drive |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | จำเป็น (Documents) | Runtime (Server) | Offline Refresh Token (`drive.file`) |
| `CLOUDINARY_CLOUD_NAME` | จำเป็น (Images) | Runtime (Server) | Cloud Name ของ Cloudinary |
| `CLOUDINARY_API_KEY` | จำเป็น (Images) | Runtime (Server) | API Key ของ Cloudinary |
| `CLOUDINARY_API_SECRET` | จำเป็น (Images) | Runtime (Server) | API Secret ของ Cloudinary (ห้ามส่งออกฝั่ง Client) |
| `CLOUDINARY_URL` | ทางเลือก | Runtime (Server) | ใช้แทนชุดตัวแปร `CLOUDINARY_*` ด้านบนได้ |
| `LINE_BOT_ENABLED` | จำเป็น (ถ้าใช้ LINE Bot) | Runtime (Server) | เปิด/ปิด LINE Leave & Calendar Bot (`false` โดยค่าเริ่มต้น; ตั้ง `true` เมื่อพร้อม) |
| `LINE_CHANNEL_SECRET` | จำเป็น (ถ้าใช้ LINE Bot) | Runtime (Server) | Channel Secret สำหรับตรวจลายเซ็น `x-line-signature` ที่ `/api/line/webhook` |
| `LINE_CHANNEL_ACCESS_TOKEN` | จำเป็น (ถ้าใช้ LINE Bot) | Runtime (Server) | Channel Access Token สำหรับส่งข้อความ Reply/Push ผ่าน LINE Messaging API |
| `LINE_INTEGRATION_SECRET` | จำเป็น (ถ้าใช้ LINE Bot) | Scheduler / Cron | Bearer Secret สำหรับเรียก `POST /api/internal/integrations/retry` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | จำเป็น (ถ้าซิงก์ Calendar) | Runtime (Server) | อีเมล Service Account ที่มีสิทธิ์เขียนลง Google Calendar เป้าหมาย |
| `GOOGLE_PRIVATE_KEY` | จำเป็น (ถ้าซิงก์ Calendar) | Runtime (Server) | PKCS8 Private Key ของ Service Account (รองรับ `\n` แบบ escaped) |
| `GOOGLE_CALENDAR_ID` | จำเป็น (ถ้าซิงก์ Calendar) | Runtime (Server) | Calendar ID ที่แชร์สิทธิ์ให้ Service Account แล้ว |

---

## 4. การเตรียมฐานข้อมูล (Database Migration & Initial Data)

### 4.1 ตรวจสอบความถูกต้องของ Schema
```bash
npm run typecheck
DATABASE_URL="postgresql://user:pass@localhost:5432/db" npm run db:check
```
*(หมายเหตุ: ในเครื่องที่ติดตั้ง Bun สามารถรันผ่าน `bun run` แทน `npm run` ได้)*

### 4.2 การสร้างตารางอัตโนมัติ (Auto-Migration) และรัน Migration ด้วยตนเอง
ระบบมีกลไก **Auto-Migration อัตโนมัติตอนเริ่มเซิร์ฟเวอร์** (`instrumentation.ts` → `lib/db/auto-migrate.ts`) เมื่อเริ่ม Instance หรือเปิดหน้าเว็บครั้งแรก:
- ระบบจะรันไฟล์ SQL ทั้งหมดในโฟลเดอร์ `drizzle/` โดยใช้ `DIRECT_DATABASE_URL` (Session Pooler `:5432`) และ fallback ไป `DATABASE_URL` ให้อัตโนมัติ พร้อมเติมข้อมูลพื้นฐาน (`employment_statuses`, `employment_types`, `request_statuses`, `leave_types`, `ot_rate_settings`) และสร้างบัญชีผู้ใช้ (`users`) อัตโนมัติแบบ idempotent ให้พนักงานที่ปฏิบัติงานอยู่ซึ่งมีอีเมลถูกต้องแต่ยังไม่มีบัญชี (รหัสผ่านเริ่มต้น = รหัสพนักงาน 4 หลัก และ `must_change_password = true`)
- หากเชื่อมต่อฐานข้อมูลไม่ได้หรือยังไม่มีตาราง ระบบจะแสดงแบนเนอร์แจ้งสาเหตุและคำแนะนำชัดเจนบนหน้าเว็บ (เช่น แจ้งเตือนกรณีใช้ `db.*.supabase.co` ซึ่งเป็น IPv6 บน Vercel)

กรณีต้องการรัน Migration ด้วยตนเองล่วงหน้าจากเครื่องหรือ CI/CD Pipeline:
```bash
export DIRECT_DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
npm run db:migrate
```
สคริปต์ `scripts/db/migrate.ts` จะใช้ `DIRECT_DATABASE_URL` (fallback ไป `DATABASE_URL`) และรัน Migration + เติมข้อมูลพื้นฐานชุดเดียวกัน

### 4.3 บัญชีผู้ดูแลระบบกลาง (Built-in Admin) และ Seed ข้อมูลตัวอย่าง
- **บัญชีผู้ดูแลระบบ (`admin`) ไม่จำเป็นต้องสร้างแถวในตาราง `employees` / `users` และไม่ต้องรัน Seed ก่อนเข้าสู่ระบบ:** ระบบฝังบัญชีผู้ดูแลระบบกลางไว้ในโค้ด (`lib/auth/admin.ts`) สามารถเข้าสู่ระบบทันทีด้วยชื่อผู้ใช้ `admin` และรหัสผ่านเริ่มต้น `admin` (หรือใช้ค่าจากตัวแปร `ADMIN_PASSWORD`, `ADMIN_USERNAME`, `ADMIN_EMAIL` ใน Environment Variables หากมีการกำหนดไว้)
- สำหรับการใช้งานจริงบน Production ควรตั้งค่า `ADMIN_PASSWORD` เป็นรหัสผ่านที่ปลอดภัยใน Vercel / Environment Variables

> [!CAUTION]
> สคริปต์ `scripts/db/seed.ts` ใช้สำหรับทดสอบภายในเครื่องเท่านั้น โดยจะทำการ **TRUNCATE ข้อมูลเดิม** ในตาราง Master, พนักงาน, ผู้ใช้ และคำขอต่างๆ และจะบล็อกการรันบนฐานข้อมูล Production โดยอัตโนมัติ (ยกเว้นกำหนด `ALLOW_DESTRUCTIVE_DB_SCRIPTS=1`) **ห้ามรันบนระบบที่มีข้อมูลจริงแล้ว**

สำหรับฐานข้อมูลทดสอบที่เพิ่งสร้างใหม่เท่านั้น (เติมแผนก/ตำแหน่ง/ข้อมูลอ้างอิงตัวอย่าง):
```bash
ALLOW_DESTRUCTIVE_DB_SCRIPTS=1 DATABASE_URL="$DIRECT_DATABASE_URL" npm run db:seed
```

### 4.4 การนำเข้าข้อมูลจาก Google Sheet (AppSheet `.xlsx`)
- สามารถอัปโหลดไฟล์ `.xlsx` ที่ดาวน์โหลดจาก Google Sheet (**File → Download → Microsoft Excel (.xlsx)**) ได้โดยตรงที่หน้า **`/settings/import` (นำเข้าข้อมูล)** สำหรับผู้ดูแลระบบ (`users.permissions.manage`)
- **รองรับการเลือกนำเข้าเฉพาะส่วน (Selective Import):** สามารถอัปโหลดไฟล์ทั้ง 5 แท็บ หรือไฟล์ที่มีเฉพาะแท็บที่ต้องการ (เช่น เฉพาะ `ข้อมูลการทำโอที`) แล้วเลือกติ๊กเฉพาะส่วนที่ต้องการนำเข้าได้ โดยส่วนอื่นที่ไม่ได้เลือกจะคงข้อมูลเดิมในระบบไว้ทั้งหมด
- **พฤติกรรมเมื่อเลือกนำเข้าแต่ละส่วน:**
  1. `ข้อมูลพนักงาน` → อัปเดตและเพิ่มพนักงานใหม่เข้า `employees` แบบ **Upsert ตามรหัสพนักงาน** โดยคง `employees.id`, ข้อมูลเงินเดือน/เรท OT, เอกสารพนักงาน และบัญชีผู้ใช้ `users` เดิม (รหัสผ่าน, `role`, `permissions`) ไว้ตามเดิม พร้อมสร้างบัญชี `users` ให้อัตโนมัติเฉพาะพนักงานปฏิบัติงานที่มีอีเมลถูกต้องและยังไม่มีบัญชี (รหัสผ่านเริ่มต้น = รหัสพนักงาน 4 หลัก และ `must_change_password = true`) ส่วนพนักงานที่พ้นสภาพจะปิดสถานะ `users.is_active = false` และพนักงานที่ยังไม่มีอีเมลสามารถไปเติมอีเมลแล้วกดสร้างบัญชีย้อนหลังได้ในหน้า **ตั้งค่า → สิทธิ์ผู้ใช้**
  2. `ข้อมูลการยืมทรัพย์สิน` → แทนที่ `asset_requests`, `asset_request_items`, `asset_request_attachments`, `asset_agreements`, `asset_agreement_signers` (รองรับ Agreement HTML, กล่องลายเซ็น JSON 3 ฝ่าย รวมถึงเซลล์แบบ RichText+Hyperlink และรูปแนบ โดยคงแม่แบบ `asset_agreement_templates` เดิมไว้)
  3. `ข้อมูลการทำโอที` → แทนที่ `overtime_requests` (ผูกกับพนักงานที่มีอยู่ในระบบหรือเลือกนำเข้าพร้อม `ข้อมูลพนักงาน`)
  4. `ข้อมูลการลา` → แทนที่ `leave_requests`
  5. `ข้อมูลงาน` → แทนที่ `work_tracking_records` (กู้คืนเลขที่บ้านที่ Excel แปลงเป็นวันที่อัตโนมัติ, ดึงรายการเสริมในคอลัมน์ H–N, คำนวณ `delivered_date` และรวมรายการคีย์ซ้ำ)
- ระบบจะตรวจสอบไฟล์, แสดงยอดในไฟล์เทียบกับยอดปัจจุบันในระบบ และสรุปส่วนที่เลือกก่อนกดยืนยันบันทึกใน 1 Transaction (`lib/migration/appsheet.ts` และ `lib/migration/import-db.ts`)
- กรณีใช้งานผ่านสคริปต์ CLI รุ่นเดิม (`scripts/migration/appsheet_to_sql.py`) ดูรายละเอียดใน [scripts/migration/README.md](../scripts/migration/README.md) *(CLI รุ่นเดิมครอบคลุมเฉพาะ 4 แท็บแรกโดยไม่รวม Agreement/ลายเซ็น และ `ข้อมูลงาน`)*

### 4.5 การย้ายลิงก์รูป ImgBB เดิมมา Cloudinary (ถ้ามีข้อมูลเดิม)
ระบบมีกลไก 2 ชั้น:
1. **อัตโนมัติ (Read/Write Auto-Migration):** เมื่อมีการเปิดดูหรือบันทึกข้อมูลพนักงาน, คำขอยืมทรัพย์สิน, ลายเซ็น หรือเทมเพลตสัญญาที่มีลิงก์ `ibb.co` ระบบจะดูดรูปมาเก็บใน Cloudinary และอัปเดตฐานข้อมูลให้อัตโนมัติ (`lib/cloudinary-migration.ts`)
2. **ย้ายทั้งฐานข้อมูลแบบ Batch ล่วงหน้า:**
   ```bash
   npm run db:migrate-imgbb-cloudinary
   ```
   หรือสั่งผ่าน API `POST /api/media/migrate-imgbb` (เฉพาะสิทธิ์ผู้ดูแลระบบ)

---

## 5. การ Deploy ขึ้น Vercel

### 5.1 กลไกเลี่ยงข้อจำกัด 4.5 MB ของ Vercel ที่ฝังอยู่ในระบบแล้ว
Vercel จำกัดขนาด Request/Response Body ของ Serverless Function ไว้ที่ **4.5 MB** ซึ่งระบบจัดการไว้ครบทุกจุด:
- **เอกสารพนักงาน (สูงสุด 50 MB):** แบ่งอัปโหลดเป็น Chunk ละ **3 MiB** ผ่าน Google Drive Resumable Upload (`/api/employees/[id]/documents/upload/init` และ `/chunk`) พร้อม Token เข้ารหัส (`lib/upload-token.ts`)
- **รูปภาพทั้งหมด:** ย่อขนาดและบีบอัดฝั่ง Client (`lib/client/optimize-image.js`) แล้วอัปโหลดตรงจาก Browser ไปยัง Cloudinary ด้วย Direct Signed Upload (`/api/media/signature`) จึงไม่วิ่งผ่าน Serverless Payload ของ Vercel
- **นำเข้าสลิปเงินเดือน (`.xlsx`):** แปลงไฟล์และแบ่ง Batch ส่งเป็น JSON (`lib/salary-slips/*`) ก่อนส่งไป Export เป็น PDF/XLSX
- **ส่งออกไฟล์ / ดาวน์โหลดเอกสาร:** ใช้ `bufferToReadableStream` (`lib/api/stream.ts`) เพื่อ Stream ข้อมูลตอบกลับแทนการส่ง Buffer ก้อนเดียว

### 5.2 ขั้นตอน Deploy บน Vercel
1. **เชื่อม Repository:** Import โปรเจกต์ `hrm-system` เข้า Vercel (Framework Preset: **Next.js**)
2. **ตั้งค่า Build & Node Version:**
   - Install Command: `npm install` (หรือค่าเริ่มต้นของ Vercel)
   - Build Command: `npm run build`
   - ตรวจสอบ Region ให้เป็น **Singapore (`sin1`)** ซึ่งระบุไว้ใน [vercel.json](../vercel.json) เพื่อลด Latency ระหว่าง Vercel ↔ Supabase
3. **กรอก Environment Variables:**
   - ใส่ตัวแปรทั้งหมดในหัวข้อที่ 3 แยกตาม Environment (**Production**, **Preview**)
   - ตรวจสอบว่า `DATABASE_URL` ใช้ Transaction Pooler (`*.pooler.supabase.com:6543/postgres?pgbouncer=true`) และ `DIRECT_DATABASE_URL` ใช้ Session Pooler (`*.pooler.supabase.com:5432/postgres`) และตั้งค่า Secret ทั้งหมดเป็น Encrypted Env Vars (ไม่ต้องใส่เครื่องหมาย `"` ครอบค่า)
4. **รัน Migration แล้ว Deploy:**
   - รัน `npm run db:migrate` ให้เรียบร้อยก่อน Traffic เข้า Production
   - กด Deploy และแนะนำให้ทดสอบบน **Preview Deployment** ก่อน Promote เป็น Production

---

## 6. การ Deploy ด้วย Docker Container (ทางเลือก)

โปรเจกต์มีไฟล์ [Dockerfile.vercel](../Dockerfile.vercel) สำหรับรันแบบ Node Container (`node:22-bookworm-slim`, port `3000`):

```bash
docker build -f Dockerfile.vercel -t hrm-system:latest .
docker run -d --name hrm-system -p 3000:3000 --env-file .env.production hrm-system:latest
```

> [!NOTE]
> ข้อควรระวังสำหรับโหมด Container (รวมถึง Vercel Container Build ที่ใช้ `Dockerfile.vercel`):
> - Environment Variables ที่ตั้งไว้ใน Vercel Dashboard จะถูกฉีดเข้าตอน **Runtime** เท่านั้น (ไม่ได้ส่งเข้าขั้นตอน `RUN npm run build` ระหว่าง Build Image) ซึ่ง `lib/db/client.ts` ออกแบบให้สร้างการเชื่อมต่อแบบ Lazy แล้วเพื่อให้ `next build` ผ่านได้โดยไม่ต้องฝัง `DATABASE_URL` ลงใน Image
> - `Dockerfile.vercel` คัดลอก `package.json`, `node_modules`, `.next`, `public`, `drizzle`, `lib/salary-slips/assets` และ `next.config.mjs` เข้าไปใน Stage `runner` เพื่อให้ทั้ง Export PDF สลิปเงินเดือนและระบบ Auto-Migration ทำงานได้ทันทีเมื่อเริ่ม Container
> - หากต้องการรัน `npm run db:migrate` ล่วงหน้าก่อน Deploy สามารถรันจาก CI/Local ด้วย `DIRECT_DATABASE_URL` (Session Pooler พอร์ต `5432`) ได้ตามปกติ

---

## 7. รายการตรวจสอบหลัง Deploy (Post-Deploy Verification Checklist)

อ้างอิงขั้นตอนตรวจสอบเพิ่มเติมจาก [production-verification.md](./specs/production-verification.md) และ [external-service-integrations.md](./specs/external-service-integrations.md):

1. **Authentication & RBAC (3 บทบาท: `employee`, `hr`, `executive`)**
   - ทดสอบ Login, Logout, เปลี่ยนรหัสผ่าน และตรวจ Cookie `HttpOnly` + `Secure` บน HTTPS
   - ตรวจสิทธิ์การเข้าถึงเมนูและ API ของแต่ละ Role รวมถึงขอบเขต Self-only (`401`/`403`)
2. **Database Connectivity**
   - เปิดหน้า Employee Directory, Leave, OT, Asset Requests เพื่อยืนยัน Query ผ่าน `DATABASE_URL` (Pooler) ปกติ
3. **Google Drive Integration**
   - ทดสอบอัปโหลดเอกสารพนักงานขนาดเล็ก (< 1 MB) และขนาดใหญ่ (> 5 MB เพื่อยืนยันระบบ Chunked Upload) รวมถึงการดาวน์โหลดและตรวจสิทธิ์เข้าถึง
4. **Cloudinary Integration**
   - ทดสอบอัปโหลดรูปโปรไฟล์พนักงาน, รูปแนบคำขอยืมทรัพย์สิน และลายเซ็นในสัญญา (ตรวจ Network Tab ว่ายิงตรงไป `api.cloudinary.com` และบันทึก URL เป็น `res.cloudinary.com`)
5. **Salary Slip & Reports (PDF / XLSX)**
   - ทดสอบ Export PDF ภาษาไทย (ตรวจสอบฟอนต์ สระ/วรรณยุกต์ และเลขหน้า) และ Excel (`.xlsx`) จากเมนูรายงานและสลิปเงินเดือน
6. **Work Tracking & LINE Integration**
   - ตรวจสอบการซิงก์สถานะกับ API Checker และการเชื่อมข้อมูลสองทางระหว่าง `line-work-tracking` (ผ่าน Supabase RPC `save_line_work_batch`) กับหน้า `/work-tracking`
   - หากเปิดใช้ LINE Leave & Calendar Bot (`LINE_BOT_ENABLED=true`) ให้ตรวจลายเซ็น Webhook `/api/line/webhook`, ทดสอบยื่น/อนุมัติวันลา และยืนยันว่า Scheduler เรียก `POST /api/internal/integrations/retry` ได้สำเร็จตาม [docs/runbooks/line-cutover.md](./runbooks/line-cutover.md)

---

## เอกสารที่เกี่ยวข้อง
- [schema DBML (dbdiagram.io)](./database.dbml)
- [คู่มือ Cutover ระบบ LINE Bot](./runbooks/line-cutover.md)
- [การตั้งค่า Google Drive Storage](./GOOGLE_DRIVE_STORAGE.md)
- [Spec Index](./specs/README.md)
- [Spec: Vercel & Supabase Architecture](./specs/vercel-deployment.md)
- [Spec: External Service Integrations](./specs/external-service-integrations.md)
- [Spec: Production Verification](./specs/production-verification.md)
