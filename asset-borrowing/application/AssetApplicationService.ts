import {
  assetAgreementSchema,
  assetCreateInputSchema,
  assetTransitionSchema,
  agreementParticipantForSignatureBox,
  canTransitionAssetStatus,
  canSignAgreementAsEmployee,
  nextAgreementStatus,
  parseAssetItems,
  serializeAssetItems,
  type AssetAgreement,
  type AssetItem,
  type AssetCreateInput,
  type AssetRequest,
  type AssetTransition,
} from '../domain/asset';
import {
  createDefaultBorrowAgreement,
  type AssetFormAgreementTemplate,
  type BorrowAgreementTemplate,
} from './agreementFactory';
import { AssetApplicationError } from './AssetApplicationError';
import type { AssetRepository } from './ports';

export type AssetBorrowRequestSubmission = {
  borrowers: readonly Pick<AssetRequest, 'employeeName' | 'employeeCode' | 'department' | 'position'>[];
  requestedBy: { name: string; employeeCode: string };
  fromDate: Date;
  toDate: Date | null;
  items: readonly AssetItem[];
  reason: string;
  remarks: string;
  imageUrl: string;
  additionalImages: readonly string[];
} & (
  | { flow: 'admin-managed'; agreementTemplate?: BorrowAgreementTemplate | null }
  | { flow: 'self-service'; borrowerSignature: string }
);

export type AssetAgreementTemplates = {
  borrow: BorrowAgreementTemplate;
  assetForm: AssetFormAgreementTemplate;
};

/** Use cases for the borrowing lifecycle. UI components deal with input and display; this layer coordinates domain rules and persistence ports. */
export class AssetApplicationService {
  constructor(
    private readonly repository: AssetRepository,
    _agreementTemplates?: AssetAgreementTemplates,
  ) {}

