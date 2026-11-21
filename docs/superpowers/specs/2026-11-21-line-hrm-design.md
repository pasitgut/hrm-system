# Spec ฉบับร่าง LINE Bot เชื่อม HRM บน Vercel

วันที่: 21 พฤศจิกายน 2026

สถานะ: ใช้เป็นฐานเขียนแผนงานตามคำขอผู้ใช้ ยังไม่เริ่ม implementation หรือย้าย production

ข้อยืนยันเพิ่มเติม: ผู้ใช้ให้เลือก Tech Stack ตามความเหมาะสม และกำหนดให้ Google Calendar เชื่อมด้วย Google Service Account

ฐานข้อมูลที่บังคับใช้: [HRM schema ที่ผู้ใช้ให้](hrm-schema.dbml) จำนวน 24 tables และ 8 enums; source of truth ของระบบจริงคือ `lib/db/schema.ts` ตามหมายเหตุใน schema ไม่สร้างฐาน HRM แยกสำหรับ bot

## 1. เป้าหมายและขอบเขต

ย้าย LINE Bot จาก Google Apps Script มาเป็นช่องทางใช้งานของ HRM บน Vercel โดยใช้ Supabase ฐานหลักร่วมกัน และใช้ Google Calendar API โดยตรง ระบบมีผู้ใช้ภายในประมาณ 10–20 คน ใช้งานเป็นช่วง ๆ ไม่มีหน้าเว็บใหม่สำหรับ bot และต้องการไม่มีค่า Deploy เพิ่ม

รักษาความสามารถเดิม ได้แก่ ลงทะเบียนและเชื่อมบัญชีพนักงาน ส่งและยกเลิกคำขอลาที่ยังรอพิจารณา อนุมัติหรือปฏิเสธพร้อมแจ้งผล สร้างนัดหมายพร้อมสถานที่ ดูนัดหมาย 7 วัน และลบนัดหมายตามสิทธิ์

ไม่เพิ่มระบบ HRM ชุดใหม่ ไม่ทำฐานพนักงานหรือกฎวันลาซ้ำ ไม่ใช้ AI chatbot ไม่เพิ่ม Redis, message broker หรือระบบ microservices และไม่เพิ่มหน้าเว็บบริหารแยก

## 2. สิ่งที่ทราบและสมมติฐาน

ข้อเท็จจริงจากผู้ใช้: HRM เป็นระบบหลัก Deploy บน Vercel; LINE Bot เป็นระบบเสริม; ฐานข้อมูลหลักจะอยู่บน Supabase

ข้อเท็จจริงจากไฟล์เดิม:

- `helpers.gs` อ่านชีตข้อมูลพนักงาน เชื่อม LINE user ID และอ่านชีต `register` เป็น fallback
- `leave_logic.gs` บันทึกคำขอลา อนุมัติ ปฏิเสธ ยกเลิก และคำนวณสถิติจากชีตข้อมูลการลา
- `PropertiesService` เก็บ state ลงทะเบียน ลางาน และสร้างหรือลบนัดหมาย
- Calendar ถูกใช้สร้างนัดหมาย สร้างรายการลาแบบเต็มวัน อ่าน และลบนัดหมาย
- `webhook.gs` มีทั้ง LINE webhook และ action ที่ออกแบบไว้ให้ระบบเว็บเรียกแจ้งเตือน
- ปุ่มอนุมัติและยกเลิกอ้างอิงเลขแถว Sheets
- ไม่พบการเรียก Drive, Gmail, MailApp, Docs หรือ Forms ในไฟล์ที่มี

ได้รับ schema HRM แล้ว แต่ยังไม่มี source code, API, seed ของ lookup และ RLS policies จริงในโฟลเดอร์นี้ จึงยืนยันชื่อตารางและชนิดข้อมูลได้ แต่ยังยืนยัน framework, ORM, กฎอนุมัติ และสิทธิ์การเข้าถึงแต่ละแถวไม่ได้ ต้องเทียบกับ `lib/db/schema.ts` และ migrations จริงก่อนเพิ่ม schema

HRM มี Google Drive สำหรับ `employee_documents.drive_file_id` และ Cloudinary สำหรับรูปภาพตาม schema ซึ่งอยู่นอกขอบเขต bot รุ่นนี้ คำกล่าวว่าเหลือ Calendar เพียงอย่างเดียวหมายถึง integration ของ LINE Bot ที่ตรวจจาก Apps Script ไม่ใช่บริการ Google ทั้งหมดของ HRM ห้ามย้ายหรือลบระบบเอกสารเหล่านี้

