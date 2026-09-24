"use client";

import {
  RiBriefcaseLine,
  RiBuildingLine,
  RiCalendarTodoLine,
  RiShieldUserLine,
  RiUserSettingsLine,
} from "@remixicon/react";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { ResourceTab } from "@/components/hrm/settings/ResourceTab";

const departmentFormFields = [{ key: "name", label: "ชื่อแผนก", type: "text", required: true }];

const positionFormFields = [{ key: "name", label: "ชื่อตำแหน่ง", type: "text", required: true }];

const employmentStatusFormFields = [{ key: "name", label: "ชื่อสถานะพนักงาน", type: "text", required: true }];

const employmentTypeFormFields = [
  { key: "code", label: "รหัสประเภทการจ้างงาน", type: "text", required: true },
  { key: "name", label: "ชื่อประเภทการจ้างงาน", type: "text", required: true },
];
const employmentTypeDetailFields = [{ key: "code", render: (item) => `รหัส: ${item.code}` }];

const leaveTypeFormFields = [
  { key: "code", label: "รหัสประเภทการลา", type: "text", required: true, readOnlyOnEdit: true },
  { key: "name", label: "ชื่อประเภทการลา", type: "text", required: true },
  { key: "description", label: "รายละเอียด", type: "textarea" },
  {
    key: "annualQuotaDays",
    label: "โควตาวันลาต่อปี (วัน)",
    type: "number",
    hint: "เว้นว่างหากไม่จำกัดจำนวนวัน",
  },
];
const leaveTypeDetailFields = [
  { key: "code", render: (item) => `รหัส: ${item.code}` },
  {
    key: "quota",
    render: (item) => (item.annualQuotaDays == null ? "โควตา: ไม่จำกัด" : `โควตา: ${item.annualQuotaDays} วัน/ปี`),
  },
];

export default function SettingsModule() {
  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold leading-4 uppercase tracking-[0.08em] text-primary">HRM · Settings</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight leading-tight text-foreground sm:text-3xl">
          ตั้งค่าระบบ
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          จัดการข้อมูลหลักที่ใช้ร่วมกันทั้งระบบ เช่น แผนก ตำแหน่ง สถานะและประเภทการจ้างงาน และประเภทการลา
        </p>
      </section>
      <Tabs defaultSelectedKey="departments">
        <TabList aria-label="หมวดหมู่การตั้งค่า" className="flex-wrap">
          <Tab id="departments" icon={RiBuildingLine}>
            แผนก
          </Tab>
          <Tab id="positions" icon={RiBriefcaseLine}>
            ตำแหน่ง
          </Tab>
          <Tab id="employment-statuses" icon={RiShieldUserLine}>
            สถานะพนักงาน
          </Tab>
          <Tab id="employment-types" icon={RiUserSettingsLine}>
            ประเภทการจ้างงาน
          </Tab>
          <Tab id="leave-types" icon={RiCalendarTodoLine}>
            ประเภทการลา
          </Tab>
        </TabList>
        <TabPanel id="departments">
          <ResourceTab
            resourceKey="departments"
            title="แผนก"
            description="รายชื่อแผนกที่ใช้ในทะเบียนพนักงาน"
            endpoint="/api/departments"
            idKey="id"
            formFields={departmentFormFields}
            emptyLabel="ยังไม่มีแผนก"
            deleteMode="hard"
          />
        </TabPanel>
        <TabPanel id="positions">
          <ResourceTab
            resourceKey="positions"
            title="ตำแหน่ง"
            description="รายชื่อตำแหน่งงานที่ใช้ในทะเบียนพนักงาน"
            endpoint="/api/positions"
            idKey="id"
            formFields={positionFormFields}
            emptyLabel="ยังไม่มีตำแหน่ง"
            deleteMode="hard"
          />
        </TabPanel>
        <TabPanel id="employment-statuses">
          <ResourceTab
            resourceKey="employment-statuses"
            title="สถานะพนักงาน"
            description="สถานะของพนักงาน"
            endpoint="/api/employment-statuses"
            idKey="id"
            formFields={employmentStatusFormFields}
            emptyLabel="ยังไม่มีสถานะพนักงาน"
            deleteMode="hard"
          />
        </TabPanel>
        <TabPanel id="employment-types">
          <ResourceTab
            resourceKey="employment-types"
            title="ประเภทการจ้างงาน"
            description="ประเภทสัญญาจ้างของพนักงาน"
            endpoint="/api/employment-types"
            idKey="id"
            formFields={employmentTypeFormFields}
            detailFields={employmentTypeDetailFields}
            emptyLabel="ยังไม่มีประเภทการจ้างงาน"
            deleteMode="hard"
          />
        </TabPanel>
        <TabPanel id="leave-types">
          <ResourceTab
            resourceKey="leave-types"
            title="ประเภทการลา"
            description="ประเภทการลาและโควตาต่อปี"
            endpoint="/api/leave-types"
            idKey="code"
            formFields={leaveTypeFormFields}
            detailFields={leaveTypeDetailFields}
            emptyLabel="ยังไม่มีประเภทการลา"
          />
        </TabPanel>
      </Tabs>
    </div>
  );
}
