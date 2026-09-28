import { randomUUID } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import {
  agreementParticipantForSignatureBox,
  canTransitionAssetStatus,
  parseAssetItems,
  type AssetAgreementParticipant as Participant,
  type AssetAgreementStatus as AgreementStatus,
  type AssetSignatureBox as SignatureBox,
  type AssetStatus,
} from '../domain/asset.js';
import { apiHandler, type Actor, type ApiRequest, type ApiResponse } from '../../../../api/lib/auth.js';
import { asDate, getPool, HttpError, inTransaction, toIso } from '../../../../api/lib/db.js';

const statusFromDb: Record<string, AssetStatus> = {
  pending: 'pending', approved: 'approved', rejected: 'rejected', return_pending: 'returnPending', returned: 'returned', unknown: 'unknown',
};
const statusToDb: Record<AssetStatus, string> = {
  pending: 'pending', approved: 'approved', rejected: 'rejected', returnPending: 'return_pending', returned: 'returned', unknown: 'unknown',
};
const statusLabel: Record<AssetStatus, string> = {
  pending: 'รอ', approved: 'อนุมัติ', rejected: 'ไม่อนุมัติ', returnPending: 'รอรับคืน', returned: 'คืนแล้ว', unknown: 'ไม่ทราบสถานะ',
};
const agreementStatusToDb: Record<AgreementStatus, string> = {
  waitingHandover: 'waiting_handover', waitingEmployee: 'waiting_employee', waitingAdmin: 'waiting_admin', completed: 'completed',
};
const agreementStatusFromDb: Record<string, AgreementStatus> = {
  waiting_handover: 'waitingHandover', waiting_employee: 'waitingEmployee', waiting_admin: 'waitingAdmin', completed: 'completed',
};

type RequestRow = QueryResultRow & {
  id: string;
  legacy_sheet_id: string | null;
  borrower_employee_id: string;
  borrower_employee_code: string;
  borrower_name: string;
  borrower_department: string;
  borrower_position: string;
  form_date: Date;
  from_date: Date;
  to_date: Date | null;
  reason: string;
  remarks: string;
  status: string;
  status_label: string;
  approved_borrow_by_name: string;
  approved_borrow_at: Date | null;
  return_inspector_name: string;
  approved_return_by_name: string;
  return_inspection: string | null;
};

function requireString(value: unknown, field: string, max = 20_000): string {
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, `ข้อมูล ${field} ไม่ถูกต้อง`);
  return value.trim();
}
function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}
function date(value: unknown, field: string): Date {
  const parsed = asDate(value);
  if (!parsed) throw new HttpError(400, `กรุณาระบุ${field}`);
  return parsed;
}
function optionalDate(value: unknown): Date | null {
  return asDate(value);
}
function status(value: unknown): AssetStatus {
  if (typeof value !== 'string' || !(value in statusToDb)) throw new HttpError(400, 'สถานะรายการไม่ถูกต้อง');
  return value as AssetStatus;
}
function parseItems(value: unknown): Array<{ name: string; quantity: number; note: string }> {
  const source = requireString(value, 'รายการทรัพย์สิน', 10_000);
  try {
    return parseAssetItems(source);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'รายการทรัพย์สินไม่ถูกต้อง');
  }
}
function agreementParticipant(box: Partial<SignatureBox>): Participant {
  return agreementParticipantForSignatureBox({ id: box.id ?? '', signer: box.signer });
}
function validateAgreement(value: unknown): Record<string, unknown> & {
  title: string; header: string; body: string; footer: string; signatureBoxes: SignatureBox[];
  status: AgreementStatus; createdBy: string; createdByCode: string; documentDate: Date; updatedAt: Date | null;
} {
  if (!value || typeof value !== 'object') throw new HttpError(400, 'Agreement ไม่ถูกต้อง');
  const input = value as Record<string, unknown>;
  const statuses: AgreementStatus[] = ['waitingHandover', 'waitingEmployee', 'waitingAdmin', 'completed'];
  if (!Array.isArray(input.signatureBoxes) || input.signatureBoxes.length > 20) throw new HttpError(400, 'รายการผู้ลงนามไม่ถูกต้อง');
  if (typeof input.status !== 'string' || !statuses.includes(input.status as AgreementStatus)) throw new HttpError(400, 'สถานะ Agreement ไม่ถูกต้อง');
  if (input.returnCondition !== undefined && input.returnCondition !== null && !['original', 'damaged', 'lost'].includes(String(input.returnCondition))) {
    throw new HttpError(400, 'สภาพทรัพย์สินตอนคืนไม่ถูกต้อง');
  }
  const boxes: SignatureBox[] = input.signatureBoxes.map((value) => {
    if (!value || typeof value !== 'object') throw new HttpError(400, 'ข้อมูลผู้ลงนามไม่ถูกต้อง');
    const box = value as Record<string, unknown>;
    const position = box.position;
    if (!['bottom-left', 'bottom-right', 'lower-left', 'lower-right'].includes(String(position))) throw new HttpError(400, 'ตำแหน่งลายเซ็นไม่ถูกต้อง');
    if (!['pending', 'signed', 'locked'].includes(String(box.status))) throw new HttpError(400, 'สถานะลายเซ็นไม่ถูกต้อง');
    const signatureData = typeof box.signatureData === 'string' ? box.signatureData : undefined;
    const returnSignatureData = typeof box.returnSignatureData === 'string' ? box.returnSignatureData : undefined;
    if ((signatureData?.length ?? 0) > 2_000_000 || (returnSignatureData?.length ?? 0) > 2_000_000) {
      throw new HttpError(400, 'ไฟล์ลายเซ็นมีขนาดใหญ่เกินไป');
    }
    return {
      id: requireString(box.id, 'รหัสผู้ลงนาม', 120),
      label: requireString(box.label, 'ชื่อช่องลายเซ็น', 300),
      role: requireString(box.role, 'ตำแหน่งผู้ลงนาม', 300),
      name: requireString(box.name, 'ชื่อผู้ลงนาม', 300),
      signer: ['employee', 'admin', 'other'].includes(String(box.signer)) ? box.signer as SignatureBox['signer'] : undefined,
      position: position as SignatureBox['position'],
      page: box.page === 2 || box.page === 3 ? box.page as 2 | 3 : undefined,
      x: typeof box.x === 'number' && box.x >= 0 && box.x <= 100 ? box.x : undefined,
      y: typeof box.y === 'number' && box.y >= 0 && box.y <= 100 ? box.y : undefined,
      signatureData,
      returnSignatureData,
      returnSignedAt: box.returnSignedAt === null || typeof box.returnSignedAt === 'string' ? box.returnSignedAt as string | null : null,
      status: box.status as SignatureBox['status'],
      signedAt: box.signedAt === null || typeof box.signedAt === 'string' ? box.signedAt as string | null : null,
    };
  });
  const result = {
    ...input,
    title: requireString(input.title, 'ชื่อเอกสาร', 500),
    header: requireString(input.header, 'หัวเอกสาร', 20_000),
    body: requireString(input.body, 'เนื้อหาเอกสาร', 200_000),
    footer: requireString(input.footer, 'ท้ายเอกสาร', 20_000),
    signatureBoxes: boxes,
    status: input.status as AgreementStatus,
    createdBy: requireString(input.createdBy, 'ผู้สร้าง', 300),
    createdByCode: requireString(input.createdByCode, 'รหัสผู้สร้าง', 100),
    documentDate: date(input.documentDate, 'วันที่เอกสาร'),
    updatedAt: optionalDate(input.updatedAt),
  };
  if (!result.title || !result.body) throw new HttpError(400, 'Agreement ต้องมีชื่อและเนื้อหา');
  return result;
}

