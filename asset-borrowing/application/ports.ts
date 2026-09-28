import type {
  AssetAgreement,
  AssetAgreementParticipant,
  AssetCreateInput,
  AssetRequest,
  AssetTransition,
} from '../domain/asset';

export type AssetImageUpload = {
  fileName: string;
  mediaType: string;
  bytes: Uint8Array;
};

export interface AssetImageUploadGateway {
  upload(image: AssetImageUpload): Promise<string>;
}

export interface AssetRepository {
  listAll(): Promise<AssetRequest[]>;
  listForEmployee(employeeCode: string): Promise<AssetRequest[]>;
  listForAgreementParticipant(
    participant: AssetAgreementParticipant,
    employeeCode: string,
    employeeName: string,
  ): Promise<AssetRequest[]>;
  create(input: AssetCreateInput): Promise<AssetRequest>;
  createMany(inputs: readonly AssetCreateInput[]): Promise<AssetRequest[]>;
  transition(input: AssetTransition): Promise<void>;
  markSeen(ids: readonly string[]): Promise<void>;
  remove(id: string): Promise<void>;
  updateItems(id: string, items: string): Promise<void>;
  updateDetails(id: string, items: string, agreement: AssetAgreement): Promise<void>;
  confirmReturn(input: {
    id: string;
    agreement: AssetAgreement;
    returnInspector: string;
    approvedReturnBy: string;
    imageUrl: string;
    returnInspection: string;
  }): Promise<void>;
  saveAgreement(id: string, agreement: AssetAgreement): Promise<void>;
  approveFormRequest(id: string, actorName: string, signatureData: string): Promise<void>;
}
