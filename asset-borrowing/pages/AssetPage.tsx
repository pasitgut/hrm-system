import {
  AddRounded,
  ArrowBackRounded,
  CheckRounded,
  DeleteOutlineRounded,
  DescriptionOutlined,
  DownloadRounded,
  EditNoteRounded,
  FormatAlignCenterRounded,
  FormatAlignLeftRounded,
  FormatAlignJustifyRounded,
  FormatAlignRightRounded,
  FormatBoldRounded,
  FormatClearRounded,
  FormatItalicRounded,
  FormatIndentDecreaseRounded,
  FormatIndentIncreaseRounded,
  FormatListBulletedRounded,
  FormatListNumberedRounded,
  FormatStrikethroughRounded,
  FormatUnderlinedRounded,
  Inventory2Outlined,
  KeyboardArrowRightRounded,
  SaveRounded,
  RedoRounded,
  UndoRounded,
  UploadFileRounded,
  VisibilityRounded,
  ZoomInRounded,
  ZoomOutRounded,
} from '@mui/icons-material';
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Extension, Mark, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import SignaturePadLibrary from 'signature_pad';
import { assetApplicationService, assetRepository, employeeRepository, imageUploadGateway } from '@/app/container';
import { useEmployeeSession } from '@/features/auth/application/session-context';
import { hasPermission, hasSupervisorAccess } from '@/features/permissions/domain/permissionPolicy';
import { formatDateInput, parseDateInput } from '@/shared/lib/dateInput';
import { formatThaiDate } from '@/shared/lib/format';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  createDefaultBorrowAgreement,
  canEditAgreement,
  canExportAgreementDocument,
  canTransitionAssetStatus,
  matchesAssetAgreementFilter,
  parseAssetItems,
  isAssetFormOnly,
  serializeAssetItems,
  type AssetAgreement,
  type AssetAgreementParticipant,
  type AssetBorrowRequestSubmission,
  type AssetItem,
  type AssetRequest,
  type AssetSignatureBox,
  type AssetAgreementStatus,
  type AssetAgreementFilter,
  type AssetReturnCondition,
  type AssetStatus,
} from '..';
import {
  COMPANY_APPROVER_NAME,
  COMPANY_BORROW_AGREEMENT,
  COMPANY_HANDOVER_NAME,
} from '../presets/companyAgreements';

type BorrowFormState = {
  fromDate: string;
  toDate: string;
  itemRows: AssetItem[];
  reason: string;
  remarks: string;
  imageUrl: string;
  additionalImages: string;
};

type ReturnSignatureParticipant = 'employee' | 'admin';
type AgreementFilter = AssetAgreementFilter;

const agreementFilterLabels: Record<AgreementFilter, string> = {
  all: 'ทั้งหมด',
  waitingHandover: 'รอผู้ส่งมอบ',
  waitingEmployee: 'รอผู้รับมอบ',
  waitingAdmin: 'รอผู้อนุมัติ',
  returnPending: 'รอคืน',
};

const initialBorrowForm: BorrowFormState = {
  fromDate: '',
  toDate: '',
  itemRows: [{ name: '', quantity: 1, note: '' }],
  reason: '',
  remarks: '',
  imageUrl: '',
  additionalImages: '',
};

const AGREEMENT_PAGE_BREAK_HTML = '<hr data-agreement-page-break="true">';

const returnConditionLabels: Record<AssetReturnCondition, string> = {
  original: 'อยู่ในสภาพเดิม',
  damaged: 'ชำรุด',
  lost: 'สูญหาย',
};

function returnConditionMark(current: AssetReturnCondition | null | undefined, value: AssetReturnCondition): string {
  return current === value ? '☑' : '□';
}

function statusColor(status: AssetStatus): 'default' | 'success' | 'error' | 'warning' | 'info' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'error';
  if (status === 'returnPending') return 'info';
  if (status === 'returned') return 'default';
  return status === 'unknown' ? 'default' : 'warning';
}

function agreementStatusLabel(status: AssetAgreementStatus): string {
  if (status === 'waitingHandover') return 'รอผู้ส่งมอบเซ็น';
  if (status === 'waitingAdmin') return 'รอผู้อนุมัติเซ็น';
  if (status === 'completed') return 'เซ็นครบแล้ว';
  return 'รอพนักงานเซ็น';
}

function assetFormStatusLabel(entry: AssetRequest): string {
  return entry.status === 'approved' ? 'รอคืน' : entry.statusLabel;
}

function agreementStatusColor(status: AssetAgreementStatus): 'default' | 'success' | 'warning' {
  if (status === 'completed') return 'success';
  if (status === 'waitingHandover' || status === 'waitingAdmin' || status === 'waitingEmployee') return 'warning';
  return 'default';
}

function itemLabel(value: string): string {
  try {
    return parseAssetItems(value)
      .map((item) => `${item.name} × ${item.quantity}${item.note ? ` (${item.note})` : ''}`)
      .join(', ');
  } catch {
    return value;
  }
}

function formatThaiFormalDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(
    date,
  );
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  return `${day} เดือน ${month} พ.ศ. ${year}`;
}

function entryWithItems(entry: AssetRequest, items: AssetItem[]): AssetRequest {
  const filledItems = items.filter((item) => item.name.trim());
  if (filledItems.length === 0) return entry;
  return { ...entry, items: serializeAssetItems(filledItems) };
}

const agreementFieldTokens = [
  { token: '{{agreementDate}}', label: 'วันที่ Agreement' },
  { token: '{{employeeName}}', label: 'ชื่อผู้ยืม' },
  { token: '{{position}}', label: 'ตำแหน่งผู้ยืม' },
  { token: '{{employeeCode}}', label: 'รหัสพนักงาน' },
  { token: '{{department}}', label: 'แผนก' },
  { token: '{{handoverName}}', label: 'ชื่อผู้ส่งมอบ' },
  { token: '{{approverName}}', label: 'ชื่อผู้อนุมัติ' },
  { token: '{{assetItems}}', label: 'รายการยืม' },
  { token: '{{fromDate}}', label: 'วันที่เริ่มยืม' },
  { token: '{{toDate}}', label: 'วันที่สิ้นสุดการยืม (ถ้ามี)' },
  { token: '{{reason}}', label: 'เหตุผล' },
  { token: '{{remarks}}', label: 'หมายเหตุ' },
] as const;

type AgreementSignatureSlot = 'employee' | 'handover' | 'admin';

const agreementSignatureTokens: { token: string; label: string; slot: AgreementSignatureSlot }[] = [
  { token: '{{signatureBorrower}}', label: 'ช่องเซ็น: ผู้ยืม', slot: 'employee' },
  { token: '{{signatureHandover}}', label: 'ช่องเซ็น: ผู้ส่งมอบ', slot: 'handover' },
  { token: '{{signatureApprover}}', label: 'ช่องเซ็น: ผู้อนุมัติ', slot: 'admin' },
] as const;

const fontFamilyOptions = [
  { value: 'Sarabun, sans-serif', label: 'Sarabun' },
  { value: 'TH Sarabun New, Sarabun, sans-serif', label: 'TH Sarabun New' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Tahoma, sans-serif', label: 'Tahoma' },
  { value: 'Georgia, serif', label: 'Georgia' },
] as const;

const fontSizeOptions = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'] as const;

const signatureFieldValues: Record<string, string> = {
  '{{signatureBorrower}}':
    '<span class="agreement-signature-placeholder"><span>(ลงชื่อ) .........................................</span><strong>ผู้ยืม</strong></span>',
  '{{signatureHandover}}':
    '<span class="agreement-signature-placeholder"><span>(ลงชื่อ) .........................................</span><strong>ผู้ส่งมอบ</strong></span>',
  '{{signatureApprover}}':
    '<span class="agreement-signature-placeholder"><span>(ลงชื่อ) .........................................</span><strong>ผู้อนุมัติ</strong></span>',
};

const signatureFieldLabels: Record<string, string> = {
  '{{signatureBorrower}}': '[ช่องเซ็น: ผู้ยืม]',
  '{{signatureHandover}}': '[ช่องเซ็น: ผู้ส่งมอบ]',
  '{{signatureApprover}}': '[ช่องเซ็น: ผู้อนุมัติ]',
};

function agreementSignatureSlotFromId(id: string): AgreementSignatureSlot | null {
  if (id === 'employee' || id.startsWith('employee-')) return 'employee';
  if (id === 'handover' || id.startsWith('handover-')) return 'handover';
  if (id === 'admin' || id.startsWith('admin-')) return 'admin';
  return null;
}

function isFixedAgreementSignature(box: AssetSignatureBox): boolean {
  return box.id === 'employee' || box.id === 'handover' || box.id === 'admin';
}

function visibleAgreementSignatureBoxes(boxes: AssetSignatureBox[]): AssetSignatureBox[] {
  return boxes.filter((box) => agreementSignatureSlotFromId(box.id) !== null);
}

function formatBorrowingPeriod(fromDate: Date, toDate: Date | null): string {
  return toDate ? `${formatThaiDate(fromDate)} ถึง ${formatThaiDate(toDate)}` : `${formatThaiDate(fromDate)} เป็นต้นไป`;
}

function formatOptionalThaiDate(date: Date | null, fallback = 'ไม่ระบุ'): string {
  return date ? formatThaiDate(date) : fallback;
}

function fillAgreementFields(body: string, entry: AssetRequest, documentDate: Date): string {
  const values: Record<string, string> = {
    '{{agreementDate}}': formatThaiFormalDate(documentDate),
    '{{employeeName}}': entry.employeeName,
    '{{employeeCode}}': entry.employeeCode,
    '{{department}}': entry.department || '-',
    '{{position}}': entry.position || '-',
    '{{handoverName}}': COMPANY_HANDOVER_NAME,
    '{{approverName}}': COMPANY_APPROVER_NAME,
    '{{assetItems}}': itemLabel(entry.items) || '-',
    '{{fromDate}}': formatThaiDate(entry.fromDate),
    '{{toDate}}': formatOptionalThaiDate(entry.toDate, 'ไม่ระบุวันสิ้นสุด'),
    '{{reason}}': entry.reason || '-',
    '{{remarks}}': entry.remarks || '-',
  };
  // Keep previously signed/saved agreements compatible with the one-line identity header.
  const normalizedBody = body.replace(
    /(<strong>\s*\{\{employeeCode\}\}\s*<\/strong>)\s*<br\s*\/?>\s*(ตำแหน่ง)/gi,
    '$1 $2',
  );
  const isHtml = /<[a-z][\s\S]*>/i.test(normalizedBody);
  const filledFields = agreementFieldTokens.reduce(
    (result, { token }) => result.split(token).join(isHtml ? escapeHtml(values[token]) : values[token]),
    normalizedBody,
  );
  return agreementSignatureTokens.reduce(
    (result, { token }) => result.split(token).join(isHtml ? signatureFieldValues[token] : signatureFieldLabels[token]),
    filledFields,
  );
}

function formatAgreementTitle(title: string): string {
  return title.replace(/\s+และ/u, '\nและ').trim();
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character,
  );
}

function bodyToHtml(body: string): string {
  if (/<[a-z][\s\S]*>/i.test(body)) return body;
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function splitAgreementBody(body: string): [string, string] {
  const rawHtml = bodyToHtml(body);
  const html = removeSignatureBlocks(rawHtml);
  const [firstPage, ...remainingPages] = html.split(/<hr\b[^>]*data-agreement-page-break\s*=\s*["']true["'][^>]*>\s*/i);
  if (remainingPages.length > 0) return [firstPage || html, remainingPages.join(AGREEMENT_PAGE_BREAK_HTML)];

  // Keep agreements created before the fixed page break usable by splitting at section 2.3.
  const legacyBreakIndex = html.search(/<p\b[^>]*>\s*(?:<strong>)?2\.3\b/i);
  if (legacyBreakIndex > 0) return [html.slice(0, legacyBreakIndex), html.slice(legacyBreakIndex)];
  return [html, ''];
}

function removeSignatureBlocks(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<div\b[^>]*data-signature-block[^>]*>[\s\S]*?<\/div>/gi, '');
  }
  const parsed = new DOMParser().parseFromString(`<main>${html}</main>`, 'text/html');
  const container = parsed.querySelector('main');
  if (!container) return html;
  container.querySelectorAll('[data-signature-block]').forEach((block) => block.remove());
  return container.innerHTML;
}

function sanitizeAgreementPreviewHtml(html: string): string {
  const withoutPageBreaks = html.replace(/<hr\b[^>]*data-agreement-page-break\s*=\s*["']true["'][^>]*>/gi, '');
  if (typeof DOMParser === 'undefined') {
    return withoutPageBreaks.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  }
  const parsed = new DOMParser().parseFromString(`<main>${withoutPageBreaks}</main>`, 'text/html');
  const container = parsed.querySelector('main');
  if (!container) return withoutPageBreaks;

  container.querySelectorAll('script, style, iframe, object, embed, form').forEach((element) => element.remove());
  container.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase();
      if (attributeName.startsWith('on')) {
        element.removeAttribute(attribute.name);
        return;
      }
      if ((attributeName === 'href' || attributeName === 'src') && /^javascript:/i.test(attribute.value.trim())) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (attributeName === 'style') {
        const style = attribute.value
          .split(';')
          .filter((rule) => !/^\s*font-(?:size|family)\s*:/i.test(rule))
          .join(';')
          .trim();
        if (style) element.setAttribute('style', style);
        else element.removeAttribute('style');
      }
    });
  });
  return container.innerHTML;
}

function joinAgreementBody(firstPage: string, secondPage: string): string {
  return `${firstPage}${AGREEMENT_PAGE_BREAK_HTML}${secondPage}`;
}

const DocumentImage = Node.create({
  name: 'documentImage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('src') ?? '',
        renderHTML: (attributes: Record<string, unknown>) => ({ src: attributes.src }),
      },
      alt: {
        default: 'รูปภาพใน Header',
        parseHTML: (element: HTMLElement) => element.getAttribute('alt') ?? 'รูปภาพใน Header',
        renderHTML: (attributes: Record<string, unknown>) => ({ alt: attributes.alt }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'img[data-agreement-image]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { 'data-agreement-image': 'true', class: 'tiptap-document-image' })];
  },
});

const TextStyleMark = Mark.create({
  name: 'textStyle',
  inclusive: true,
  addAttributes() {
    return {
      fontFamily: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.fontFamily || null,
      },
      fontSize: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.fontSize || null,
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[style]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const { fontFamily, fontSize, ...rest } = HTMLAttributes;
    const styles = [fontFamily ? `font-family: ${fontFamily}` : '', fontSize ? `font-size: ${fontSize}` : ''].filter(
      Boolean,
    );
    return ['span', mergeAttributes(rest, styles.length > 0 ? { style: styles.join('; ') } : {}), 0];
  },
});

const ParagraphIndent = Extension.create({
  name: 'paragraphIndent',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          textIndent: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.textIndent || null,
            renderHTML: (attributes: { textIndent?: string | null }) =>
              attributes.textIndent ? { style: `text-indent: ${attributes.textIndent}` } : {},
          },
        },
      },
    ];
  },
});

function LifecycleActions({
  entry,
  manager,
  own,
  busy,
  returnSignatureReady,
  onTransition,
  onRemove,
}: {
  entry: AssetRequest;
  manager: boolean;
  own: boolean;
  busy: boolean;
  returnSignatureReady?: boolean;
  onTransition: (entry: AssetRequest, status: Exclude<AssetStatus, 'unknown'>) => void;
  onRemove: (entry: AssetRequest) => void;
}) {
  const canApprove = manager && !entry.agreement && canTransitionAssetStatus(entry.status, 'approved');
  const canInspectReturn =
    manager && canTransitionAssetStatus(entry.status, 'returned') && (!entry.agreement || returnSignatureReady);
  const canRequestReturn =
    own &&
    (!entry.agreement || entry.agreement.status === 'completed') &&
    canTransitionAssetStatus(entry.status, 'returnPending');
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} flexWrap="wrap" gap={1}>
      {canApprove ? (
        <Button
          disabled={busy}
          onClick={() => onTransition(entry, 'approved')}
          size="small"
          startIcon={<CheckRounded />}
          variant="contained"
        >
          อนุมัติ
        </Button>
      ) : null}
      {canApprove ? (
        <Button
          color="error"
          disabled={busy}
          onClick={() => onTransition(entry, 'rejected')}
          size="small"
          variant="outlined"
        >
          ไม่อนุมัติ
        </Button>
      ) : null}
      {canRequestReturn ? (
        <Button disabled={busy} onClick={() => onTransition(entry, 'returnPending')} size="small" variant="outlined">
          แจ้งคืนทรัพย์สิน
        </Button>
      ) : null}
      {canInspectReturn ? (
        <Button disabled={busy} onClick={() => onTransition(entry, 'returned')} size="small" variant="contained">
          ยืนยันรับคืน
        </Button>
      ) : null}
      {manager && (entry.status === 'rejected' || entry.status === 'returned') ? (
        <Button
          color="error"
          disabled={busy}
          onClick={() => onRemove(entry)}
          size="small"
          startIcon={<DeleteOutlineRounded />}
          variant="text"
        >
          ลบรายการ
        </Button>
      ) : null}
    </Stack>
  );
}

