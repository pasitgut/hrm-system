import { describe, expect, it } from 'vitest';
import { formatAssetSheetDateTime, mapAssetRow } from './assetMapper';

describe('assetMapper', () => {
  it('maps the legacy A:R asset row and preserves additional images', () => {
    const entry = mapAssetRow([
      'AS-1',
      '2024-01-15 08:30:00',
      'สมชาย ใจดี',
      'พนักงาน',
      'A001',
      'ใช้งานหน้างาน',
      '2024-01-16',
      '2024-01-20',
      'โน้ตบุ๊ก',
      '',
      'อนุมัติ',
      'หัวหน้า',
      '',
      '',
      'https://image',
      'unseen',
      'a\nb',
      '2024-01-15 09:00:00',
    ]);
    expect(entry.status).toBe('approved');
    expect(entry.additionalImages).toEqual(['a', 'b']);
    expect(entry.approvedBorrowDate).not.toBeNull();
  });

  it('formats asset Sheet datetimes in local business time', () => {
    expect(formatAssetSheetDateTime(new Date(2024, 0, 15, 8, 30, 5))).toBe('2024-01-15 08:30:05');
  });

  it('allows an open-ended borrowing period when the end date is blank', () => {
    const row = Array.from({ length: 24 }, () => '');
    row[0] = 'AS-OPEN';
    row[1] = '2024-01-15 08:30:00';
    row[2] = 'สมชาย ใจดี';
    row[3] = 'พนักงาน';
    row[4] = 'A001';
    row[6] = '2024-01-16';
    row[8] = 'โน้ตบุ๊ก|1|';
    row[10] = 'รอ';

    expect(mapAssetRow(row).toDate).toBeNull();
  });

  it('maps the agreement workflow payload without treating it as a file', () => {
    const agreement = mapAssetRow([
      'AS-2',
      '2024-01-15 08:30:00',
      'สมชาย ใจดี',
      'พนักงาน',
      'A001',
      'รับอุปกรณ์',
      '2024-01-16',
      '2024-01-20',
      'โทรศัพท์|1|',
      '',
      'รอ',
      '',
      '',
      '',
      '',
      'seen',
      '',
      '',
      'หนังสือรับมอบทรัพย์สิน',
      'เนื้อหา Agreement',
      JSON.stringify({
        status: 'waitingAdmin',
        createdBy: 'Admin',
        createdByCode: 'ADMIN001',
        returnCondition: 'damaged',
        header: '<p>หัวกระดาษ</p>',
        footer: '<p>ท้ายกระดาษ</p>',
        signatureBoxes: [
          {
            id: 'employee',
            label: 'ผู้ยืม',
            role: 'พนักงาน',
            name: 'สมชาย',
            position: 'bottom-left',
            status: 'signed',
            signedAt: '2024-01-15T09:00:00.000Z',
            signatureData: 'data:image/png;base64,signature',
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
      }),
      '2024-01-15 00:00:00',
      '2024-01-15 09:00:00',
      'ฝ่ายวิศวกรรม',
    ]).agreement;
    expect(agreement?.status).toBe('waitingAdmin');
    expect(agreement?.createdByCode).toBe('ADMIN001');
    expect(agreement?.header).toBe('<p>หัวกระดาษ</p>');
    expect(agreement?.footer).toBe('<p>ท้ายกระดาษ</p>');
    expect(agreement?.returnCondition).toBe('damaged');
    expect(agreement?.signatureBoxes[0].status).toBe('signed');
    expect(agreement?.signatureBoxes[0].signatureData).toBe('data:image/png;base64,signature');

    const serialDateEntry = mapAssetRow([
      'AS-2-SERIAL',
      '2026-09-17 08:30:00',
      'สมชาย ใจดี',
      'พนักงาน',
      'A001',
      'รับอุปกรณ์',
      '2026-09-17',
      '2026-09-20',
      'โทรศัพท์|1|',
      '',
      'รอ',
      '',
      '',
      '',
      '',
      'seen',
      '',
      '',
      'หนังสือรับมอบทรัพย์สิน',
      'เนื้อหา Agreement',
      JSON.stringify({ signatureBoxes: [] }),
      '46282.38481',
      '',
      'ฝ่ายวิศวกรรม',
    ]).agreement;
    expect(serialDateEntry?.documentDate.getFullYear()).toBe(2026);
    expect(serialDateEntry?.documentDate.getMonth()).toBe(8);
    expect(serialDateEntry?.documentDate.getDate()).toBe(17);

    expect(
      mapAssetRow([
        'AS-3',
        '2024-01-15 08:30:00',
        'สมหญิง ใจดี',
        'หัวหน้า',
        'A002',
        'รับอุปกรณ์',
        '2024-01-16',
        '2024-01-20',
        'โทรศัพท์|1|',
        '',
        'อนุมัติ',
        '',
        '',
        '',
        '',
        'seen',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'ฝ่ายบัญชี',
      ]).department,
    ).toBe('ฝ่ายบัญชี');
  });
});
