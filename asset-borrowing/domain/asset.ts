import { z } from 'zod';

export const assetStatusSchema = z.enum(['pending', 'approved', 'rejected', 'returnPending', 'returned', 'unknown']);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const assetSignaturePositionSchema = z.enum(['bottom-left', 'bottom-right', 'lower-left', 'lower-right']);
export type AssetSignaturePosition = z.infer<typeof assetSignaturePositionSchema>;

export const assetSignatureStatusSchema = z.enum(['pending', 'signed', 'locked']);
export type AssetSignatureStatus = z.infer<typeof assetSignatureStatusSchema>;

export const assetSignatureSignerSchema = z.enum(['employee', 'admin', 'other']);
export type AssetSignatureSigner = z.infer<typeof assetSignatureSignerSchema>;

export const assetAgreementStatusSchema = z.enum(['waitingHandover', 'waitingEmployee', 'waitingAdmin', 'completed']);
export type AssetAgreementStatus = z.infer<typeof assetAgreementStatusSchema>;

export const assetAgreementTypeSchema = z.enum(['borrow', 'assetForm']);
export type AssetAgreementType = z.infer<typeof assetAgreementTypeSchema>;

export const assetAgreementParticipantSchema = z.enum(['employee', 'handover', 'admin']);
export type AssetAgreementParticipant = z.infer<typeof assetAgreementParticipantSchema>;

export const assetReturnConditionSchema = z.enum(['original', 'damaged', 'lost']);
export type AssetReturnCondition = z.infer<typeof assetReturnConditionSchema>;

export const assetSignatureBoxSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  role: z.string().trim().min(1),
  name: z.string().trim(),
  signer: assetSignatureSignerSchema.optional(),
  position: assetSignaturePositionSchema,
  page: z.union([z.literal(2), z.literal(3)]).optional(),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
  signatureData: z.string().trim().optional(),
  returnSignatureData: z.string().trim().optional(),
  returnSignedAt: z.string().trim().nullable().optional(),
  status: assetSignatureStatusSchema,
  signedAt: z.string().trim().nullable(),
});
export type AssetSignatureBox = z.infer<typeof assetSignatureBoxSchema>;

export const assetAgreementSchema = z.object({
  templateId: z.string().uuid().nullable().default(null),
  type: assetAgreementTypeSchema.default('borrow'),
  title: z.string().trim().min(1),
  header: z.string().trim(),
  body: z.string().trim().min(1),
  footer: z.string().trim(),
  signatureBoxes: z.array(assetSignatureBoxSchema),
  status: assetAgreementStatusSchema,
  createdBy: z.string().trim(),
  createdByCode: z.string().trim(),
  returnCondition: assetReturnConditionSchema.nullable().optional(),
  documentDate: z.date(),
  updatedAt: z.date().nullable(),
});
export type AssetAgreement = z.infer<typeof assetAgreementSchema>;

export function isAssetFormOnly(agreement: AssetAgreement | null | undefined): boolean {
  return agreement?.type === 'assetForm' || agreement?.title === 'Asset Form';
}

export const assetItemSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  note: z.string().trim(),
});
export type AssetItem = z.infer<typeof assetItemSchema>;

export function parseAssetItems(value: string): AssetItem[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error('กรุณาระบุรายการทรัพย์สิน');
  if (lines.length > 10) throw new Error('รายการทรัพย์สินมีได้ไม่เกิน 10 รายการ');
  return lines.map((line) => {
    const [name, quantityText, note = ''] = line.split('|').map((part) => part.trim());
    const quantity = quantityText ? Number(quantityText) : 1;
    const result = assetItemSchema.safeParse({ name, quantity, note });
    if (!result.success) throw new Error(`รายการทรัพย์สินไม่ถูกต้อง: ${name || 'ไม่ระบุชื่อ'}`);
    return result.data;
  });
}

export function serializeAssetItems(items: readonly AssetItem[]): string {
  if (items.length === 0 || items.length > 10) throw new Error('รายการทรัพย์สินต้องมี 1–10 รายการ');
  return items
    .map((item) => assetItemSchema.parse(item))
    .map((item) => `${item.name}|${item.quantity}|${item.note}`)
    .join('\n');
}

export function canTransitionAssetStatus(current: AssetStatus, next: Exclude<AssetStatus, 'unknown'>): boolean {
  if (current === 'pending') return next === 'approved' || next === 'rejected';
  if (current === 'approved') return next === 'returnPending';
  if (current === 'returnPending') return next === 'returned';
  return false;
}

export function canSignAgreementAsEmployee(
  actorIsAdmin: boolean,
  actorEmployeeCode: string,
  borrowerEmployeeCode: string,
): boolean {
  if (!actorIsAdmin) return true;
  return actorEmployeeCode.trim().toLowerCase() === borrowerEmployeeCode.trim().toLowerCase();
}

