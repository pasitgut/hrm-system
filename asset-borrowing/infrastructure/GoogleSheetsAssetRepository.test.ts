import { describe, expect, it, vi } from 'vitest';
import { DataContractError } from '@/shared/lib/errors';
import { GoogleSheetsAssetRepository } from './GoogleSheetsAssetRepository';

function store(rows: unknown[][]) {
  return {
    getValues: vi.fn(async () => rows),
    appendValues: vi.fn(async () => null),
    updateValues: vi.fn(async () => undefined),
    clearValues: vi.fn(async () => undefined),
  };
}
const row = [
  'AS-1',
  '2024-01-15 08:30:00',
  'สมชาย',
  'พนักงาน',
  'A001',
  'ใช้งาน',
  '2024-01-16',
  '2024-01-20',
  'โน้ตบุ๊ก',
  '',
  'รอ',
  '',
  '',
  '',
  '',
  'unseen',
  '',
  '',
];

describe('GoogleSheetsAssetRepository', () => {
  it('ignores legacy placeholder rows with an id but no asset dates', async () => {
    const placeholder = ['AS-EMPTY', '', '', '', '', '', '', '', '', '', 'รอ'];
    const backend = store([row, placeholder]);
    const repository = new GoogleSheetsAssetRepository(backend);

    await expect(repository.listAll()).resolves.toEqual([expect.objectContaining({ id: 'AS-1' })]);
  });

  it('updates only lifecycle columns for approval', async () => {
    const backend = store([row]);
    const repository = new GoogleSheetsAssetRepository(backend);
    await repository.transition({
      id: 'AS-1',
      status: 'approved',
      actorName: 'หัวหน้า',
      returnInspector: '',
      approvedReturnBy: '',
      imageUrl: '',
      approvedBorrowDate: new Date(2024, 0, 15, 8, 30),
    });
    expect(backend.updateValues).toHaveBeenCalledWith('ข้อมูลการยืมทรัพย์สิน!K2:R2', [
      ['อนุมัติ', 'หัวหน้า', '', '', '', 'unseen', '', '2024-01-15 08:30:00'],
    ]);
    expect(backend.updateValues).toHaveBeenCalledTimes(1);
  });

  it('allows the admin agreement flow to create a request for the selected employee', async () => {
    const backend = store([]);
    const repository = new GoogleSheetsAssetRepository(backend);

    await expect(
      repository.create({
        id: 'AS-ADMIN-1',
        formDate: new Date(2026, 8, 16),
        employeeName: 'พนักงานที่ Admin เลือก',
        department: 'ฝ่ายทดสอบ',
        position: 'เจ้าหน้าที่',
        employeeCode: 'E002',
        reason: 'สร้าง Agreement พิเศษ',
        fromDate: new Date(2026, 8, 16),
        toDate: new Date(2026, 8, 30),
        items: 'โน้ตบุ๊ก|1|',
        remarks: '',
        imageUrl: '',
        additionalImages: [],
        agreement: null,
        initialStatus: 'approved',
        initialApprovedBy: 'Admin',
      }),
    ).resolves.toMatchObject({ employeeCode: 'E002', employeeName: 'พนักงานที่ Admin เลือก' });
    expect(backend.appendValues).toHaveBeenCalledWith('ข้อมูลการยืมทรัพย์สิน!A:A', [expect.any(Array)]);
  });

  it('lists Agreement documents assigned to the handover participant', async () => {
    const agreementRow = [...row];
    agreementRow[18] = 'Agreement ทดสอบ';
    agreementRow[19] = '<p>เนื้อหา</p>';
    agreementRow[20] = JSON.stringify({
      status: 'waitingHandover',
      signatureBoxes: [
        {
          id: 'handover',
          label: 'ผู้ส่งมอบ',
          role: 'ผู้ส่งมอบ',
          name: 'นภัสปวัน ฉายสุริยะ',
          signer: 'other',
          position: 'bottom-right',
          status: 'locked',
          signedAt: null,
        },
      ],
    });
    const repository = new GoogleSheetsAssetRepository(store([agreementRow]));

    await expect(
      repository.listForAgreementParticipant('handover', 'HANDOVER001', 'นภัสปวัน ฉายสุริยะ'),
    ).resolves.toEqual([expect.objectContaining({ id: 'AS-1' })]);
    await expect(repository.listForAgreementParticipant('handover', 'HANDOVER001', 'บุคคลอื่น')).resolves.toEqual([]);
  });

  it('creates regular employee requests without requiring a Google identity check', async () => {
    const backend = store([]);
    const repository = new GoogleSheetsAssetRepository(backend);

    await expect(
      repository.create({
        id: 'AS-EMP-1',
        formDate: new Date(2026, 8, 16),
        employeeName: 'พนักงาน',
        department: '',
        position: '',
        employeeCode: 'E003',
        reason: 'ยืมปกติ',
        fromDate: new Date(2026, 8, 16),
        toDate: new Date(2026, 8, 30),
        items: 'เมาส์|1|',
        remarks: '',
        imageUrl: '',
        additionalImages: [],
        agreement: null,
      }),
    ).resolves.toMatchObject({ employeeCode: 'E003', employeeName: 'พนักงาน' });
  });

  it('updates the editable Asset Form table in the item column', async () => {
    const backend = store([row]);
    const repository = new GoogleSheetsAssetRepository(backend);

    await repository.updateItems('AS-1', 'ยูนิฟอร์ม|1|สีน้ำเงิน\nโทรศัพท์|1|พร้อมสายชาร์จ');

    expect(backend.updateValues).toHaveBeenCalledWith('ข้อมูลการยืมทรัพย์สิน!I2', [
      ['ยูนิฟอร์ม|1|สีน้ำเงิน\nโทรศัพท์|1|พร้อมสายชาร์จ'],
    ]);
  });

  it('fails closed for duplicate asset ids', async () => {
    const backend = store([row, row]);
    const repository = new GoogleSheetsAssetRepository(backend);
    await expect(repository.remove('AS-1')).rejects.toThrow(DataContractError);
    expect(backend.clearValues).not.toHaveBeenCalled();
  });

  it('stops when a return lifecycle transition is out of order', async () => {
    const backend = store([row]);
    const repository = new GoogleSheetsAssetRepository(backend);

    await expect(
      repository.transition({
        id: 'AS-1',
        status: 'returned',
        actorName: 'หัวหน้า',
        returnInspector: 'หัวหน้า',
        approvedReturnBy: 'หัวหน้า',
        imageUrl: '',
        approvedBorrowDate: null,
      }),
    ).rejects.toThrow('ไม่สามารถเปลี่ยนสถานะ AssetRequest');
    expect(backend.updateValues).not.toHaveBeenCalled();
  });

  it('stores agreement content and signature workflow in columns S:W', async () => {
    const backend = store([row]);
    const repository = new GoogleSheetsAssetRepository(backend);
    await repository.saveAgreement('AS-1', {
      title: 'หนังสือรับมอบทรัพย์สิน',
      header: '<p>หัวกระดาษ</p>',
      body: 'ข้อตกลงทดสอบ',
      footer: '<p>ท้ายกระดาษ</p>',
      status: 'waitingEmployee',
      createdBy: 'ผู้ดูแลระบบ',
      createdByCode: 'ADMIN001',
      documentDate: new Date(2024, 0, 15),
      updatedAt: null,
      signatureBoxes: [
        {
          id: 'employee',
          label: 'ผู้ยืม',
          role: 'พนักงาน',
          name: 'สมชาย',
          position: 'bottom-left',
          status: 'pending',
          signedAt: null,
        },
        {
          id: 'inspector',
          label: 'ผู้ตรวจสอบ',
          role: 'ฝ่ายบุคคล',
          name: '',
          position: 'bottom-right',
          status: 'locked',
          signedAt: null,
        },
        {
          id: 'hr',
          label: 'ฝ่ายบุคคล',
          role: 'ฝ่ายบุคคล',
          name: '',
          position: 'lower-left',
          status: 'locked',
          signedAt: null,
        },
        {
          id: 'admin',
          label: 'Admin',
          role: 'Admin',
          name: '',
          position: 'lower-right',
          status: 'locked',
          signedAt: null,
        },
      ],
    });
    const [range, values] = backend.updateValues.mock.calls[0] as unknown as [string, unknown[][]];
    expect(range).toBe('ข้อมูลการยืมทรัพย์สิน!S2:W2');
    expect(values[0][0]).toBe('หนังสือรับมอบทรัพย์สิน');
    expect(JSON.parse(String(values[0][2]))).toMatchObject({
      status: 'waitingEmployee',
      createdByCode: 'ADMIN001',
      header: '<p>หัวกระดาษ</p>',
      footer: '<p>ท้ายกระดาษ</p>',
    });
    expect(values[0][3]).toBe('2024-01-15 00:00:00');
    expect(String(values[0][4])).toMatch(/^\d{4}-\d{2}-\d{2} /);
  });

  it('approves a signed Asset Form with one sheet update', async () => {
    const formRow = [...row];
    formRow[18] = 'Asset Form';
    formRow[19] = 'แบบฟอร์มการขอยืมทรัพย์สิน';
    formRow[20] = JSON.stringify({
      status: 'waitingAdmin',
      signatureBoxes: [
        {
          id: 'employee',
          label: 'ผู้ยืม',
          role: 'ผู้ยืม',
          name: 'สมชาย',
          position: 'bottom-left',
          status: 'signed',
          signatureData: 'https://example.com/borrower.jpg',
          signedAt: '2024-01-15T08:30:00.000Z',
        },
        {
          id: 'admin',
          label: 'ผู้อนุมัติ',
          role: 'ผู้อนุมัติ',
          name: '',
          position: 'bottom-right',
          status: 'locked',
          signedAt: null,
        },
      ],
    });
    const backend = store([formRow]);
    const repository = new GoogleSheetsAssetRepository(backend);

    await repository.approveFormRequest('AS-1', 'หัวหน้า', 'https://example.com/approver.jpg');

    expect(backend.updateValues).toHaveBeenCalledTimes(1);
    const [range, rows] = backend.updateValues.mock.calls[0] as unknown as [string, unknown[][]];
    expect(range).toBe('ข้อมูลการยืมทรัพย์สิน!K2:W2');
    expect(rows[0][0]).toBe('อนุมัติ');
    expect(rows[0][1]).toBe('หัวหน้า');
    const payload = JSON.parse(String(rows[0][10]));
    expect(payload.status).toBe('completed');
    expect(payload.signatureBoxes).toHaveLength(2);
    expect(payload.signatureBoxes[1]).toMatchObject({
      name: 'หัวหน้า',
      signatureData: 'https://example.com/approver.jpg',
      status: 'signed',
    });
  });
});
