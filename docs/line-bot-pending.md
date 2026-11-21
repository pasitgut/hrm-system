# งาน LINE Bot ที่ต้องทำต่อและข้อจำกัดก่อนเปิดจริง

สถานะ: โค้ด integration อยู่ใน branch feat/line-hrm-bot ยังไม่ได้ Deploy, เปลี่ยน webhook, migrate ฐานจริง หรือส่งข้อความ/แก้ปฏิทินจริง

ข้อกำหนดล่าสุด: ลงทะเบียนด้วยรหัสพนักงานและเก็บ employees.line_uid ไม่มีขั้นตอนขอ OTP จาก HRM แล้ว หน้าตา Flex ใช้ต้นฉบับ ดู [ความต่างปัจจุบัน](line-bot-differences.md) และ [mapping ฟังก์ชัน](line-bot-function-mapping.md)

## 1. ตั้งค่าระบบจริงและทดสอบ provider

ต้องกำหนด LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, LINE_INTEGRATION_SECRET, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY และ GOOGLE_CALENDAR_ID ใน server environment โดยไม่ส่ง key ลงแชทหรือ commit ลง Git

เปิด Calendar API ของ Google project และแชร์ปฏิทินเป้าหมายให้ Service Account ด้วยสิทธิ์อ่านและแก้ไข event ใช้ calendar ID จริง ไม่ใช้ primary ไม่ใช้ OAuth ของบุคคลหรือ credential ของ Google Drive

ก่อนเปิด LINE_BOT_ENABLED=true ต้องผ่าน migration, ตั้ง recovery runner, ทดสอบด้วย LINE channel/Calendar สำหรับทดสอบ และตรวจโควตา/สิทธิ์แพ็กเกจของ Vercel, Supabase และ LINE OA จริง การทดสอบอัตโนมัติใช้ local PostgreSQL และ fake HTTP providers จึงไม่ยืนยัน token หรือสิทธิ์ภายนอกจริง

เกณฑ์ปิดงาน: Verify webhook ผ่านจริง บัญชีทดสอบเชื่อมได้ ขอลา/อนุมัติผ่านทั้งเว็บและ LINE ได้ผลเดียวกัน และรายการ Calendar ถูกสร้าง/ลบจริงเพียงครั้งเดียว

## 2. Recovery scheduler และงานที่ต้องตรวจเอง

มี endpoint POST /api/internal/integrations/retry แล้ว แต่ยังไม่ได้ตั้ง scheduler บนบัญชีจริง ต้องเรียกทุก 5 นาทีด้วย Authorization: Bearer <LINE_INTEGRATION_SECRET> จาก scheduler เดิม หรือ Supabase Cron + pg_net โดยเก็บ secret ใน Vault ไม่ใส่ secret ใน URL

runner ประมวลผลเป็น batch และมีเวลา/จำนวนจำกัด ต้องตรวจ backlog เมื่อมีงานพร้อมกันมาก webhook เรียก after() เพื่อเริ่มงานทันที แต่ after() ไม่ใช่ durable queue และไม่แทน recovery scheduler

ตรวจ line_integration_jobs ที่ status failed/unknown และ line_webhook_events ที่ error_code=BOT_PROCESSING_FAILED การ retry อัตโนมัติไม่เกิน 5 ครั้งหลังครั้งแรก; pending งานเก่าที่มี Retry-After อาจรอนานกว่ารอบ scheduler ห้าม reset unknown reply อัตโนมัติ เพราะอาจส่งสำเร็จไปแล้ว

ยังไม่มีหน้า admin สำหรับตรวจ/requeue งาน ใช้ DB console ที่จำกัดสิทธิ์และตรวจผล provider ก่อน requeue failed เป็น pending โดยเก็บ retry_key/operation_key เดิมไว้ ห้ามหมุน key ใหม่เพื่อแก้การส่งซ้ำ

runner ลบ completed jobs และ state ที่หมดอายุเกิน 7 วัน รวมถึงรหัสเชื่อมที่หมดอายุแล้วโดยอัตโนมัติ ส่วน pending/failed/unknown และ line_webhook_events ของ work tracking จะไม่ถูกลบ จึงยังต้องมีผู้รับผิดชอบ reconcile และจัด retention ของข้อมูลร่วมตามนโยบายจริง

LINE รับรองการกันซ้ำด้วย push retry key ในช่วงเวลาจำกัด โค้ดจึงใช้ guard แบบอนุรักษ์นิยม: งาน push ที่เคยลองแล้วและอายุจากเวลาสร้างงานเกิน 23 ชั่วโมงจะเป็น unknown โดยไม่เรียก provider อีก แม้บางกรณีเวลาลองครั้งแรกอาจใหม่กว่านั้น ต้องตรวจผลก่อนส่งต่อด้วยมือ ห้าม requeue งานเก่าโดยถือว่า key เดิมกันซ้ำได้ตลอดไป

เกณฑ์ปิดงาน: ซ้อมปิด invocation แล้ว runner กู้งานได้ และมีผู้รับผิดชอบตรวจ failed/unknown jobs พร้อม retention/backup ที่ใช้งานจริง

## 3. ย้าย Sheets และปุ่มเก่า

ยังไม่มีข้อมูล export จาก Sheets, ข้อมูล mapping เลขแถวเดิม และ Calendar events เดิม จึงยังไม่นำเข้าข้อมูลจริงหรือเดาว่ารายการใดตรงกับใบลา UUID ใด