function NormalAssetCard({
  entry,
  busy,
  onOpenAgreement,
  onTransition,
}: {
  entry: AssetRequest;
  busy: boolean;
  onOpenAgreement: () => void;
  onTransition: (entry: AssetRequest, status: Exclude<AssetStatus, 'unknown'>) => void;
}) {
  const canRequestReturn =
    (!entry.agreement || entry.agreement.status === 'completed') &&
    canTransitionAssetStatus(entry.status, 'returnPending');
  return (
    <Paper className="asset-request-card" variant="outlined">
      <div className="asset-request-card-heading">
        <div>
          <span className="asset-request-card-id">{entry.id}</span>
          <Typography component="h2" variant="h6">
            {itemLabel(entry.items)}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {formatBorrowingPeriod(entry.fromDate, entry.toDate)}
          </Typography>
        </div>
        <Chip
          color={
            entry.agreement && !isAssetFormOnly(entry.agreement)
              ? agreementStatusColor(entry.agreement.status)
              : statusColor(entry.status)
          }
          label={
            entry.agreement && !isAssetFormOnly(entry.agreement)
              ? agreementStatusLabel(entry.agreement.status)
              : assetFormStatusLabel(entry)
          }
          size="small"
        />
      </div>
      <div className="asset-request-card-details">
        <span>
          <b>เหตุผล</b>
          {entry.reason || 'ไม่ได้ระบุ'}
        </span>
        <span>
          <b>หมายเหตุ</b>
          {entry.remarks || 'ไม่มี'}
        </span>
        {entry.approvedBorrowBy ? (
          <span>
            <b>ผู้อนุมัติ</b>
            {entry.approvedBorrowBy}
          </span>
        ) : null}
      </div>
      {entry.agreement ? (
        <div className="asset-request-agreement-row">
          <Typography color="text.secondary" variant="body2">
            {isAssetFormOnly(entry.agreement)
              ? entry.status === 'pending'
                ? 'ผู้ยืมเซ็นคำขอแล้ว รอผู้อนุมัติลงชื่อ'
                : 'คำขอยืมอยู่ใน Asset Form'
              : entry.agreement.status === 'completed'
                ? 'Agreement เซ็นครบแล้ว'
                : 'Agreement ต้องเซ็นก่อนจึงจะดำเนินการยืมต่อได้'}
          </Typography>
          <Button disabled={busy} onClick={onOpenAgreement} size="small" variant="contained">
            {isAssetFormOnly(entry.agreement) ? 'เปิด Asset Form' : 'เปิด Agreement'}
          </Button>
        </div>
      ) : null}
      {canRequestReturn ? (
        <Button disabled={busy} onClick={() => onTransition(entry, 'returnPending')} size="small" variant="outlined">
          แจ้งคืนทรัพย์สิน
        </Button>
      ) : null}
    </Paper>
  );
}

function AgreementCollection({
  entries,
  filter,
  counts,
  onFilterChange,
  onOpen,
}: {
  entries: AssetRequest[];
  filter: AgreementFilter;
  counts: Record<AgreementFilter, number>;
  onFilterChange: (filter: AgreementFilter) => void;
  onOpen: (entry: AssetRequest) => void;
}) {
  return (
    <section aria-label="คำขอยืมทรัพย์สินทั้งหมด" className="agreement-collection no-print">
      <div className="asset-request-list-heading">
        <div>
          <span className="section-kicker">asset requests</span>
          <Typography component="h2" variant="h5">
            คำขอยืมทรัพย์สินทั้งหมด
          </Typography>
        </div>
      </div>
      <Tabs
        aria-label="กรองสถานะคำขอยืม"
        onChange={(_, value: AgreementFilter) => onFilterChange(value)}
        scrollButtons="auto"
        value={filter}
        variant="scrollable"
      >
        {(Object.keys(agreementFilterLabels) as AgreementFilter[])
          .filter((value) => (value !== 'waitingHandover' && value !== 'waitingEmployee') || counts[value] > 0)
          .map((value) => (
            <Tab key={value} label={`${agreementFilterLabels[value]} (${counts[value]})`} value={value} />
          ))}
      </Tabs>
      <div className="agreement-collection-grid">
        {entries.map((entry) => {
          const agreement = entry.agreement;
          if (!agreement) return null;
          return (
            <Paper className="agreement-collection-card" key={entry.id} variant="outlined">
              <div className="agreement-collection-card-topline">
                <span className="asset-request-card-id">{entry.id}</span>
                <Chip
                  color={
                    isAssetFormOnly(agreement) ? statusColor(entry.status) : agreementStatusColor(agreement.status)
                  }
                  label={
                    isAssetFormOnly(agreement) ? assetFormStatusLabel(entry) : agreementStatusLabel(agreement.status)
                  }
                  size="small"
                />
              </div>
              <Typography component="h3" variant="h6">
                {isAssetFormOnly(agreement) ? `Asset Form · ${itemLabel(entry.items)}` : agreement.title}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {entry.employeeName} · {entry.employeeCode} · {entry.department || 'ไม่ระบุแผนก'}
              </Typography>
              <div className="agreement-collection-meta">
                <span>{itemLabel(entry.items)}</span>
                <span>{formatBorrowingPeriod(entry.fromDate, entry.toDate)}</span>
              </div>
              <Button
                endIcon={<KeyboardArrowRightRounded />}
                onClick={() => onOpen(entry)}
                size="small"
                variant="outlined"
              >
                {isAssetFormOnly(agreement) ? 'เปิด Asset Form' : 'เปิด Agreement'}
              </Button>
            </Paper>
          );
        })}
      </div>
      {entries.length === 0 ? (
        <Paper className="asset-empty-state" variant="outlined">
          <Typography component="h3" variant="h6">
            ไม่พบคำขอยืมในสถานะนี้
          </Typography>
          <Typography color="text.secondary">ลองเลือก Tab อื่นเพื่อดูรายการเพิ่มเติม</Typography>
        </Paper>
      ) : null}
    </section>
  );
}

type TiptapSurface = 'body';

const tiptapSurfaceLabels: Record<TiptapSurface, string> = {
  body: 'เนื้อหาเอกสาร',
};

const ASSET_FORM_ROW_COUNT = 10;
function FixedAgreementHeader() {
  return (
    <div aria-label="หัวกระดาษแบบคงที่" className="asset-form-document-company-header">
      <img alt="ตราบริษัท ต.จรัสชัย" src="/download.png" />
      <div>
        <strong>T.Jaruschai International Construction Co.,Ltd.</strong>
        <span>2043 Soi Kanchanaphisek 008, Bangkae, Bangkae Bangkok 10160 Thailand</span>
      </div>
    </div>
  );
}

function FixedAssetFormSignature({
  box,
  name,
  role,
  className,
  signatureData,
  signedAt,
}: {
  box: AssetSignatureBox | undefined;
  name: string;
  role: string;
  className?: string;
  signatureData?: string | null;
  signedAt?: string | null;
}) {
  if (!box) return <div aria-hidden="true" className="asset-signature-empty" />;
  const displayedSignature = signatureData === undefined ? box.signatureData : signatureData;
  const displayedSignedAt = signedAt === undefined ? box.signedAt : signedAt;
  const signedDate = displayedSignedAt ? new Date(displayedSignedAt) : null;
  const hasSignedDate = signedDate && !Number.isNaN(signedDate.getTime());
  return (
    <div className={className}>
      <div className="asset-signature-line-row">
        <span>ลงชื่อ</span>
        <span className="asset-signature-line">
          {displayedSignature ? <TrimmedSignatureImage alt={`ลายเซ็น${role}`} dataUrl={displayedSignature} /> : null}
        </span>
      </div>
      <span>( {name || '.........................................'} )</span>
      <strong>{role}</strong>
      <small>
        {hasSignedDate ? `วันที่ ${formatThaiFormalDate(signedDate)}` : 'วันที่ .... เดือน ........ พ.ศ. ........'}
      </small>
    </div>
  );
}

function trimSignatureDataUrl(dataUrl: string): Promise<string> {
  // Keep remote image URLs as URLs. Only inline data URLs need normalization;
  // trying to draw a remote image onto a canvas can fail because of CORS.
  if (!dataUrl.startsWith('data:image/')) return Promise.resolve(dataUrl);
  if (typeof Image === 'undefined' || typeof document === 'undefined') return Promise.resolve(dataUrl);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = image.naturalWidth || image.width;
        sourceCanvas.height = image.naturalHeight || image.height;
        const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
        if (!sourceContext || sourceCanvas.width === 0 || sourceCanvas.height === 0) {
          resolve(dataUrl);
          return;
        }
        sourceContext.drawImage(image, 0, 0);
        const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        let left = sourceCanvas.width;
        let top = sourceCanvas.height;
        let right = -1;
        let bottom = -1;
        for (let y = 0; y < sourceCanvas.height; y += 1) {
          for (let x = 0; x < sourceCanvas.width; x += 1) {
            const offset = (y * sourceCanvas.width + x) * 4;
            const red = pixels.data[offset];
            const green = pixels.data[offset + 1];
            const blue = pixels.data[offset + 2];
            const alpha = pixels.data[offset + 3];
            const isInk = alpha > 20 && (red < 245 || green < 245 || blue < 245);
            if (!isInk) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
        if (right < left || bottom < top) {
          resolve(dataUrl);
          return;
        }
        const padding = 8;
        const cropLeft = Math.max(0, left - padding);
        const cropTop = Math.max(0, top - padding);
        const cropRight = Math.min(sourceCanvas.width - 1, right + padding);
        const cropBottom = Math.min(sourceCanvas.height - 1, bottom + padding);
        const cropWidth = cropRight - cropLeft + 1;
        const cropHeight = cropBottom - cropTop + 1;
        const maxWidth = 480;
        const maxHeight = 180;
        const scale = Math.min(1, maxWidth / cropWidth, maxHeight / cropHeight);
        const outputWidth = Math.max(1, Math.round(cropWidth * scale));
        const outputHeight = Math.max(1, Math.round(cropHeight * scale));
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = outputWidth;
        outputCanvas.height = outputHeight;
        const outputContext = outputCanvas.getContext('2d');
        if (!outputContext) {
          resolve(dataUrl);
          return;
        }

        // JPEG keeps signature uploads small. Paint a
        // white background first so transparent PNG/SVG signatures stay legible.
        outputContext.fillStyle = '#ffffff';
        outputContext.fillRect(0, 0, outputWidth, outputHeight);
        outputContext.drawImage(
          sourceCanvas,
          cropLeft,
          cropTop,
          cropWidth,
          cropHeight,
          0,
          0,
          outputWidth,
          outputHeight,
        );
        const qualities = [0.72, 0.58, 0.45, 0.32, 0.22];
        const normalized = qualities
          .map((quality) => outputCanvas.toDataURL('image/jpeg', quality))
          .find((candidate) => candidate.length <= 24_000);
        resolve(normalized ?? outputCanvas.toDataURL('image/jpeg', 0.15));
      } catch {
        // Keep the original signature if a browser blocks canvas access.
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function storeSignatureData(dataUrl: string): Promise<string> {
  const normalized = await trimSignatureDataUrl(dataUrl);
  if (!normalized.startsWith('data:image/')) return normalized;

  const separatorIndex = normalized.indexOf(',');
  if (separatorIndex < 0) throw new Error('รูปลายเซ็นมีรูปแบบไม่ถูกต้อง');
  const metadata = normalized.slice(0, separatorIndex);
  const payload = normalized.slice(separatorIndex + 1);
  const mimeType = metadata.match(/^data:([^;,]+)/)?.[1] || 'image/jpeg';
  const bytes = metadata.includes(';base64')
    ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/svg+xml' ? 'svg' : 'jpg';
  return imageUploadGateway.upload({ fileName: `signature-${Date.now()}.${extension}`, mediaType: mimeType, bytes });
}

async function uploadImageFile(file: File): Promise<string> {
  return imageUploadGateway.upload({
    fileName: file.name,
    mediaType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
}

async function normalizeSignatureBoxes(signatureBoxes: AssetSignatureBox[]): Promise<AssetSignatureBox[]> {
  return Promise.all(
    signatureBoxes.map(async (box) => {
      const [signatureData, returnSignatureData] = await Promise.all([
        box.signatureData ? storeSignatureData(box.signatureData) : Promise.resolve(box.signatureData),
        box.returnSignatureData
          ? storeSignatureData(box.returnSignatureData)
          : Promise.resolve(box.returnSignatureData),
      ]);
      return { ...box, signatureData, returnSignatureData };
    }),
  );
}

function hasInlineSignatureData(signatureBoxes: AssetSignatureBox[]): boolean {
  return signatureBoxes.some(
    (box) => box.signatureData?.startsWith('data:image/') || box.returnSignatureData?.startsWith('data:image/'),
  );
}

async function migrateLegacyAgreementSignatures(entry: AssetRequest): Promise<boolean> {
  if (!entry.agreement || !hasInlineSignatureData(entry.agreement.signatureBoxes)) return false;
  const signatureBoxes = await normalizeSignatureBoxes(entry.agreement.signatureBoxes);
  await assetApplicationService.saveAgreement(entry.id, {
    ...entry.agreement,
    signatureBoxes,
    updatedAt: null,
  });
  return true;
}

function TrimmedSignatureImage({ alt, dataUrl }: { alt: string; dataUrl: string }) {
  const [trimmedDataUrl, setTrimmedDataUrl] = useState(dataUrl);

  useEffect(() => {
    let active = true;
    setTrimmedDataUrl(dataUrl);
    void trimSignatureDataUrl(dataUrl).then((normalized) => {
      if (active) setTrimmedDataUrl(normalized);
    });
    return () => {
      active = false;
    };
  }, [dataUrl]);

  return <img alt={alt} className="asset-signature-image" src={trimmedDataUrl} />;
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const targetCanvas = canvas;
    const padContainer = container;
    const signaturePad = new SignaturePadLibrary(targetCanvas, {
      backgroundColor: 'rgba(255, 255, 255, 0)',
      minDistance: 2,
      penColor: '#182338',
    });
    let frameId = 0;
    let retryCount = 0;
    function resizeCanvas() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const width = padContainer.clientWidth;
      const height = padContainer.clientHeight;
      if (width <= 0 || height <= 0) {
        if (retryCount < 10) {
          retryCount += 1;
          scheduleResize();
        }
        return;
      }
      retryCount = 0;
      const scaledWidth = Math.max(Math.round(width * ratio), 1);
      const scaledHeight = Math.max(Math.round(height * ratio), 1);
      if (targetCanvas.width === scaledWidth && targetCanvas.height === scaledHeight) return;
      targetCanvas.width = scaledWidth;
      targetCanvas.height = scaledHeight;
      targetCanvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
      signaturePad.clear();
    }

    function scheduleResize() {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(resizeCanvas);
    }

    function handleEnd() {
      if (!signaturePad.isEmpty()) {
        void trimSignatureDataUrl(signaturePad.toDataURL('image/png')).then(onChange);
      }
    }

    scheduleResize();
    signaturePad.addEventListener('endStroke', handleEnd);
    window.addEventListener('resize', scheduleResize);
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleResize);
    resizeObserver?.observe(padContainer);
    return () => {
      cancelAnimationFrame(frameId);
      signaturePad.removeEventListener('endStroke', handleEnd);
      signaturePad.off();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleResize);
    };
  }, [onChange]);

  return (
    <div className="signature-pad-shell" ref={containerRef}>
      <canvas aria-label="พื้นที่วาดลายเซ็น" className="signature-pad" ref={canvasRef} />
    </div>
  );
}