async function requestRows(actor: Actor, body: Record<string, unknown>): Promise<RequestRow[]> {
  const action = text(body.action);
  const values: unknown[] = [];
  let where = 'r.deleted_at IS NULL';
  if (action === 'listForEmployee') {
    const code = requireString(body.employeeCode, 'รหัสพนักงาน', 100);
    if (!actor.canManageRequests && code.toLowerCase() !== actor.employeeCode.toLowerCase()) throw new HttpError(403, 'ไม่มีสิทธิ์ดูคำขอของพนักงานคนอื่น');
    values.push(code);
    where += ` AND lower(r.borrower_employee_code) = lower($${values.length})`;
  } else if (action === 'listForParticipant') {
    const participant = text(body.participant);
    if (!['employee', 'handover', 'admin'].includes(participant)) throw new HttpError(400, 'ประเภทผู้ลงนามไม่ถูกต้อง');
    const code = requireString(body.employeeCode, 'รหัสพนักงาน', 100);
    const name = requireString(body.employeeName, 'ชื่อพนักงาน', 300);
    if (!actor.canManageRequests && (code.toLowerCase() !== actor.employeeCode.toLowerCase() || name.toLowerCase() !== actor.name.toLowerCase())) {
      throw new HttpError(403, 'ไม่มีสิทธิ์ดูรายการของผู้ใช้อื่น');
    }
    if (participant === 'employee') {
      values.push(actor.employeeId);
      where += ` AND r.borrower_employee_id = $${values.length}`;
    } else {
      values.push(participant, name);
      where += ` AND EXISTS (SELECT 1 FROM asset_agreement_signers s WHERE s.request_id = r.id AND s.participant = $${values.length - 1}::asset_agreement_participant AND lower(btrim(s.signer_name)) = lower(btrim($${values.length})))`;
    }
  } else if (!actor.canManageRequests) {
    values.push(actor.employeeId, actor.name);
    where += ` AND (r.borrower_employee_id = $${values.length - 1} OR EXISTS (SELECT 1 FROM asset_agreement_signers s WHERE s.request_id = r.id AND lower(btrim(s.signer_name)) = lower(btrim($${values.length}))))`;
  }
  const result = await getPool().query<RequestRow>(
    `SELECT r.* FROM asset_requests r WHERE ${where} ORDER BY r.form_date DESC, r.created_at DESC`, values,
  );
  return result.rows;
}

