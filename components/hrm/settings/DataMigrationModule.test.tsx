// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import DataMigrationModule from "@/components/hrm/settings/DataMigrationModule";

function createTestXlsxFile(name = "sheet.xlsx") {
  return new File([new Uint8Array([1, 2, 3, 4])], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("DataMigrationModule selective import", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts multi-sheet previews with 0 selected sections and submits only checked sections (e.g. OT only)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "preview",
          fileName: "all-sheets.xlsx",
          sheetsFound: ["ข้อมูลพนักงาน", "ข้อมูลการทำโอที"],
          sheetsMissing: ["ข้อมูลการยืมทรัพย์สิน", "ข้อมูลการลา", "ข้อมูลงาน"],
          availableSections: ["employees", "overtime"],
          summary: {
            employeesActive: 10,
            employeesFormerStubs: 2,
            employeesTotal: 12,
            usersProvisioned: 1,
            usersSkippedNoEmail: 0,
            departments: 3,
            positions: 4,
            overtimeRequests: 15,
            leaveRequests: 0,
            assetRequests: 0,
            assetItems: 0,
            assetAgreements: 0,
            assetAgreementSigners: 0,
            assetAttachments: 0,
            workTrackingRecords: 0,
            hasWorkSheet: false,
          },
          warnings: [],
          errors: [],
          existingDbCounts: {
            employees: 10,
            users: 10,
            overtime: 5,
            leave: 8,
            assets: 3,
            workTracking: 12,
          },
          missingDbEmployeeCodesBySection: {
            overtime: [],
            leave: [],
            assets: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "import",
          fileName: "all-sheets.xlsx",
          selectedSections: ["overtime"],
          imported: {
            importedSections: ["overtime"],
            overtimeRequests: 15,
            employeesInserted: 0,
            employeesUpdated: 0,
            usersProvisioned: 0,
            usersSkippedNoEmail: 0,
            usersExistingKept: 0,
          },
          warnings: [],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<DataMigrationModule />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [createTestXlsxFile("all-sheets.xlsx")] } });
    fireEvent.click(screen.getByRole("button", { name: "ตรวจสอบไฟล์" }));

    expect(await screen.findByText("เลือกส่วนข้อมูลที่ต้องการนำเข้า")).toBeInTheDocument();

    const otCheckbox = screen.getByRole("checkbox", { name: /คำขอ OT/ });
    const empCheckbox = screen.getByRole("checkbox", { name: /ข้อมูลพนักงานและบัญชีผู้ใช้/ });
    expect(otCheckbox).toHaveAttribute("aria-checked", "false");
    expect(empCheckbox).toHaveAttribute("aria-checked", "false");

    const submitTrigger = screen.getByRole("button", { name: /นำเข้าเฉพาะส่วนที่เลือก \(0\)/ });
    expect(submitTrigger).toBeDisabled();

    // Select only OT
    fireEvent.click(otCheckbox);
    expect(otCheckbox).toHaveAttribute("aria-checked", "true");
    expect(empCheckbox).toHaveAttribute("aria-checked", "false");

    const confirmCheckbox = screen.getByRole("checkbox", { name: /ฉันตรวจสอบส่วนที่เลือกแล้ว/ });
    fireEvent.click(confirmCheckbox);

    fireEvent.click(screen.getByRole("button", { name: /นำเข้าเฉพาะส่วนที่เลือก \(1\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "ยืนยันนำเข้าส่วนที่เลือก" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [, importCallInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = importCallInit.body as FormData;
    expect(body.getAll("sections")).toEqual(["overtime"]);
    expect(body.get("mode")).toBe("import");
    expect(body.get("confirmReplace")).toBe("true");

    expect(await screen.findByText("นำเข้าข้อมูลเฉพาะส่วนที่เลือกเรียบร้อยแล้ว")).toBeInTheDocument();
    expect(screen.getByText(/นำเข้า คำขอ OT · OT 15 รายการ/)).toBeInTheDocument();
  });

  it("auto-selects the single available section when previewing a single-sheet workbook", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mode: "preview",
        fileName: "ot-only.xlsx",
        sheetsFound: ["ข้อมูลการทำโอที"],
        sheetsMissing: ["ข้อมูลพนักงาน", "ข้อมูลการยืมทรัพย์สิน", "ข้อมูลการลา", "ข้อมูลงาน"],
        availableSections: ["overtime"],
        summary: {
          employeesActive: 0,
          employeesFormerStubs: 0,
          employeesTotal: 0,
          usersProvisioned: 0,
          usersSkippedNoEmail: 0,
          departments: 0,
          positions: 0,
          overtimeRequests: 7,
          leaveRequests: 0,
          assetRequests: 0,
          assetItems: 0,
          assetAgreements: 0,
          assetAgreementSigners: 0,
          assetAttachments: 0,
          workTrackingRecords: 0,
          hasWorkSheet: false,
        },
        warnings: [],
        errors: [],
        existingDbCounts: {
          employees: 10,
          users: 10,
          overtime: 5,
          leave: 8,
          assets: 3,
          workTracking: 12,
        },
        missingDbEmployeeCodesBySection: {
          overtime: [],
          leave: [],
          assets: [],
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    render(<DataMigrationModule />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [createTestXlsxFile("ot-only.xlsx")] } });
    fireEvent.click(screen.getByRole("button", { name: "ตรวจสอบไฟล์" }));

    expect(await screen.findByText("เลือกส่วนข้อมูลที่ต้องการนำเข้า")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /คำขอ OT/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /นำเข้าเฉพาะส่วนที่เลือก \(1\)/ })).toBeInTheDocument();
  });
});