ข้อเสนอของผู้ออกแบบ: รวม webhook ในโปรเจกต์ HRM เดิม หากมี backend ที่แก้ไขได้ และใช้ service สำหรับกฎงานร่วมกับเว็บ ไม่บังคับเปลี่ยน framework หรือ ORM ของ HRM

## 3. ทางเลือกและข้อเสนอ

| ทางเลือก | ข้อดี | ข้อแลกเปลี่ยน |
|---|---|---|
| เพิ่ม LINE webhook ใน HRM เดิม | ใช้สิทธิ์ กฎงาน และ deployment ร่วมกัน มีระบบที่ต้องดูแลน้อยที่สุด | ต้องแก้ HRM และทดสอบเส้นทางเว็บร่วมด้วย |
| แยกโปรเจกต์ LINE Bot บน Vercel และเรียก HRM API | Deploy bot แยกจาก HRM ได้ | ต้องจัดการ service authentication และสัญญา API ข้ามโปรเจกต์ |
| คง Apps Script และเปลี่ยนเฉพาะฐานข้อมูล | เปลี่ยนโค้ดน้อยในช่วงแรก | ยังมี runtime และกฎงานสองแห่งที่อาจไม่ตรงกัน |

แนะนำทางเลือกแรก ทางเลือกที่สองใช้เมื่อเข้าถึงโค้ด HRM ไม่ได้ หรือ HRM มี API ที่รองรับอยู่แล้ว ห้ามให้โปรเจกต์ bot แยกเขียนสถานะใบลาโดยข้ามกฎงานของ HRM

ผู้ใช้ยังไม่ได้ยืนยันรูปแบบรวม/แยกโปรเจกต์ เอกสารนี้จึงวางทางเลือกแรกเป็นฐานสำหรับพิจารณา ไม่ถือว่าได้รับอนุมัติแล้ว

## 4. Tech Stack ที่แนะนำ

| ส่วน | ข้อเสนอ | เงื่อนไขการใช้ |
|---|---|---|
| ภาษา | TypeScript | หาก HRM ใช้ภาษาอื่น ให้ใช้ backend เดิมแทนการบังคับย้าย |
| Runtime | Node.js รุ่น LTS ที่ Vercel และ SDK รองรับร่วมกัน | ล็อกเวอร์ชันตอนเริ่มพัฒนา |
| HTTP endpoint | Route/API ของ framework HRM เดิม | ถ้าเป็น Next.js ให้ใช้ Route Handler บน Node.js runtime |
| Hosting | โปรเจกต์ Vercel เดิม | ตรวจแพ็กเกจ สิทธิ์การใช้งาน และโควตาก่อน Deploy |
| Database | Supabase PostgreSQL ฐานหลักของ HRM | ใช้ schema และ migration workflow เดิม |
| Database access | Drizzle ORM + postgres driver เดิมของ HRM | ใช้ transaction และ migration workflow เดิม ไม่เพิ่ม Supabase REST client |
| LINE | Node.js crypto + fetch + Zod | ตรวจ HMAC signature แบบ timing-safe และเรียก Messaging API โดยไม่เพิ่ม dependency |
| Calendar | jose + fetch | เซ็น Service Account JWT ด้วย library ที่ติดตั้งอยู่แล้ว และเรียก Calendar API ฝั่ง server |
| Validation | ตัวตรวจข้อมูลเดิมของ HRM | ไม่เพิ่ม dependency หากของเดิมรองรับ |
| Tests | test runner เดิม | หากไม่มี ใช้ Vitest สำหรับ unit/integration tests |
| Logs | Vercel logs และสถานะงานใน DB | ไม่บันทึก secret หรือเหตุผลการลาแบบเต็มใน log |

ไม่มีเหตุผลให้สร้าง Next.js app ใหม่เพียงเพื่อรับ webhook หาก HRM มี API อยู่แล้ว

## 5. โครงสร้างการทำงาน

LINE ส่ง webhook เข้า backend HRM จากนั้น backend ตรวจความถูกต้อง ระบุพนักงานและสิทธิ์ เรียกกฎงาน HRM และบันทึกข้อมูลใน Supabase เมื่อมีผลอนุมัติ ให้สร้างงานแจ้ง LINE และงาน Calendar จากข้อมูลที่บันทึกแล้ว