async function hydrateRequests(client: PoolClient, rows: RequestRow[], actor: Actor): Promise<unknown[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [items, attachments, agreements, signers, reads] = await Promise.all([
    client.query(`SELECT request_id, position, name, quantity, note FROM asset_request_items WHERE request_id = ANY($1::uuid[]) ORDER BY position`, [ids]),
    client.query(`SELECT request_id, kind, position, url FROM asset_request_attachments WHERE request_id = ANY($1::uuid[]) ORDER BY kind, position`, [ids]),
    client.query(`SELECT * FROM asset_agreements WHERE request_id = ANY($1::uuid[])`, [ids]),
    client.query(`SELECT * FROM asset_agreement_signers WHERE request_id = ANY($1::uuid[]) ORDER BY position`, [ids]),
    client.query(`SELECT request_id FROM asset_request_reads WHERE request_id = ANY($1::uuid[]) AND employee_id = $2`, [ids, actor.employeeId]),
  ]);
  const itemsById = groupBy(items.rows, 'request_id');
  const attachmentsById = groupBy(attachments.rows, 'request_id');
  const agreementsById = new Map(agreements.rows.map((item) => [item.request_id as string, item]));
  const signersById = groupBy(signers.rows, 'request_id');
  const seen = new Set(reads.rows.map((row) => row.request_id as string));
  return rows.map((row) => {
    const itemRows = itemsById.get(row.id) ?? [];
    const itemText = itemRows.map((item) => `${item.name}|${item.quantity}|${item.note ?? ''}`).join('\n');
    const attached = attachmentsById.get(row.id) ?? [];
    const requestImages = attached.filter((item) => item.kind === 'request');
    const returnImages = attached.filter((item) => item.kind === 'return');
    const additionalImages = attached.filter((item) => item.kind === 'additional').map((item) => item.url as string);
    const agreementRow = agreementsById.get(row.id);
    const agreement = agreementRow ? {
      title: agreementRow.title,
      header: agreementRow.header_html,
      body: agreementRow.body_html,
      footer: agreementRow.footer_html,
      status: agreementStatusFromDb[agreementRow.status as string] ?? 'waitingHandover',
      createdBy: agreementRow.created_by_name,
      createdByCode: agreementRow.created_by_employee_code,
      returnCondition: agreementRow.return_condition ?? null,
      documentDate: toIso(agreementRow.document_date),
      updatedAt: toIso(agreementRow.updated_at),
      signatureBoxes: (signersById.get(row.id) ?? []).map((signer) => ({
        id: signer.box_id,
        label: signer.label,
        role: signer.role,
        name: signer.signer_name,
        signer: signer.signer_kind,
        position: signer.layout_position,
        ...(signer.page === null ? {} : { page: signer.page }),
        ...(signer.x_percent === null ? {} : { x: Number(signer.x_percent) }),
        ...(signer.y_percent === null ? {} : { y: Number(signer.y_percent) }),
        ...(signer.signature_data ? { signatureData: signer.signature_data } : {}),
        ...(signer.return_signature_data ? { returnSignatureData: signer.return_signature_data } : {}),
        returnSignedAt: toIso(signer.return_signed_at),
        status: signer.signature_status,
        signedAt: toIso(signer.signed_at),
      })),
    } : null;
    const assetStatus = statusFromDb[row.status] ?? 'unknown';
    return {
      id: row.legacy_sheet_id ?? row.id,
      formDate: toIso(row.form_date),
      employeeName: row.borrower_name,
      department: row.borrower_department,
      position: row.borrower_position,
      employeeCode: row.borrower_employee_code,
      reason: row.reason,
      fromDate: toIso(row.from_date),
      toDate: toIso(row.to_date),
      items: itemText,
      remarks: row.remarks,
      status: assetStatus,
      statusLabel: row.status_label || statusLabel[assetStatus],
      approvedBorrowBy: row.approved_borrow_by_name,
      returnInspector: row.return_inspector_name,
      approvedReturnBy: row.approved_return_by_name,
      returnInspection: row.return_inspection ?? '',
      imageUrl: (assetStatus === 'returned' ? returnImages[0]?.url : requestImages[0]?.url) ?? requestImages[0]?.url ?? '',
      seen: seen.has(row.id),
      additionalImages,
      approvedBorrowDate: toIso(row.approved_borrow_at),
      agreement,
    };
  });
}
function groupBy(rows: QueryResultRow[], key: string): Map<string, QueryResultRow[]> {
  const result = new Map<string, QueryResultRow[]>();
  for (const row of rows) {
    const id = String(row[key]);
    const group = result.get(id) ?? [];
    group.push(row);
    result.set(id, group);
  }
  return result;
}

async function findRequest(client: PoolClient, id: string, lock = false): Promise<RequestRow> {
  const result = await client.query<RequestRow>(
    `SELECT * FROM asset_requests WHERE deleted_at IS NULL AND (legacy_sheet_id = $1 OR id::text = $1) ${lock ? 'FOR UPDATE' : ''}`,
    [id],
  );
  if (result.rows.length !== 1) throw new HttpError(result.rows.length ? 409 : 404, result.rows.length ? 'พบรหัสรายการซ้ำ' : 'ไม่พบคำขอทรัพย์สิน');
  return result.rows[0];
}

