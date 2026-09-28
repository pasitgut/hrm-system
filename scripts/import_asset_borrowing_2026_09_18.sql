BEGIN;

CREATE TEMP TABLE asset_borrowing_import_stage (
  id uuid PRIMARY KEY,
  form_at timestamptz NOT NULL,
  employee_code varchar(4) NOT NULL,
  employee_name text NOT NULL,
  employee_position text NOT NULL,
  reason text NOT NULL,
  from_date date NOT NULL,
  to_date date,
  approved_by_name text NOT NULL,
  test_marker text NOT NULL,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  agreement_id uuid,
  agreement_title text NOT NULL DEFAULT 'หนังสือรับทราบและยอมรับเงื่อนไขการรับมอบยูนิฟอร์ม (Custom Made) และอุปกรณ์ชุดโทรศัพท์พร้อมสายชาร์จ',
  agreement_header_html text NOT NULL DEFAULT '<img data-agreement-image="true" src="/download.png" alt="ตราบริษัท ต.จรัสชัย"><p style="text-align:center"><strong>T.Jaruschai International Construction Co.,Ltd.</strong><br>2043 Soi Kanchanaphisek 008, Bangkae, Bangkae Bangkok 10160 Thailand</p>',
  agreement_body_html text NOT NULL DEFAULT $agreement$<p>วันที่ {{agreementDate}}</p>
<p>ข้าพเจ้า (นาย/นาง/นางสาว) <strong>{{employeeName}}</strong> รหัสพนักงาน <strong>{{employeeCode}}</strong> ตำแหน่ง <strong>{{position}}</strong> แผนก/หน่วยงาน <strong>{{department}}</strong></p>
<p>ข้าพเจ้าได้รับมอบยูนิฟอร์มตัวนอกซึ่งบริษัทเป็นผู้สั่งตัดแบบพิเศษเฉพาะ (Custom Made) และอุปกรณ์ชุดโทรศัพท์พร้อมสายชาร์จ เพื่อใช้ในการปฏิบัติงานตามหน้าที่ที่ได้รับมอบหมาย และขอรับทราบพร้อมยอมรับเงื่อนไขการดูแลรักษา การเปลี่ยน และความรับผิดในกรณีสูญหายหรือชำรุด ดังต่อไปนี้</p>
<p><strong>1. ยูนิฟอร์มตัวนอก (Custom Made)</strong> เป็นชุดที่บริษัทสั่งตัดขึ้นเป็นพิเศษเฉพาะ ตามแบบ สี และตราสัญลักษณ์ของบริษัท โดยบริษัทเป็นผู้ออกค่าใช้จ่าย และถือเป็นทรัพย์สินของบริษัทที่มอบให้พนักงานใช้ในการปฏิบัติงาน พนักงานได้รับมอบยูนิฟอร์มตัวนอกจำนวน 1 ตัว</p>
<p><strong>1.1</strong> กรณีทำสูญหาย ข้าพเจ้ายินยอมชดใช้ค่าเสียหายให้บริษัทในอัตราตัวละ <strong>1,000 บาท (หนึ่งพันบาทถ้วน)</strong> พนักงานชำระค่าชดใช้เป็นเงินสดหรือโอนเข้าบัญชีของบริษัท ภายใน 15 วันนับแต่วันที่บริษัทแจ้งเป็นหนังสือ บริษัทจะออกใบเสร็จรับเงินให้ทุกครั้ง ทั้งนี้ บริษัทจะไม่หักเงินจำนวนนี้จากค่าจ้างของพนักงาน</p>
<p><strong>1.2</strong> กรณีชุดเก่าตามสภาพการใช้งาน ขาด หรือชำรุด ข้าพเจ้าสามารถแจ้งขอเปลี่ยนชุดใหม่กับบริษัทได้โดยไม่มีค่าใช้จ่าย ทั้งนี้ให้อยู่ในดุลพินิจของบริษัทในการพิจารณาความเหมาะสมในการเปลี่ยนเป็นราย ๆ ไป</p>
<p><strong>1.3</strong> การขอเปลี่ยนชุดตามข้อ 1.2 ข้าพเจ้าต้องนำชุดเดิมมาแสดงหรือส่งคืนบริษัทเพื่อประกอบการพิจารณาทุกครั้ง</p>
<p><strong>2. ชุดโทรศัพท์พร้อมสายชาร์จ (จำนวน 1 ชุด)</strong></p>
<p><strong>2.1</strong> บริษัทมอบชุดโทรศัพท์พร้อมสายชาร์จ จำนวน 1 ชุด ให้ข้าพเจ้าใช้ในการปฏิบัติงาน โดยถือเป็นทรัพย์สินของบริษัททั้งสิ้น</p>
<p><strong>2.2</strong> กรณีทำสูญหาย ข้าพเจ้ายินยอมชดใช้ค่าปรับตามมูลค่าสินค้าจริงของอุปกรณ์รายการนั้น ๆ</p><hr data-agreement-page-break="true"><p></p>
<p><strong>2.3</strong> กรณีอุปกรณ์ชำรุดหรือเสียจากการใช้งานตามปกติและต้องซ่อมแซม ข้าพเจ้าต้องแจ้งบริษัทเพื่อดำเนินการซ่อม โดยบริษัทไม่เรียกเก็บค่าใช้จ่ายจากข้าพเจ้า</p>
<p><strong>2.4</strong> ข้าพเจ้าจะไม่ดำเนินการซ่อม ดัดแปลง หรือให้บุคคลภายนอกซ่อมอุปกรณ์ด้วยตนเอง โดยไม่ได้รับอนุญาตจากบริษัท</p>
<p><strong>3. เงื่อนไขทั่วไป</strong></p>
<p><strong>3.1</strong> สวมใส่ยูนิฟอร์มเฉพาะในการปฏิบัติงานหรือกิจกรรมของบริษัท และรักษาให้อยู่ในสภาพเรียบร้อย สะอาด เหมาะสมกับภาพลักษณ์ของบริษัท</p>
<p><strong>3.2</strong> ข้าพเจ้าจะดูแลรักษาทรัพย์สินของบริษัททุกรายการที่ได้รับมอบให้อยู่ในสภาพดี และใช้เพื่อประโยชน์ในการปฏิบัติงานเท่านั้น</p>
<p><strong>3.3</strong> กรณีทรัพย์สินสูญหาย ชำรุด หรือเสียหาย ข้าพเจ้าจะแจ้งผู้บังคับบัญชาหรือฝ่ายบุคคลทราบทันที หรือไม่เกิน 3 วันทำการ นับจากวันที่ทราบเหตุ</p>
<p><strong>3.4</strong> กรณีความเสียหายหรือการสูญหายเกิดจากการจงใจหรือประมาทเลินเล่อของข้าพเจ้า ข้าพเจ้ายินยอมชดใช้ค่าเสียหายให้บริษัทตามเงื่อนไขที่ระบุไว้ในหนังสือฉบับนี้</p>
<p><strong>3.5</strong> เมื่อข้าพเจ้าพ้นสภาพการเป็นพนักงาน โอนย้าย หรือเมื่อบริษัทเรียกคืน ข้าพเจ้าจะส่งคืนยูนิฟอร์มและอุปกรณ์ทั้งหมดให้บริษัทในสภาพเรียบร้อย หากรายการใดสูญหาย ข้าพเจ้ายินยอมชดใช้ตามเงื่อนไขข้างต้น</p>
<p><strong>3.6</strong> บริษัทขอสงวนสิทธิ์ในการเปลี่ยนแปลงเงื่อนไขหรืออัตราค่าเสียหายในอนาคต โดยจะแจ้งให้พนักงานทราบล่วงหน้า</p>
<p>พนักงานได้อ่านและเข้าใจเงื่อนไขข้างต้นโดยตลอดแล้ว และลงลายมือชื่อไว้ด้วยความสมัครใจ หนังสือนี้จัดทำขึ้นสองฉบับมีข้อความตรงกัน บริษัทและพนักงานเก็บไว้ฝ่ายละหนึ่งฉบับ</p>$agreement$,
  agreement_footer_html text NOT NULL DEFAULT '',
  agreement_status public.asset_agreement_status NOT NULL DEFAULT 'waiting_handover',
  agreement_created_by_name text NOT NULL DEFAULT 'นำเข้าข้อมูลเดิม',
  agreement_created_by_employee_code varchar(20) NOT NULL DEFAULT '',
  agreement_document_date date,
  agreement_updated_at timestamptz,
  agreement_signature_boxes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(agreement_signature_boxes) = 'array'),
  borrower_employee_id uuid,
  approved_by_employee_id uuid
) ON COMMIT DROP;

