import type { AssetAgreement, AssetRequest, AssetSignatureBox } from '../domain/asset';

export type BorrowAgreementTemplate = {
  templateId?: string | null;
  title: string;
  header: string;
  body: string;
  footer: string;
  handoverSigner: { label: string; role: string; name: string };
  approverSigner: { label: string; role: string; name: string };
};

export type AssetFormAgreementTemplate = {
  title: string;
  header: string;
  body: string;
  footer: string;
  approverSigner: { label: string; role: string; name: string };
};

type Borrower = Pick<AssetRequest, 'employeeName' | 'employeeCode'>;

export function createDefaultBorrowAgreement(
  borrower: Borrower,
  template: BorrowAgreementTemplate,
  createdBy = '',
  createdByCode = '',
): AssetAgreement {
  const documentDate = new Date();
  const signatureBoxes: AssetSignatureBox[] = [
    {
      id: 'employee',
      label: 'พนักงานผู้รับมอบ',
      role: 'พนักงานผู้รับมอบ',
      name: borrower.employeeName,
      signer: 'employee',
      position: 'bottom-left',
      page: 3,
      x: 10,
      y: 72,
      status: 'pending',
      signedAt: null,
    },
    {
      id: 'handover',
      label: template.handoverSigner.label,
      role: template.handoverSigner.role,
      name: template.handoverSigner.name,
      signer: 'other',
      position: 'bottom-right',
      page: 3,
      x: 60,
      y: 72,
      status: 'locked',
      signedAt: null,
    },
    {
      id: 'admin',
      label: template.approverSigner.label,
      role: template.approverSigner.role,
      name: template.approverSigner.name,
      signer: 'admin',
      position: 'lower-right',
      page: 3,
      x: 60,
      y: 82,
      status: 'locked',
      signedAt: null,
    },
  ];

  return {
    templateId: template.templateId ?? null,
    type: 'borrow',
    title: template.title,
    header: template.header,
    body: template.body,
    footer: template.footer,
    documentDate,
    updatedAt: null,
    signatureBoxes,
    status: 'waitingHandover',
    createdBy,
    createdByCode,
    returnCondition: null,
  };
}

export function createAssetFormAgreement(
  employeeName: string,
  employeeCode: string,
  signatureData: string,
  template: AssetFormAgreementTemplate,
): AssetAgreement {
  const signedAt = new Date();
  return {
    templateId: null,
    type: 'assetForm',
    title: template.title,
    header: template.header,
    body: template.body,
    footer: template.footer,
    documentDate: signedAt,
    updatedAt: null,
    createdBy: employeeName,
    createdByCode: employeeCode,
    status: 'waitingAdmin',
    returnCondition: null,
    signatureBoxes: [
      {
        id: 'employee',
        label: 'ผู้ยืม',
        role: 'ผู้ยืม',
        name: employeeName,
        signer: 'employee',
        position: 'bottom-left',
        signatureData,
        status: 'signed',
        signedAt: signedAt.toISOString(),
      },
      {
        id: 'admin',
        label: template.approverSigner.label,
        role: template.approverSigner.role,
        name: template.approverSigner.name,
        signer: 'admin',
        position: 'bottom-right',
        status: 'locked',
        signedAt: null,
      },
    ],
  };
}