ต้องตรวจข้อมูลพนักงาน/LINE UID ซ้ำ, รหัสพนักงานเกิน employees.code varchar(4), ปี พ.ศ./ค.ศ., วันที่กำกวม และรหัสประเภทลา/สถานะก่อน import ห้ามตัดเลขหรือเติมศูนย์จากการเดา ห้ามนำเข้าบัญชี users/password/เงินเดือนจากข้อมูล bot

ปุ่มเก่าที่ส่ง row แทน UUID จะถูกปฏิเสธพร้อมให้ทำต่อใน HRM แทนการเสี่ยงเปลี่ยนใบลาผิดรายการ ต้องออกปุ่มใหม่ให้รายการ pending หลังทำ mapping ที่ยืนยันแล้ว หากต้องการรองรับปุ่มเก่าเต็มรูปแบบ ต้องมี legacy mapping และ regression tests เพิ่ม

เกณฑ์ปิดงาน: dry-run/report ที่เทียบจำนวนและยอดลาได้ ไม่มี conflict ที่ยังไม่ตัดสินใจ ซ้อมนำเข้าซ้ำไม่สร้างรายการซ้ำ และผ่าน cutover/rollback rehearsal

## 4. Calendar เดิม รายการร่วม และวันลาครึ่งวัน

คำสั่งดู/ลบนัดหมายในรุ่นนี้แสดงเฉพาะรายการที่มี mapping ใน line_calendar_events และเป็นของพนักงานคนนั้น การดูจำกัดช่วง 7 วัน ผู้ใช้พิมพ์ชื่อ/วันหรือกด ลบ : ชื่อ แบบเดิม แต่ backend resolve เป็น event ID และตรวจเจ้าของก่อน ไม่อนุญาตให้ลบ event ใบลาจากเมนูนัดหมาย

รายการที่สร้างด้วยมือใน Google Calendar หรือสร้างจาก Apps Script เดิมยังไม่ถูกนำมาแสดง/ลบผ่าน bot ต้องยืนยันสิทธิ์ดูทั้งปฏิทิน สิทธิ์ผู้ดูแล และ map เจ้าของกับ Calendar API event ID ก่อน ไม่ถือว่า CalendarApp iCalUID คือ API event ID

LINE ยื่นลาแบบเต็มวันตาม scope เดิม ใบลาครึ่งวันที่อนุมัติผ่านเว็บยังบันทึก HRM ตามปกติ แต่ job Calendar จะ failed อย่างชัดเจนด้วย provider 400 แทนการเดาเวลาทำงานเช้า/บ่าย เมื่อยืนยันเวลาและ timezone ของบริษัทแล้ว จึงเพิ่ม mapping session am/pm พร้อม tests และ requeue jobs เดิม

เกณฑ์ปิดงาน: ยืนยันนโยบายและเวลา ใช้ test Calendar พิสูจน์รายการเก่า/ชื่อซ้ำ/ครึ่งวัน และไม่มี event ซ้ำระหว่าง backfill

## 5. LINE work tracking ที่อาจอยู่นอก repository

ฐานมีตาราง work tracking, OT linkage และ line_webhook_events แต่ไม่พบ LINE webhook handler เดิมใน repository HRM นี้ ต้องตรวจว่า production channel ปัจจุบันชี้ไปที่ระบบภายนอกหรือไม่ก่อนเปลี่ยน URL

โค้ดใหม่นี้ไม่เพิ่ม flow work tracking หรือ OT ใน LINE และไม่ consume receipt เดิมที่ request_payload เป็น null หาก channel เดียวกันมี handler ภายนอกอยู่ ต้องนำ router/handler นั้นมาเชื่อมโดยมีผู้ claim event_id เพียงระบบเดียวก่อน cutover ไม่ใช้สอง webhook writers แข่งกัน

Google Drive และ Cloudinary ของ HRM เดิมยังทำงานตามเดิม ไม่เปลี่ยนระบบเอกสารเป็น Service Account ตามไปด้วย

## 6. Dependency baseline

npm ci รายงานช่องโหว่ของ dependency ที่มีอยู่เดิม ไม่ได้เพิ่ม dependency ในงานนี้ ผล npm audit --omit=dev ณ วันที่ 21 พฤศจิกายน 2026 รายงาน 7 รายการ: critical 1 (next), high 3 (sharp, source-map-js, zod), moderate 2 (exceljs, uuid), low 1 (dompurify) ต้องประเมิน advisory กับเส้นทางที่ใช้งานจริงก่อนเปิด production

ไม่ได้รัน npm audit fix --force เพราะอาจเปลี่ยนพฤติกรรม HRM การอัปเดต dependencies ควรแยกงานพร้อม regression tests และไม่ถือว่า severity ของ package ทุกตัวมี exploit path ในระบบนี้เหมือนกัน

ผล audit และผลตรวจโค้ดล่าสุดให้ดูจากรายงานการส่งมอบของ branch นี้ ไม่ถือว่า build/test ที่ผ่านลบความเสี่ยงของ advisory

## 7. การลงทะเบียนเวอร์ชันก่อนหน้า

เอาปุ่มเชื่อม LINE และ endpoint ออกรหัสจาก HRM ออกแล้ว ตาราง line_link_codes เดิมคงไว้เพื่อให้ migration ที่มีอยู่ไม่ถูกแก้ย้อนหลัง แต่ไม่มีการออกรหัสใหม่ใน runtime ปัจจุบัน ลงทะเบียนด้วยรหัสพนักงานตามต้นฉบับ และยังคงตรวจบัญชี active/สิทธิ์/ไม่เขียนทับ LINE เดิม