INSERT INTO asset_borrowing_import_stage (
  id, form_at, employee_code, employee_name, employee_position,
  reason, from_date, to_date, approved_by_name, test_marker, items
) VALUES
  (
    '42d965e1-d3ca-454b-8562-295cc537a50e', '2026-09-18 08:23:09+07', '2209', 'ชนม์สวัสดิ์ เชยชื่นกลิ่น', 'พนักงาน',
    '', '2026-09-18', NULL, 'สุเมธ เจตธำรงชัย', 'seen',
    '[{"name":"เสื้อกั๊ก custom made","quantity":1,"note":""},{"name":"โทรศัพท์ + สายชาร์จ","quantity":1,"note":""},{"name":"ระดับน้ำ","quantity":1,"note":""},{"name":"ไฟฉาย","quantity":1,"note":""},{"name":"ไฟฉาย+ที่เปิดท่อ","quantity":1,"note":""},{"name":"กระเป๋าตรวจ","quantity":1,"note":""}]'::jsonb
  ),
  (
    '71e68f47-070c-4a5b-937f-c514cf1e7b93', '2026-09-18 08:25:49+07', '2317', 'วาทนนท์ หลักนาลาว', 'พนักงาน',
    '', '2026-09-18', NULL, 'สุเมธ เจตธำรงชัย', 'seen',
    '[{"name":"เสื้อกั๊ก custom made","quantity":1,"note":""},{"name":"โทรศัพท์ + สายชาร์จ","quantity":1,"note":""},{"name":"ปากกาวัดไฟ","quantity":1,"note":""},{"name":"ไม้เคาะ","quantity":1,"note":""},{"name":"ไฟฉาย","quantity":1,"note":""},{"name":"ระดับน้ำ","quantity":1,"note":""},{"name":"กระเป๋าตรวจ","quantity":1,"note":""}]'::jsonb
  ),
  (
    '0614931b-58fe-47a1-bf1a-8160762d2742', '2026-09-18 08:27:36+07', '1803', 'จักริน ศรีวรวงษ์', 'พนักงาน',
    '', '2026-09-18', NULL, 'สุเมธ เจตธำรงชัย', 'seen',
    '[{"name":"เสื้อกั๊ก custom made","quantity":1,"note":""},{"name":"โทรศัพท์ + สายชาร์จ","quantity":1,"note":""},{"name":"ไฟฉาย+ที่เปิดท่อ","quantity":2,"note":""},{"name":"ปากกาวัดไฟ","quantity":1,"note":""},{"name":"กระเป๋าตรวจ","quantity":1,"note":""}]'::jsonb
  ),
  (
    'bd1d1f5f-a15d-4042-80e3-e82bcfcd275e', '2026-09-18 08:28:45+07', '2005', 'ชาญธวัช เจริญธรรมโชติ', 'หัวหน้างาน',
    '', '2026-09-18', NULL, 'สุเมธ เจตธำรงชัย', 'seen',
    '[{"name":"เสื้อกั๊ก custom made","quantity":1,"note":""},{"name":"โทรศัพท์ + สายชาร์จ","quantity":1,"note":""},{"name":"ไฟฉายเลเซอร์","quantity":1,"note":""},{"name":"เข้มขัด","quantity":1,"note":""},{"name":"กระเป๋าตรวจ","quantity":1,"note":""},{"name":"ไฟฉาย+ที่เปิดท่อ","quantity":1,"note":""},{"name":"ระดับน้ำ","quantity":1,"note":""},{"name":"ปากกาวัดไฟ","quantity":1,"note":""}]'::jsonb
  ),
  (
    'c61269bb-2739-4a41-bae9-c52ef5db99c2', '2026-09-18 08:30:02+07', '2425', 'วทัญญู ทูรังกูร', 'พนักงาน',
    '', '2026-09-18', NULL, 'สุเมธ เจตธำรงชัย', 'seen',
    '[{"name":"เสื้อกั๊ก custom made","quantity":1,"note":""},{"name":"โทรศัพท์ + สายชาร์จ","quantity":1,"note":""},{"name":"ไฟฉาย+ที่เปิดท่อ","quantity":1,"note":""},{"name":"ปากกาวัดไฟ","quantity":1,"note":""},{"name":"ปืนฉีดน้ำ","quantity":1,"note":""},{"name":"ไขควง","quantity":1,"note":""},{"name":"ระดับน้ำ","quantity":1,"note":""},{"name":"กระเป๋าตรวจ","quantity":1,"note":""}]'::jsonb
  ),
  (
    '945cb6bf-3a3d-4220-b08d-f4832de83d44', '2026-09-18 08:31:11+07', '2320', 'พรเทวา กิจขยัน', 'พนักงาน',
    '', '2026-09-18', NULL, 'สุเมธ เจตธำรงชัย', 'seen',
    '[{"name":"เสื้อกั๊ก custom made","quantity":1,"note":""},{"name":"โทรศัพท์ + สายชาร์จ","quantity":1,"note":""},{"name":"ไฟเทส USB","quantity":1,"note":""},{"name":"ไฟฉาย","quantity":1,"note":""},{"name":"ไฟฉาย+ที่เปิดท่อ","quantity":1,"note":""},{"name":"ไขควง","quantity":1,"note":""},{"name":"ระดับน้ำ","quantity":1,"note":""},{"name":"กระเป๋าตรวจ","quantity":1,"note":""}]'::jsonb
  ),
  (
    'cc0539ac-5d99-49c3-988e-e8524235b5c0', '2026-09-18 08:32:24+07', '2529', 'บุญเอก กุยยกานนท์', 'พนักงาน',
    '', '2026-09-18', NULL, 'สุเมธ เจตธำรงชัย', 'seen',
    '[{"name":"เสื้อกั๊ก custom made","quantity":1,"note":""},{"name":"โทรศัพท์ + สายชาร์จ","quantity":1,"note":""},{"name":"เครื่องตรวจสอบเต้ารับไฟ (socket test )","quantity":1,"note":""},{"name":"ไฟฉาย+ที่เปิดท่อ","quantity":1,"note":""},{"name":"ระดับน้ำ","quantity":1,"note":""},{"name":"กระเป๋าตรวจ","quantity":1,"note":""}]'::jsonb
  ),
  (
    'cf3c8257-a39b-4c3d-8045-49742d695122', '2026-09-18 08:33:29+07', '2634', 'วรัญชิต คุ้มปานอินทร์', 'พนักงาน',
    '', '2026-09-18', NULL, 'สุเมธ เจตธำรงชัย', 'seen',
    '[{"name":"เสื้อกั๊ก custom made","quantity":1,"note":""},{"name":"โทรศัพท์ + สายชาร์จ","quantity":1,"note":""},{"name":"ปากกาวัดไฟ","quantity":1,"note":""},{"name":"ไฟฉาย+ที่เปิดท่อ","quantity":1,"note":""},{"name":"ตลับเมตร","quantity":1,"note":""},{"name":"ไขควง","quantity":1,"note":""},{"name":"ระดับน้ำ","quantity":1,"note":""},{"name":"กระเป๋าตรวจ","quantity":1,"note":""}]'::jsonb
  ),
  (
    '0cc5c517-03ef-49db-82eb-42d8b6484246', '2026-09-18 08:34:34+07', '2632', 'อดิเทพ ประวงศ์', 'พนักงาน',
    '', '2026-09-18', NULL, 'สุเมธ เจตธำรงชัย', 'seen',
    '[{"name":"เสื้อกั๊ก custom made","quantity":1,"note":""},{"name":"โทรศัพท์ + สายชาร์จ","quantity":1,"note":""},{"name":"สายรัด","quantity":1,"note":""},{"name":"ถุงมือ","quantity":1,"note":""},{"name":"ปากกาวัดไฟ","quantity":1,"note":""},{"name":"ไฟฉาย","quantity":1,"note":""},{"name":"ไฟฉาย+ที่เปิดท่อ","quantity":1,"note":""},{"name":"ไขควง","quantity":1,"note":""},{"name":"ระดับน้ำ","quantity":1,"note":""},{"name":"กระเป๋าตรวจ","quantity":1,"note":""}]'::jsonb
  ),
  (
    '47e66176-9191-4dc6-b3bf-c3364ec21ecd', '2026-09-18 08:35:36+07', '2213', 'ศุภพัฒน์ เจริญธรรมโชติ', 'พนักงาน',
    '', '2026-09-18', NULL, 'สุเมธ เจตธำรงชัย', 'seen',
    '[{"name":"เสื้อกั๊ก custom made","quantity":1,"note":""},{"name":"โทรศัพท์ + สายชาร์จ","quantity":1,"note":""},{"name":"ไฟฉาย+ที่เปิดท่อ","quantity":1,"note":""},{"name":"ไฟเทส usb","quantity":1,"note":""},{"name":"สายเทส TV","quantity":1,"note":""},{"name":"ปากกาวัดไฟ","quantity":1,"note":""},{"name":"ตลับเมตร","quantity":1,"note":""},{"name":"ไขควง","quantity":1,"note":""},{"name":"ระดับน้ำ","quantity":1,"note":""}]'::jsonb
  );