function typedSignatureDataUrl(value: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="240" viewBox="0 0 720 240"><rect width="720" height="240" fill="white" fill-opacity="0"/><text x="360" y="145" fill="#182338" font-family="cursive" font-size="64" font-style="italic" text-anchor="middle">${escapeHtml(value)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

type AgreementPageNumber = 2 | 3;
type AgreementSignatureGeometry = { page: AgreementPageNumber; x: number; y: number };
const AGREEMENT_SIGNATURE_PAGE: AgreementPageNumber = 3;

const legacySignatureGeometry: Record<AssetSignatureBox['position'], AgreementSignatureGeometry> = {
  'bottom-left': { page: AGREEMENT_SIGNATURE_PAGE, x: 10, y: 72 },
  'bottom-right': { page: AGREEMENT_SIGNATURE_PAGE, x: 60, y: 72 },
  'lower-left': { page: 3, x: 10, y: 72 },
  'lower-right': { page: 3, x: 60, y: 72 },
};

function agreementSignatureGeometry(box: AssetSignatureBox): AgreementSignatureGeometry {
  const fallback = legacySignatureGeometry[box.position];
  const isDefaultAdminPlacement = box.id === 'admin' && box.x === 10 && [72, 78, 84].includes(box.y ?? -1);
  return {
    page: AGREEMENT_SIGNATURE_PAGE,
    x: isDefaultAdminPlacement ? 60 : (box.x ?? fallback.x),
    y: isDefaultAdminPlacement ? 82 : (box.y ?? fallback.y),
  };
}

function agreementSignatureName(box: AssetSignatureBox, entry: AssetRequest): string {
  const slot = agreementSignatureSlotFromId(box.id);
  if (slot === 'employee') return entry.employeeName;
  if (slot === 'handover') return COMPANY_HANDOVER_NAME;
  return COMPANY_APPROVER_NAME;
}

function agreementSignatureRole(box: AssetSignatureBox): string {
  const slot = agreementSignatureSlotFromId(box.id);
  if (slot === 'employee') return 'พนักงานผู้รับมอบ';
  if (slot === 'handover') return 'ผู้ส่งมอบ';
  return 'ผู้มีอำนาจอนุมัติ';
}

function DraggableAgreementSignatureBox({
  box,
  entry,
  canvasRef,
  readOnly,
  selected,
  onMove,
  onDelete,
  onSelect,
}: {
  box: AssetSignatureBox;
  entry: AssetRequest;
  canvasRef: { current: HTMLDivElement | null };
  readOnly: boolean;
  selected: boolean;
  onMove: (id: string, geometry: AgreementSignatureGeometry) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const geometry = agreementSignatureGeometry(box);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

  function moveBox(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const page = canvasRef.current?.querySelector<HTMLElement>(`[data-agreement-page="${AGREEMENT_SIGNATURE_PAGE}"]`);
    if (!page) return;
    const bounds = page.getBoundingClientRect();
    const x = ((event.clientX - bounds.left - dragRef.current.offsetX) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top - dragRef.current.offsetY) / bounds.height) * 100;
    onMove(box.id, {
      page: AGREEMENT_SIGNATURE_PAGE,
      x: Math.max(0, Math.min(64, x)),
      y: Math.max(0, Math.min(94, y)),
    });
  }

  return (
    <div
      aria-label={`กล่องลายเซ็น${agreementSignatureRole(box)}`}
      className={`agreement-signature-text-box${selected ? ' is-selected' : ''}${readOnly ? ' is-read-only' : ''}`}
      onKeyDown={(event) => {
        if (!readOnly && !isFixedAgreementSignature(box) && (event.key === 'Delete' || event.key === 'Backspace')) {
          event.preventDefault();
          onDelete(box.id);
        }
      }}
      onPointerDown={(event) => {
        onSelect(box.id);
        if (readOnly) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        dragRef.current = { offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={moveBox}
      onPointerUp={(event) => {
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      style={{ left: `${geometry.x}%`, top: `${geometry.y}%` }}
      tabIndex={readOnly ? -1 : 0}
    >
      <FixedAssetFormSignature
        box={box}
        className="agreement-signature-text-box-content"
        name={agreementSignatureName(box, entry)}
        role={agreementSignatureRole(box)}
      />
    </div>
  );
}

function editableAssetFormCell({
  label,
  readOnly,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  readOnly: boolean;
  value: string | number;
  onChange: (value: string) => void;
  type?: 'number' | 'text';
}) {
  return readOnly ? (
    <span aria-label={label} className="asset-form-cell-value">
      {value}
    </span>
  ) : (
    <input
      aria-label={label}
      className="asset-form-cell-input"
      min={type === 'number' ? 1 : undefined}
      onChange={(event) => onChange(event.target.value)}
      type={type}
      value={value}
    />
  );
}

function AssetFormDocumentPage({
  entry,
  items,
  signatureBoxes,
  returnCondition,
  readOnly,
  onItemsChange,
}: {
  entry: AssetRequest;
  items: AssetItem[];
  signatureBoxes: AssetSignatureBox[];
  returnCondition?: AssetReturnCondition | null;
  readOnly: boolean;
  onItemsChange: (items: AssetItem[]) => void;
}) {
  const rows = Array.from(
    { length: ASSET_FORM_ROW_COUNT },
    (_, index) => items[index] ?? { name: '', quantity: 1, note: '' },
  );
  const filledRows = items.filter((item) => item.name.trim());
  const signatureBoxById = new Map(visibleAgreementSignatureBoxes(signatureBoxes).map((box) => [box.id, box]));

  function updateItem(index: number, patch: Partial<AssetItem>) {
    const next = rows.map((item, rowIndex) => (rowIndex === index ? { ...item, ...patch } : item));
    onItemsChange(next);
  }

  return (
    <section aria-label="แบบฟอร์มการขอยืมทรัพย์สิน" className="asset-form-document-page agreement-document-page">
      <FixedAgreementHeader />
      <header className="asset-form-document-heading">
        <h2>แบบฟอร์มการขอยืมทรัพย์สิน/วัสดุ ของบริษัท</h2>
        <p>วันที่ {formatThaiFormalDate(entry.formDate)}</p>
      </header>
      <div className="asset-form-intro">
        <p>
          ข้าพเจ้า <strong>นาย {entry.employeeName}</strong> ตำแหน่ง <strong>{entry.position || '-'}</strong>{' '}
          รหัสพนักงาน <strong>{entry.employeeCode}</strong> มีความประสงค์ จะขอยืมทรัพย์สิน/วัสดุของบริษัท ต.จรัสชัย
          สากลก่อสร้าง จำกัด เพื่อนำไปใช้{' '}
          <strong>{`ตั้งแต่วันที่ ${formatBorrowingPeriod(entry.fromDate, entry.toDate)}`}</strong> ตามรายการดังนี้
        </p>
      </div>
      <table className="asset-form-document-table">
        <thead>
          <tr>
            <th>
              <strong>ลำดับ</strong>
            </th>
            <th>รายการทรัพย์สิน/วัสดุ</th>
            <th>จำนวน</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => (
            <tr key={index}>
              <td>{item.name.trim() ? index + 1 : ''}</td>
              <td>
                {editableAssetFormCell({
                  label: `รายการทรัพย์สินในแบบฟอร์ม ${index + 1}`,
                  onChange: (value) => updateItem(index, { name: value }),
                  readOnly,
                  value: item.name,
                })}
              </td>
              <td>
                {editableAssetFormCell({
                  label: `จำนวนทรัพย์สินในแบบฟอร์ม ${index + 1}`,
                  onChange: (value) => updateItem(index, { quantity: Math.max(1, Number(value) || 1) }),
                  readOnly,
                  type: 'number',
                  value: item.name.trim() ? item.quantity : '',
                })}
              </td>
              <td>
                {editableAssetFormCell({
                  label: `หมายเหตุทรัพย์สินในแบบฟอร์ม ${index + 1}`,
                  onChange: (value) => updateItem(index, { note: value }),
                  readOnly,
                  value: item.note,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="asset-form-responsibility">
        รวมทั้งสิ้น <strong>{filledRows.length}</strong> รายการ โดยหากมีความเสียหายใด ๆ หรือมีการสูญหายเกิดขึ้น
        ข้าพเจ้าจะขอรับผิดชอบทั้งหมดทุกกรณีโดยไม่มีเงื่อนไข
        โดยจัดทำการซ่อมแซมให้ใช้การได้ดังเดิมหรือจัดหาทดแทนให้ครบตามจำนวนที่ยืม
      </p>
      <div className="asset-form-signature-row">
        <FixedAssetFormSignature box={signatureBoxById.get('employee')} name={entry.employeeName} role="ผู้ยืม" />
        <FixedAssetFormSignature
          box={signatureBoxById.get('admin')}
          name={
            isAssetFormOnly(entry.agreement)
              ? (signatureBoxById.get('admin')?.name ?? COMPANY_APPROVER_NAME)
              : COMPANY_APPROVER_NAME
          }
          role="ผู้อนุมัติ"
        />
      </div>
      <hr aria-hidden="true" className="asset-form-signature-divider" />
      <section className="asset-form-company-section">
        <strong>สำหรับบริษัท</strong>
        <p>ข้าพเจ้าได้รับทรัพย์สิน/วัสดุ/อุปกรณ์ ที่ได้ทำการยืม</p>
        <div className="asset-form-checks">
          {(Object.keys(returnConditionLabels) as AssetReturnCondition[]).map((condition) => (
            <span key={condition}>
              {returnConditionMark(returnCondition, condition)} {returnConditionLabels[condition]}
            </span>
          ))}
        </div>
        <p>
          หมายเหตุ
          ........................................................................................................................................
        </p>
        <div className="asset-form-signature-row asset-form-signature-row-bottom">
          <FixedAssetFormSignature
            box={signatureBoxById.get('employee')}
            name={entry.employeeName}
            role="ผู้ยืม"
            signatureData={signatureBoxById.get('employee')?.returnSignatureData ?? null}
            signedAt={signatureBoxById.get('employee')?.returnSignedAt ?? null}
          />
          <FixedAssetFormSignature
            box={signatureBoxById.get('admin')}
            name={
              isAssetFormOnly(entry.agreement)
                ? (signatureBoxById.get('admin')?.name ?? COMPANY_APPROVER_NAME)
                : COMPANY_APPROVER_NAME
            }
            role="ผู้อนุมัติ"
            signatureData={signatureBoxById.get('admin')?.returnSignatureData ?? null}
            signedAt={signatureBoxById.get('admin')?.returnSignedAt ?? null}
          />
        </div>
      </section>
    </section>
  );
}

function AgreementWebPreview({
  entry,
  items,
  title,
  body,
  documentDate,
}: {
  entry: AssetRequest;
  items: AssetItem[];
  title: string;
  body: string;
  documentDate: Date;
}) {
  const [bodyPageOneHtml, bodyPageTwoHtml] = splitAgreementBody(body);
  const agreementHtml = sanitizeAgreementPreviewHtml(`${bodyPageOneHtml}${bodyPageTwoHtml}`);
  const filledItems = items.filter((item) => item.name.trim());

  return (
    <section aria-label="เนื้อหา Agreement สำหรับอ่านบนเว็บไซต์" className="agreement-web-preview">
      <header className="agreement-web-preview-header">
        <div className="agreement-web-brand">
          <img alt="ตราบริษัท ต.จรัสชัย" src="/download.png" />
          <div>
            <span className="section-kicker">agreement</span>
            <strong>T.Jaruschai International Construction Co.,Ltd.</strong>
            <small>เอกสารสำหรับตรวจสอบก่อนลงชื่อ</small>
          </div>
        </div>
        <div className="agreement-web-date">
          <span>วันที่ในเอกสาร</span>
          <strong>{formatThaiFormalDate(documentDate)}</strong>
        </div>
      </header>

      <div className="agreement-web-title-block">
        <span className="section-kicker">รายละเอียดข้อตกลง</span>
        <h2>{formatAgreementTitle(title || 'ชื่อเอกสาร Agreement')}</h2>
        <p>อ่านรายละเอียดให้ครบก่อนลงชื่อรับมอบทรัพย์สิน</p>
      </div>

      <div className="agreement-web-meta-grid">
        <div className="agreement-web-meta-card">
          <span>ผู้ยืม</span>
          <strong>{entry.employeeName}</strong>
          <small>รหัสพนักงาน {entry.employeeCode}</small>
        </div>
        <div className="agreement-web-meta-card">
          <span>ตำแหน่ง / แผนก</span>
          <strong>{entry.position || '-'}</strong>
          <small>{entry.department || 'ไม่ระบุแผนก'}</small>
        </div>
        <div className="agreement-web-meta-card">
          <span>ช่วงเวลายืม</span>
          <strong>{formatThaiDate(entry.fromDate)}</strong>
          <small>{entry.toDate ? `ถึง ${formatThaiDate(entry.toDate)}` : 'ไม่ระบุวันสิ้นสุด'}</small>
        </div>
        <div className="agreement-web-meta-card">
          <span>เหตุผลการยืม</span>
          <strong>{entry.reason || 'ไม่ได้ระบุ'}</strong>
          <small>{entry.remarks || 'ไม่มีหมายเหตุเพิ่มเติม'}</small>
        </div>
      </div>

      <section className="agreement-web-section" aria-labelledby="agreement-web-items-title">
        <div className="agreement-web-section-heading">
          <div>
            <span className="section-kicker">ทรัพย์สิน</span>
            <h3 id="agreement-web-items-title">รายการที่ได้รับมอบ</h3>
          </div>
          <span className="agreement-web-count">{filledItems.length} รายการ</span>
        </div>
        {filledItems.length > 0 ? (
          <div className="agreement-web-table-wrap">
            <table className="agreement-web-items-table">
              <thead>
                <tr>
                  <th>ลำดับ</th>
                  <th>รายการทรัพย์สิน / วัสดุ</th>
                  <th>จำนวน</th>
                  <th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {filledItems.map((item, index) => (
                  <tr key={`${item.name}-${index}`}>
                    <td>{index + 1}</td>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>{item.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="agreement-web-empty">ไม่มีรายการทรัพย์สินที่ระบุไว้</p>
        )}
      </section>

      <article className="agreement-web-section agreement-web-content-section">
        <div className="agreement-web-section-heading">
          <div>
            <span className="section-kicker">เงื่อนไขและรายละเอียด</span>
            <h3>ข้อตกลงการรับมอบ</h3>
          </div>
        </div>
        <div className="agreement-web-rich-text" dangerouslySetInnerHTML={{ __html: agreementHtml }} />
      </article>
    </section>
  );
}

function TiptapDocxEditor({
  entry,
  items,
  signatureBoxes,
  returnCondition,
  title,
  body,
  readOnly,
  onChange,
  onSignatureAdd,
  onSignatureDelete,
  onSignatureMove,
  onTitleChange,
  onItemsChange,
}: {
  entry: AssetRequest;
  items: AssetItem[];
  signatureBoxes: AssetSignatureBox[];
  returnCondition?: AssetReturnCondition | null;
  title: string;
  body: string;
  readOnly: boolean;
  onChange: (surface: TiptapSurface, value: string) => void;
  onSignatureAdd?: (slot: AgreementSignatureSlot, page: AgreementPageNumber) => string | null;
  onSignatureDelete?: (id: string) => void;
  onSignatureMove?: (id: string, geometry: AgreementSignatureGeometry) => void;
  onTitleChange?: (value: string) => void;
  onItemsChange: (items: AssetItem[]) => void;
}) {
  const [activeSurface, setActiveSurface] = useState<TiptapSurface>('body');
  const [activeBodyPage, setActiveBodyPage] = useState<1 | 2>(1);
  const [canvasZoom, setCanvasZoom] = useState(100);
  const [activeSignatureId, setActiveSignatureId] = useState<string | null>(null);
  const bodyPageOneEditorRef = useRef<Editor | null>(null);
  const bodyPageTwoEditorRef = useRef<Editor | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [bodyPageOneHtml, bodyPageTwoHtml] = splitAgreementBody(body);
  const bodyPageOneEditor = useEditor({
    content: bodyPageOneHtml,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'เขียนเนื้อหา Agreement ที่นี่...' }),
      DocumentImage,
      TextStyleMark,
      ParagraphIndent,
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) =>
      onChange('body', joinAgreementBody(currentEditor.getHTML(), bodyPageTwoEditorRef.current?.getHTML() ?? '')),
  });
  bodyPageOneEditorRef.current = bodyPageOneEditor;
  const bodyPageTwoEditor = useEditor({
    content: bodyPageTwoHtml,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'เขียนเนื้อหา Agreement หน้าที่ 3 ที่นี่...' }),
      DocumentImage,
      TextStyleMark,
      ParagraphIndent,
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) =>
      onChange('body', joinAgreementBody(bodyPageOneEditorRef.current?.getHTML() ?? '', currentEditor.getHTML())),
  });
  bodyPageTwoEditorRef.current = bodyPageTwoEditor;
  useEffect(() => {
    [bodyPageOneEditor, bodyPageTwoEditor].forEach((editor) => editor?.setEditable(!readOnly));
  }, [bodyPageOneEditor, bodyPageTwoEditor, readOnly]);

  useEffect(() => {
    const [nextPageOneHtml, nextPageTwoHtml] = splitAgreementBody(body);
    if (bodyPageOneEditor && !bodyPageOneEditor.isFocused && bodyPageOneEditor.getHTML() !== nextPageOneHtml) {
      bodyPageOneEditor.commands.setContent(nextPageOneHtml, { emitUpdate: false });
    }
    if (bodyPageTwoEditor && !bodyPageTwoEditor.isFocused && bodyPageTwoEditor.getHTML() !== nextPageTwoHtml) {
      bodyPageTwoEditor.commands.setContent(nextPageTwoHtml, { emitUpdate: false });
    }
  }, [body, bodyPageOneEditor, bodyPageTwoEditor]);

  if (!bodyPageOneEditor || !bodyPageTwoEditor) {
    return <div className="tiptap-editor-loading">กำลังเตรียมพื้นที่เขียนเอกสาร...</div>;
  }

  const activeEditor = activeBodyPage === 1 ? bodyPageOneEditor : bodyPageTwoEditor;

  function runOnActive(command: (editor: Editor) => void) {
    if (activeEditor) command(activeEditor);
  }

  function applyTextStyle(attributes: { fontFamily?: string | null; fontSize?: string | null }) {
    runOnActive((editor) => editor.chain().focus().setMark('textStyle', attributes).run());
  }

  function adjustParagraphIndent(editor: Editor, direction: 'increase' | 'decrease') {
    const nodeType = editor.isActive('heading') ? 'heading' : 'paragraph';
    const currentIndent = Number.parseInt(String(editor.getAttributes(nodeType).textIndent ?? '0'), 10) || 0;
    const nextIndent = Math.max(0, Math.min(120, currentIndent + (direction === 'increase' ? 12 : -12)));
    editor
      .chain()
      .focus()
      .updateAttributes(nodeType, { textIndent: nextIndent > 0 ? `${nextIndent}px` : null })
      .run();
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent) {
    if (readOnly || event.key !== 'Tab') return;
    event.preventDefault();
    adjustParagraphIndent(activeEditor, event.shiftKey ? 'decrease' : 'increase');
  }

  const activeTextStyle = activeEditor.getAttributes('textStyle') as {
    fontFamily?: string | null;
    fontSize?: string | null;
  };

  function renderAgreementSignatures(page: AgreementPageNumber) {
    return (
      <div className="agreement-signature-layer">
        {visibleAgreementSignatureBoxes(signatureBoxes)
          .filter((box) => agreementSignatureGeometry(box).page === page)
          .map((box) => (
            <DraggableAgreementSignatureBox
              box={box}
              canvasRef={canvasRef}
              entry={entry}
              key={box.id}
              onDelete={onSignatureDelete ?? (() => undefined)}
              onMove={onSignatureMove ?? (() => undefined)}
              onSelect={(id) => {
                setActiveSignatureId(id);
                setActiveBodyPage(page === 2 ? 1 : 2);
              }}
              readOnly={readOnly}
              selected={activeSignatureId === box.id}
            />
          ))}
      </div>
    );
  }

  return (
    <>
      <div className={`tiptap-docx-editor${readOnly ? ' is-read-only' : ''}`}>
        {!readOnly ? (
          <div aria-label="เครื่องมือจัดรูปแบบเอกสาร" className="tiptap-toolbar">
            <IconButton
              aria-label="ลดขนาดหน้าเอกสาร"
              onClick={() => setCanvasZoom((value) => Math.max(70, value - 10))}
              size="small"
              title="ลดขนาดหน้าเอกสาร"
            >
              <ZoomOutRounded fontSize="small" />
            </IconButton>
            <span className="tiptap-zoom-value">{canvasZoom}%</span>
            <IconButton
              aria-label="เพิ่มขนาดหน้าเอกสาร"
              onClick={() => setCanvasZoom((value) => Math.min(150, value + 10))}
              size="small"
              title="เพิ่มขนาดหน้าเอกสาร"
            >
              <ZoomInRounded fontSize="small" />
            </IconButton>
            <Divider flexItem orientation="vertical" />
            <IconButton
              aria-label="ย้อนกลับ"
              onClick={() => runOnActive((editor) => editor.chain().focus().undo().run())}
              size="small"
              title="ย้อนกลับ"
            >
              <UndoRounded fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="ทำซ้ำ"
              onClick={() => runOnActive((editor) => editor.chain().focus().redo().run())}
              size="small"
              title="ทำซ้ำ"
            >
              <RedoRounded fontSize="small" />
            </IconButton>
            <Divider flexItem orientation="vertical" />
            <Select
              aria-label="รูปแบบข้อความ"
              className="tiptap-style-select"
              onChange={(event) => {
                const value = event.target.value;
                runOnActive((editor) =>
                  value === 'paragraph'
                    ? editor.chain().focus().setParagraph().run()
                    : editor
                        .chain()
                        .focus()
                        .toggleHeading({ level: Number(value) as 2 | 3 })
                        .run(),
                );
              }}
              size="small"
              value={
                activeEditor.isActive('heading', { level: 2 })
                  ? '2'
                  : activeEditor.isActive('heading', { level: 3 })
                    ? '3'
                    : 'paragraph'
              }
            >
              <MenuItem value="paragraph">ปกติ</MenuItem>
              <MenuItem value="2">หัวข้อ 1</MenuItem>
              <MenuItem value="3">หัวข้อ 2</MenuItem>
            </Select>
            <Select
              aria-label="Font Family"
              className="tiptap-style-select tiptap-font-family-select"
              onChange={(event) => applyTextStyle({ fontFamily: event.target.value || null })}
              size="small"
              value={activeTextStyle.fontFamily ?? ''}
            >
              <MenuItem value="">Default</MenuItem>
              {fontFamilyOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
            <Select
              aria-label="Font Size"
              className="tiptap-style-select tiptap-font-size-select"
              onChange={(event) => applyTextStyle({ fontSize: event.target.value || null })}
              size="small"
              value={activeTextStyle.fontSize ?? '16px'}
            >
              {fontSizeOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {option.replace('px', '')}
                </MenuItem>
              ))}
            </Select>
            <IconButton
              aria-label="ตัวหนา"
              className={activeEditor.isActive('bold') ? 'is-active' : ''}
              onClick={() => runOnActive((editor) => editor.chain().focus().toggleBold().run())}
              size="small"
              title="ตัวหนา"
            >
              <FormatBoldRounded fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="ตัวเอียง"
              className={activeEditor.isActive('italic') ? 'is-active' : ''}
              onClick={() => runOnActive((editor) => editor.chain().focus().toggleItalic().run())}
              size="small"
              title="ตัวเอียง"
            >
              <FormatItalicRounded fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="ขีดเส้นใต้"
              className={activeEditor.isActive('underline') ? 'is-active' : ''}
              onClick={() => runOnActive((editor) => editor.chain().focus().toggleUnderline().run())}
              size="small"
              title="ขีดเส้นใต้"
            >
              <FormatUnderlinedRounded fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="ขีดฆ่า"
              className={activeEditor.isActive('strike') ? 'is-active' : ''}
              onClick={() => runOnActive((editor) => editor.chain().focus().toggleStrike().run())}
              size="small"
              title="ขีดฆ่า"
            >
              <FormatStrikethroughRounded fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="ล้างรูปแบบ"
              onClick={() => runOnActive((editor) => editor.chain().focus().unsetAllMarks().run())}
              size="small"
              title="ล้างรูปแบบ"
            >
              <FormatClearRounded fontSize="small" />
            </IconButton>
            <Divider flexItem orientation="vertical" />
            <IconButton
              aria-label="รายการหัวข้อ"
              className={activeEditor.isActive('bulletList') ? 'is-active' : ''}
              onClick={() => runOnActive((editor) => editor.chain().focus().toggleBulletList().run())}
              size="small"
              title="รายการหัวข้อ"
            >
              <FormatListBulletedRounded fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="รายการลำดับเลข"
              className={activeEditor.isActive('orderedList') ? 'is-active' : ''}
              onClick={() => runOnActive((editor) => editor.chain().focus().toggleOrderedList().run())}
              size="small"
              title="รายการลำดับเลข"
            >
              <FormatListNumberedRounded fontSize="small" />
            </IconButton>
            <Divider flexItem orientation="vertical" />
            <IconButton
              aria-label="จัดชิดซ้าย"
              className={activeEditor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}
              onClick={() => runOnActive((editor) => editor.chain().focus().setTextAlign('left').run())}
              size="small"
              title="จัดชิดซ้าย"
            >
              <FormatAlignLeftRounded fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="จัดกึ่งกลาง"
              className={activeEditor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}
              onClick={() => runOnActive((editor) => editor.chain().focus().setTextAlign('center').run())}
              size="small"
              title="จัดกึ่งกลาง"
            >
              <FormatAlignCenterRounded fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="จัดชิดขวา"
              className={activeEditor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}
              onClick={() => runOnActive((editor) => editor.chain().focus().setTextAlign('right').run())}
              size="small"
              title="จัดชิดขวา"
            >
              <FormatAlignRightRounded fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="จัดเต็มบรรทัด"
              className={activeEditor.isActive({ textAlign: 'justify' }) ? 'is-active' : ''}
              onClick={() => runOnActive((editor) => editor.chain().focus().setTextAlign('justify').run())}
              size="small"
              title="จัดเต็มบรรทัด"
            >
              <FormatAlignJustifyRounded fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="ลดระยะย่อหน้า"
              onClick={() => runOnActive((editor) => adjustParagraphIndent(editor, 'decrease'))}
              size="small"
              title="ลดระยะย่อหน้า"
            >
              <FormatIndentDecreaseRounded fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="เพิ่มระยะย่อหน้า"
              onClick={() => runOnActive((editor) => adjustParagraphIndent(editor, 'increase'))}
              size="small"
              title="เพิ่มระยะย่อหน้า"
            >
              <FormatIndentIncreaseRounded fontSize="small" />
            </IconButton>
            <span className="tiptap-active-surface">กำลังแก้ไข: {tiptapSurfaceLabels[activeSurface]}</span>
            <div className="tiptap-field-menu" aria-label="ช่องข้อมูลอัตโนมัติ">
              {agreementFieldTokens.map(({ token, label }) => (
                <Button
                  className="tiptap-field-button"
                  key={token}
                  onClick={() => runOnActive((editor) => editor.chain().focus().insertContent(token).run())}
                  size="small"
                  title={`แทรก ${label}`}
                  variant="text"
                >
                  + {label}
                </Button>
              ))}
              {agreementSignatureTokens.map(({ token, label, slot }) => (
                <Button
                  className={`tiptap-field-button tiptap-signature-insert-button${activeSignatureId === slot ? ' is-selected' : ''}`}
                  key={token}
                  onClick={() => {
                    const id = onSignatureAdd?.(slot, AGREEMENT_SIGNATURE_PAGE) ?? null;
                    setActiveSignatureId(id ?? slot);
                  }}
                  size="small"
                  title={`เพิ่มกล่อง${label} ที่หน้า Agreement หน้าสุดท้าย`}
                  variant="text"
                >
                  + {label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="tiptap-docx-canvas" ref={canvasRef} style={{ zoom: readOnly ? '100%' : `${canvasZoom}%` }}>
          <AssetFormDocumentPage
            entry={entry}
            items={items}
            onItemsChange={onItemsChange}
            readOnly={readOnly}
            returnCondition={returnCondition}
            signatureBoxes={signatureBoxes}
          />
          <div
            className="tiptap-docx-page agreement-document-page"
            data-agreement-page="2"
            onPointerDown={() => setActiveBodyPage(1)}
          >
            <FixedAgreementHeader />
            {readOnly ? (
              <div className="tiptap-document-title">{formatAgreementTitle(title || 'ชื่อเอกสาร Agreement')}</div>
            ) : (
              <textarea
                aria-label="ชื่อเอกสารบนหน้า Agreement"
                className="tiptap-document-title tiptap-document-title-input"
                onChange={(event) => onTitleChange?.(event.target.value)}
                placeholder="ชื่อเอกสาร Agreement"
                rows={Math.max(1, formatAgreementTitle(title).split(/\r?\n/).length)}
                value={formatAgreementTitle(title)}
              />
            )}
            <section
              aria-label="แก้ไขเนื้อหาเอกสาร"
              className={`tiptap-document-region tiptap-body-region${activeSurface === 'body' ? ' is-active' : ''}`}
              onFocus={() => {
                setActiveSurface('body');
                setActiveBodyPage(1);
              }}
            >
              <EditorContent
                aria-label="เนื้อหา Agreement หน้า 2"
                className="tiptap-editor-content"
                editor={bodyPageOneEditor}
                onKeyDown={handleEditorKeyDown}
              />
            </section>
            {renderAgreementSignatures(2)}
          </div>
          <div
            className="tiptap-docx-page tiptap-docx-page-three agreement-document-page"
            data-agreement-page="3"
            onPointerDown={() => setActiveBodyPage(2)}
          >
            <FixedAgreementHeader />
            <section
              aria-label="แก้ไขเนื้อหาเอกสารหน้า 3"
              className={`tiptap-document-region tiptap-body-region tiptap-body-region-page-three${activeSurface === 'body' && activeBodyPage === 2 ? ' is-active' : ''}`}
              onFocus={() => {
                setActiveSurface('body');
                setActiveBodyPage(2);
              }}
            >
              <EditorContent
                aria-label="เนื้อหา Agreement หน้า 3"
                className="tiptap-editor-content"
                editor={bodyPageTwoEditor}
                onKeyDown={handleEditorKeyDown}
              />
            </section>
            {renderAgreementSignatures(3)}
          </div>
        </div>
      </div>
    </>
  );
}

function AgreementEditor({
  entry,
  items,
  draft,
  onChange,
  onItemsChange,
  readOnly,
}: {
  entry: AssetRequest;
  items: AssetItem[];
  draft: AssetAgreement;
  onChange: (next: AssetAgreement) => void;
  onItemsChange: (items: AssetItem[]) => void;
  readOnly: boolean;
}) {
  const draftRef = useRef(draft);
  draftRef.current = draft;

  function commitDraft(next: AssetAgreement) {
    draftRef.current = next;
    onChange(next);
  }

  function removeSignature(id: string) {
    const box = draftRef.current.signatureBoxes.find((candidate) => candidate.id === id);
    if (!box || box.status === 'signed') return;
    commitDraft({
      ...draftRef.current,
      signatureBoxes: draftRef.current.signatureBoxes.filter((candidate) => candidate.id !== id),
    });
  }

  function updateSignatureGeometry(id: string, geometry: AgreementSignatureGeometry) {
    const currentBox = draftRef.current.signatureBoxes.find((box) => box.id === id);
    if (!currentBox) return;
    commitDraft({
      ...draftRef.current,
      signatureBoxes: draftRef.current.signatureBoxes.map((box) => (box.id === id ? { ...box, ...geometry } : box)),
    });
  }

  function addSignatureBox(slot: AgreementSignatureSlot): string | null {
    const source = draftRef.current.signatureBoxes.find((box) => box.id === slot);
    if (!source) return null;
    const signaturePage = AGREEMENT_SIGNATURE_PAGE;
    const sameSlotCount = visibleAgreementSignatureBoxes(draftRef.current.signatureBoxes).filter(
      (box) => agreementSignatureSlotFromId(box.id) === slot,
    ).length;
    const pageBoxCount = visibleAgreementSignatureBoxes(draftRef.current.signatureBoxes).filter(
      (box) => agreementSignatureGeometry(box).page === signaturePage,
    ).length;
    let id = `${slot}-${Date.now()}`;
    while (draftRef.current.signatureBoxes.some((box) => box.id === id)) id = `${slot}-${Date.now()}-${Math.random()}`;
    commitDraft({
      ...draftRef.current,
      signatureBoxes: [
        ...draftRef.current.signatureBoxes,
        {
          ...source,
          id,
          label: `${source.label} ${sameSlotCount + 1}`,
          page: signaturePage,
          x: 10 + (pageBoxCount % 3) * 26,
          y: 12 + Math.floor(pageBoxCount / 3) * 14,
          status: source.signer === 'employee' ? 'pending' : 'locked',
          signedAt: null,
          signatureData: undefined,
          returnSignatureData: undefined,
          returnSignedAt: null,
        },
      ],
    });
    return id;
  }

  return (
    <div className="agreement-editor-content">
      <div className="editor-section-heading">
        <div>
          <span className="section-kicker">document content</span>
          <Typography component="h2" variant="h6">
            เขียนข้อตกลง
          </Typography>
        </div>
        <Chip icon={<EditNoteRounded />} label="Tiptap DocX Editor" size="small" variant="outlined" />
      </div>
      <TextField
        disabled={readOnly}
        fullWidth
        InputLabelProps={{ shrink: true }}
        label="วันที่ในเอกสาร"
        onChange={(event) => {
          const date = parseDateInput(event.target.value);
          if (date) onChange({ ...draft, documentDate: date });
        }}
        type="date"
        value={formatDateInput(draft.documentDate)}
      />
      <div className="tiptap-field">
        <Typography className="tiptap-field-label" component="div">
          เอกสารยืมทรัพย์สิน + Agreement
        </Typography>
        <TiptapDocxEditor
          body={readOnly ? fillAgreementFields(draft.body, entry, draft.documentDate) : draft.body}
          entry={entry}
          items={items}
          onChange={(surface, value) => commitDraft({ ...draftRef.current, [surface]: value })}
          onSignatureAdd={addSignatureBox}
          onSignatureDelete={removeSignature}
          onSignatureMove={updateSignatureGeometry}
          onItemsChange={onItemsChange}
          onTitleChange={(value) => commitDraft({ ...draftRef.current, title: value })}
          readOnly={readOnly}
          returnCondition={draft.returnCondition}
          signatureBoxes={draft.signatureBoxes}
          title={draft.title}
        />
        <Typography className="tiptap-field-helper" color="text.secondary" component="div">
          Header ทั้ง 3 หน้าเป็นแบบคงที่ตามหน้าแรก ส่วนเนื้อหา Agreement แก้ไขได้เฉพาะผู้จัดทำ ข้อมูลทั้งหมดบันทึกเป็น
          metadata ลงฐานข้อมูล
        </Typography>
      </div>
    </div>
  );
}

export default function AssetPage() {
  const { session } = useEmployeeSession();
  const location = useLocation();
  const navigate = useNavigate();
  const { agreementId } = useParams<{ agreementId?: string }>();
  const queryClient = useQueryClient();
  const [borrowDialogOpen, setBorrowDialogOpen] = useState(false);
  const [borrowForm, setBorrowForm] = useState<BorrowFormState>(initialBorrowForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [returnDialog, setReturnDialog] = useState<AssetRequest | null>(null);
  const [returnInspection, setReturnInspection] = useState('');
  const [returnCondition, setReturnCondition] = useState<AssetReturnCondition | null>(null);
  const [returnImageUrl, setReturnImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [agreementDraft, setAgreementDraft] = useState<AssetAgreement | null>(null);
  const [agreementDraftEntryId, setAgreementDraftEntryId] = useState<string | null>(null);
  const [assetItemsDraft, setAssetItemsDraft] = useState<AssetItem[]>([]);
  const [assetItemsDraftEntryId, setAssetItemsDraftEntryId] = useState<string | null>(null);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreementFilter, setAgreementFilter] = useState<AgreementFilter>('all');
  const [agreementPreviewOpen, setAgreementPreviewOpen] = useState(false);
  const [printingAgreement, setPrintingAgreement] = useState(false);
  const [signatureDialog, setSignatureDialog] = useState<AssetAgreementParticipant | null>(null);
  const [formSignatureMode, setFormSignatureMode] = useState<'request' | 'approve' | null>(null);
  const [returnSignatureDialog, setReturnSignatureDialog] = useState<ReturnSignatureParticipant | null>(null);
  const [signatureMethod, setSignatureMethod] = useState<'draw' | 'type' | 'upload'>('draw');
  const [signatureDraft, setSignatureDraft] = useState('');
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [typedSignature, setTypedSignature] = useState('');
  const [signaturePadVersion, setSignaturePadVersion] = useState(0);
  const [agreementReadConfirmed, setAgreementReadConfirmed] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [selectedEmployeeCodes, setSelectedEmployeeCodes] = useState<string[]>([]);
  const migratingAgreementIdsRef = useRef(new Set<string>());
  const migratedAgreementIdsRef = useRef(new Set<string>());
  const failedAgreementMigrationIdsRef = useRef(new Set<string>());
  const manager = Boolean(session && hasSupervisorAccess(session.permission, session.employee.position));
  const admin = Boolean(session && hasPermission(session.permission, 'admin'));
  const managementMode = location.pathname.startsWith('/app/asset/manage');
  const manageAgreements = managementMode && admin;
  const agreementDetailOpen = manageAgreements && Boolean(agreementId);
  const agreementViewOpen = agreementDetailOpen || agreementOpen;
  const queryKey = useMemo(
    () => ['asset-requests', session?.employee.code ?? '', managementMode],
    [managementMode, session?.employee.code],
  );
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (manageAgreements) return assetRepository.listAll();
      if (manager) {
        const [allEntries, ownedEntries] = await Promise.all([
          assetRepository.listAll(),
          assetRepository.listForAgreementParticipant('employee', session!.employee.code, session!.employee.name),
        ]);
        const onBehalfEntries = allEntries.filter(
          (entry) => entry.agreement && ['waitingHandover', 'waitingAdmin'].includes(entry.agreement.status),
        );
        return Array.from(new Map([...ownedEntries, ...onBehalfEntries].map((entry) => [entry.id, entry])).values());
      }
      const [ownedEntries, handoverEntries] = await Promise.all([
        assetRepository.listForAgreementParticipant('employee', session!.employee.code, session!.employee.name),
        assetRepository.listForAgreementParticipant('handover', session!.employee.code, session!.employee.name),
      ]);
      return Array.from(new Map([...ownedEntries, ...handoverEntries].map((entry) => [entry.id, entry])).values());
    },
    enabled: Boolean(session),
  });
  const employeesQuery = useQuery({
    queryKey: ['asset-employees'],
    queryFn: () => employeeRepository.listAll(),
    enabled: manageAgreements && borrowDialogOpen,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!manageAgreements && !selectedId && query.data?.[0]) setSelectedId(query.data[0].id);
    const unseenIds = query.data?.filter((entry) => !entry.seen).map((entry) => entry.id) ?? [];
    if (unseenIds.length === 0) return;
    void assetApplicationService
      .markSeen(unseenIds)
      .then(() => queryClient.invalidateQueries({ queryKey }))
      .catch(() => undefined);
  }, [manageAgreements, query.data, queryClient, queryKey, selectedId]);

  const agreementEntries = useMemo(() => query.data?.filter((entry) => entry.agreement) ?? [], [query.data]);
  const filteredAgreementEntries = useMemo(
    () => agreementEntries.filter((entry) => matchesAssetAgreementFilter(entry, agreementFilter)),
    [agreementEntries, agreementFilter],
  );
  const agreementFilterCounts = useMemo(
    () =>
      (Object.keys(agreementFilterLabels) as AgreementFilter[]).reduce(
        (counts, filter) => {
          counts[filter] = agreementEntries.filter((entry) => matchesAssetAgreementFilter(entry, filter)).length;
          return counts;
        },
        {} as Record<AgreementFilter, number>,
      ),
    [agreementEntries],
  );

  useEffect(() => {
    if (!manageAgreements) return;
    const legacyEntries = agreementEntries.filter(
      (entry) =>
        !migratedAgreementIdsRef.current.has(entry.id) &&
        !migratingAgreementIdsRef.current.has(entry.id) &&
        !failedAgreementMigrationIdsRef.current.has(entry.id) &&
        entry.agreement &&
        hasInlineSignatureData(entry.agreement.signatureBoxes),
    );
    if (legacyEntries.length === 0) return;

    legacyEntries.forEach((entry) => migratingAgreementIdsRef.current.add(entry.id));
    void Promise.allSettled(
      legacyEntries.map(async (entry) => {
        try {
          const migrated = await migrateLegacyAgreementSignatures(entry);
          if (migrated) migratedAgreementIdsRef.current.add(entry.id);
          return migrated;
        } finally {
          migratingAgreementIdsRef.current.delete(entry.id);
        }
      }),
    ).then((results) => {
      if (results.some((result) => result.status === 'fulfilled' && result.value)) {
        setSavedMessage('กำลังย้ายลายเซ็นเดิมไปเก็บเป็นรูปภาพใน ImgBB แล้ว');
        void queryClient.invalidateQueries({ queryKey });
      }
      const failures = results
        .map((result, index) => {
          if (result.status !== 'rejected') return null;
          failedAgreementMigrationIdsRef.current.add(legacyEntries[index].id);
          return result.reason instanceof Error ? result.reason.message : 'ไม่ทราบสาเหตุ';
        })
        .filter((message): message is string => Boolean(message));
      if (failures.length > 0) {
        setFormError(`ย้ายลายเซ็นเดิมไป ImgBB ไม่สำเร็จ: ${failures[0]}`);
      }
    });
  }, [agreementEntries, manageAgreements, queryClient, queryKey]);

  const selectedEntry = manageAgreements
    ? (agreementEntries.find((entry) => entry.id === agreementId) ?? null)
    : (query.data?.find((entry) => entry.id === selectedId) ?? query.data?.[0] ?? null);

  useEffect(() => {
    if (
      !selectedEntry?.agreement ||
      !migratedAgreementIdsRef.current.has(selectedEntry.id) ||
      hasInlineSignatureData(selectedEntry.agreement.signatureBoxes) ||
      agreementDraftEntryId !== selectedEntry.id
    ) {
      return;
    }
    setAgreementDraft(selectedEntry.agreement);
  }, [agreementDraftEntryId, selectedEntry]);

  useEffect(() => {
    setAgreementReadConfirmed(false);
  }, [selectedEntry?.id]);

  useEffect(() => {
    if (!selectedEntry) {
      if (managementMode && !query.isPending) {
        setAgreementDraft(null);
        setAgreementDraftEntryId(null);
        setAssetItemsDraft([]);
        setAssetItemsDraftEntryId(null);
      }
      return;
    }
    if (agreementDraftEntryId !== selectedEntry.id) {
      setAgreementDraft(selectedEntry.agreement ?? createDefaultBorrowAgreement(selectedEntry, COMPANY_BORROW_AGREEMENT));
      setAgreementDraftEntryId(selectedEntry.id);
    }
    if (assetItemsDraftEntryId !== selectedEntry.id) {
      setAssetItemsDraft(parseAssetItems(selectedEntry.items));
      setAssetItemsDraftEntryId(selectedEntry.id);
    }
  }, [agreementDraftEntryId, assetItemsDraftEntryId, managementMode, query.isPending, selectedEntry]);

  const createMutation = useMutation({
    mutationFn: (input: AssetBorrowRequestSubmission) => assetApplicationService.submitBorrowRequests(input),
    onSuccess: async (entries) => {
      setBorrowDialogOpen(false);
      setFormSignatureMode(null);
      if (manageAgreements && entries[0]) {
        setAgreementDraft(entries[0].agreement ?? createDefaultBorrowAgreement(entries[0], COMPANY_BORROW_AGREEMENT));
        setAgreementDraftEntryId(entries[0].id);
        setAssetItemsDraft(parseAssetItems(entries[0].items));
        setAssetItemsDraftEntryId(entries[0].id);
        navigate(`/app/asset/manage/${encodeURIComponent(entries[0].id)}`);
      } else {
        const createdEntry = entries[0];
        setSelectedId(createdEntry?.id ?? null);
        if (createdEntry?.agreement && !isAssetFormOnly(createdEntry.agreement)) {
          setAgreementDraft(createdEntry.agreement);
          setAgreementDraftEntryId(createdEntry.id);
          setAssetItemsDraft(parseAssetItems(createdEntry.items));
          setAssetItemsDraftEntryId(createdEntry.id);
          setAgreementOpen(true);
        }
      }
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const transitionMutation = useMutation({
    mutationFn: (input: {
      entry: AssetRequest;
      status: Exclude<AssetStatus, 'unknown'>;
      returnInspection?: string;
      imageUrl?: string;
    }) =>
      assetApplicationService.changeStatus(input.entry, {
        id: input.entry.id,
        status: input.status,
        actorName: session!.employee.name,
        returnInspector: input.status === 'returned' ? session!.employee.name : '',
        approvedReturnBy: input.status === 'returned' ? session!.employee.name : '',
        imageUrl: input.imageUrl ?? '',
        approvedBorrowDate: input.status === 'approved' ? new Date() : null,
        returnInspection: input.returnInspection,
      }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey }),
  });
  const returnConfirmationMutation = useMutation({
    mutationFn: async (input: {
      entry: AssetRequest;
      agreement?: AssetAgreement;
      returnInspection: string;
      imageUrl: string;
    }) => {
      if (input.agreement) {
        await assetApplicationService.confirmReturn({
          entry: input.entry,
          agreement: input.agreement,
          returnInspector: session!.employee.name,
          approvedReturnBy: session!.employee.name,
          imageUrl: input.imageUrl,
          returnInspection: input.returnInspection,
        });
      } else {
        await assetApplicationService.changeStatus(input.entry, {
          id: input.entry.id,
          status: 'returned',
          actorName: session!.employee.name,
          returnInspector: session!.employee.name,
          approvedReturnBy: session!.employee.name,
          imageUrl: input.imageUrl,
          approvedBorrowDate: null,
          returnInspection: input.returnInspection,
        });
      }
      return input.agreement;
    },
    onSuccess: async (nextAgreement) => {
      if (nextAgreement) setAgreementDraft({ ...nextAgreement, updatedAt: new Date() });
      setReturnDialog(null);
      setReturnCondition(null);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const removeMutation = useMutation({
    mutationFn: (entry: AssetRequest) => assetApplicationService.remove(entry.id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey }),
  });
  const agreementMutation = useMutation({
    mutationFn: async (input: { entry: AssetRequest; agreement: AssetAgreement; items: string }) => {
      await assetApplicationService.updateRequestDetails(input.entry.id, input.items, input.agreement);
    },
    onSuccess: async () => {
      setAgreementDraft((current) => (current ? { ...current, updatedAt: new Date() } : current));
      setSavedMessage('บันทึก Agreement ลงฐานข้อมูลแล้ว');
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const signAgreementMutation = useMutation({
    mutationFn: async (input: { entry: AssetRequest; signer: AssetAgreementParticipant; signatureData: string }) => {
      if (!agreementDraft) throw new Error('ไม่พบข้อมูล Agreement');
      return assetApplicationService.signAgreement({
        entry: input.entry,
        agreement: agreementDraft,
        signer: input.signer,
        signatureData: input.signatureData,
        actorName: session!.employee.name,
        actorEmployeeCode: session!.employee.code,
        actorIsAdmin: admin,
        actorCanManageRequests: manager,
        storeSignature: storeSignatureData,
      });
    },
    onSuccess: async (nextAgreement, input) => {
      setAgreementDraft({ ...nextAgreement, updatedAt: new Date() });
      setSignatureDialog(null);
      setSignatureDraft('');
      setTypedSignature('');
      setSavedMessage(
        input.signer === 'handover'
          ? 'ผู้ส่งมอบลงชื่อแล้ว รายการเปิดให้ผู้ยืมเซ็นต่อ'
          : input.signer === 'employee'
            ? 'ผู้ยืมลงชื่อแล้ว รายการรอผู้อนุมัติเซ็นต่อ'
            : 'ผู้อนุมัติลงชื่อแล้ว Agreement เสร็จสมบูรณ์',
      );
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const approveFormMutation = useMutation({
    mutationFn: async (input: { entry: AssetRequest; signatureData: string }) => {
      if (!manager) throw new Error('เฉพาะผู้อนุมัติเท่านั้นที่ลงชื่อได้');
      await assetApplicationService.approveFormRequest(input.entry.id, session!.employee.name, input.signatureData);
    },
    onSuccess: async () => {
      setFormSignatureMode(null);
      setSignatureDraft('');
      setSavedMessage('ผู้อนุมัติลงชื่อแล้ว รายการพร้อมรอคืน');
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const signReturnMutation = useMutation({
    mutationFn: async (input: { entry: AssetRequest; signer: ReturnSignatureParticipant; signatureData: string }) => {
      if (!agreementDraft) throw new Error('ไม่พบข้อมูล Agreement สำหรับบันทึกลายเซ็นคืน');
      return assetApplicationService.signReturn({
        entry: input.entry,
        agreement: agreementDraft,
        signer: input.signer,
        signatureData: input.signatureData,
        actorName: session!.employee.name,
        actorEmployeeCode: session!.employee.code,
        actorCanManageRequests: manager,
        storeSignature: storeSignatureData,
      });
    },
    onSuccess: async (nextAgreement, input) => {
      setAgreementDraft({ ...nextAgreement, updatedAt: new Date() });
      setReturnSignatureDialog(null);
      setSignatureDraft('');
      setTypedSignature('');
      setSavedMessage(
        input.signer === 'employee'
          ? 'ผู้ยืมเซ็นคืนแล้ว รายการรอผู้อนุมัติเซ็นรับคืน'
          : 'ผู้อนุมัติเซ็นรับคืนแล้ว กรุณาตรวจสภาพและยืนยันรับคืน',
      );
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  if (!session) return null;
  const currentSession = session;
  const busy =
    createMutation.isPending ||
    transitionMutation.isPending ||
    removeMutation.isPending ||
    agreementMutation.isPending ||
    signAgreementMutation.isPending ||
    approveFormMutation.isPending ||
    signReturnMutation.isPending ||
    returnConfirmationMutation.isPending;
  const employeePickerBlocked =
    manageAgreements && (employeesQuery.isPending || employeesQuery.isError || !employeesQuery.data?.length);
  const visibleEntries = manageAgreements ? agreementEntries : (query.data ?? []);
  const adminOwnBorrow = Boolean(
    admin &&
    selectedEntry &&
    selectedEntry.employeeCode.trim().toLowerCase() === currentSession.employee.code.trim().toLowerCase(),
  );
  const ownsSelectedEntry = Boolean(
    selectedEntry &&
    selectedEntry.employeeCode.trim().toLowerCase() === currentSession.employee.code.trim().toLowerCase(),
  );
  const canSignHandoverStep = Boolean(manager && agreementDraft?.status === 'waitingHandover');
  const canSignEmployeeStep = Boolean(agreementDraft?.status === 'waitingEmployee' && ownsSelectedEntry);
  const canSignAdminStep = Boolean(manager && agreementDraft?.status === 'waitingAdmin');
  const canExportAgreement = Boolean(agreementDraft && canExportAgreementDocument(agreementDraft.signatureBoxes));
  const agreementEditable = Boolean(
    agreementDraft &&
    canEditAgreement(
      admin,
      manageAgreements,
      agreementDraft.status,
      agreementDraft.signatureBoxes.some((box) => box.status === 'signed'),
    ),
  );
  const entryCount = visibleEntries.length;
  const pendingCount = visibleEntries.filter((entry) =>
    manageAgreements
      ? isAssetFormOnly(entry.agreement)
        ? entry.status === 'pending'
        : entry.agreement?.status === 'waitingEmployee'
      : entry.status === 'pending',
  ).length;
  const agreementCount = visibleEntries.filter(
    (entry) => entry.status === 'approved' && (!entry.agreement || entry.agreement.status === 'completed'),
  ).length;
  const mutationError =
    createMutation.error ??
    transitionMutation.error ??
    removeMutation.error ??
    agreementMutation.error ??
    signAgreementMutation.error ??
    approveFormMutation.error ??
    signReturnMutation.error ??
    returnConfirmationMutation.error;

  const returnEmployeeBox = agreementDraft?.signatureBoxes.find((box) => box.id === 'employee');
  const returnAdminBox = agreementDraft?.signatureBoxes.find((box) => box.id === 'admin');
  const returnEmployeeSigned = Boolean(returnEmployeeBox?.returnSignatureData);
  const returnAdminSigned = Boolean(returnAdminBox?.returnSignatureData);
  const returnSignatureReady = returnEmployeeSigned && returnAdminSigned;
  const canSignReturnEmployee = Boolean(
    selectedEntry?.status === 'returnPending' && ownsSelectedEntry && !returnEmployeeSigned,
  );
  const canSignReturnAdmin = Boolean(
    selectedEntry?.status === 'returnPending' && manager && returnEmployeeSigned && !returnAdminSigned,
  );

  function openBorrowDialog() {
    setBorrowForm({ ...initialBorrowForm, fromDate: formatDateInput(new Date()), toDate: '' });
    setSelectedEmployeeCodes([]);
    setAgreementOpen(false);
    setAgreementPreviewOpen(false);
    setFormError(null);
    setSignatureDraft('');
    setBorrowDialogOpen(true);
  }

  function openAgreement(entry: AssetRequest) {
    if (!entry.agreement) return;
    setSelectedId(entry.id);
    setAgreementDraft(entry.agreement);
    setAgreementDraftEntryId(entry.id);
    setAssetItemsDraft(parseAssetItems(entry.items));
    setAssetItemsDraftEntryId(entry.id);
    setAgreementPreviewOpen(false);
    setSavedMessage(null);
    setAgreementOpen(true);
  }

  function handleTransition(entry: AssetRequest, status: Exclude<AssetStatus, 'unknown'>) {
    if (status === 'returned') {
      setReturnDialog(entry);
      setReturnInspection('');
      setReturnCondition(null);
      setReturnImageUrl('');
      return;
    }
    transitionMutation.mutate(
      { entry, status },
      {
        onSuccess: () => {
          if (status === 'returnPending' && entry.agreement && !isAssetFormOnly(entry.agreement)) {
            openAgreement(entry);
            setSavedMessage('แจ้งคืนทรัพย์สินแล้ว กรุณาลงชื่อคืนใน Agreement');
          }
        },
      },
    );
  }

  function confirmReturn() {
    if (!returnDialog || !returnInspection.trim() || !returnCondition) {
      setFormError('กรุณาเลือกสภาพทรัพย์สินและระบุผลการตรวจสภาพก่อนยืนยันรับคืน');
      return;
    }
    setFormError(null);
    const agreement =
      returnDialog.agreement && agreementDraft ? { ...agreementDraft, returnCondition, updatedAt: null } : undefined;
    returnConfirmationMutation.mutate({
      entry: returnDialog,
      agreement,
      returnInspection: `${returnConditionLabels[returnCondition]}: ${returnInspection.trim()}`,
      imageUrl: returnImageUrl,
    });
  }

  function handleBorrowSubmit(borrowerSignature?: string) {
    const fromDate = parseDateInput(borrowForm.fromDate);
    const toDate = parseDateInput(borrowForm.toDate);
    if (!fromDate || (toDate && toDate < fromDate)) {
      setFormError('กรุณาระบุวันที่ยืม และตรวจสอบวันที่สิ้นสุดการยืมให้ถูกต้อง');
      return;
    }
    const selectedEmployees = manageAgreements
      ? (employeesQuery.data ?? []).filter((employee) => selectedEmployeeCodes.includes(employee.code))
      : [currentSession.employee];
    if (!manageAgreements && !borrowerSignature) {
      setFormError(null);
      setSignatureMethod('draw');
      setSignatureDraft('');
      setTypedSignature('');
      setSignaturePadVersion((value) => value + 1);
      setFormSignatureMode('request');
      return;
    }
    if (selectedEmployees.length === 0) {
      setFormError('กรุณาเลือกพนักงานอย่างน้อย 1 คน');
      return;
    }
    createMutation.mutate({
      borrowers: selectedEmployees.map((employee) => ({
        employeeName: employee.name,
        employeeCode: employee.code,
        department: employee.department,
        position: employee.position,
      })),
      requestedBy: { name: currentSession.employee.name, employeeCode: currentSession.employee.code },
      fromDate,
      toDate,
      items: borrowForm.itemRows.filter((item) => item.name.trim()),
      reason: borrowForm.reason,
      remarks: borrowForm.remarks,
      imageUrl: borrowForm.imageUrl,
      additionalImages: borrowForm.additionalImages.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
      ...(manageAgreements ? { flow: 'admin-managed' as const } : { flow: 'self-service' as const, borrowerSignature: borrowerSignature! }),
    });
  }

  function saveAgreement() {
    if (!agreementEditable || !selectedEntry || !agreementDraft) return;
    if (!agreementDraft.title.trim() || !agreementDraft.body.trim()) {
      setSavedMessage(null);
      setFormError('กรุณากรอกชื่อเอกสารและเนื้อหา Agreement ให้ครบ');
      return;
    }
    let items: string;
    try {
      items = serializeAssetItems(assetItemsDraft.filter((item) => item.name.trim()));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'กรุณาตรวจสอบรายการใน Asset Form');
      return;
    }
    setFormError(null);
    setSavedMessage(null);
    agreementMutation.mutate({
      entry: selectedEntry,
      agreement: {
        ...agreementDraft,
        signatureBoxes: visibleAgreementSignatureBoxes(agreementDraft.signatureBoxes),
        updatedAt: null,
      },
      items,
    });
  }

  function signAgreement(signer: AssetAgreementParticipant) {
    if (!selectedEntry || !agreementDraft) return;
    const expectedStatus =
      signer === 'handover' ? 'waitingHandover' : signer === 'employee' ? 'waitingEmployee' : 'waitingAdmin';
    if (agreementDraft.status !== expectedStatus) {
      setFormError(
        signer === 'handover'
          ? 'รายการนี้ไม่ได้อยู่ในขั้นตอนรอผู้ส่งมอบเซ็น'
          : signer === 'employee'
            ? 'รายการนี้ไม่ได้อยู่ในขั้นตอนรอผู้ยืมเซ็น'
            : 'รายการนี้ไม่ได้อยู่ในขั้นตอนรอผู้อนุมัติเซ็น',
      );
      return;
    }
    if (signer === 'employee' && !ownsSelectedEntry) {
      setFormError('ผู้ยืมสามารถลงชื่อได้เฉพาะ Agreement ของตัวเอง');
      return;
    }
    if (!agreementReadConfirmed) {
      setFormError('กรุณาอ่าน Agreement ให้ครบถ้วน และติ๊กยอมรับก่อนลงชื่อ');
      return;
    }
    if ((signer === 'handover' || signer === 'admin') && !manager) {
      setFormError('เฉพาะ Admin หรือหัวหน้างานเท่านั้นที่สามารถเซ็นแทนได้');
      return;
    }
    setFormError(null);
    setSavedMessage(null);
    setSignatureMethod('draw');
    setSignatureDraft('');
    setTypedSignature('');
    setSignaturePadVersion((value) => value + 1);
    setSignatureDialog(signer);
  }

  function signReturn(signer: ReturnSignatureParticipant) {
    if (!selectedEntry || !agreementDraft) return;
    if (selectedEntry.status !== 'returnPending') {
      setFormError('รายการนี้ยังไม่อยู่ในขั้นตอนรอเซ็นคืน');
      return;
    }
    if (signer === 'employee' && !ownsSelectedEntry) {
      setFormError('ผู้ยืมสามารถลงชื่อคืนได้เฉพาะรายการของตัวเอง');
      return;
    }
    if (signer === 'admin' && !manager) {
      setFormError('เฉพาะ Admin หรือหัวหน้างานเท่านั้นที่สามารถเซ็นรับคืนได้');
      return;
    }
    setFormError(null);
    setSavedMessage(null);
    setSignatureMethod('draw');
    setSignatureDraft('');
    setTypedSignature('');
    setSignaturePadVersion((value) => value + 1);
    setReturnSignatureDialog(signer);
  }

  async function confirmSignature() {
    if (!formSignatureMode && (!selectedEntry || !agreementDraft || (!signatureDialog && !returnSignatureDialog)))
      return;
    if (!signatureDraft) {
      setFormError('กรุณาลงลายเซ็นก่อนยืนยัน');
      return;
    }
    try {
      const storedSignature = await storeSignatureData(signatureDraft);
      setSignatureDraft(storedSignature);
      setFormError(null);
      setSavedMessage(null);
      if (formSignatureMode === 'request') {
        handleBorrowSubmit(storedSignature);
      } else if (formSignatureMode === 'approve' && selectedEntry) {
        approveFormMutation.mutate({ entry: selectedEntry, signatureData: storedSignature });
      } else if (returnSignatureDialog && selectedEntry) {
        signReturnMutation.mutate({
          entry: selectedEntry,
          signer: returnSignatureDialog,
          signatureData: storedSignature,
        });
      } else if (signatureDialog && selectedEntry) {
        signAgreementMutation.mutate({ entry: selectedEntry, signer: signatureDialog, signatureData: storedSignature });
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'ไม่สามารถอัปโหลดรูปลายเซ็นได้');
    }
  }

  function changeSignatureMethod(method: 'draw' | 'type' | 'upload') {
    setSignatureMethod(method);
    setSignatureDraft('');
    setTypedSignature('');
    if (method === 'draw') setSignaturePadVersion((value) => value + 1);
  }

  async function handleSignatureUpload(event: ReactChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('ไฟล์ลายเซ็นต้องเป็นรูปภาพเท่านั้น');
      return;
    }
    setFormError(null);
    setUploadingSignature(true);
    try {
      const previewDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('ไม่สามารถอ่านไฟล์รูปลายเซ็นได้'));
        };
        reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปลายเซ็นได้'));
        reader.readAsDataURL(file);
      });
      setSignatureDraft(previewDataUrl);

      // Keep only the ImgBB URL in the request instead of the image's base64.
      setSignatureDraft(await uploadImageFile(file));
    } catch (error) {
      setSignatureDraft('');
      setFormError(error instanceof Error ? error.message : 'อัปโหลดรูปลายเซ็นไม่สำเร็จ');
    } finally {
      setUploadingSignature(false);
      event.target.value = '';
    }
  }

  function exportPdf() {
    if (!selectedEntry || !agreementDraft) return;
    setPrintingAgreement(true);
    window.setTimeout(() => {
      const previousTitle = document.title;
      document.title = `agreement-${selectedEntry.id}`;
      window.print();
      window.setTimeout(() => {
        document.title = previousTitle;
        setPrintingAgreement(false);
      }, 800);
    }, 100);
  }

  const editorEntry = selectedEntry ? entryWithItems(selectedEntry, assetItemsDraft) : null;

  return (
    <div className="asset-page">
      <div className="asset-page-inner">
        <header className="asset-page-header no-print">
          <div>
            <div className="asset-eyebrow">
              <Inventory2Outlined fontSize="small" /> {managementMode ? 'asset requests' : 'asset borrowing'}
            </div>
            <Typography component="h1" variant="h4">
              {managementMode
                ? agreementDetailOpen
                  ? isAssetFormOnly(selectedEntry?.agreement)
                    ? 'Asset Form'
                    : 'เอกสารรายการยืม'
                  : 'คำขอยืมทรัพย์สินทั้งหมด'
                : 'ระบบยืม-คืนทรัพย์สิน'}
            </Typography>
            <Typography color="text.secondary">
              {manageAgreements
                ? agreementDetailOpen
                  ? isAssetFormOnly(selectedEntry?.agreement)
                    ? 'ตรวจสอบ Asset Form และลงชื่ออนุมัติคำขอ'
                    : 'ดูเอกสารรายการเดิมและดำเนินการที่ค้างอยู่'
                  : 'ตรวจสอบคำขอยืมทรัพย์สินและสถานะการคืน'
                : 'ส่งคำขอยืมทรัพย์สิน ติดตามสถานะ และแจ้งคืนของในระบบ'}
            </Typography>
          </div>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
            {!agreementViewOpen ? (
              <Button onClick={openBorrowDialog} startIcon={<AddRounded />} variant="outlined">
                {manageAgreements ? 'สร้างรายการยืมพิเศษ' : 'ขอยืมทรัพย์สิน'}
              </Button>
            ) : null}
            {agreementViewOpen && !isAssetFormOnly(agreementDraft) ? (
              <Button
                disabled={!selectedEntry || !agreementDraft || !canExportAgreement || printingAgreement}
                onClick={exportPdf}
                startIcon={<DownloadRounded />}
                title={canExportAgreement ? 'ส่งออกเอกสารที่ผู้ยืมลงชื่อแล้ว' : 'ส่งออกได้เมื่อผู้ยืมลงชื่อรับแล้ว'}
                variant="contained"
              >
                ส่งออก PDF
              </Button>
            ) : null}
          </Stack>
        </header>

        <div className="asset-stat-grid no-print">
          <div className="asset-stat-block">
            <span>รายการทั้งหมด</span>
            <strong>{entryCount}</strong>
            <small>รายการยืมในระบบ</small>
          </div>
          <div className="asset-stat-block asset-stat-accent">
            <span>{manageAgreements ? 'รอดำเนินการ' : 'รออนุมัติ'}</span>
            <strong>{pendingCount}</strong>
            <small>{manageAgreements ? 'คำขอที่ต้องลงชื่อ' : 'ต้องตรวจสอบต่อ'}</small>
          </div>
          <div className="asset-stat-block">
            <span>รอคืน</span>
            <strong>{agreementCount}</strong>
            <small>ข้อมูลอยู่ใน PostgreSQL</small>
          </div>
        </div>

        {mutationError ? (
          <Alert className="no-print" severity="error">
            {mutationError.message}
          </Alert>
        ) : null}
        {query.error ? (
          <Alert className="no-print" severity="error">
            {query.error.message}
          </Alert>
        ) : null}
        {formError ? (
          <Alert className="no-print" severity="warning">
            {formError}
          </Alert>
        ) : null}
        {query.isPending ? (
          <div className="asset-loading no-print">
            <div />
            <div />
            <div />
          </div>
        ) : null}
        {!query.isPending && !query.error && visibleEntries.length === 0 ? (
          <Paper className="asset-empty-state no-print" variant="outlined">
            <DescriptionOutlined />
            <Typography component="h2" variant="h6">
              {manageAgreements ? 'ยังไม่มีคำขอยืมทรัพย์สิน' : 'ยังไม่มีรายการยืมทรัพย์สิน'}
            </Typography>
            <Typography color="text.secondary">
              {manageAgreements ? 'คำขอของพนักงานจะปรากฏที่นี่' : 'เมื่อส่งคำขอยืมแล้ว รายการจะปรากฏที่นี่'}
            </Typography>
            {manageAgreements ? (
              <Button onClick={openBorrowDialog} startIcon={<AddRounded />} variant="contained">
                สร้างรายการยืมพิเศษ
              </Button>
            ) : null}
          </Paper>
        ) : null}

        {manageAgreements && !agreementDetailOpen && agreementEntries.length > 0 ? (
          <AgreementCollection
            counts={agreementFilterCounts}
            entries={filteredAgreementEntries}
            filter={agreementFilter}
            onFilterChange={setAgreementFilter}
            onOpen={(entry) => navigate(`/app/asset/manage/${encodeURIComponent(entry.id)}`)}
          />
        ) : agreementViewOpen ? (
          selectedEntry && agreementDraft ? (
            isAssetFormOnly(agreementDraft) ? (
              <main className="asset-workspace agreement-detail-workspace no-print">
                <section className="asset-composer-panel">
                  <div className="asset-composer-toolbar">
                    <Button
                      onClick={() => {
                        if (managementMode) navigate('/app/asset/manage');
                        else setAgreementOpen(false);
                      }}
                      startIcon={<ArrowBackRounded />}
                    >
                      กลับรายการยืม
                    </Button>
                    <Chip color={statusColor(selectedEntry.status)} label={assetFormStatusLabel(selectedEntry)} />
                  </div>
                  <Paper className="agreement-editor-panel" variant="outlined">
                    <AssetFormDocumentPage
                      entry={selectedEntry}
                      items={parseAssetItems(selectedEntry.items)}
                      onItemsChange={() => undefined}
                      readOnly
                      returnCondition={agreementDraft.returnCondition}
                      signatureBoxes={agreementDraft.signatureBoxes}
                    />
                  </Paper>
                  <div className="agreement-sign-action">
                    <div>
                      <strong>
                        {selectedEntry.status === 'pending'
                          ? 'ผู้ยืมส่งคำขอและลงชื่อแล้ว รอผู้อนุมัติลงชื่อ'
                          : selectedEntry.status === 'approved'
                            ? 'อนุมัติแล้ว รอผู้ยืมแจ้งคืนทรัพย์สิน'
                            : selectedEntry.status === 'returnPending'
                              ? 'ผู้ยืมแจ้งคืนแล้ว รอตรวจรับ'
                              : assetFormStatusLabel(selectedEntry)}
                      </strong>
                    </div>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      {manager && selectedEntry.status === 'pending' ? (
                        <>
                          <Button
                            disabled={busy}
                            onClick={() => {
                              setSelectedId(selectedEntry.id);
                              setFormError(null);
                              setSignatureMethod('draw');
                              setSignatureDraft('');
                              setTypedSignature('');
                              setSignaturePadVersion((value) => value + 1);
                              setFormSignatureMode('approve');
                            }}
                            variant="contained"
                          >
                            ลงชื่ออนุมัติ
                          </Button>
                          <Button
                            color="error"
                            disabled={busy}
                            onClick={() => handleTransition(selectedEntry, 'rejected')}
                            variant="outlined"
                          >
                            ไม่อนุมัติ
                          </Button>
                        </>
                      ) : null}
                      {ownsSelectedEntry && selectedEntry.status === 'approved' ? (
                        <Button
                          disabled={busy}
                          onClick={() => handleTransition(selectedEntry, 'returnPending')}
                          variant="outlined"
                        >
                          แจ้งคืนทรัพย์สิน
                        </Button>
                      ) : null}
                      {manager && selectedEntry.status === 'returnPending' ? (
                        <Button
                          disabled={busy}
                          onClick={() => handleTransition(selectedEntry, 'returned')}
                          variant="contained"
                        >
                          ตรวจสภาพและยืนยันรับคืน
                        </Button>
                      ) : null}
                    </Stack>
                  </div>
                </section>
              </main>
            ) : (
              <main className="asset-workspace agreement-detail-workspace no-print">
                <section className="asset-composer-panel">
                  <div className="asset-composer-toolbar">
                    <div>
                      <Button
                        className="agreement-back-button"
                        onClick={() => {
                          if (managementMode) {
                            navigate('/app/asset/manage');
                          } else {
                            setAgreementOpen(false);
                            setAgreementDraft(null);
                            setAgreementDraftEntryId(null);
                          }
                        }}
                        size="small"
                        startIcon={<ArrowBackRounded />}
                      >
                        {managementMode ? 'กลับ Agreement ทั้งหมด' : 'กลับรายการยืม'}
                      </Button>
                      <span className="section-kicker">selected request</span>
                      <Typography component="h2" variant="h6">
                        {itemLabel(selectedEntry.items)}
                      </Typography>
                      <Typography color="text.secondary" variant="body2">
                        {selectedEntry.employeeName} · {selectedEntry.department || 'ไม่ระบุแผนก'} ·{' '}
                        {selectedEntry.employeeCode}
                      </Typography>
                    </div>
                    <Chip
                      color={
                        selectedEntry.agreement
                          ? agreementStatusColor(selectedEntry.agreement.status)
                          : statusColor(selectedEntry.status)
                      }
                      label={
                        selectedEntry.agreement
                          ? agreementStatusLabel(selectedEntry.agreement.status)
                          : selectedEntry.statusLabel
                      }
                      size="small"
                    />
                  </div>
                  {agreementEditable ||
                  selectedEntry.status === 'returnPending' ||
                  (selectedEntry.status === 'approved' && ownsSelectedEntry) ? (
                    <LifecycleActions
                      busy={busy}
                      entry={selectedEntry}
                      manager={manager}
                      returnSignatureReady={returnSignatureReady}
                      onRemove={(entry) => {
                        if (window.confirm('ต้องการลบรายการนี้หรือไม่?')) removeMutation.mutate(entry);
                      }}
                      onTransition={handleTransition}
                      own={
                        selectedEntry.employeeCode.trim().toLowerCase() ===
                        currentSession.employee.code.trim().toLowerCase()
                      }
                    />
                  ) : null}
                  {selectedEntry.status === 'returnPending' || selectedEntry.status === 'returned' ? (
                    <>
                      <div className="agreement-flow-strip return-flow-strip">
                        <div
                          className={
                            returnEmployeeSigned
                              ? 'agreement-flow-step is-done'
                              : selectedEntry.status === 'returnPending'
                                ? 'agreement-flow-step is-current'
                                : 'agreement-flow-step'
                          }
                        >
                          <span>01</span>
                          <div>
                            <strong>ผู้ยืมเซ็นคืน</strong>
                            <small>ยืนยันการส่งคืนทรัพย์สิน</small>
                          </div>
                        </div>
                        <KeyboardArrowRightRounded className="agreement-flow-arrow" />
                        <div
                          className={
                            returnAdminSigned
                              ? 'agreement-flow-step is-done'
                              : selectedEntry.status === 'returnPending' && returnEmployeeSigned
                                ? 'agreement-flow-step is-current'
                                : 'agreement-flow-step'
                          }
                        >
                          <span>02</span>
                          <div>
                            <strong>ผู้อนุมัติเซ็นรับคืน</strong>
                            <small>ยืนยันการรับคืนทรัพย์สิน</small>
                          </div>
                        </div>
                      </div>
                      {canSignReturnEmployee || canSignReturnAdmin ? (
                        <div className="agreement-sign-action">
                          <div>
                            <span className="section-kicker">return signature</span>
                            <strong>
                              {canSignReturnEmployee ? 'กรุณาลงชื่อคืนทรัพย์สิน' : 'กรุณาลงชื่อผู้อนุมัติรับคืน'}
                            </strong>
                            <small>
                              {canSignReturnEmployee
                                ? 'ลงชื่อแล้ว ระบบจะเปิดขั้นตอนให้ผู้อนุมัติเซ็นรับคืน'
                                : 'เมื่อเซ็นครบแล้ว ผู้ดูแลจะตรวจสภาพและยืนยันปิดรายการ'}
                            </small>
                          </div>
                          <Button
                            disabled={signReturnMutation.isPending}
                            onClick={() => signReturn(canSignReturnEmployee ? 'employee' : 'admin')}
                            startIcon={<CheckRounded />}
                            variant="contained"
                          >
                            {signReturnMutation.isPending
                              ? 'กำลังลงชื่อ'
                              : canSignReturnEmployee
                                ? 'ลงชื่อคืน'
                                : 'ลงชื่อรับคืน'}
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div className="agreement-flow-strip">
                    <div
                      className={
                        agreementDraft.status === 'waitingHandover'
                          ? 'agreement-flow-step is-current'
                          : 'agreement-flow-step is-done'
                      }
                    >
                      <span>01</span>
                      <div>
                        <strong>ผู้ส่งมอบเซ็น</strong>
                        <small>ยืนยันการส่งมอบทรัพย์สิน</small>
                      </div>
                    </div>
                    <KeyboardArrowRightRounded className="agreement-flow-arrow" />
                    <div
                      className={
                        agreementDraft.status === 'waitingEmployee'
                          ? 'agreement-flow-step is-current'
                          : agreementDraft.status === 'waitingHandover'
                            ? 'agreement-flow-step'
                            : 'agreement-flow-step is-done'
                      }
                    >
                      <span>02</span>
                      <div>
                        <strong>{adminOwnBorrow ? 'ผู้ยืมเซ็น' : 'พนักงานเซ็น'}</strong>
                        <small>ยืนยันการรับมอบ</small>
                      </div>
                    </div>
                    <KeyboardArrowRightRounded className="agreement-flow-arrow" />
                    <div
                      className={
                        agreementDraft.status === 'waitingAdmin'
                          ? 'agreement-flow-step is-current'
                          : agreementDraft.status === 'completed'
                            ? 'agreement-flow-step is-done'
                            : 'agreement-flow-step'
                      }
                    >
                      <span>03</span>
                      <div>
                        <strong>ผู้อนุมัติเซ็น</strong>
                        <small>Agreement สมบูรณ์</small>
                      </div>
                    </div>
                  </div>
                  <div className="asset-editor-preview-grid agreement-editor-single">
                    <Paper className="agreement-editor-panel" variant="outlined">
                      {agreementEditable && !printingAgreement ? (
                        <>
                          <AgreementEditor
                            draft={agreementDraft}
                            entry={editorEntry ?? selectedEntry}
                            items={assetItemsDraft}
                            onChange={(next) => {
                              setAgreementDraft(next);
                              setSavedMessage(null);
                            }}
                            onItemsChange={(items) => {
                              setAssetItemsDraft(items);
                              setSavedMessage(null);
                            }}
                            readOnly={false}
                          />
                          <div className="agreement-editor-actions">
                            {savedMessage ? (
                              <span className="agreement-saved">
                                <CheckRounded fontSize="small" /> {savedMessage}
                              </span>
                            ) : (
                              <span className="agreement-unsaved">แก้ไขเนื้อหาได้ก่อนบันทึก</span>
                            )}
                            <div className="agreement-editor-action-buttons">
                              <Button
                                onClick={() => setAgreementPreviewOpen(true)}
                                startIcon={<VisibilityRounded />}
                                variant="outlined"
                              >
                                ดู Preview
                              </Button>
                              <Button
                                disabled={agreementMutation.isPending}
                                onClick={saveAgreement}
                                startIcon={
                                  agreementMutation.isPending ? (
                                    <CircularProgress color="inherit" size={16} />
                                  ) : (
                                    <SaveRounded />
                                  )
                                }
                                variant="outlined"
                              >
                                บันทึกแบบฟอร์มและ Agreement
                              </Button>
                            </div>
                          </div>
                        </>
                      ) : printingAgreement ? (
                        <TiptapDocxEditor
                          body={fillAgreementFields(
                            agreementDraft.body,
                            editorEntry ?? selectedEntry,
                            agreementDraft.documentDate,
                          )}
                          entry={editorEntry ?? selectedEntry}
                          items={assetItemsDraft}
                          onChange={() => undefined}
                          onItemsChange={() => undefined}
                          readOnly
                          returnCondition={agreementDraft.returnCondition}
                          signatureBoxes={agreementDraft.signatureBoxes}
                          title={agreementDraft.title}
                        />
                      ) : (
                        <AgreementWebPreview
                          body={fillAgreementFields(
                            agreementDraft.body,
                            editorEntry ?? selectedEntry,
                            agreementDraft.documentDate,
                          )}
                          documentDate={agreementDraft.documentDate}
                          entry={editorEntry ?? selectedEntry}
                          items={assetItemsDraft}
                          title={agreementDraft.title}
                        />
                      )}
                    </Paper>
                  </div>
                  {canSignHandoverStep || canSignEmployeeStep || canSignAdminStep ? (
                    <div className="agreement-sign-action">
                      <div>
                        <span className="section-kicker">action required</span>
                        <strong>
                          {canSignHandoverStep
                            ? 'กรุณาลงชื่อในฐานะผู้ส่งมอบก่อน'
                            : canSignAdminStep
                              ? 'กรุณาลงชื่อผู้อนุมัติเพื่อปิด Agreement'
                              : adminOwnBorrow
                                ? 'กรุณาลงชื่อรับมอบในฐานะผู้ยืม'
                                : 'กรุณาลงชื่อรับมอบทรัพย์สิน'}
                        </strong>
                        <small>
                          {canSignHandoverStep
                            ? 'เมื่อผู้ส่งมอบลงชื่อแล้ว ระบบจะแสดงปุ่มลงชื่อให้ผู้ยืม'
                            : canSignAdminStep
                              ? 'ผู้ส่งมอบและผู้ยืมลงชื่อแล้ว เอกสารพร้อมให้ผู้อนุมัติยืนยันขั้นสุดท้าย'
                              : 'กรุณาอ่าน Agreement ให้ครบถ้วนก่อนยืนยันการรับมอบ'}
                        </small>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={agreementReadConfirmed}
                              onChange={(event) => setAgreementReadConfirmed(event.target.checked)}
                              size="small"
                            />
                          }
                          label={
                            canSignHandoverStep
                              ? 'ฉันได้อ่าน Agreement และยืนยันการส่งมอบแล้ว'
                              : canSignAdminStep
                                ? 'ฉันได้อ่าน Agreement และอนุมัติแล้ว'
                                : 'ฉันได้อ่านและยอมรับ Agreement เรียบร้อยแล้ว'
                          }
                          sx={{ mt: 1, mb: 0 }}
                        />
                      </div>
                      <Button
                        disabled={signAgreementMutation.isPending || !agreementReadConfirmed}
                        onClick={() =>
                          signAgreement(canSignHandoverStep ? 'handover' : canSignAdminStep ? 'admin' : 'employee')
                        }
                        startIcon={<CheckRounded />}
                        variant="contained"
                      >
                        {signAgreementMutation.isPending
                          ? 'กำลังลงชื่อ'
                          : canSignHandoverStep
                            ? 'ลงชื่อผู้ส่งมอบ'
                            : canSignAdminStep
                              ? 'ลงชื่อผู้อนุมัติ'
                              : adminOwnBorrow
                                ? 'ลงชื่อรับมอบเอง'
                                : 'ลงชื่อรับมอบ'}
                      </Button>
                    </div>
                  ) : null}
                </section>
              </main>
            )
          ) : null
        ) : (
          <section aria-label="รายการยืมทรัพย์สินของฉัน" className="asset-request-list no-print">
            <div className="asset-request-list-heading">
              <div>
                <span className="section-kicker">my borrowing</span>
                <Typography component="h2" variant="h5">
                  รายการยืมของฉัน
                </Typography>
              </div>
              <Typography color="text.secondary" variant="body2">
                ลงชื่อส่งคำขอ รอผู้อนุมัติลงชื่อ แล้วแจ้งคืนเมื่อใช้งานเสร็จ
              </Typography>
            </div>
            {query.data?.map((entry, index) => (
              <NormalAssetCard
                busy={busy}
                entry={entry}
                key={`${entry.id}-${index}`}
                onOpenAgreement={() => {
                  openAgreement(entry);
                }}
                onTransition={handleTransition}
              />
            ))}
          </section>
        )}
      </div>

      {selectedEntry && agreementDraft ? (
        <Dialog
          aria-labelledby="agreement-preview-title"
          className="agreement-preview-dialog"
          fullWidth
          maxWidth="lg"
          onClose={() => setAgreementPreviewOpen(false)}
          open={agreementPreviewOpen}
        >
          <DialogTitle id="agreement-preview-title">
            <span className="section-kicker">document preview</span>
            ดู Preview Agreement
            <Typography color="text.secondary" component="div" variant="body2">
              {selectedEntry.employeeName} · {selectedEntry.employeeCode} · ฉบับปัจจุบันก่อนส่งออก PDF
            </Typography>
          </DialogTitle>
          <DialogContent className="agreement-preview-dialog-content" dividers>
            <TiptapDocxEditor
              body={fillAgreementFields(agreementDraft.body, editorEntry ?? selectedEntry, agreementDraft.documentDate)}
              entry={editorEntry ?? selectedEntry}
              items={assetItemsDraft}
              onChange={() => undefined}
              onItemsChange={() => undefined}
              readOnly
              returnCondition={agreementDraft.returnCondition}
              signatureBoxes={agreementDraft.signatureBoxes}
              title={agreementDraft.title}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAgreementPreviewOpen(false)}>ปิด Preview</Button>
          </DialogActions>
        </Dialog>
      ) : null}

      <Dialog
        fullWidth
        maxWidth="sm"
        onClose={() => {
          if (
            !createMutation.isPending &&
            !signAgreementMutation.isPending &&
            !signReturnMutation.isPending &&
            !approveFormMutation.isPending
          ) {
            setSignatureDialog(null);
            setReturnSignatureDialog(null);
            setFormSignatureMode(null);
          }
        }}
        open={signatureDialog !== null || returnSignatureDialog !== null || formSignatureMode !== null}
      >
        <DialogTitle>
          {formSignatureMode === 'request'
            ? 'ลงชื่อส่งคำขอยืม'
            : formSignatureMode === 'approve'
              ? 'ลงชื่ออนุมัติ Asset Form'
              : returnSignatureDialog
                ? 'ลงลายเซ็นรับคืน'
                : 'ลงลายเซ็นจริง'}
        </DialogTitle>
        <DialogContent>
          {formError ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          ) : null}
          {formSignatureMode === 'request' && createMutation.error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createMutation.error.message}
            </Alert>
          ) : null}
          <Typography color="text.secondary" sx={{ mb: 2 }} variant="body2">
            {formSignatureMode === 'request'
              ? 'ผู้ยืม'
              : formSignatureMode === 'approve'
                ? 'ผู้อนุมัติ'
                : returnSignatureDialog === 'employee'
                  ? 'ผู้ยืม'
                  : returnSignatureDialog === 'admin'
                    ? 'ผู้อนุมัติ'
                    : signatureDialog === 'handover'
                      ? 'ผู้ส่งมอบ'
                      : signatureDialog === 'admin'
                        ? 'ผู้อนุมัติ'
                        : 'พนักงานผู้ยืม'}{' '}
            สามารถเลือกวิธีลงลายเซ็นได้ 3 แบบ
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
            <Button
              onClick={() => changeSignatureMethod('draw')}
              variant={signatureMethod === 'draw' ? 'contained' : 'outlined'}
            >
              วาดลายเซ็น
            </Button>
            <Button
              onClick={() => changeSignatureMethod('type')}
              variant={signatureMethod === 'type' ? 'contained' : 'outlined'}
            >
              พิมพ์ชื่อ
            </Button>
            <Button
              onClick={() => changeSignatureMethod('upload')}
              variant={signatureMethod === 'upload' ? 'contained' : 'outlined'}
            >
              อัปโหลดรูป
            </Button>
          </Stack>
          {signatureMethod === 'draw' ? (
            <>
              <SignaturePad key={signaturePadVersion} onChange={setSignatureDraft} />
              <Button onClick={() => changeSignatureMethod('draw')} size="small" sx={{ mt: 1 }} variant="text">
                ล้างลายเซ็น
              </Button>
            </>
          ) : null}
          {signatureMethod === 'type' ? (
            <TextField
              autoFocus
              fullWidth
              helperText="ระบบจะแปลงชื่อเป็นรูปแบบลายเซ็นสำหรับแสดงในเอกสาร"
              label="ชื่อสำหรับลายเซ็น"
              onChange={(event) => {
                setTypedSignature(event.target.value);
                setSignatureDraft(event.target.value.trim() ? typedSignatureDataUrl(event.target.value.trim()) : '');
              }}
              value={typedSignature}
            />
          ) : null}
          {signatureMethod === 'upload' ? (
            <Stack spacing={1}>
              <Button component="label" disabled={uploadingSignature} variant="outlined">
                {uploadingSignature ? 'กำลังอัปโหลดรูปลายเซ็น' : 'เลือกไฟล์รูปลายเซ็น'}
                <input accept="image/*" hidden onChange={handleSignatureUpload} type="file" />
              </Button>
              <Typography color="text.secondary" variant="caption">
                รองรับไฟล์รูปภาพ เช่น PNG หรือ JPG — ระบบจะเก็บ URL จาก ImgBB แทนการเก็บ base64 ใน PostgreSQL
              </Typography>
            </Stack>
          ) : null}
          {signatureDraft ? (
            <div className="signature-preview-box">
              <Typography color="text.secondary" variant="caption">
                ตัวอย่างลายเซ็นที่จะบันทึก
              </Typography>
              <img alt="ตัวอย่างลายเซ็น" src={signatureDraft} />
            </div>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={
              createMutation.isPending ||
              signAgreementMutation.isPending ||
              signReturnMutation.isPending ||
              approveFormMutation.isPending
            }
            onClick={() => {
              setSignatureDialog(null);
              setReturnSignatureDialog(null);
              setFormSignatureMode(null);
            }}
          >
            ยกเลิก
          </Button>
          <Button
            disabled={
              !signatureDraft ||
              uploadingSignature ||
              createMutation.isPending ||
              signAgreementMutation.isPending ||
              signReturnMutation.isPending ||
              approveFormMutation.isPending
            }
            onClick={confirmSignature}
            variant="contained"
          >
            {createMutation.isPending ||
            signAgreementMutation.isPending ||
            signReturnMutation.isPending ||
            approveFormMutation.isPending
              ? 'กำลังบันทึกลายเซ็น'
              : 'ยืนยันและลงชื่อ'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        fullWidth
        maxWidth="sm"
        onClose={() => setBorrowDialogOpen(false)}
        open={borrowDialogOpen && formSignatureMode !== 'request'}
      >
        <DialogTitle>{manageAgreements ? 'สร้างรายการยืมพิเศษ + Agreement' : 'ขอยืมทรัพย์สิน'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {formError ? <Alert severity="warning">{formError}</Alert> : null}
            {manageAgreements ? (
              <div className="employee-picker">
                <div className="employee-picker-heading">
                  <div>
                    <span className="section-kicker">assign agreement</span>
                    <Typography fontWeight={700}>เลือกพนักงานผู้รับมอบ</Typography>
                    <Typography color="text.secondary" variant="body2">
                      สร้างรายการยืมแยกให้พนักงานแต่ละคน หลังส่งคำขอจะเปิดหน้าเขียน Agreement ของรายการแรกทันที
                    </Typography>
                  </div>
                  <Button
                    disabled={employeesQuery.isPending || employeesQuery.isError || !employeesQuery.data?.length}
                    onClick={() =>
                      setSelectedEmployeeCodes((current) =>
                        current.length === (employeesQuery.data?.length ?? 0)
                          ? []
                          : (employeesQuery.data ?? []).map((employee) => employee.code),
                      )
                    }
                    size="small"
                  >
                    {selectedEmployeeCodes.length === (employeesQuery.data?.length ?? 0)
                      ? 'ไม่เลือกทั้งหมด'
                      : 'เลือกทั้งหมด'}
                  </Button>
                </div>
                <div className="employee-picker-list">
                  {employeesQuery.isPending ? (
                    <Typography color="text.secondary">กำลังโหลดรายชื่อพนักงาน</Typography>
                  ) : employeesQuery.isError ? (
                    <Alert severity="error">
                      <Typography fontWeight={700}>โหลดรายชื่อพนักงานไม่สำเร็จ</Typography>
                      <Typography variant="body2">
                        {employeesQuery.error instanceof Error
                          ? employeesQuery.error.message
                          : 'ตรวจสอบการเชื่อมต่อฐานข้อมูลหรือสิทธิ์ แล้วลองใหม่อีกครั้ง'}
                      </Typography>
                      <Button onClick={() => void employeesQuery.refetch()} size="small" sx={{ mt: 1 }}>
                        ลองโหลดใหม่
                      </Button>
                    </Alert>
                  ) : employeesQuery.data?.length ? (
                    employeesQuery.data.map((employee) => (
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={selectedEmployeeCodes.includes(employee.code)}
                            onChange={() =>
                              setSelectedEmployeeCodes((current) =>
                                current.includes(employee.code)
                                  ? current.filter((code) => code !== employee.code)
                                  : [...current, employee.code],
                              )
                            }
                          />
                        }
                        key={employee.code}
                        label={
                          <span>
                            <strong>{employee.name}</strong>
                            <small>
                              {employee.code} · {employee.department || 'ไม่ระบุแผนก'} · {employee.position}
                            </small>
                          </span>
                        }
                      />
                    ))
                  ) : (
                    <Alert severity="warning">ไม่พบข้อมูลพนักงานที่นำเข้าในฐานข้อมูล</Alert>
                  )}
                </div>
                <Typography color="text.secondary" variant="body2">
                  เลือกแล้ว {selectedEmployeeCodes.length} คน
                </Typography>
                <Typography className="employee-picker-note" color="text.secondary" variant="body2">
                  ชื่อพนักงาน แผนก รหัสพนักงาน วันที่ Agreement และรายการยืม จะถูกเติมลงเอกสารให้อัตโนมัติ
                </Typography>
              </div>
            ) : null}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                InputLabelProps={{ shrink: true }}
                label="วันที่เริ่มยืม"
                onChange={(event) => setBorrowForm((current) => ({ ...current, fromDate: event.target.value }))}
                type="date"
                value={borrowForm.fromDate}
              />
              <TextField
                fullWidth
                InputLabelProps={{ shrink: true }}
                label="วันที่สิ้นสุดการยืม (ถ้ามี)"
                helperText="เว้นว่างได้ หากยังไม่กำหนดวันสิ้นสุดการยืม"
                onChange={(event) => setBorrowForm((current) => ({ ...current, toDate: event.target.value }))}
                type="date"
                value={borrowForm.toDate}
              />
            </Stack>
            <Stack spacing={1}>
              <Typography fontWeight={700}>รายการทรัพย์สิน (ไม่เกิน 10 รายการ)</Typography>
              <div aria-label="ตารางรายการทรัพย์สิน" className="asset-item-table" role="table">
                <div className="asset-item-table-head" role="row">
                  <span role="columnheader">ชื่อรายการ</span>
                  <span role="columnheader">จำนวน</span>
                  <span role="columnheader">หมายเหตุรายการ</span>
                  <span aria-hidden="true" />
                </div>
                {borrowForm.itemRows.map((item, index) => (
                  <div className="asset-item-table-row" key={`asset-item-${index}`} role="row">
                    <TextField
                      aria-label={`ชื่อรายการ ${index + 1}`}
                      fullWidth
                      label="ชื่อรายการ"
                      onChange={(event) =>
                        setBorrowForm((current) => ({
                          ...current,
                          itemRows: current.itemRows.map((value, rowIndex) =>
                            rowIndex === index ? { ...value, name: event.target.value } : value,
                          ),
                        }))
                      }
                      value={item.name}
                    />
                    <TextField
                      aria-label={`จำนวนรายการ ${index + 1}`}
                      label="จำนวน"
                      onChange={(event) =>
                        setBorrowForm((current) => ({
                          ...current,
                          itemRows: current.itemRows.map((value, rowIndex) =>
                            rowIndex === index ? { ...value, quantity: Number(event.target.value) } : value,
                          ),
                        }))
                      }
                      type="number"
                      value={item.quantity}
                    />
                    <TextField
                      className="asset-item-note-field"
                      fullWidth
                      label="หมายเหตุรายการ"
                      onChange={(event) =>
                        setBorrowForm((current) => ({
                          ...current,
                          itemRows: current.itemRows.map((value, rowIndex) =>
                            rowIndex === index ? { ...value, note: event.target.value } : value,
                          ),
                        }))
                      }
                      value={item.note}
                    />
                    <IconButton
                      aria-label={`ลบรายการที่ ${index + 1}`}
                      disabled={borrowForm.itemRows.length === 1}
                      onClick={() =>
                        setBorrowForm((current) => ({
                          ...current,
                          itemRows: current.itemRows.filter((_, rowIndex) => rowIndex !== index),
                        }))
                      }
                    >
                      <DeleteOutlineRounded />
                    </IconButton>
                  </div>
                ))}
              </div>
              <Button
                disabled={borrowForm.itemRows.length >= 10}
                onClick={() =>
                  setBorrowForm((current) => ({
                    ...current,
                    itemRows: [...current.itemRows, { name: '', quantity: 1, note: '' }],
                  }))
                }
                size="small"
                sx={{ alignSelf: 'flex-start' }}
              >
                เพิ่มรายการ
              </Button>
            </Stack>
            <TextField
              fullWidth
              label="เหตุผล"
              onChange={(event) => setBorrowForm((current) => ({ ...current, reason: event.target.value }))}
              value={borrowForm.reason}
            />
            <TextField
              fullWidth
              label="หมายเหตุ"
              onChange={(event) => setBorrowForm((current) => ({ ...current, remarks: event.target.value }))}
              value={borrowForm.remarks}
            />
            <Button component="label" disabled={uploadingImage} startIcon={<UploadFileRounded />} variant="outlined">
              {uploadingImage ? 'กำลังอัปโหลดรูปภาพ' : 'เลือกรูปภาพประกอบ'}
              <input
                accept="image/*"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setFormError(null);
                  setUploadingImage(true);
                  try {
                    const url = await uploadImageFile(file);
                    setBorrowForm((current) => ({ ...current, imageUrl: url }));
                  } catch (error) {
                    setFormError(error instanceof Error ? error.message : 'อัปโหลดรูปภาพไม่สำเร็จ');
                  } finally {
                    setUploadingImage(false);
                    event.target.value = '';
                  }
                }}
                type="file"
              />
            </Button>
            {borrowForm.imageUrl ? <Typography color="success.main">อัปโหลดรูปภาพแล้ว</Typography> : null}
            <TextField
              fullWidth
              helperText="ใส่ URL เอกสารเพิ่มเติมทีละบรรทัด"
              label="ลิงก์เอกสารเพิ่มเติม"
              multiline
              onChange={(event) => setBorrowForm((current) => ({ ...current, additionalImages: event.target.value }))}
              value={borrowForm.additionalImages}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBorrowDialogOpen(false)}>ยกเลิก</Button>
          <Button
            disabled={busy || uploadingImage || employeePickerBlocked}
            onClick={() => handleBorrowSubmit()}
            variant="contained"
          >
            {createMutation.isPending ? <CircularProgress color="inherit" size={22} /> : 'ส่งคำขอ'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog fullWidth maxWidth="sm" onClose={() => setReturnDialog(null)} open={Boolean(returnDialog)}>
        <DialogTitle>ตรวจสภาพและยืนยันรับคืน</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="warning">กรุณาตรวจสภาพทรัพย์สินและบันทึกผลก่อนยืนยัน รายการจะเปลี่ยนเป็น “คืนแล้ว”</Alert>
            {formError ? <Alert severity="error">{formError}</Alert> : null}
            <div aria-label="สภาพทรัพย์สินที่ส่งคืน" className="return-condition-picker" role="group">
              <Typography fontWeight={700}>สภาพทรัพย์สิน</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0, sm: 2 }}>
                {(Object.keys(returnConditionLabels) as AssetReturnCondition[]).map((condition) => (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={returnCondition === condition}
                        onChange={() => setReturnCondition((current) => (current === condition ? null : condition))}
                      />
                    }
                    key={condition}
                    label={returnConditionLabels[condition]}
                  />
                ))}
              </Stack>
            </div>
            <TextField
              autoFocus
              fullWidth
              label="ผลการตรวจสภาพ / ความรับผิดชอบ"
              multiline
              onChange={(event) => setReturnInspection(event.target.value)}
              value={returnInspection}
            />
            <Button component="label" disabled={uploadingImage} startIcon={<UploadFileRounded />} variant="outlined">
              {uploadingImage ? 'กำลังอัปโหลดรูปภาพ' : 'เลือกรูปสภาพทรัพย์สิน (ถ้ามี)'}
              <input
                accept="image/*"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setFormError(null);
                  setUploadingImage(true);
                  try {
                    setReturnImageUrl(await uploadImageFile(file));
                  } catch (error) {
                    setFormError(error instanceof Error ? error.message : 'อัปโหลดรูปภาพไม่สำเร็จ');
                  } finally {
                    setUploadingImage(false);
                    event.target.value = '';
                  }
                }}
                type="file"
              />
            </Button>
            {returnImageUrl ? <Typography color="success.main">อัปโหลดรูปสภาพแล้ว</Typography> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReturnDialog(null)}>ยกเลิก</Button>
          <Button disabled={busy} onClick={confirmReturn} variant="contained">
            {returnConfirmationMutation.isPending ? <CircularProgress color="inherit" size={22} /> : 'ยืนยันรับคืน'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