เว็บ HRM และ LINE ต้องเรียกกฎงานชุดเดียวกัน การอนุมัติจากเว็บต้องทำให้ LINE ได้รับผลและ Calendar ได้รายการเช่นเดียวกับการอนุมัติจาก LINE โดยมีเจ้าของการสร้างงานเพียงจุดเดียว

### Endpoint ที่เสนอ

- `POST /api/line/webhook`: รับเฉพาะ LINE webhook ที่มี signature ถูกต้อง
- `POST /api/internal/integrations/retry`: ประมวลผลงานค้างแบบจำกัดจำนวน ตรวจ service credential หรือสิทธิ์ผู้ดูแลทุกครั้ง
- ใช้ endpoint/service ของ HRM เดิมสำหรับสร้างใบลา อนุมัติ ปฏิเสธ ยกเลิก และเชื่อมบัญชี ไม่เปิด API ซ้ำถ้ามีอยู่แล้ว

ชื่อ path ปรับตาม convention เดิมได้ ห้ามคง action ผ่าน GET ที่เปลี่ยนข้อมูลโดยไม่มีการตรวจสิทธิ์ และห้ามยอมรับสถานะอนุมัติจาก request body โดยไม่อ่านรายการจริงจาก HRM

## 6. ข้อมูลและสิทธิ์

ใช้ schema HRM ที่ผู้ใช้ให้เป็นฐานโดยตรง ดังนี้

| หน้าที่ | ตารางและคอลัมน์ที่ใช้ |
|---|---|
| พนักงานและบัญชี LINE | `employees.id` (uuid), `code` (varchar(4), unique), `line_uid` (varchar(64), unique); ชื่อจาก first_name/last_name ไม่สร้าง register หรือ LINE link table ซ้ำ |
| สิทธิ์และบัญชี HRM | `users.employee_id`, `role` (`employee`, `hr`, `executive`), `permissions`, `is_active` ร่วมกับ employees.deleted_at/end_date/employment_status_id และ policy เดิม ห้ามสมมติว่า employees มี is_active |
| สายผู้บังคับบัญชา | `employees.manager_id` เป็นข้อมูลประกอบ ไม่ได้พิสูจน์ว่ามีสิทธิ์อนุมัติ ต้องใช้ service/policy จริง |
| ประเภทลาและโควตา | `leave_types.code`, name, annual_quota_days, quota_basis (`fixed`/`tenure`), is_active; ห้าม map จากชื่อไทยหรือ hardcode โควตาเพียงอย่างเดียว |
| ใบลา | `leave_requests.id`, employee_id, leave_type_code, start_on, end_on, session, reason, status_code และคอลัมน์ผู้พิจารณา/ยกเลิกกับ timestamp |
| สถานะคำขอ | `request_statuses.code` และ seed จริง; schema ยืนยันค่า default pending เท่านั้น ไม่เดารหัส approved/rejected/cancelled จากชื่อแสดงผล |
| Webhook receipt | ใช้ `line_webhook_events` ที่มี event_id เป็น PK, source_id, status, attempts, lease_until, response_payload, error_code, push_retry_key และ timestamps อยู่แล้ว |

บัญชี HRM ใช้ `users.password_hash` ตาม schema จึงห้ามสมมติว่าล็อกอินด้วย Supabase Auth หรือว่า users.id ตรง auth.uid(); ต้องตรวจ session และ RLS จริง ไม่อ่าน password_hash, base_salary, payroll_data หรือ citizen_id มาใช้ใน bot

`leave_requests.session` ยืนยันได้เพียง default `full` ยังไม่ทราบค่า session อื่นและกฎครึ่งวัน ใช้ full ตาม flow เดิมและตรวจ service HRM ก่อนรองรับ session อื่น `leave_requests` ไม่มี source หรือ version column ห้ามใช้ source ของ overtime_requests หรือ version ของ asset_requests แทน ใช้ status_code และ updated_at เพื่อ concurrency ตาม service เดิม และออก operation key ที่คงเดิมตาม ID/action สำหรับผลข้างเคียง

ข้อมูล operational ที่ยังไม่ปรากฏใน schema และต้องตรวจโค้ดจริงก่อนเพิ่ม มีดังนี้