UPDATE asset_borrowing_import_stage
SET
  agreement_id = CASE id
    WHEN '42d965e1-d3ca-454b-8562-295cc537a50e' THEN 'a5499786-83aa-5171-a345-ddb6c799ad1e'::uuid
    WHEN '71e68f47-070c-4a5b-937f-c514cf1e7b93' THEN '863e2b64-424f-5bb0-8625-1f97e5d7fe3d'::uuid
    WHEN '0614931b-58fe-47a1-bf1a-8160762d2742' THEN '02fc4857-e104-5738-9769-ad8f206373c6'::uuid
    WHEN 'bd1d1f5f-a15d-4042-80e3-e82bcfcd275e' THEN '2de196ad-cd7a-5f06-a7e7-418f983c6a4b'::uuid
    WHEN 'c61269bb-2739-4a41-bae9-c52ef5db99c2' THEN '87509a25-ca03-5eb5-9cbb-54ba2584c01c'::uuid
    WHEN '945cb6bf-3a3d-4220-b08d-f4832de83d44' THEN '29c0f2fc-b278-5c1b-bdcb-d51b653ed61f'::uuid
    WHEN 'cc0539ac-5d99-49c3-988e-e8524235b5c0' THEN 'e8fb0803-f287-5e4e-9de1-2f617d739420'::uuid
    WHEN 'cf3c8257-a39b-4c3d-8045-49742d695122' THEN '3455ea25-0987-56d1-a761-65ceab5316af'::uuid
    WHEN '0cc5c517-03ef-49db-82eb-42d8b6484246' THEN '9ddd8106-4aaa-595a-b2dd-f1968f5f4bc1'::uuid
    WHEN '47e66176-9191-4dc6-b3bf-c3364ec21ecd' THEN 'b9899cf5-6b92-56e3-98a9-58e8283c5e5f'::uuid
  END,
  agreement_document_date = form_at::date,
  agreement_signature_boxes = jsonb_build_array(
    jsonb_build_object('id', 'employee', 'label', 'พนักงานผู้รับมอบ', 'role', 'พนักงานผู้รับมอบ', 'name', employee_name, 'signer', 'employee', 'position', 'bottom-left', 'page', 3, 'x', 10, 'y', 72, 'status', 'pending', 'signedAt', NULL),
    jsonb_build_object('id', 'handover', 'label', 'ผู้ส่งมอบ', 'role', 'ผู้ส่งมอบ', 'name', 'นภัสปวัน ฉายสุริยะ', 'signer', 'other', 'position', 'bottom-right', 'page', 3, 'x', 60, 'y', 72, 'status', 'locked', 'signedAt', NULL),
    jsonb_build_object('id', 'admin', 'label', 'ผู้มีอำนาจอนุมัติ', 'role', 'ผู้มีอำนาจอนุมัติ', 'name', 'สุเมธ เจตธำรงชัย', 'signer', 'admin', 'position', 'lower-right', 'page', 3, 'x', 60, 'y', 82, 'status', 'locked', 'signedAt', NULL)
  );