export function canEditAgreement(
  actorIsAdmin: boolean,
  managementMode: boolean,
  agreementStatus: AssetAgreementStatus,
  hasSignedSignature = false,
): boolean {
  return (
    actorIsAdmin &&
    managementMode &&
    (agreementStatus === 'waitingHandover' || (agreementStatus === 'waitingEmployee' && !hasSignedSignature))
  );
}

export function agreementParticipantForSignatureBox(
  box: Pick<AssetSignatureBox, 'id' | 'signer'>,
): AssetAgreementParticipant {
  if (box.id === 'employee' || box.id.startsWith('employee-')) return 'employee';
  if (box.id === 'handover' || box.id.startsWith('handover-')) return 'handover';
  if (box.id === 'admin' || box.id.startsWith('admin-')) return 'admin';
  if (box.signer === 'employee') return 'employee';
  return box.signer === 'other' ? 'handover' : 'admin';
}

export function nextAgreementStatus(signatureBoxes: readonly AssetSignatureBox[]): AssetAgreementStatus {
  const pending = (participant: AssetAgreementParticipant) =>
    signatureBoxes.some((box) => agreementParticipantForSignatureBox(box) === participant && box.status !== 'signed');
  if (pending('handover')) return 'waitingHandover';
  if (pending('employee')) return 'waitingEmployee';
  if (pending('admin')) return 'waitingAdmin';
  return 'completed';
}

export function canExportAgreementDocument(signatureBoxes: readonly AssetSignatureBox[]): boolean {
  return signatureBoxes.some(
    (box) => agreementParticipantForSignatureBox(box) === 'employee' && box.status === 'signed',
  );
}

export const assetAgreementFilterSchema = z.enum([
  'all',
  'waitingHandover',
  'waitingEmployee',
  'waitingAdmin',
  'returnPending',
]);
export type AssetAgreementFilter = z.infer<typeof assetAgreementFilterSchema>;

export function matchesAssetAgreementFilter(entry: AssetRequest, filter: AssetAgreementFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'returnPending') return entry.status === 'returnPending' || (entry.agreement?.status === 'completed' && entry.status !== 'returned');
  if (filter === 'waitingAdmin' && !entry.agreement) return entry.status === 'pending' && Boolean(entry.borrowerSignatureData);
  return entry.agreement?.status === filter;
}

export const assetRequestSchema = z.object({
  id: z.string().trim().min(1),
  agreementId: z.string().uuid().nullable().default(null),
  formDate: z.date(),
  employeeName: z.string().trim().min(1),
  department: z.string().trim(),
  position: z.string().trim(),
  employeeCode: z.string().trim().min(1),
  reason: z.string().trim(),
  fromDate: z.date(),
  toDate: z.date().nullable(),
  items: z.string().trim().min(1),
  remarks: z.string().trim(),
  status: assetStatusSchema,
  statusLabel: z.string().trim().min(1),
  approvedBorrowBy: z.string().trim(),
  borrowerSignatureData: z.string().trim().default(''),
  approvedBorrowSignatureData: z.string().trim().default(''),
  returnInspector: z.string().trim(),
  approvedReturnBy: z.string().trim(),
  imageUrl: z.string().trim(),
  seen: z.boolean(),
  additionalImages: z.array(z.string()),
  approvedBorrowDate: z.date().nullable(),
  agreement: assetAgreementSchema.nullable(),
});
export type AssetRequest = z.infer<typeof assetRequestSchema>;

export const assetCreateInputSchema = z.object({
  id: z.string().trim().min(1),
  formDate: z.date(),
  employeeName: z.string().trim().min(1),
  department: z.string().trim(),
  position: z.string().trim(),
  employeeCode: z.string().trim().min(1),
  reason: z.string().trim(),
  fromDate: z.date(),
  toDate: z.date().nullable(),
  items: z.string().trim().min(1),
  remarks: z.string().trim(),
  imageUrl: z.string().trim(),
  additionalImages: z.array(z.string()),
  agreement: assetAgreementSchema.nullable().optional(),
  borrowerSignatureData: z.string().trim().default(''),
  initialStatus: z.enum(['pending', 'approved']).optional(),
  initialApprovedBy: z.string().trim().optional(),
});
export type AssetCreateInput = z.infer<typeof assetCreateInputSchema>;

export const assetTransitionSchema = z.object({
  id: z.string().min(1),
  status: assetStatusSchema.exclude(['unknown']),
  actorName: z.string().trim().min(1),
  returnInspector: z.string().trim(),
  approvedReturnBy: z.string().trim(),
  imageUrl: z.string().trim(),
  approvedBorrowDate: z.date().nullable(),
  returnInspection: z.string().trim().optional(),
});
export type AssetTransition = z.infer<typeof assetTransitionSchema>;
