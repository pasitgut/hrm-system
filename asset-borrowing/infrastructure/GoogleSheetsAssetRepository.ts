import { DataContractError } from '@/shared/lib/errors';
import type { SheetValuesReader, SheetValuesWriter } from '@/shared/infrastructure/GoogleSheetsClient';
import {
  canTransitionAssetStatus,
  agreementParticipantForSignatureBox,
  assetAgreementSchema,
  assetCreateInputSchema,
  assetTransitionSchema,
  parseAssetItems,
  isAssetFormOnly,
  type AssetCreateInput,
  type AssetAgreement,
  type AssetAgreementParticipant,
  type AssetRequest,
  type AssetTransition,
} from '../domain/asset';
import type { AssetRepository } from '../application/ports';
import {
  assetCreateRow,
  assetRequestIdFromRow,
  formatAssetSheetDateTime,
  isAssetPlaceholderRow,
  mapAssetRow,
} from './assetMapper';

const SHEET_NAME = 'ข้อมูลการยืมทรัพย์สิน';
const DATA_RANGE = `${SHEET_NAME}!A2:X`;
const DATA_START_ROW = 2;
const statusToSheet: Record<Exclude<AssetTransition['status'], 'unknown'>, string> = {
  pending: 'รอ',
  approved: 'อนุมัติ',
  rejected: 'ไม่อนุมัติ',
  returnPending: 'รอรับคืน',
  returned: 'คืนแล้ว',
};