UPDATE asset_borrowing_import_stage
SET
  agreement_status = 'completed',
  agreement_created_by_name = 'ฝึกงาน',
  agreement_created_by_employee_code = '7777',
  agreement_updated_at = '2026-09-19 13:51:02+07',
  agreement_signature_boxes = '[
    {"id":"employee","label":"พนักงานผู้รับมอบ","role":"พนักงานผู้รับมอบ","name":"ชนม์สวัสดิ์ เชยชื่นกลิ่น","signer":"employee","position":"bottom-left","page":3,"x":10,"y":72,"signatureData":"https://i.ibb.co/bM8xXyGy/signature-1789724409426.jpg","status":"signed","signedAt":"2026-09-18T09:40:11.409Z"},
    {"id":"handover","label":"ผู้ส่งมอบ","role":"ผู้ส่งมอบ","name":"นภัสปวัน ฉายสุริยะ","signer":"other","position":"bottom-right","page":3,"x":60,"y":72,"signatureData":"https://i.ibb.co/4RVVtdS3/signature-1789700775301.jpg","status":"signed","signedAt":"2026-09-18T01:39:22.107Z"},
    {"id":"admin","label":"ผู้มีอำนาจอนุมัติ","role":"ผู้มีอำนาจอนุมัติ","name":"สุเมธ เจตธำรงชัย","signer":"admin","position":"lower-right","page":3,"x":60,"y":82,"signatureData":"https://i.ibb.co/jvRb2X9P/sign.png","status":"signed","signedAt":"2026-09-19T06:51:01.809Z"}
  ]'::jsonb,
  agreement_header_html = '<img data-agreement-image="true" src="/download.png" alt="ตราบริษัท ต.จรัสชัย"><p style="text-align:center"><strong>T.Jaruschai International Construction Co.,Ltd.</strong><br>2043 Soi Kanchanaphisek 008, Bangkae, Bangkae Bangkok 10160 Thailand</p>'
