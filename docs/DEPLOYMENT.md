# คู่มือการ Deploy ระบบ HRM ขึ้น Production

เอกสารนี้สรุปสถาปัตยกรรม สภาพแวดล้อมที่ต้องเตรียม การตั้งค่า Environment Variables การ Run Database Migration และขั้นตอนการ Deploy ระบบ `hrm-system` ขึ้น **Vercel** (แนะนำ) หรือ **Docker Container** สำหรับใช้งานจริง

> [!IMPORTANT]
> ระบบใช้ **PostgreSQL (Supabase)** ร่วมกับบริการภายนอก **Google Drive** (เก็บเอกสารพนักงานสูงสุด 50 MB) และ **Cloudinary** (เก็บรูปภาพทั้งหมด) โดยไม่มีการเก็บไฟล์ Binary ลงใน Database และระบบได้รับการออกแบบให้เลี่ยงข้อจำกัด Payload **4.5 MB ของ Vercel** แล้ว

---

## 1. ภาพรวมสถาปัตยกรรม (Architecture Overview)

| ส่วนประกอบ | หน้าที่ | รายละเอียดสำคัญ |
| :--- | :--- | :--- |
| **Next.js App (`hrm-system`)** | Web UI + API Routes | Region เริ่มต้น `sin1` (Singapore) ตาม [vercel.json](../vercel.json) |
| **PostgreSQL (Supabase)** | ฐานข้อมูลหลัก (24 ตาราง, 8 Enums) | เปิด RLS ทุกตาราง `public`; ใช้ Pooler สำหรับ Runtime และ Direct Port `5432` สำหรับ Migration ([database.dbml](./database.dbml)) |
| **Companion (`line-work-tracking`)** | LINE Webhook & Sync Worker | แชร์ฐานข้อมูล Supabase เดียวกัน แต่ `hrm-system` เป็นผู้ถือ Drizzle Migration ([vercel-deployment.md](./specs/vercel-deployment.md)) |
| **Google Drive API** | เก็บไฟล์เอกสารพนักงาน | OAuth2 (`drive.file` scope) + Resumable Chunked Upload ผ่าน `/api/employees/[id]/documents/upload/{init,chunk}` |
| **Cloudinary** | เก็บรูปโปรไฟล์, รูปทรัพย์สิน, ลายเซ็น, รูปในสัญญา | Direct Signed Upload ผ่าน `/api/media/signature` + Auto-migrate ลิงก์ `ibb.co` เดิมอัตโนมัติ |
| **API Checker** | เชื่อมต่อสถานะงานตรวจบ้าน | ยืนยันตัวตนด้วย `CHECKER_API_EMAIL` และ `CHECKER_API_PASSWORD` |

---

## 2. การเตรียมบริการภายนอกก่อน Deploy (Prerequisites)

### 2.1 Supabase (PostgreSQL)
1. สร้างโปรเจกต์บน Supabase (แนะนำ Region **Singapore `ap-southeast-1`** ให้ตรงกับ Vercel `sin1`).
2. เตรียม Connection String **2 เส้น** จาก **Connect / Database Settings**:
   - **Transaction Pooler (Port `6543` พร้อม `?pgbouncer=true`)** → ใช้เป็น `DATABASE_URL` สำหรับ Serverless Runtime (`lib/db/connection.ts` จะปิด `prepare` statement, เปิด `ssl: "require"`, และจำกัด pool `{ max: 5, idle_timeout: 20, connect_timeout: 15 }` ให้อัตโนมัติ)
   - **Direct Connection / Session Pooler (Port `5432`)** → ใช้เป็น `DIRECT_DATABASE_URL` สำหรับรัน Migration (`scripts/db/migrate.ts` ใช้ `max: 1`)
3. ตรวจสอบว่า **RLS (Row Level Security)** เปิดครบทั้ง 24 ตารางใน schema `public` เพื่อป้องกันการเข้าถึงตรงผ่าน PostgREST โดยไม่ผ่าน Server API ของระบบ (ดูรายละเอียดใน [vercel-deployment.md](./specs/vercel-deployment.md))
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

---

## 3. รายการ Environment Variables ทั้งหมด

อ้างอิงจาก [.env.example](../.env.example):

