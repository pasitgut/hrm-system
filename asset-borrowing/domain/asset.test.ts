import { describe, expect, it } from 'vitest';
import {
  canEditAgreement,
  canExportAgreementDocument,
  canSignAgreementAsEmployee,
  canTransitionAssetStatus,
  agreementParticipantForSignatureBox,
  nextAgreementStatus,
  parseAssetItems,
  serializeAssetItems,
} from './asset';

describe('Asset status policy', () => {
  it('keeps the borrow and return lifecycle ordered', () => {
    expect(canTransitionAssetStatus('pending', 'approved')).toBe(true);
    expect(canTransitionAssetStatus('pending', 'rejected')).toBe(true);
    expect(canTransitionAssetStatus('approved', 'returnPending')).toBe(true);
    expect(canTransitionAssetStatus('returnPending', 'returned')).toBe(true);
    expect(canTransitionAssetStatus('pending', 'returned')).toBe(false);
    expect(canTransitionAssetStatus('returned', 'approved')).toBe(false);
    expect(canTransitionAssetStatus('unknown', 'approved')).toBe(false);
  });

  it('parses structured items with quantities and enforces the maximum', () => {
    expect(parseAssetItems('โน้ตบุ๊ก|2|สำหรับตรวจงาน\nเมาส์')).toEqual([
      { name: 'โน้ตบุ๊ก', quantity: 2, note: 'สำหรับตรวจงาน' },
      { name: 'เมาส์', quantity: 1, note: '' },
    ]);
    expect(serializeAssetItems([{ name: 'โน้ตบุ๊ก', quantity: 2, note: 'ใช้งาน' }])).toBe('โน้ตบุ๊ก|2|ใช้งาน');
    expect(() => parseAssetItems(Array.from({ length: 11 }, (_, index) => `item-${index + 1}`).join('\n'))).toThrow(
      'ไม่เกิน 10',
    );
  });
});

describe('Agreement signing policy', () => {
  const boxes = [
    {
      id: 'employee',
      label: 'ผู้ยืม',
      role: 'ผู้ยืม',
      name: 'ผู้ยืม',
      signer: 'employee' as const,
      position: 'bottom-left' as const,
      status: 'pending' as const,
      signedAt: null,
    },
    {
      id: 'handover',
      label: 'ผู้ส่งมอบ',
      role: 'ผู้ส่งมอบ',
      name: 'ผู้ส่งมอบ',
      signer: 'other' as const,
      position: 'bottom-right' as const,
      status: 'locked' as const,
      signedAt: null,
    },
    {
      id: 'admin',
      label: 'ผู้อนุมัติ',
      role: 'ผู้อนุมัติ',
      name: 'ผู้อนุมัติ',
      signer: 'admin' as const,
      position: 'lower-left' as const,
      status: 'locked' as const,
      signedAt: null,
    },
  ];

  it('requires handover, employee, then admin in that order', () => {
    expect(agreementParticipantForSignatureBox(boxes[1])).toBe('handover');
    expect(nextAgreementStatus(boxes)).toBe('waitingHandover');
    const handoverSigned = boxes.map((box) => (box.id === 'handover' ? { ...box, status: 'signed' as const } : box));
    expect(nextAgreementStatus(handoverSigned)).toBe('waitingEmployee');
    const employeeSigned = handoverSigned.map((box) =>
      box.id === 'employee' ? { ...box, status: 'signed' as const } : box,
    );
    expect(nextAgreementStatus(employeeSigned)).toBe('waitingAdmin');
    const allSigned = employeeSigned.map((box) => ({ ...box, status: 'signed' as const }));
    expect(nextAgreementStatus(allSigned)).toBe('completed');
  });

  it('lets an admin sign the employee step only for the admin own request', () => {
    expect(canSignAgreementAsEmployee(true, 'ADMIN001', 'admin001')).toBe(true);
    expect(canSignAgreementAsEmployee(true, 'ADMIN001', 'E002')).toBe(false);
    expect(canSignAgreementAsEmployee(false, 'E001', 'E002')).toBe(true);
  });

  it('allows editing only in the admin Agreement management screen before signing starts', () => {
    expect(canEditAgreement(true, true, 'waitingHandover')).toBe(true);
    expect(canEditAgreement(true, true, 'waitingEmployee')).toBe(true);
    expect(canEditAgreement(true, true, 'waitingEmployee', true)).toBe(false);
    expect(canEditAgreement(true, false, 'waitingEmployee')).toBe(false);
    expect(canEditAgreement(true, true, 'waitingAdmin')).toBe(false);
    expect(canEditAgreement(false, true, 'waitingEmployee')).toBe(false);
  });

  it('allows exporting after the borrower signs, before approval is complete', () => {
    expect(canExportAgreementDocument(boxes)).toBe(false);
    const employeeSigned = boxes.map((box) => (box.id === 'employee' ? { ...box, status: 'signed' as const } : box));
    expect(canExportAgreementDocument(employeeSigned)).toBe(true);
    expect(canExportAgreementDocument(employeeSigned.map((box) => ({ ...box, status: 'signed' as const })))).toBe(true);
  });
});