WHERE id = '42d965e1-d3ca-454b-8562-295cc537a50e';

INSERT INTO public.positions (name)
SELECT DISTINCT employee_position
FROM asset_borrowing_import_stage
WHERE employee_position <> ''
ON CONFLICT (name) DO NOTHING;

-- start_date is required by the HRM schema; use the earliest supplied borrowing date for these imported profiles.
INSERT INTO public.employees (code, first_name, last_name, email, start_date, position_id)
SELECT
  s.employee_code,
  split_part(s.employee_name, ' ', 1),
  substr(s.employee_name, strpos(s.employee_name, ' ') + 1),
  'hrm-import-asset-20260918-' || s.employee_code || '@example.invalid',
  s.from_date,
  p.id
FROM asset_borrowing_import_stage s
JOIN public.positions p ON p.name = s.employee_position
ON CONFLICT (code) DO NOTHING;

UPDATE public.employees e
SET email = 'hrm-import-asset-20260918-' || s.employee_code || '@example.invalid'
FROM asset_borrowing_import_stage s
WHERE e.code = s.employee_code
  AND (e.email IS NULL OR btrim(e.email) = '')
  AND NOT EXISTS (
    SELECT 1 FROM public.employees other
    WHERE other.email = 'hrm-import-asset-20260918-' || s.employee_code || '@example.invalid'
      AND other.id <> e.id
  );