| ข้อมูลเชิงหน้าที่ | ข้อมูลขั้นต่ำและข้อบังคับ |
|---|---|
| หลักฐานเชื่อมบัญชี | ใช้ employees.line_uid เป็นผลลัพธ์หลัก เพิ่มเพียง hash/expiry/used-at ของรหัสเชื่อมในกลไกเดิมหรือที่เก็บชั่วคราว หาก HRM ยังไม่มี |
| Bot conversation state | LINE user ID, ขั้นตอน, payload, version, expires_at; state เริ่มต้นหมดอายุหลังไม่ใช้งาน 30 นาที |
| Webhook payload สำหรับ recovery | line_webhook_events ยังไม่มีคอลัมน์ raw event/timestamp ของ LINE และไม่ทราบความหมาย response_payload ต้องตรวจ handler เดิมก่อนเพิ่ม nullable event_payload/event_timestamp ตาม migration ที่เข้ากันได้ ห้ามใช้ response_payload เก็บ incoming event โดยเปลี่ยนสัญญาเงียบ ๆ |
| Integration job | unique operation key, ประเภทงาน, ID รายการ HRM, version ของรายการ, สถานะ, attempts, next_attempt_at, lease และ error |
| Calendar mapping | ID รายการภายใน, calendar ID, Calendar API event ID, สถานะ sync; unique ตามรายการและปฏิทิน |
| Legacy row mapping | ชีต/แหล่งข้อมูลเดิม + เลขแถวเดิม ไปยัง ID ใบลาใหม่ สำหรับปุ่มที่ส่งไปก่อน cutover |

ห้ามสร้าง employees, users, leave_types, leave_requests, request_statuses หรือ webhook inbox ซ้ำ ห้ามเปลี่ยนความหมาย `line_webhook_events.sheet_committed` จากชื่อคอลัมน์เพียงอย่างเดียว ต้อง trace ผู้เขียน/ผู้อ่านเดิม รวมสถานะ attempts/lease และการใช้ push_retry_key ก่อนต่อยอด ห้าม rename/drop คอลัมน์ shared ใน migration ของ bot นี้

ถ้า HRM มี LINE webhook สำหรับ work tracking อยู่แล้ว ให้รวม routing ที่ entry point เดิม โดยหนึ่ง event มีเจ้าของเพียง pipeline เดียว claim/deduplicate ครั้งเดียวแล้ว route ตาม command/state ห้ามให้ handler เดิมและ handler ลางานแย่ง event ID เดียวกันจนงานหาย อย่าแยก LINE webhook URL ใหม่โดยไม่รู้ channel และ router ที่ใช้อยู่จริง

`work_tracking_records`, `work_tracking_requests`, `work_tracking_activities` และ `overtime_requests` เป็นงานเดิมที่ต้อง regression test แต่ไม่เพิ่มฟีเจอร์ work tracking/OT/asset borrowing ให้ bot ในงานนี้ ไม่ใช้ตาราง asset events เป็น audit log ของใบลา และไม่อ้างว่ามี generic audit table จาก schema นี้

เหตุผลการลาและ payload สนทนาเป็นข้อมูลบุคคล ต้องจำกัดการเข้าถึง ข้อมูล operational ใหม่ที่จบแล้วเก็บไม่เกิน 7 วันตามค่าเริ่มต้น ส่วนประวัติใบลาและ line_webhook_events ที่ใช้ร่วมกับงานเดิมต้องคง retention ของ HRM ห้ามเพิ่ม cleanup 7 วันครอบตารางร่วมโดยไม่ตรวจผู้ใช้เดิมและหลักฐานกันซ้ำ

ไม่ใช้เลขแถวเป็น business ID หลังย้าย ปุ่มใหม่ส่ง ID รายการและ action เท่านั้น จากนั้น backend อ่านเจ้าของรายการและสถานะจริงจาก DB

ใช้ auth/RLS เดิมของ HRM การใช้ secret หรือ service-role credential ฝั่ง server ต้องตรวจสิทธิ์ใน service เองด้วย ห้ามให้ LINE user ID หรือค่าที่ส่งใน postback กำหนดสิทธิ์ผู้อนุมัติ

## 7. Flow ที่ต้องรองรับ

### การเชื่อมบัญชี

ผู้ใช้ยืนยันให้ใช้ flow เดิม: พิมพ์ ลงทะเบียน แล้วกรอกรหัสพนักงาน ระบบค้น employees.code และบันทึก employees.line_uid ไม่ต้องขอ OTP จาก HRM เก็บรหัสเป็นข้อความเพื่อรักษาเลขศูนย์นำหน้า จำกัดการลอง 5 ครั้งต่อ 10 นาที และไม่เขียนทับ LINE binding ของผู้อื่น