async function writeItems(client: PoolClient, id: string, value: unknown): Promise<void> {
  const items = parseItems(value);
  await client.query('DELETE FROM asset_request_items WHERE request_id = $1', [id]);
  for (const [position, item] of items.entries()) {
    await client.query(
      `INSERT INTO asset_request_items (request_id, position, name, quantity, note) VALUES ($1, $2, $3, $4, $5)`,
      [id, position, item.name, item.quantity, item.note],
    );
  }
}

async function writeAttachments(client: PoolClient, id: string, body: Record<string, unknown>): Promise<void> {
  const returnImage = body.returnImage === true;
  await client.query(
    returnImage
      ? `DELETE FROM asset_request_attachments WHERE request_id = $1 AND kind = 'return'`
      : `DELETE FROM asset_request_attachments WHERE request_id = $1 AND kind IN ('request','additional')`,
    [id],
  );
  const entries: Array<{ kind: 'request' | 'additional' | 'return'; url: string; position: number }> = [];
  const image = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  if (image) entries.push({ kind: returnImage ? 'return' : 'request', url: image, position: 0 });
  const additional = Array.isArray(body.additionalImages) ? body.additionalImages : [];
  for (const [position, raw] of additional.entries()) {
    if (typeof raw === 'string' && raw.trim()) entries.push({ kind: 'additional', url: raw.trim(), position });
  }
  for (const entry of entries) {
    await client.query(
      `INSERT INTO asset_request_attachments (request_id, kind, position, url, uploaded_by_employee_id) VALUES ($1, $2, $3, $4, $5)`,
      [id, entry.kind, entry.position, entry.url, body.actorId ?? null],
    );
  }
}

async function writeAgreement(client: PoolClient, requestId: string, value: unknown, actor: Actor): Promise<void> {
  if (value === null || value === undefined) {
    await client.query('DELETE FROM asset_agreements WHERE request_id = $1', [requestId]);
    return;
  }
  const agreement = validateAgreement(value);
  const previous = await client.query(`SELECT box_id, signature_data, signature_status, signed_by_employee_id, signed_by_name,
      return_signature_data, return_signed_by_employee_id, return_signed_by_name
    FROM asset_agreement_signers WHERE request_id=$1`, [requestId]);
  const previousById = new Map(previous.rows.map((row) => [row.box_id as string, row]));
  const result = await client.query(
    `INSERT INTO asset_agreements (request_id, title, header_html, body_html, footer_html, status,
       created_by_employee_id, created_by_name, created_by_employee_code, return_condition, document_date, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (request_id) DO UPDATE SET title=EXCLUDED.title, header_html=EXCLUDED.header_html,
       body_html=EXCLUDED.body_html, footer_html=EXCLUDED.footer_html, status=EXCLUDED.status,
       created_by_employee_id=asset_agreements.created_by_employee_id,
       created_by_name=EXCLUDED.created_by_name, created_by_employee_code=EXCLUDED.created_by_employee_code,
       return_condition=EXCLUDED.return_condition, document_date=EXCLUDED.document_date,
       updated_at=COALESCE(EXCLUDED.updated_at, now()), version=asset_agreements.version+1 RETURNING request_id`,
    [requestId, agreement.title, agreement.header, agreement.body, agreement.footer,
      agreementStatusToDb[agreement.status], actor.employeeId, agreement.createdBy, agreement.createdByCode,
      agreement.returnCondition ?? null, agreement.documentDate, agreement.updatedAt],
  );
  await client.query('DELETE FROM asset_agreement_signers WHERE request_id = $1', [requestId]);
  for (const [position, box] of agreement.signatureBoxes.entries()) {
    const old = previousById.get(box.id);
    const signatureWasChanged = box.signatureData !== (old?.signature_data ?? null);
    const returnSignatureWasChanged = box.returnSignatureData !== (old?.return_signature_data ?? null);
    const signedByEmployeeId = box.status !== 'signed' ? null
      : old && !signatureWasChanged ? old.signed_by_employee_id
        : box.name.trim().toLowerCase() === actor.name.trim().toLowerCase() ? actor.employeeId : null;
    const signedByName = box.status !== 'signed' ? ''
      : old && !signatureWasChanged ? old.signed_by_name || box.name : actor.name;
    const returnSignedByEmployeeId = !box.returnSignatureData ? null
      : old && !returnSignatureWasChanged ? old.return_signed_by_employee_id
        : box.name.trim().toLowerCase() === actor.name.trim().toLowerCase() ? actor.employeeId : null;
    const returnSignedByName = !box.returnSignatureData ? ''
      : old && !returnSignatureWasChanged ? old.return_signed_by_name || box.name : actor.name;
    await client.query(
      `INSERT INTO asset_agreement_signers (
        request_id, box_id, position, participant, label, role, signer_kind, signer_name,
        layout_position, page, x_percent, y_percent, signature_data, signature_status,
        signed_by_employee_id, signed_by_name, signed_at, return_signature_data,
        return_signed_by_employee_id, return_signed_by_name, return_signed_at
       ) VALUES ($1,$2,$3,$4::asset_agreement_participant,$5,$6,$7::asset_signer_kind,$8,$9,$10,$11,$12,$13,$14::asset_signature_status,$15,$16,$17,$18,$19,$20,$21)`,
      [result.rows[0].request_id, box.id, position, agreementParticipant(box), box.label, box.role,
        box.signer ?? (agreementParticipant(box) === 'employee' ? 'employee' : agreementParticipant(box) === 'handover' ? 'other' : 'admin'),
        box.name, box.position, box.page ?? null, box.x ?? null, box.y ?? null, box.signatureData ?? null,
        box.status, signedByEmployeeId, signedByName, box.signedAt ? asDate(box.signedAt) : null,
        box.returnSignatureData ?? null, returnSignedByEmployeeId, returnSignedByName,
        box.returnSignedAt ? asDate(box.returnSignedAt) : null],
    );
  }
}