UPDATE public.employees e
SET position_id = p.id
FROM asset_borrowing_import_stage s
JOIN public.positions p ON p.name = s.employee_position
WHERE e.code = s.employee_code AND e.position_id IS NULL;

DO $$
DECLARE
  missing_employees text;
BEGIN
  SELECT string_agg(s.employee_code || ' (' || s.employee_name || ')', ', ' ORDER BY s.employee_code)
  INTO missing_employees
  FROM asset_borrowing_import_stage s
  LEFT JOIN public.employees e ON e.code = s.employee_code
  WHERE e.id IS NULL;

  IF missing_employees IS NOT NULL THEN
    RAISE EXCEPTION 'Asset borrowing import stopped; employee codes not found: %', missing_employees;
  END IF;
END;
$$;

UPDATE asset_borrowing_import_stage s
SET borrower_employee_id = e.id
FROM public.employees e
WHERE e.code = s.employee_code;

UPDATE asset_borrowing_import_stage s
SET approved_by_employee_id = (
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(e.id))[1] END
  FROM public.employees e
  WHERE btrim(concat_ws(' ', e.first_name, e.last_name)) = btrim(s.approved_by_name)
);

-- Preserve the completed document and signatures supplied for employee 2209.
-- The other nine rows receive the same document template with unsigned workflow boxes;
-- no missing historical signatures are fabricated.
INSERT INTO public.asset_agreements (
  id, title, header_html, body_html, footer_html, status,
  created_by_employee_id, created_by_name, created_by_employee_code,
  return_condition, document_date, updated_at
)
SELECT
  s.agreement_id, s.agreement_title, s.agreement_header_html, s.agreement_body_html,
  s.agreement_footer_html, s.agreement_status,
  (SELECT e.id FROM public.employees e WHERE e.code = s.agreement_created_by_employee_code LIMIT 1),
  s.agreement_created_by_name, s.agreement_created_by_employee_code,
  NULL, s.agreement_document_date, s.agreement_updated_at