  async submitBorrowRequests(input: AssetBorrowRequestSubmission): Promise<AssetRequest[]> {
    if (input.borrowers.length === 0) throw new AssetApplicationError('กรุณาเลือกพนักงานอย่างน้อย 1 คน');
    if (!input.requestedBy.name.trim() || !input.requestedBy.employeeCode.trim()) {
      throw new AssetApplicationError('ไม่พบข้อมูลผู้ส่งคำขอ');
    }
    if (input.toDate && input.toDate < input.fromDate) {
      throw new AssetApplicationError('วันที่คืนต้องไม่ก่อนวันที่ยืม');
    }

    const items = serializeAssetItems(input.items);
    if (input.flow === 'self-service') {
      if (input.borrowers.length !== 1 || input.borrowers[0]?.employeeCode.trim().toLowerCase() !== input.requestedBy.employeeCode.trim().toLowerCase()) {
        throw new AssetApplicationError('พนักงานส่งคำขอได้เฉพาะทรัพย์สินของตนเอง');
      }
      if (!input.borrowerSignature.trim()) throw new AssetApplicationError('กรุณาลงลายเซ็นผู้ยืม');
    }

    const formDate = new Date();
    const requests = input.borrowers.map((borrower): AssetCreateInput => {
      const common = {
        id: globalThis.crypto?.randomUUID?.() ?? `AS-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        formDate,
        employeeName: borrower.employeeName,
        department: borrower.department,
        position: borrower.position,
        employeeCode: borrower.employeeCode,
        reason: input.reason,
        fromDate: input.fromDate,
        toDate: input.toDate,
        items,
        remarks: input.remarks,
        imageUrl: input.imageUrl,
        additionalImages: input.additionalImages.map((url) => url.trim()).filter(Boolean),
        borrowerSignatureData: '',
      };

      if (input.flow === 'admin-managed') {
        return {
          ...common,
          agreement: input.agreementTemplate
            ? createDefaultBorrowAgreement(borrower, input.agreementTemplate, input.requestedBy.name, input.requestedBy.employeeCode)
            : null,
          initialStatus: 'approved',
          initialApprovedBy: input.requestedBy.name,
        };
      }
      return {
        ...common,
        agreement: null,
        borrowerSignatureData: input.borrowerSignature,
      };
    });

    return this.createRequests(requests);
  }

  async createRequests(inputs: readonly AssetCreateInput[]): Promise<AssetRequest[]> {
    const valid = inputs.map((input) => assetCreateInputSchema.parse(input));
    for (const input of valid) parseAssetItems(input.items);
    return this.repository.createMany(valid);
  }

  async changeStatus(current: AssetRequest, input: AssetTransition): Promise<void> {
    const valid = assetTransitionSchema.parse(input);
    if (!canTransitionAssetStatus(current.status, valid.status)) {
      throw new AssetApplicationError('ไม่สามารถเปลี่ยนสถานะคำขอจากสถานะปัจจุบันได้');
    }
    await this.repository.transition(valid);
  }

  async updateRequestDetails(id: string, items: string, agreement: AssetAgreement): Promise<void> {
    parseAssetItems(items);
    const validAgreement = assetAgreementSchema.parse(agreement);
    await this.repository.updateDetails(id, items, validAgreement);
  }

  async confirmReturn(input: {
    entry: AssetRequest;
    agreement: AssetAgreement;
    returnInspector: string;
    approvedReturnBy: string;
    imageUrl: string;
    returnInspection: string;
  }): Promise<void> {
    if (input.entry.status !== 'returnPending') throw new AssetApplicationError('คำขอต้องอยู่ในสถานะรอรับคืนก่อน');
    if (!input.returnInspection.trim()) throw new AssetApplicationError('กรุณาระบุผลการตรวจสภาพก่อนยืนยันรับคืน');
    await this.repository.confirmReturn({
      id: input.entry.id,
      agreement: assetAgreementSchema.parse(input.agreement),
      returnInspector: input.returnInspector,
      approvedReturnBy: input.approvedReturnBy,
      imageUrl: input.imageUrl,
      returnInspection: input.returnInspection,
    });
  }

  saveAgreement(id: string, agreement: AssetAgreement): Promise<void> {
    return this.repository.saveAgreement(id, assetAgreementSchema.parse(agreement));
  }

  async signAgreement(input: {
    entry: AssetRequest;
    agreement: AssetAgreement;
    signer: 'employee' | 'handover' | 'admin';
    signatureData: string;
    actorName: string;
    actorEmployeeCode: string;
    actorIsAdmin: boolean;
    actorCanManageRequests: boolean;
    storeSignature: (data: string) => Promise<string>;
  }): Promise<AssetAgreement> {
    if (input.signer === 'employee') {
      const ownsEntry = input.actorEmployeeCode.trim().toLowerCase() === input.entry.employeeCode.trim().toLowerCase();
      if (!ownsEntry || !canSignAgreementAsEmployee(input.actorIsAdmin, input.actorEmployeeCode, input.entry.employeeCode)) {
        throw new AssetApplicationError('ผู้ยืมสามารถลงชื่อได้เฉพาะ Agreement ของตัวเอง');
      }
    }
    if (input.signer !== 'employee' && !input.actorCanManageRequests) {
      throw new AssetApplicationError('เฉพาะ Admin หรือหัวหน้างานเท่านั้นที่สามารถเซ็นแทนได้');
    }
    const expectedStatus = input.signer === 'handover' ? 'waitingHandover'
      : input.signer === 'employee' ? 'waitingEmployee' : 'waitingAdmin';
    if (input.agreement.status !== expectedStatus) throw new AssetApplicationError('Agreement ยังไม่อยู่ในขั้นตอนรอลงชื่อของผู้ใช้นี้');
    const matchingBoxes = input.agreement.signatureBoxes.filter((box) =>
      ['employee', 'handover', 'admin'].some((id) => box.id === id || box.id.startsWith(`${id}-`)) &&
      agreementParticipantForSignatureBox(box) === input.signer && box.status !== 'signed',
    );
    if (!matchingBoxes.length) throw new AssetApplicationError('ไม่พบช่องลายเซ็นที่รอผู้ใช้นี้');
    const signedAt = new Date().toISOString();
    const storedSignature = await input.storeSignature(input.signatureData);
    const boxes = await Promise.all(input.agreement.signatureBoxes.map(async (box) => {
      const eligible = ['employee', 'handover', 'admin'].some((id) => box.id === id || box.id.startsWith(`${id}-`));
      if (!eligible || agreementParticipantForSignatureBox(box) !== input.signer) return box;
      return {
        ...box,
        status: 'signed' as const,
        signedAt,
        signatureData: storedSignature,
        name: input.actorName,
      };
    }));
    const nextAgreement = assetAgreementSchema.parse({
      ...input.agreement,
      signatureBoxes: boxes,
      status: nextAgreementStatus(boxes),
      updatedAt: null,
    });
    await this.repository.saveAgreement(input.entry.id, nextAgreement);
    return nextAgreement;
  }

  async signReturn(input: {
    entry: AssetRequest;
    agreement: AssetAgreement;
    signer: 'employee' | 'admin';
    signatureData: string;
    actorName: string;
    actorEmployeeCode: string;
    actorCanManageRequests: boolean;
    storeSignature: (data: string) => Promise<string>;
  }): Promise<AssetAgreement> {
    if (input.entry.status !== 'returnPending') throw new AssetApplicationError('รายการนี้ยังไม่อยู่ในขั้นตอนรอเซ็นคืน');
    if (input.signer === 'employee' && input.actorEmployeeCode.trim().toLowerCase() !== input.entry.employeeCode.trim().toLowerCase()) {
      throw new AssetApplicationError('ผู้ยืมสามารถลงชื่อคืนได้เฉพาะรายการของตัวเอง');
    }
    if (input.signer === 'admin' && !input.actorCanManageRequests) {
      throw new AssetApplicationError('เฉพาะ Admin หรือหัวหน้างานเท่านั้นที่สามารถเซ็นรับคืนได้');
    }
    const signedAt = new Date().toISOString();
    let found = false;
    const boxes = await Promise.all(input.agreement.signatureBoxes.map(async (box) => {
      if (box.id !== input.signer) return box;
      found = true;
      return { ...box, returnSignatureData: await input.storeSignature(input.signatureData), returnSignedAt: signedAt };
    }));
    if (!found) throw new AssetApplicationError('ไม่พบช่องลายเซ็นคืน');
    const nextAgreement = assetAgreementSchema.parse({ ...input.agreement, signatureBoxes: boxes, updatedAt: null });
    await this.repository.saveAgreement(input.entry.id, nextAgreement);
    return nextAgreement;
  }

  approveFormRequest(id: string, actorName: string, signatureData: string): Promise<void> {
    if (!signatureData.trim()) throw new AssetApplicationError('กรุณาระบุลายเซ็นผู้อนุมัติ');
    return this.repository.approveFormRequest(id, actorName, signatureData);
  }

  markSeen(ids: readonly string[]): Promise<void> {
    return this.repository.markSeen(ids);
  }

  remove(id: string): Promise<void> {
    return this.repository.remove(id);
  }
}