ข้อมูล LINE ID ที่นำเข้าต้องตรวจความซ้ำก่อนใช้ เมื่อเริ่มลางานโดยยังไม่ลงทะเบียน ให้ถามรหัสแล้วกลับเข้า flow ลาอัตโนมัติ รหัสพนักงานไม่ใช่ความลับ ความเสี่ยงและเงื่อนไข HRM ที่ยังต่างระบุใน docs/line-bot-differences.md

### การลาและการพิจารณา

1. ตรวจว่าพนักงานเชื่อมบัญชีและยังใช้งานได้
2. รับประเภทลา วันเริ่ม วันสิ้นสุด และเหตุผล โดยรักษาข้อความและ Flex Message เดิมเท่าที่กฎ HRM อนุญาต
3. ตรวจวันลาและสิทธิ์ด้วยกฎ HRM ไม่คัดลอกจำนวนสิทธิ์แบบ hardcode จาก Apps Script
4. สร้างใบลาเพียงครั้งเดียว แล้วแจ้งผู้อนุมัติตามสายอนุมัติจริงของ HRM
5. อนุมัติ/ปฏิเสธได้เฉพาะผู้มีสิทธิ์กับรายการนั้น และเปลี่ยนสถานะจาก pending แบบ atomic
6. พนักงานยกเลิกได้เฉพาะรายการตนเองที่ยัง pending ตามพฤติกรรมเดิม หาก HRM ใช้นโยบายอื่นให้ยืนยันก่อน
7. บันทึกผู้กระทำ เวลา และสถานะเดิม/ใหม่ จากนั้นแจ้งผลและสร้างรายการ Calendar เมื่อ HRM ถือว่าอนุมัติสมบูรณ์แล้ว

หาก HRM อนุมัติหลายขั้น ให้ bot ใช้สถานะและสิทธิ์ของแต่ละขั้นตาม HRM ไม่ยุบเป็นอนุมัติครั้งเดียว

### นัดหมาย

รองรับชื่อ เวลาเริ่ม–สิ้นสุด สถานที่/ลิงก์ การดู 7 วัน และการลบ ตรวจเวลาสิ้นสุดหลังเวลาเริ่ม รายการใหม่ลบด้วย event ID ที่เก็บไว้ ไม่ลบด้วยชื่อรายการเพียงอย่างเดียว หากผู้ใช้พิมพ์ชื่อและวัน ให้ค้นหาและยืนยันรายการเป้าหมายก่อนลบ

ข้อเสนอสิทธิ์เริ่มต้น: พนักงานสร้างและลบนัดหมายที่ bot บันทึกว่าเป็นของตนเอง ผู้ดูแลที่ HRM ให้อำนาจจัดการได้ทั้งปฏิทิน รายการเก่าที่ไม่มีเจ้าของให้ผู้ดูแลจัดการเท่านั้น ต้องยืนยันนโยบายนี้ก่อนพัฒนา

รักษาการดูนัดหมาย 7 วันตามเดิมเมื่อปฏิทินนี้อนุญาตให้พนักงานเห็นร่วมกัน หาก HRM จำกัดรายละเอียดรายบุคคล ต้องกรองข้อมูลตามสิทธิ์ก่อนส่ง LINE

## 8. Webhook และความทนทาน

ตรวจ `x-line-signature` กับ raw request body ก่อน parse JSON ใช้ SDK มาตรฐาน ไม่สร้างกลไก signature ใหม่ จัดการทุก event ใน `events[]` รวมถึงกรณีว่างสำหรับการ Verify webhook

บันทึก webhook ที่ตรวจแล้วลง DB ก่อนตอบ 200; หากบันทึกไม่ได้ให้ตอบ 5xx อย่าตอบรับสำเร็จแล้วปล่อย event หาย ใช้ webhookEventId กันซ้ำแบบ durable และไม่ทิ้ง event ที่สถานะ processing ค้างโดยไม่มีทางกู้คืน

หลังบันทึกสำเร็จ เริ่มประมวลผลด้วยกลไกที่ runtime รองรับ เช่น `waitUntil()` หรือ `after()` ตาม framework กลไกนี้เป็นตัวเริ่มงาน ไม่ใช่ durable queue ความสำเร็จต้องตรวจจาก DB และมี recovery runner สำหรับงานค้าง

