import { env } from '@/config/env';
import { DataContractError } from '@/shared/lib/errors';
import type { Auth } from 'firebase/auth';
import {
  assetAgreementSchema,
  assetRequestSchema,
  type AssetAgreement,
  type AssetAgreementParticipant,
  type AssetCreateInput,
  type AssetRequest,
  type AssetTransition,
} from '../domain/asset';
import type { AssetRepository } from '../application/ports';

const errorSchema = (value: unknown): string | null =>
  value && typeof value === 'object' && 'message' in value && typeof value.message === 'string' ? value.message : null;

function parseRequest(value: unknown): AssetRequest {
  if (!value || typeof value !== 'object') throw new DataContractError('รูปแบบคำขอทรัพย์สินจาก API ไม่ถูกต้อง');
  const row = value as Record<string, unknown>;
  const agreement = row.agreement && typeof row.agreement === 'object' ? row.agreement as Record<string, unknown> : null;
  const parsed = assetRequestSchema.safeParse({
    ...row,
    formDate: new Date(String(row.formDate)),
    fromDate: new Date(String(row.fromDate)),
    toDate: row.toDate ? new Date(String(row.toDate)) : null,
    approvedBorrowDate: row.approvedBorrowDate ? new Date(String(row.approvedBorrowDate)) : null,
    agreement: agreement ? assetAgreementSchema.parse({
      ...agreement,
      documentDate: new Date(String(agreement.documentDate)),
      updatedAt: agreement.updatedAt ? new Date(String(agreement.updatedAt)) : null,
      signatureBoxes: Array.isArray(agreement.signatureBoxes) ? agreement.signatureBoxes.map((raw) => {
        if (!raw || typeof raw !== 'object') return raw;
        const box = raw as Record<string, unknown>;
        return {
          ...box,
          signedAt: box.signedAt === null ? null : box.signedAt ? String(box.signedAt) : null,
          returnSignedAt: box.returnSignedAt === null ? null : box.returnSignedAt ? String(box.returnSignedAt) : null,
        };
      }) : [],
    }) : null,
  });
  if (!parsed.success) throw new DataContractError('ข้อมูลคำขอทรัพย์สินจาก API ไม่ตรงกับรูปแบบที่ระบบรองรับ');
  return parsed.data;
}

export class PostgresAssetRepository implements AssetRepository {
  constructor(private readonly auth: Auth | null, private readonly fetcher: typeof fetch = globalThis.fetch) {}

  async listAll(): Promise<AssetRequest[]> {
    return this.requests(await this.request({ action: 'listAll' }));
  }

  async listForEmployee(employeeCode: string): Promise<AssetRequest[]> {
    return this.requests(await this.request({ action: 'listForEmployee', employeeCode }));
  }

  async listForAgreementParticipant(participant: AssetAgreementParticipant, employeeCode: string, employeeName: string): Promise<AssetRequest[]> {
    return this.requests(await this.request({ action: 'listForParticipant', participant, employeeCode, employeeName }));
  }

  async create(input: AssetCreateInput): Promise<AssetRequest> {
    const [created] = await this.createMany([input]);
    if (!created) throw new DataContractError('ไม่พบคำขอที่เพิ่งสร้าง');
    return created;
  }

  async createMany(inputs: readonly AssetCreateInput[]): Promise<AssetRequest[]> {
    if (!inputs.length) return [];
    const ids = await this.request({ action: 'createMany', inputs });
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) throw new DataContractError('รูปแบบผลลัพธ์การสร้างคำขอไม่ถูกต้อง');
    const visible = await this.listAll();
    const byId = new Map(visible.map((item) => [item.id, item]));
    return ids.map((id) => {
      const item = byId.get(id);
      if (!item) throw new DataContractError(`ไม่พบคำขอที่เพิ่งสร้าง: ${id}`);
      return item;
    });
  }

  async transition(input: AssetTransition): Promise<void> {
    await this.request({ action: 'transition', ...input });
  }

  async markSeen(ids: readonly string[]): Promise<void> {
    for (let index = 0; index < ids.length; index += 200) {
      await this.request({ action: 'markSeen', ids: ids.slice(index, index + 200) });
    }
  }

  async remove(id: string): Promise<void> {
    await this.request({ action: 'remove', id });
  }

  async updateItems(id: string, items: string): Promise<void> {
    await this.request({ action: 'updateItems', id, items });
  }

  async updateDetails(id: string, items: string, agreement: AssetAgreement): Promise<void> {
    await this.request({ action: 'updateDetails', id, items, agreement });
  }

  async confirmReturn(input: {
    id: string; agreement: AssetAgreement; returnInspector: string; approvedReturnBy: string; imageUrl: string; returnInspection: string;
  }): Promise<void> {
    await this.request({ action: 'confirmReturn', ...input });
  }

  async saveAgreement(id: string, agreement: AssetAgreement): Promise<void> {
    await this.request({ action: 'saveAgreement', id, agreement });
  }

  async approveFormRequest(id: string, actorName: string, signatureData: string): Promise<void> {
    await this.request({ action: 'approveFormRequest', id, actorName, signatureData });
  }

  private requests(value: unknown): AssetRequest[] {
    if (!Array.isArray(value)) throw new DataContractError('รูปแบบรายการคำขอจาก API ไม่ถูกต้อง');
    return value.map(parseRequest);
  }

  private async request(body: Record<string, unknown>): Promise<unknown> {
    const user = this.auth?.currentUser;
    if (!user) throw new DataContractError('กรุณาลงชื่อเข้าใช้ก่อนเรียกข้อมูลยืมคืนทรัพย์สิน');
    const token = await user.getIdToken();
    const response = await this.fetcher(`${env.apiBaseUrl}/api/assets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new DataContractError(errorSchema(payload) ?? 'บันทึกข้อมูลยืมคืนทรัพย์สินไม่สำเร็จ');
    return payload;
  }
}
