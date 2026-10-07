// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

let mockRole = "supervisor";

vi.mock("@/components/hrm/HrmShell", () => ({
  useHrmRole: () => ({ role: mockRole, employeeId: "emp-1", email: "user@example.com" }),
}));

import EmployeeModule from "@/components/hrm/employees/EmployeeModule";

const employeeItem = {
  id: "emp-1",
  code: "E001",
  prefix: "คุณ",
  firstName: "ทดสอบ",
  lastName: "ใจดี",
  nickname: "เทส",
  citizenId: null,
  firstNameEn: null,
  lastNameEn: null,
  birthDate: null,
  email: "test@example.com",
  phone: null,
  avatarUrl: null,
  startDate: "2026-01-01",
  department: { id: 1, name: "Engineering" },
  position: { id: 1, name: "Software Engineer" },
  employmentStatus: { id: 1, name: "ปฏิบัติงาน" },
  employmentType: { id: 1, code: "full_time", name: "พนักงานประจำ" },
  managerId: null,
  managerName: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function mockResponse(url: string) {
  if (url.startsWith("/api/departments")) return { ok: true, json: async () => ({ items: [{ id: 1, name: "Engineering" }] }) };
  if (url.startsWith("/api/positions")) return { ok: true, json: async () => ({ items: [{ id: 1, name: "Software Engineer" }] }) };
  if (url.startsWith("/api/employment-statuses")) return { ok: true, json: async () => ({ items: [{ id: 1, name: "ปฏิบัติงาน" }] }) };
  if (url.startsWith("/api/employment-types")) return { ok: true, json: async () => ({ items: [{ id: 1, code: "full_time", name: "พนักงานประจำ" }] }) };
  if (url.startsWith("/api/employees")) return { ok: true, json: async () => ({ items: [employeeItem] }) };
  throw new Error(`unexpected fetch: ${url}`);
}

function stubFetch(mutationResponse?: (url: string, options: RequestInit) => { ok: boolean; json: () => Promise<unknown> }) {
  const fetchMock = vi.fn((url: string, options?: RequestInit) => {
    if (options?.method) {
      if (mutationResponse) return Promise.resolve(mutationResponse(url, options));
      const body = options.body ? JSON.parse(String(options.body)) : {};
      if (/^\/api\/(departments|positions|employment-types|employment-statuses)(\/|$)/.test(url)) {
        return Promise.resolve({ ok: true, json: async () => ({ item: { id: 99, ...body } }) });
      }
      const item = options.method === "DELETE"
        ? { ...employeeItem, ...body, isActive: false, employmentStatus: { id: 2, name: "พ้นสภาพ" } }
        : { ...employeeItem, ...body };
      return Promise.resolve({ ok: true, json: async () => ({ item }) });
    }
    return Promise.resolve(mockResponse(url));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  mockRole = "supervisor";
});

describe("EmployeeModule", () => {
  it("loads real data from the lookup + list endpoints and renders the directory", async () => {
    stubFetch();
    render(<EmployeeModule />);

    await waitFor(() => expect(screen.getAllByText(/ทดสอบ ใจดี/).length).toBeGreaterThan(0));
    expect(screen.getAllByText("Engineering").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Software Engineer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("พนักงานประจำ").length).toBeGreaterThan(0);
  });

  it("hides the add-employee action for an employee role (canManageEmployees gate)", async () => {
    mockRole = "employee";
    stubFetch();
    render(<EmployeeModule />);

    await waitFor(() => expect(screen.getAllByText(/ทดสอบ ใจดี/).length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "เพิ่มพนักงาน" })).not.toBeInTheDocument();
  });

  it("shows the add-employee action for a supervisor", async () => {
    stubFetch();
    render(<EmployeeModule />);

    await waitFor(() => expect(screen.getByRole("button", { name: "เพิ่มพนักงาน" })).toBeInTheDocument());
  });

  it("saves a lookup through the shared master-data workflow", async () => {
    const fetchMock = stubFetch();
    render(<EmployeeModule />);

    fireEvent.click(await screen.findByRole("button", { name: "จัดการรายการ" }));
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มประเภทการจ้าง" }));
    fireEvent.change(screen.getByLabelText("รหัสประเภท *"), { target: { value: " consultant " } });
    fireEvent.change(screen.getByLabelText("ประเภทการจ้าง *"), { target: { value: " ที่ปรึกษา " } });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มรายการ" }));

    expect(await screen.findByText(/เพิ่มประเภทการจ้าง “ที่ปรึกษา” สำเร็จ/)).toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find(([url, options]) => url === "/api/employment-types" && options?.method === "POST");
    expect(createCall).toBeDefined();
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({ code: "consultant", name: "ที่ปรึกษา" });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === "/api/employees?includeDeleted=true")).toHaveLength(2));
  });

  it("filters the rendered list by the search query, client-side", async () => {
    stubFetch();
    render(<EmployeeModule />);
    await waitFor(() => expect(screen.getAllByText(/ทดสอบ ใจดี/).length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText("ค้นหาพนักงาน"), { target: { value: "ไม่มีอยู่จริง" } });
    await waitFor(() => expect(screen.getByText("ไม่พบพนักงานที่ตรงกับตัวกรอง")).toBeInTheDocument());
    expect(screen.queryAllByText(/ทดสอบ ใจดี/)).toHaveLength(0);
  });

  it("creates an employee, shows success, and refreshes the directory", async () => {
    const fetchMock = stubFetch();
    render(<EmployeeModule />);
    await screen.findByRole("button", { name: "เพิ่มพนักงาน" });

    fireEvent.click(screen.getByRole("button", { name: "เพิ่มพนักงาน" }));
    fireEvent.change(screen.getByLabelText("รหัสพนักงาน *"), { target: { value: "2603" } });
    fireEvent.change(screen.getByLabelText("ชื่อ (ไทย) *"), { target: { value: "สมชาย" } });
    fireEvent.change(screen.getByLabelText("นามสกุล (ไทย) *"), { target: { value: "ทดสอบ" } });
    fireEvent.change(screen.getByLabelText("อีเมล *"), { target: { value: "somchai@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูล" }));

    expect(await screen.findByText(/เพิ่มพนักงาน สมชาย ทดสอบ สำเร็จ/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "ข้อมูลพนักงาน" })).not.toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find(([url, options]) => url === "/api/employees" && options?.method === "POST");
    expect(createCall).toBeDefined();
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({ code: "2603", firstName: "สมชาย", lastName: "ทดสอบ" });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === "/api/employees?includeDeleted=true")).toHaveLength(2));
  });

  it("keeps the employee form open and shows a mapped error when creation fails", async () => {
    const fetchMock = stubFetch(() => ({ ok: false, json: async () => ({ error: "Email is already in use" }) }));
    render(<EmployeeModule />);
    await screen.findByRole("button", { name: "เพิ่มพนักงาน" });

    fireEvent.click(screen.getByRole("button", { name: "เพิ่มพนักงาน" }));
    fireEvent.change(screen.getByLabelText("รหัสพนักงาน *"), { target: { value: "2603" } });
    fireEvent.change(screen.getByLabelText("ชื่อ (ไทย) *"), { target: { value: "สมชาย" } });
    fireEvent.change(screen.getByLabelText("นามสกุล (ไทย) *"), { target: { value: "ทดสอบ" } });
    fireEvent.change(screen.getByLabelText("อีเมล *"), { target: { value: "somchai@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูล" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("มีข้อมูลชื่อนี้หรือรหัสนี้อยู่แล้ว กรุณาตรวจสอบก่อนบันทึก");
    expect(screen.getByLabelText("รหัสพนักงาน *")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/employees?includeDeleted=true")).toHaveLength(1);
  });

  it("edits an employee through the shared workflow", async () => {
    const fetchMock = stubFetch();
    render(<EmployeeModule />);
    await screen.findAllByRole("button", { name: "แก้ไข ทดสอบ ใจดี" });

    fireEvent.click(screen.getAllByRole("button", { name: "แก้ไข ทดสอบ ใจดี" })[0]);
    fireEvent.change(screen.getByLabelText("รหัสพนักงาน *"), { target: { value: "2601" } });
    fireEvent.change(screen.getByLabelText("ชื่อเล่น"), { target: { value: "ชื่อใหม่" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูล" }));

    expect(await screen.findByText(/บันทึกข้อมูล ทดสอบ ใจดี สำเร็จ/)).toBeInTheDocument();
    const updateCall = fetchMock.mock.calls.find(([url, options]) => url === "/api/employees/emp-1" && options?.method === "PATCH");
    expect(updateCall).toBeDefined();
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({ code: "2601", nickname: "ชื่อใหม่" });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === "/api/employees?includeDeleted=true")).toHaveLength(2));
  });

  it("keeps the employee form open and shows a mapped error when editing fails", async () => {
    const fetchMock = stubFetch(() => ({ ok: false, json: async () => ({ error: "Email is already in use" }) }));
    render(<EmployeeModule />);
    await screen.findAllByRole("button", { name: "แก้ไข ทดสอบ ใจดี" });

    fireEvent.click(screen.getAllByRole("button", { name: "แก้ไข ทดสอบ ใจดี" })[0]);
    fireEvent.change(screen.getByLabelText("รหัสพนักงาน *"), { target: { value: "2601" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูล" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("มีข้อมูลชื่อนี้หรือรหัสนี้อยู่แล้ว กรุณาตรวจสอบก่อนบันทึก");
    expect(screen.getByLabelText("ชื่อเล่น")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/employees?includeDeleted=true")).toHaveLength(1);
  });

  it("offboards an employee through the shared workflow", async () => {
    const fetchMock = stubFetch();
    render(<EmployeeModule />);
    await screen.findAllByRole("button", { name: "เปลี่ยน ทดสอบ ใจดี เป็นพ้นสภาพ" });

    fireEvent.click(screen.getAllByRole("button", { name: "เปลี่ยน ทดสอบ ใจดี เป็นพ้นสภาพ" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันพ้นสภาพ" }));

    expect(await screen.findByText(/เปลี่ยนสถานะ ทดสอบ ใจดี เป็นพ้นสภาพสำเร็จ/)).toBeInTheDocument();
    const offboardCall = fetchMock.mock.calls.find(([url, options]) => url === "/api/employees/emp-1" && options?.method === "DELETE");
    expect(offboardCall).toBeDefined();
    expect(JSON.parse(String(offboardCall?.[1]?.body)).endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === "/api/employees?includeDeleted=true")).toHaveLength(2));
  });

  it("keeps the offboarding dialog open and shows a mapped error when offboarding fails", async () => {
    const fetchMock = stubFetch(() => ({ ok: false, json: async () => ({ error: "Employee is already off-boarded" }) }));
    render(<EmployeeModule />);
    await screen.findAllByRole("button", { name: "เปลี่ยน ทดสอบ ใจดี เป็นพ้นสภาพ" });

    fireEvent.click(screen.getAllByRole("button", { name: "เปลี่ยน ทดสอบ ใจดี เป็นพ้นสภาพ" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันพ้นสภาพ" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("พนักงานพ้นสภาพแล้ว จึงทำรายการนี้ซ้ำไม่ได้");
    expect(screen.getByLabelText("วันที่สิ้นสุดการทำงาน")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/employees?includeDeleted=true")).toHaveLength(1);
  });
});