export class GoogleSheetsAssetRepository implements AssetRepository {
  constructor(private readonly store: SheetValuesReader & SheetValuesWriter) {}
  async listAll(): Promise<AssetRequest[]> {
    return (await this.store.getValues(DATA_RANGE))
      .filter((row) => String(row[0] ?? '').trim())
      .filter((row) => !isAssetPlaceholderRow(row))
      .map(mapAssetRow);
  }
  async listForEmployee(employeeCode: string): Promise<AssetRequest[]> {
    const target = employeeCode.trim().toLowerCase();
    return (await this.listAll()).filter((entry) => entry.employeeCode.toLowerCase() === target);
  }
  async listForAgreementParticipant(
    participant: AssetAgreementParticipant,
    employeeCode: string,
    employeeName: string,
  ): Promise<AssetRequest[]> {
    const normalizedCode = employeeCode.trim().toLowerCase();
    const normalizedName = employeeName.trim().toLowerCase();
    return (await this.listAll()).filter((entry) => {
      if (participant === 'employee') return entry.employeeCode.trim().toLowerCase() === normalizedCode;
      if (!entry.agreement) return false;
      return entry.agreement.signatureBoxes.some(
        (box) =>
          agreementParticipantForSignatureBox(box) === participant && box.name.trim().toLowerCase() === normalizedName,
      );
    });
  }
  async create(input: AssetCreateInput): Promise<AssetRequest> {
    const valid = assetCreateInputSchema.parse(input);
    parseAssetItems(valid.items);
    const row = assetCreateRow(valid);
    // Use the stable row key as the append table. If the sheet contains legacy
    // or stray values in later columns, Google Sheets must still append from A.
    await this.store.appendValues(`${SHEET_NAME}!A:A`, [row]);
    return mapAssetRow(row);
  }
  async transition(input: AssetTransition): Promise<void> {
    const valid = assetTransitionSchema.parse(input);
    const target = await this.resolveUniqueRow(valid.id);
    if (!canTransitionAssetStatus(target.request.status, valid.status)) {
      throw new DataContractError('ไม่สามารถเปลี่ยนสถานะ AssetRequest จากสถานะปัจจุบันได้');
    }
    await this.assertUnchanged(target);
    const rowNumber = target.rowNumber;
    const values = target.row.slice(10, 18);
    values[0] = statusToSheet[valid.status];
    if (valid.status === 'approved' || valid.status === 'rejected') {
      values[1] = valid.actorName;
      if (valid.approvedBorrowDate) values[7] = formatAssetSheetDateTime(valid.approvedBorrowDate);
    }
    if (valid.status === 'returned') {
      if (!valid.returnInspection?.trim()) {
        throw new DataContractError('กรุณาระบุผลการตรวจสภาพก่อนยืนยันรับคืน');
      }
      values[2] = valid.returnInspector;
      values[3] = valid.approvedReturnBy || valid.actorName;
      if (valid.imageUrl) values[4] = valid.imageUrl;
    }
    if (valid.status === 'returned' && valid.returnInspection) {
      const returnValues = [valid.returnInspection, ...values];
      await this.store.updateValues(`${SHEET_NAME}!J${rowNumber}:R${rowNumber}`, [returnValues]);
    } else {
      await this.store.updateValues(`${SHEET_NAME}!K${rowNumber}:R${rowNumber}`, [values]);
    }
  }
  async markSeen(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      const target = await this.resolveUniqueRow(id);
      await this.assertUnchanged(target);
      await this.store.updateValues(`${SHEET_NAME}!P${target.rowNumber}`, [['seen']]);
    }
  }
  async remove(id: string): Promise<void> {
    const target = await this.resolveUniqueRow(id);
    await this.assertUnchanged(target);
    await this.store.clearValues(`${SHEET_NAME}!A${target.rowNumber}:X${target.rowNumber}`);
  }
  async updateItems(id: string, items: string): Promise<void> {
    const validItems = items.trim();
    parseAssetItems(validItems);
    const target = await this.resolveUniqueRow(id);
    await this.assertUnchanged(target);
    await this.store.updateValues(`${SHEET_NAME}!I${target.rowNumber}`, [[validItems]]);
  }
  async saveAgreement(id: string, agreement: AssetAgreement): Promise<void> {
    const valid = assetAgreementSchema.parse(agreement);
    const target = await this.resolveUniqueRow(id);
    await this.assertUnchanged(target);
    await this.store.updateValues(`${SHEET_NAME}!S${target.rowNumber}:W${target.rowNumber}`, [
      [
        valid.title,
        valid.body,
        JSON.stringify({
          signatureBoxes: valid.signatureBoxes,
          header: valid.header,
          footer: valid.footer,
          status: valid.status,
          createdBy: valid.createdBy,
          createdByCode: valid.createdByCode,
          returnCondition: valid.returnCondition ?? null,
        }),
        formatAssetSheetDateTime(valid.documentDate),
        formatAssetSheetDateTime(new Date()),
      ],
    ]);
  }
  async approveFormRequest(id: string, actorName: string, signatureData: string): Promise<void> {
    const target = await this.resolveUniqueRow(id);
    const agreement = target.request.agreement;
    if (
      target.request.status !== 'pending' ||
      !isAssetFormOnly(agreement) ||
      agreement?.status !== 'waitingAdmin' ||
      !agreement.signatureBoxes.find((box) => box.id === 'employee' && box.status === 'signed')
    ) {
      throw new DataContractError('รายการนี้ไม่พร้อมให้ผู้อนุมัติลงชื่อ');
    }
    const approver = agreement.signatureBoxes.find((box) => box.id === 'admin');
    if (!approver || approver.status === 'signed') {
      throw new DataContractError('รายการนี้มีลายเซ็นผู้อนุมัติแล้ว');
    }
    await this.assertUnchanged(target);
    const approvedAt = new Date();
    const signedAgreement = {
      ...agreement,
      status: 'completed' as const,
      signatureBoxes: agreement.signatureBoxes.map((box) =>
        box.id === 'admin'
          ? {
              ...box,
              name: actorName.trim(),
              signatureData,
              signedAt: approvedAt.toISOString(),
              status: 'signed' as const,
            }
          : box,
      ),
    };
    const values = target.row.slice(10, 23);
    while (values.length < 13) values.push('');
    values[0] = 'อนุมัติ';
    values[1] = actorName.trim();
    values[7] = formatAssetSheetDateTime(approvedAt);
    values[10] = JSON.stringify({
      signatureBoxes: signedAgreement.signatureBoxes,
      header: signedAgreement.header,
      footer: signedAgreement.footer,
      status: signedAgreement.status,
      createdBy: signedAgreement.createdBy,
      createdByCode: signedAgreement.createdByCode,
      returnCondition: signedAgreement.returnCondition ?? null,
    });
    values[12] = formatAssetSheetDateTime(approvedAt);
    await this.store.updateValues(`${SHEET_NAME}!K${target.rowNumber}:W${target.rowNumber}`, [values]);
  }
  private async resolveUniqueRow(id: string): Promise<{ rowNumber: number; request: AssetRequest; row: unknown[] }> {
    const rows = await this.store.getValues(DATA_RANGE);
    const matches = rows
      .map((row, index) => ({ row, rowNumber: DATA_START_ROW + index }))
      .filter(({ row }) => String(row[0] ?? '').trim())
      .filter(({ row }) => assetRequestIdFromRow(row) === id);
    if (matches.length !== 1)
      throw new DataContractError(
        matches.length === 0
          ? 'ไม่พบ AssetRequest ที่ต้องการแก้ไข'
          : 'พบ AssetRequest ซ้ำหลายรายการ จึงหยุดการแก้ไขเพื่อป้องกันข้อมูลผิดแถว',
      );
    return { rowNumber: matches[0].rowNumber, request: mapAssetRow(matches[0].row), row: matches[0].row };
  }

  private async assertUnchanged(target: { rowNumber: number; row: unknown[] }): Promise<void> {
    const rows = await this.store.getValues(DATA_RANGE);
    const current = rows[target.rowNumber - DATA_START_ROW];
    if (!current || JSON.stringify(current) !== JSON.stringify(target.row)) {
      throw new DataContractError('AssetRequest เปลี่ยนแปลงระหว่างทำรายการ กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง');
    }
  }
}