ประมวลผลตามลำดับต่อ LINE user ID ใช้ DB transaction/lease และ version ของ conversation state ห้ามพึ่ง mutex หรือ Map ในหน่วยความจำของ serverless เพียงอย่างเดียว event ที่เก่ากว่าขั้นตอนปัจจุบันต้องไม่ย้อน state หรือทำรายการผิดขั้น

บันทึกผลเปลี่ยนสถานะ HRM และ integration jobs ใน transaction เดียวกัน ห้ามเปิด DB transaction ค้างระหว่างเรียก LINE หรือ Google ใช้ unique operation key และ atomic claim ป้องกัน worker สองตัวทำงานเดียวกัน

retry เฉพาะข้อผิดพลาดชั่วคราว เช่น network, 429 และ 5xx พร้อม backoff และเคารพ Retry-After ค่าเริ่มต้น retry สูงสุด 5 ครั้งและเก็บงาน failed ให้ผู้ดูแลตรวจหรือสั่ง retry ไม่วนซ้ำกับข้อผิดพลาดสิทธิ์หรือข้อมูลไม่ถูกต้อง

runner ใช้งานเดิมของ HRM ถ้ามี หากไม่มี เสนอ Supabase Cron + pg_net เรียก retry endpoint ทุก 5 นาที โดยเก็บ credential ใน Vault และจำกัด batch ตามเวลา Function ต้องตรวจ availability, quotas และตั้งค่าในโปรเจกต์จริงก่อนรับรอง ห้ามสร้าง cron เพื่อหลบการพักของ Free plan

ใช้ reply token ทันทีเมื่อยังใช้ได้ ไม่เก็บไปใช้ใน retry ระยะยาว หากต้องแจ้งภายหลังให้ใช้ push ตามสิทธิ์และโควตา LINE OA อย่าส่งข้อความซ้ำโดยไม่ตรวจสถานะ notification เดิม และไม่อ้างว่า LINE ส่งข้อความได้ exactly once เมื่อผลจาก provider ยังไม่ชัดเจน

## 9. Google Calendar

ใช้ Google Service Account ตามข้อกำหนดผู้ใช้ โดยเจ้าของแชร์ปฏิทินเป้าหมายให้ service account ด้วยสิทธิ์ที่จำเป็นต่อการอ่าน สร้าง และลบ event ใช้ calendar ID แบบระบุชัดเจน ไม่ใช้ `primary` และทดสอบกับปฏิทินทดสอบก่อน ไม่ต้องขอให้พนักงานทุกคนล็อกอิน Google

หากนโยบายองค์กรไม่อนุญาตให้แชร์ปฏิทินกับ service account ให้หยุดเฉพาะการเปิด Calendar integration จนกว่าผู้ดูแลจะตั้งสิทธิ์ได้ ไม่เปลี่ยนเป็น OAuth ของบุคคลโดยอัตโนมัติ ไม่ใช้ domain-wide delegation และไม่เพิ่ม attendees หรือส่งคำเชิญแทนพนักงานในขอบเขตนี้ เก็บ credential ฝั่ง server เท่านั้น ห้าม commit service-account JSON/private key

แยกรายการลาเต็มวันเป็นวันที่ล้วน โดยวันสิ้นสุดของ API เป็นวันถัดจากวันลาสุดท้าย นัดหมายใช้เวลาพร้อม timezone `Asia/Bangkok` ข้อมูล timestamp ใน DB ใช้ timestamptz; วันลาเต็มวันใช้ date ตาม schema HRM

งาน Calendar ใช้ operation ID ที่คงเดิมในการ retry และสร้าง event ID ที่เข้ารูปแบบ Calendar API จาก ID ภายใน เมื่อ response สูญหาย ให้ค้นหาหรืออ่าน event ID เดิมก่อนสร้างใหม่ เก็บ mapping หลังสำเร็จ

การอนุมัติใน HRM สำเร็จต้องไม่ถูกย้อนเพราะ Calendar ล่ม ให้เก็บ sync pending/failed แล้ว retry แยก แจ้งความล้มเหลวกับผู้ดูแลโดยไม่เผยเหตุผลการลากับผู้ไม่มีสิทธิ์

ตรวจ event เก่าจาก Apps Script ก่อนเปิดการ sync ห้ามอนุมัติหรือ backfill ประวัติทั้งหมดแล้วสร้าง Calendar ซ้ำ event ID ที่ได้จาก CalendarApp อาจมีความหมายต่างจาก Calendar API ID ต้องตรวจ mapping จริง ไม่คัดลอกโดยสมมติว่าเท่ากัน