FROM asset_borrowing_import_stage s
WHERE NOT EXISTS (
  SELECT 1 FROM public.asset_requests r
  WHERE r.id = s.id AND r.agreement_id IS NOT NULL AND r.agreement_id <> s.agreement_id
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.asset_agreement_signers (
  agreement_id, box_id, position, participant, label, role,
  signer_kind, signer_name, layout_position, page, x_percent, y_percent,
  signature_data, signature_status, signed_by_employee_id, signed_by_name, signed_at,
  return_signature_data, return_signed_by_employee_id, return_signed_by_name, return_signed_at
)
SELECT
  s.agreement_id,
  box.value ->> 'id',
  (box.ordinality - 1)::smallint,
  CASE box.value ->> 'signer'
    WHEN 'employee' THEN 'employee'::public.asset_agreement_participant
    WHEN 'other' THEN 'handover'::public.asset_agreement_participant
    ELSE 'admin'::public.asset_agreement_participant
  END,
  box.value ->> 'label',
  box.value ->> 'role',
  (box.value ->> 'signer')::public.asset_signer_kind,
  COALESCE(box.value ->> 'name', ''),
  box.value ->> 'position',
  NULLIF(box.value ->> 'page', '')::smallint,
  NULLIF(box.value ->> 'x', '')::numeric(5, 2),
  NULLIF(box.value ->> 'y', '')::numeric(5, 2),
  NULLIF(box.value ->> 'signatureData', ''),
  (box.value ->> 'status')::public.asset_signature_status,
  CASE WHEN box.value ->> 'status' = 'signed' THEN (
    SELECT e.id FROM public.employees e
    WHERE btrim(concat_ws(' ', e.first_name, e.last_name)) = btrim(box.value ->> 'name')
    LIMIT 1
  ) ELSE NULL END,
  CASE WHEN box.value ->> 'status' = 'signed' THEN COALESCE(box.value ->> 'name', '') ELSE '' END,
  NULLIF(box.value ->> 'signedAt', '')::timestamptz,
  NULL,
  NULL,
  '',
  NULL
FROM asset_borrowing_import_stage s
CROSS JOIN LATERAL jsonb_array_elements(s.agreement_signature_boxes) WITH ORDINALITY AS box(value, ordinality)
WHERE EXISTS (SELECT 1 FROM public.asset_agreements a WHERE a.id = s.agreement_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.asset_requests r
    WHERE r.id = s.id AND r.agreement_id IS NOT NULL AND r.agreement_id <> s.agreement_id
  )
ON CONFLICT (agreement_id, box_id) DO NOTHING;

-- The source data has no separate approval timestamp, so approved_borrow_at stays NULL.
INSERT INTO public.asset_requests (
  id, agreement_id, borrower_employee_id, borrower_employee_code, borrower_name,
  borrower_department, borrower_position, form_date, from_date, to_date,
  reason, remarks, status, approved_borrow_by_employee_id,
  approved_borrow_by_name, approved_borrow_at, return_inspector_name,
  approved_return_by_name, return_inspection, created_at, updated_at
)
SELECT
  s.id, s.agreement_id, s.borrower_employee_id, s.employee_code, s.employee_name,
  '', s.employee_position, s.form_at, s.from_date, s.to_date,
  s.reason, '', 'approved'::public.asset_request_status,
  s.approved_by_employee_id, s.approved_by_name, NULL, '', '', NULL,
  s.form_at, s.form_at
FROM asset_borrowing_import_stage s
ON CONFLICT (id) DO UPDATE SET
  agreement_id = COALESCE(public.asset_requests.agreement_id, EXCLUDED.agreement_id);

INSERT INTO public.asset_request_items (request_id, position, name, quantity, note)
SELECT
  s.id,
  (item.ordinality - 1)::smallint,
  item.value ->> 'name',
  (item.value ->> 'quantity')::integer,
  COALESCE(item.value ->> 'note', '')
FROM asset_borrowing_import_stage s
CROSS JOIN LATERAL jsonb_array_elements(s.items) WITH ORDINALITY AS item(value, ordinality)
WHERE EXISTS (SELECT 1 FROM public.asset_requests r WHERE r.id = s.id)
ON CONFLICT (request_id, position) DO NOTHING;

INSERT INTO public.asset_request_events (
  request_id, actor_employee_id, event_type, from_status, to_status, details, created_at
)
SELECT
  s.id, s.approved_by_employee_id, 'imported_from_spreadsheet', NULL,
  'approved'::public.asset_request_status,
  jsonb_build_object(
    'source', 'user_provided_import',
    'approverName', s.approved_by_name,
    'test', s.test_marker
  ),
  s.form_at
FROM asset_borrowing_import_stage s
WHERE EXISTS (SELECT 1 FROM public.asset_requests r WHERE r.id = s.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.asset_request_events e
    WHERE e.request_id = s.id AND e.event_type = 'imported_from_spreadsheet'
  );

COMMIT;