async function event(client: PoolClient, requestId: string, actor: Actor, eventType: string, from: string | null, to: string | null, details: Record<string, unknown> = {}): Promise<void> {
  await client.query(
    `INSERT INTO asset_request_events (request_id, actor_employee_id, event_type, from_status, to_status, details)
     VALUES ($1,$2,$3,$4::asset_request_status,$5::asset_request_status,$6::jsonb)`,
    [requestId, actor.employeeId, eventType, from, to, JSON.stringify(details)],
  );
}

function requireManager(actor: Actor): void {
  if (!actor.canManageRequests) throw new HttpError(403, 'ไม่มีสิทธิ์จัดการคำขอยืมทรัพย์สิน');
}

async function createOne(client: PoolClient, actor: Actor, input: Record<string, unknown>): Promise<string> {
  const id = requireString(input.id, 'รหัสคำขอ', 200);
  const employeeCode = requireString(input.employeeCode, 'รหัสผู้ยืม', 100);
  if (!actor.canManageRequests && employeeCode.toLowerCase() !== actor.employeeCode.toLowerCase()) throw new HttpError(403, 'สร้างคำขอแทนพนักงานคนอื่นไม่ได้');
  const employeeResult = await client.query<{ id: string; employee_code: string; name: string; department: string; position: string }>(
    `SELECT id, employee_code, name, department, position FROM employees WHERE lower(btrim(employee_code)) = lower(btrim($1)) AND active = true`, [employeeCode],
  );
  const borrower = employeeResult.rows[0];
  if (!borrower) throw new HttpError(400, 'ไม่พบข้อมูลผู้ยืมในฐานข้อมูล');
  const items = parseItems(input.items);
  const initialStatus = input.initialStatus === 'approved' && actor.canManageRequests ? 'approved' : 'pending';
  const formDate = date(input.formDate, 'วันที่ยื่นคำขอ');
  const fromDate = date(input.fromDate, 'วันที่เริ่มยืม');
  const toDate = optionalDate(input.toDate);
  if (toDate && toDate < fromDate) throw new HttpError(400, 'วันที่คืนต้องไม่ก่อนวันที่ยืม');
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO asset_requests (legacy_sheet_id, borrower_employee_id, borrower_employee_code, borrower_name,
      borrower_department, borrower_position, form_date, from_date, to_date, reason, remarks, status, status_label,
      approved_borrow_by_employee_id, approved_borrow_by_name, approved_borrow_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::asset_request_status,$13,$14,$15,$16)
     ON CONFLICT (legacy_sheet_id) DO NOTHING RETURNING id`,
    [id, borrower.id, borrower.employee_code, borrower.name, borrower.department, borrower.position, formDate, fromDate,
      toDate, text(input.reason), text(input.remarks), initialStatus, statusLabel[initialStatus],
      initialStatus === 'approved' ? actor.employeeId : null,
      initialStatus === 'approved' ? actor.name : '',
      initialStatus === 'approved' ? new Date() : null],
  );
  let requestId = inserted.rows[0]?.id;
  if (!requestId) {
    const existing = await client.query<{ id: string; borrower_employee_id: string }>(
      'SELECT id, borrower_employee_id FROM asset_requests WHERE legacy_sheet_id = $1', [id],
    );
    if (existing.rows[0]?.borrower_employee_id !== borrower.id) throw new HttpError(409, 'รหัสคำขอนี้ถูกใช้แล้ว');
    return existing.rows[0].id;
  }
  for (const [position, item] of items.entries()) {
    await client.query('INSERT INTO asset_request_items (request_id, position, name, quantity, note) VALUES ($1,$2,$3,$4,$5)',
      [requestId, position, item.name, item.quantity, item.note]);
  }
  await writeAttachments(client, requestId, { ...input, actorId: actor.employeeId });
  if (input.agreement) await writeAgreement(client, requestId, input.agreement, actor);
  await event(client, requestId, actor, 'created', null, initialStatus, { legacySheetId: id });
  return requestId;
}

async function handleAction(actor: Actor, body: Record<string, unknown>): Promise<unknown> {
  const action = requireString(body.action, 'คำสั่ง', 100);
  if (action === 'listAll' || action === 'listForEmployee' || action === 'listForParticipant') {
    const rows = await requestRows(actor, body);
    return inTransaction((client) => hydrateRequests(client, rows, actor));
  }
  if (action === 'createMany') {
    if (!Array.isArray(body.inputs) || body.inputs.length > 20) throw new HttpError(400, 'จำนวนคำขอไม่ถูกต้อง');
    const ids = await inTransaction(async (client) => {
      const result = [];
      for (const input of body.inputs as unknown[]) {
        if (!input || typeof input !== 'object') throw new HttpError(400, 'ข้อมูลคำขอไม่ถูกต้อง');
        result.push(await createOne(client, actor, input as Record<string, unknown>));
      }
      return result;
    });
    return ids;
  }

  const id = requireString(body.id, 'รหัสคำขอ', 200);
  if (action === 'transition') {
    const next = status(body.status);
    if (next === 'pending' || next === 'unknown') throw new HttpError(400, 'ไม่รองรับการเปลี่ยนสถานะนี้');
    return inTransaction(async (client) => {
      const row = await findRequest(client, id, true);
      const current = statusFromDb[row.status] ?? 'unknown';
      const allowed = canTransitionAssetStatus(current, next) &&
        (current === 'approved' ? row.borrower_employee_id === actor.employeeId : actor.canManageRequests);
      if (!allowed) throw new HttpError(403, 'ไม่สามารถเปลี่ยนสถานะรายการนี้ได้');
      const inspection = text(body.returnInspection).trim();
      if (next === 'returned' && !inspection) throw new HttpError(400, 'กรุณาระบุผลการตรวจสภาพก่อนยืนยันรับคืน');
      await client.query(
        `UPDATE asset_requests SET status=$2::asset_request_status, status_label=$3,
         approved_borrow_by_employee_id=CASE WHEN $2 IN ('approved','rejected') THEN $4 ELSE approved_borrow_by_employee_id END,
         approved_borrow_by_name=CASE WHEN $2 IN ('approved','rejected') THEN $5 ELSE approved_borrow_by_name END,
         approved_borrow_at=CASE WHEN $2='approved' THEN now() ELSE approved_borrow_at END,
         return_inspector_employee_id=CASE WHEN $2='returned' THEN $4 ELSE return_inspector_employee_id END,
         return_inspector_name=CASE WHEN $2='returned' THEN $5 ELSE return_inspector_name END,
         approved_return_by_employee_id=CASE WHEN $2='returned' THEN $4 ELSE approved_return_by_employee_id END,
         approved_return_by_name=CASE WHEN $2='returned' THEN $5 ELSE approved_return_by_name END,
         return_inspection=CASE WHEN $2='returned' THEN $6 ELSE return_inspection END,
         version=version+1, updated_at=now() WHERE id=$1`,
        [row.id, statusToDb[next], statusLabel[next], actor.employeeId, actor.name, inspection],
      );
      if (next === 'returned') await writeAttachments(client, row.id, { imageUrl: body.imageUrl, returnImage: true, actorId: actor.employeeId });
      await event(client, row.id, actor, 'status_changed', row.status, statusToDb[next], { inspection });
      return {};
    });
  }

  if (action === 'confirmReturn') {
    requireManager(actor);
    const agreement = validateAgreement(body.agreement);
    const inspection = requireString(body.returnInspection, 'ผลตรวจคืน', 5000);
    if (!inspection) throw new HttpError(400, 'กรุณาระบุผลการตรวจสภาพก่อนยืนยันรับคืน');
    return inTransaction(async (client) => {
      const row = await findRequest(client, id, true);
      if (row.status !== 'return_pending') throw new HttpError(409, 'คำขอต้องอยู่ในสถานะรอรับคืนก่อน');
      await writeAgreement(client, row.id, agreement, actor);
      await client.query(
        `UPDATE asset_requests SET status='returned', status_label=$2, return_inspector_employee_id=$3,
         return_inspector_name=$4, approved_return_by_employee_id=$3, approved_return_by_name=$5,
         return_inspection=$6, version=version+1, updated_at=now() WHERE id=$1`,
        [row.id, statusLabel.returned, actor.employeeId, actor.name, actor.name, inspection],
      );
      await writeAttachments(client, row.id, { imageUrl: body.imageUrl, returnImage: true, actorId: actor.employeeId });
      await event(client, row.id, actor, 'return_confirmed', row.status, 'returned', { inspection });
      return {};
    });
  }

  if (action === 'markSeen') {
    if (!Array.isArray(body.ids) || body.ids.length > 200) throw new HttpError(400, 'รายการที่อ่านไม่ถูกต้อง');
    return inTransaction(async (client) => {
      for (const rawId of body.ids as unknown[]) {
        const row = await findRequest(client, requireString(rawId, 'รหัสคำขอ', 200));
        if (!actor.canManageRequests) {
          const visible = await client.query(`SELECT r.borrower_employee_id=$2 OR EXISTS (
            SELECT 1 FROM asset_agreement_signers s WHERE s.request_id=r.id AND lower(btrim(s.signer_name))=lower(btrim($3))
          ) AS allowed FROM asset_requests r WHERE r.id=$1`, [row.id, actor.employeeId, actor.name]);
          if (!visible.rows[0]?.allowed) throw new HttpError(403, 'ไม่มีสิทธิ์เข้าถึงคำขอนี้');
        }
        await client.query(
          `INSERT INTO asset_request_reads (request_id, employee_id) VALUES ($1,$2)
           ON CONFLICT (request_id, employee_id) DO UPDATE SET seen_at=now()`, [row.id, actor.employeeId],
        );
      }
      return {};
    });
  }
  if (action === 'remove') {
    requireManager(actor);
    return inTransaction(async (client) => {
      const row = await findRequest(client, id, true);
      await client.query('UPDATE asset_requests SET deleted_at=now(), deleted_by_employee_id=$2, updated_at=now(), version=version+1 WHERE id=$1', [row.id, actor.employeeId]);
      await event(client, row.id, actor, 'deleted', row.status, row.status, {});
      return {};
    });
  }
  if (action === 'updateItems') {
    requireManager(actor);
    return inTransaction(async (client) => {
      const row = await findRequest(client, id, true);
      await writeItems(client, row.id, body.items);
      await client.query('UPDATE asset_requests SET version=version+1, updated_at=now() WHERE id=$1', [row.id]);
      await event(client, row.id, actor, 'items_updated', row.status, row.status, {});
      return {};
    });
  }
  if (action === 'updateDetails') {
    requireManager(actor);
    return inTransaction(async (client) => {
      const row = await findRequest(client, id, true);
      await writeItems(client, row.id, body.items);
      await writeAgreement(client, row.id, body.agreement, actor);
      await client.query('UPDATE asset_requests SET version=version+1, updated_at=now() WHERE id=$1', [row.id]);
      await event(client, row.id, actor, 'request_updated', row.status, row.status, {});
      return {};
    });
  }
  if (action === 'saveAgreement') {
    return inTransaction(async (client) => {
      const row = await findRequest(client, id, true);
      if (!actor.canManageRequests) await assertSignerOwnChange(client, row.id, actor, body.agreement);
      await writeAgreement(client, row.id, body.agreement, actor);
      await client.query('UPDATE asset_requests SET version=version+1, updated_at=now() WHERE id=$1', [row.id]);
      await event(client, row.id, actor, 'agreement_updated', row.status, row.status, {});
      return {};
    });
  }
  if (action === 'approveFormRequest') {
    requireManager(actor);
    const signatureData = requireString(body.signatureData, 'ลายเซ็น', 2_000_000);
    return inTransaction(async (client) => {
      const row = await findRequest(client, id, true);
      const loaded = await loadAgreement(client, row.id);
      if (row.status !== 'pending' || !loaded || loaded.title !== 'Asset Form' || loaded.status !== 'waitingAdmin') throw new HttpError(409, 'รายการนี้ไม่พร้อมให้ผู้อนุมัติลงชื่อ');
      const employeeSigner = loaded.signatureBoxes.find((box) => box.id === 'employee' && box.status === 'signed');
      const adminSigner = loaded.signatureBoxes.find((box) => box.id === 'admin');
      if (!employeeSigner || !adminSigner || adminSigner.status === 'signed') throw new HttpError(409, 'รายการนี้มีลายเซ็นไม่ครบหรือถูกอนุมัติแล้ว');
      const now = new Date().toISOString();
      const next = { ...loaded, status: 'completed', signatureBoxes: loaded.signatureBoxes.map((box) => box.id === 'admin' ? { ...box, name: actor.name, signatureData, signedAt: now, status: 'signed' } : box) };
      await writeAgreement(client, row.id, next, actor);
      await client.query(`UPDATE asset_requests SET status='approved', status_label=$2, approved_borrow_by_employee_id=$3,
        approved_borrow_by_name=$4, approved_borrow_at=now(), version=version+1, updated_at=now() WHERE id=$1`,
        [row.id, statusLabel.approved, actor.employeeId, actor.name]);
      await event(client, row.id, actor, 'form_approved', row.status, 'approved', {});
      return {};
    });
  }
  throw new HttpError(400, 'ไม่รองรับคำสั่งนี้');
}

async function loadAgreement(client: PoolClient, requestId: string): Promise<{ title: string; status: AgreementStatus; signatureBoxes: SignatureBox[]; [key: string]: unknown } | null> {
  const result = await client.query('SELECT * FROM asset_agreements WHERE request_id=$1', [requestId]);
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  const signers = await client.query('SELECT * FROM asset_agreement_signers WHERE request_id=$1 ORDER BY position', [requestId]);
  return {
    title: row.title,
    header: row.header_html,
    body: row.body_html,
    footer: row.footer_html,
    status: agreementStatusFromDb[row.status as string] ?? 'waitingHandover',
    createdBy: row.created_by_name,
    createdByCode: row.created_by_employee_code,
    returnCondition: row.return_condition,
    documentDate: row.document_date,
    updatedAt: row.updated_at,
    signatureBoxes: signers.rows.map((signer) => ({
      id: signer.box_id, label: signer.label, role: signer.role, name: signer.signer_name,
      signer: signer.signer_kind, position: signer.layout_position, page: signer.page ?? undefined,
      x: signer.x_percent === null ? undefined : Number(signer.x_percent),
      y: signer.y_percent === null ? undefined : Number(signer.y_percent),
      signatureData: signer.signature_data ?? undefined, returnSignatureData: signer.return_signature_data ?? undefined,
      returnSignedAt: toIso(signer.return_signed_at), status: signer.signature_status, signedAt: toIso(signer.signed_at),
    })),
  };
}

async function assertSignerOwnChange(client: PoolClient, requestId: string, actor: Actor, value: unknown): Promise<void> {
  const old = await loadAgreement(client, requestId);
  const next = validateAgreement(value);
  if (!old) throw new HttpError(403, 'ไม่มีสิทธิ์สร้างหรือแก้ไข Agreement');
  const allowedAgreementKeys = new Set(['status', 'signatureBoxes', 'updatedAt']);
  for (const key of Object.keys(next)) {
    if (!allowedAgreementKeys.has(key) && JSON.stringify(next[key]) !== JSON.stringify(old[key])) throw new HttpError(403, 'ไม่มีสิทธิ์แก้ไขเนื้อหา Agreement');
  }
  if (next.signatureBoxes.length !== old.signatureBoxes.length) throw new HttpError(403, 'ไม่มีสิทธิ์แก้ไขผู้ลงนาม');
  const changed: Array<{ before: SignatureBox; after: SignatureBox }> = [];
  let migrationCount = 0;
  for (let index = 0; index < next.signatureBoxes.length; index++) {
    const before = old.signatureBoxes[index];
    const after = next.signatureBoxes[index];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const sameExceptSignatureUrls = (['id', 'label', 'role', 'name', 'signer', 'position', 'page', 'x', 'y', 'status', 'signedAt', 'returnSignedAt'] as const)
      .every((key) => before[key] === after[key]);
    const migratedSignature = before.signatureData?.startsWith('data:image/') && after.signatureData?.startsWith('http');
    const migratedReturnSignature = before.returnSignatureData?.startsWith('data:image/') && after.returnSignatureData?.startsWith('http');
    const signatureSame = before.signatureData === after.signatureData || migratedSignature;
    const returnSignatureSame = before.returnSignatureData === after.returnSignatureData || migratedReturnSignature;
    if (sameExceptSignatureUrls && signatureSame && returnSignatureSame && (migratedSignature || migratedReturnSignature)) {
      migrationCount++;
      continue;
    }
    changed.push({ before, after });
  }
  if (changed.length === 0 && migrationCount > 0) return;
  if (!changed.length) throw new HttpError(403, 'ไม่พบการเปลี่ยนแปลงลายเซ็น');
  const request = await findRequest(client, requestId);
  const participant = agreementParticipant(changed[0].before);
  for (const { before, after } of changed) {
    if (agreementParticipant(before) !== participant) throw new HttpError(403, 'แก้ไขลายเซ็นได้เฉพาะช่องของผู้ลงนามคนเดียวกัน');
    const isReturnSignature = before.status === after.status && before.signatureData === after.signatureData && before.signedAt === after.signedAt && before.returnSignatureData !== after.returnSignatureData;
    const isNewSignature = before.status !== 'signed' && after.status === 'signed' && Boolean(after.signatureData) && before.returnSignatureData === after.returnSignatureData && before.returnSignedAt === after.returnSignedAt;
    const allowedKeys = isReturnSignature ? new Set(['returnSignatureData', 'returnSignedAt'])
      : isNewSignature ? new Set(['status', 'signedAt', 'signatureData', 'name']) : new Set<string>();
    if (!allowedKeys.size) throw new HttpError(403, 'ลายเซ็นไม่อยู่ในสถานะที่ลงได้');
    for (const key of Object.keys(before) as Array<keyof SignatureBox>) {
      if (!allowedKeys.has(key) && before[key] !== after[key]) throw new HttpError(403, 'ไม่มีสิทธิ์แก้ไขรูปแบบช่องลายเซ็น');
    }
    if (participant === 'employee' && (request.borrower_employee_id !== actor.employeeId || (before.name && before.name.toLowerCase() !== actor.name.toLowerCase()))) {
      throw new HttpError(403, 'ลายเซ็นนี้เป็นของผู้ยืมเท่านั้น');
    }
    if (participant === 'handover' && !actor.canManageRequests) throw new HttpError(403, 'ต้องเป็นผู้จัดการคำขอจึงจะลงชื่อส่งมอบได้');
    if (participant === 'admin' && !actor.canManageRequests) throw new HttpError(403, 'ต้องเป็นผู้จัดการคำขอจึงจะลงชื่อได้');
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  await apiHandler(request, response, handleAction);
}