## 10. การย้ายและ rollback

1. อ่าน HRM code/schema และยืนยันสิทธิ์ account linking, วันลา, สถานะอนุมัติ และ Calendar ก่อนเริ่ม implementation
2. map ชีตข้อมูลพนักงานและ register ไป employees.id/line_uid ด้วย employees.code แบบข้อความยาวไม่เกิน 4 ตัวอักษร ห้าม truncate, pad หรือ cast เป็นตัวเลขโดยเดา; map ใบลาไป leave_requests ผ่าน employee_id, leave_type_code และ status_code จาก lookup จริง
3. ตรวจข้อมูลซ้ำ วันที่และรูปแบบปี สถานะ และจำนวนวันลา ไม่เดารูปแบบวันเดือนปีที่กำกวม เก็บรายการผิดปกติเพื่อแก้ก่อนนำเข้า
4. สำรอง Sheets และ DB ทดลองนำเข้าใน environment ทดสอบ แล้วเทียบจำนวนรายการ ยอดลา สถานะ และ LINE link ไม่เขียนทับข้อมูล HRM ที่มีอยู่โดยไม่มีกฎ merge
5. ทดสอบด้วย LINE channel และ Calendar สำหรับทดสอบ โดยปิดการแจ้งเตือนจริงและไม่ใช้ production secrets
6. ก่อน cutover ให้จบคำขอสำคัญที่ค้าง หยุด writer เก่าและนำเข้าส่วนต่างครั้งสุดท้าย state สนทนาที่ค้างให้ผู้ใช้เริ่มใหม่โดยแจ้งชัดเจน
7. ปุ่มเก่าที่ส่ง row ใช้ legacy mapping ไปยัง ID ใหม่ พร้อมตรวจสิทธิ์และสถานะเหมือนปุ่มใหม่ หาก mapping ไม่แน่นอนต้องไม่เดารายการ ให้แสดงว่าปุ่มหมดอายุและออกปุ่มใหม่สำหรับรายการ pending
8. เปลี่ยน LINE webhook และจุดเรียกจาก HRM ให้ใช้ backend ใหม่ ปิด action endpoint เก่าที่อาจสร้างผลซ้ำ ให้มี writer หลักเพียงระบบเดียว
9. เฝ้าดู webhook, jobs และ Calendar mapping หลังเปิดจริง เก็บระบบเก่าไว้ปิดการเขียนจนผ่านการรับรอง

rollback ก่อนมีรายการใหม่อาจคืน endpoint เดิมได้ แต่หลังเปิดจริงมี DB เปลี่ยนแล้ว ห้ามเพียงเปลี่ยน webhook กลับ ให้หยุดรับรายการชั่วคราว reconcile รายการและ Calendar ที่เกิดใหม่ แล้วจึงเปิด writer ที่เลือก การ rollback โค้ดต้องไม่ลบข้อมูลใหม่หรือ undo ใบลาที่อนุมัติแล้วโดยอัตโนมัติ

## 11. เกณฑ์ยอมรับ

- ลงทะเบียนผ่านหลักฐานเจ้าของบัญชีได้ และนำ LINE ID ของคนอื่นไปผูกกับพนักงานไม่ได้
- ส่งคำขอและอนุมัติจาก LINE หรือเว็บแล้วเห็นรายการเดียวกันใน HRM พร้อมใช้สิทธิ์และกฎวันลาเดียวกัน
- ผู้ไม่มีสิทธิ์อนุมัติไม่ได้ และยกเลิกใบลาผู้อื่นไม่ได้ แม้แก้ postback เอง
- webhook signature ผิดถูกปฏิเสธ; events ว่างตอบรับได้; batch หลาย event ไม่ตกหล่น
- webhook ซ้ำ หรือผู้อนุมัติกดพร้อมกัน ไม่สร้างใบลาหรือ Calendar ซ้ำ และมีผลพิจารณาสุดท้ายเพียงครั้งเดียว
- state ของพนักงานแต่ละคนไม่ปะปน และหมดอายุแล้วเริ่มใหม่โดยไม่ส่งข้อมูลเก่า
- เวลานัดหมายตรงกับ Asia/Bangkok และวันลาเต็มวันไม่เลื่อนหรือเพิ่มวันผิด
- Google หรือ LINE ล่มแล้วข้อมูล HRM ยังถูกต้อง งานค้างมีสถานะและ retry ได้ รวมถึงกรณี response หลังสร้าง Calendar สูญหาย
- pending jobs ถูกกู้หลัง process หยุด และงานที่หมด lease ถูก claim ใหม่ได้อย่างปลอดภัย
- ปุ่มเก่าทำงานผ่าน mapping ที่ตรวจแล้ว หรือถูกปฏิเสธอย่างชัดเจน โดยไม่กระทำกับรายการผิด
- ข้อมูลหลังย้ายเทียบกับแหล่งเดิมได้ และผ่านการซ้อม cutover/rollback ด้วยข้อมูลทดสอบ