| ตัวแปร | จำเป็น | ใช้ใน | คำอธิบาย |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | จำเป็น | Runtime (Vercel / Server) | PostgreSQL Connection String ผ่าน Pooler (`:6543?pgbouncer=true`) |
| `DIRECT_DATABASE_URL` | จำเป็น (Migration) | CLI / CI Migration | Direct Connection String (`:5432`) สำหรับ `npm run db:migrate` |
| `TEST_DATABASE_URL` | เฉพาะ Test | Local / CI Test | ฐานข้อมูลแยกสำหรับการทดสอบ **ห้ามชี้ไปที่ Production** |
| `JWT_SECRET` | จำเป็น | Runtime (Server) | คีย์ลับสำหรับ JWT Session และ Upload Token |
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

---

## 4. การเตรียมฐานข้อมูล (Database Migration & Initial Data)

### 4.1 ตรวจสอบความถูกต้องของ Schema
```bash
npm run typecheck
DATABASE_URL="postgresql://user:pass@localhost:5432/db" npm run db:check
```
*(หมายเหตุ: ในเครื่องที่ติดตั้ง Bun สามารถรันผ่าน `bun run` แทน `npm run` ได้)*

### 4.2 รัน Database Migration ขึ้น Supabase Production
ตั้งค่า `DIRECT_DATABASE_URL` (Port `5432`) แล้วรันจากเครื่องหรือ CI/CD Pipeline ก่อนปล่อยทราฟฟิก:
```bash
export DIRECT_DATABASE_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
npm run db:migrate
```
สคริปต์ `scripts/db/migrate.ts` จะใช้ `DIRECT_DATABASE_URL` (fallback ไป `DATABASE_URL`) และรันไฟล์ SQL ทั้งหมดในโฟลเดอร์ `drizzle/`

### 4.3 การสร้างข้อมูลตั้งต้น (Seed — เฉพาะฐานข้อมูลใหม่เท่านั้น)
> [!CAUTION]
> สคริปต์ `scripts/db/seed.ts` จะทำการ **TRUNCATE ข้อมูลเดิม** ในตาราง Master, พนักงาน, ผู้ใช้ และคำขอต่างๆ และจะบล็อกการรันบนฐานข้อมูล Production โดยอัตโนมัติ (ยกเว้นกำหนด `ALLOW_DESTRUCTIVE_DB_SCRIPTS=1`) **ห้ามรันบนระบบที่มีข้อมูลจริงแล้ว**

สำหรับฐานข้อมูลที่เพิ่งสร้างใหม่ทั้งหมดเท่านั้น:
```bash
ALLOW_DESTRUCTIVE_DB_SCRIPTS=1 DATABASE_URL="$DIRECT_DATABASE_URL" npm run db:seed
```
- บัญชีผู้ดูแลระบบ HR ตั้งต้นที่สคริปต์สร้าง: รหัสพนักงาน `2603` / อีเมล `admin@peopleos.co` / รหัสผ่านเริ่มต้น `admin` (`role: "hr"`)
- หลัง Seed แล้วให้เข้าสู่ระบบและเปลี่ยนรหัสผ่านทันที

### 4.4 การย้ายลิงก์รูป ImgBB เดิมมา Cloudinary (ถ้ามีข้อมูลเดิม)
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
   - ตรวจสอบว่า `DATABASE_URL` ใช้ Pooler (`:6543?pgbouncer=true`) และตั้งค่า Secret ทั้งหมดเป็น Encrypted Env Vars
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

> [!WARNING]
> ข้อควรระวังสำหรับโหมด Container:
> - `Dockerfile.vercel` คัดลอกเฉพาะ `package.json`, `node_modules`, `.next`, `public`, และ `next.config.mjs` เข้าไปใน Stage `runner` — หากมีการอ่านไฟล์ Font/Assets เพิ่มเติมจาก `lib/salary-slips/assets/` ใน Runtime ที่ไม่ได้ถูก Trace เข้า `.next` ให้ตรวจสอบการสร้าง PDF สลิปเงินเดือนบน Container จริง หรือคัดลอกโฟลเดอร์ `lib/salary-slips/assets` เพิ่มใน `Dockerfile.vercel`
> - ให้รัน `npm run db:migrate` จากภายนอก Container (CI/Local) ก่อนสตาร์ท Container ใหม่

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
   - ตรวจสอบการซิงก์สถานะกับ API Checker และการแสดงผลข้อมูลจาก `line-work-tracking`

---

## เอกสารที่เกี่ยวข้อง
- [schema DBML (dbdiagram.io)](./database.dbml)
- [การตั้งค่า Google Drive Storage](./GOOGLE_DRIVE_STORAGE.md)
- [Spec Index](./specs/README.md)
- [Spec: Vercel & Supabase Architecture](./specs/vercel-deployment.md)
- [Spec: External Service Integrations](./specs/external-service-integrations.md)
- [Spec: Production Verification](./specs/production-verification.md)