ใช้ tests ของ HRM เป็นหลัก เพิ่มเฉพาะ unit tests ของ state/สิทธิ์/วันเวลา และ integration tests สำหรับ transaction, duplicate events, concurrent approval และ external API failure ใช้ LINE test channel และ test Calendar สำหรับทดสอบปลายทาง ห้ามส่งข้อความจริงระหว่าง automated tests

## 12. งบประมาณและข้อจำกัด

เป้าหมายคือไม่มีค่า Deploy เพิ่มโดยใช้โปรเจกต์และแพ็กเกจเดิม ไม่รับรองว่าค่าใช้จ่ายทั้งระบบเป็นศูนย์จนกว่าจะตรวจสิทธิ์การใช้ Vercel, โควตารวมของ HRM และ bot, Supabase และแพ็กเกจ LINE OA การ push แจ้งเตือนและ retry ต้องนับรวมโควตา LINE

Supabase Free อาจพักเมื่อกิจกรรมต่ำและไม่มี automatic backup รวมอยู่ ต้องกำหนดการสำรองข้อมูลจริงโดยไม่เก็บ dump ไว้ใน repository หรือ public storage ไม่มี SLA สำหรับการส่งข้อความหรือ Calendar sync ตามเวลาตายตัวบนเงื่อนไขฟรีนี้

## 13. สิ่งที่ต้องยืนยันก่อนอนุมัติแบบ

1. HRM ใช้ framework/runtime/ORM อะไร และจะแก้ในโปรเจกต์เดิมหรือใช้ API จากโปรเจกต์แยก
2. เทียบ schema ที่ได้รับกับ lib/db/schema.ts, lookup seeds, RLS และ service/API จริง รวมถึง router/ผู้ใช้ line_webhook_events เดิมและวิธีแจ้งผลจากเว็บ
3. วิธีเชื่อมบัญชีที่ HRM รองรับ และสิทธิ์สร้าง ดู ลบนัดหมายของแต่ละบทบาท
4. เจ้าของ Calendar ความสามารถในการแชร์ให้ service account และแนวทางจัดการรายการเก่า
5. แพ็กเกจ Vercel/Supabase/LINE OA และความสามารถ recovery runner ที่ใช้ได้จริงโดยไม่มีค่าเพิ่ม

ข้อเหล่านี้ไม่ขัดขวางการใช้เอกสารเป็นร่างประเมิน แต่ยังไม่ควรสร้าง schema หรือเริ่มย้าย production ก่อนยืนยัน

## 14. เอกสารอ้างอิง

- [LINE SDK webhook และ signature](https://line.github.io/line-bot-sdk-nodejs/guide/webhook.html)
- [LINE webhook redelivery และ webhookEventId](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [Vercel Functions และ waitUntil](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Google Calendar การสร้าง events](https://developers.google.com/workspace/calendar/api/guides/create-events)
- [Vercel Terms ส่วน Hobby](https://vercel.com/legal/terms)
- [Supabase Free และข้อจำกัด](https://supabase.com/pricing)


## ข้อกำหนดล่าสุดเรื่องความเหมือนของระบบเดิม

ใช้ employee-code registration และ Flex จาก Apps Script โดยตรงตามที่ผู้ใช้ยืนยัน ไม่ใช้ OTP หรือปุ่มเชื่อมใน HRM ตรวจ payload กับ source ที่เก็บใน docs/legacy/google-apps-script และทำ mapping ทุกฟังก์ชันใน docs/line-bot-function-mapping.md ความต่างที่เหลือต้องอยู่ใน docs/line-bot-differences.md ไม่ใช้คำว่าเหมือนเดิม 100% ครอบทั้งระบบจากผลทดสอบ backend เพียงอย่างเดียว
