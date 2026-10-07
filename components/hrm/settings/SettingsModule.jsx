"use client";

import {
  RiBriefcaseLine,
  RiBuildingLine,
  RiCalendarTodoLine,
  RiMoneyDollarCircleLine,
  RiShieldUserLine,
  RiUserSettingsLine,
} from "@remixicon/react";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { ResourceTab } from "@/components/hrm/settings/ResourceTab";
import UserPermissionsTab from "@/components/hrm/settings/UserPermissionsTab";
import { OtRateSettingsTab } from "@/components/hrm/settings/OtRateSettingsTab";
import { PageHeader } from "@/components/hrm/PageHeader";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { canManageOtRates } from "@/lib/auth/rolePermissionAccess";
import {
  canManageDepartments,
  canManageEmploymentSettings,
  canManageLeaveTypes,
  canManagePositions,
  canManageUserPermissions,
} from "@/lib/auth/permissions";

const departmentFormFields = [{ key: "name", label: "ชื่อแผนก", type: "text", required: true }];

const positionFormFields = [{ key: "name", label: "ชื่อตำแหน่ง", type: "text", required: true }];

const employmentStatusFormFields = [{ key: "name", label: "ชื่อสถานะพนักงาน", type: "text", required: true }];

const employmentTypeFormFields = [
  { key: "code", label: "รหัสประเภทการจ้างงาน", type: "text", required: true },
  { key: "name", label: "ชื่อประเภทการจ้างงาน", type: "text", required: true },
];
const employmentTypeDetailFields = [{ key: "code", render: (item) => `รหัส: ${item.code}` }];

const leaveTypeFormFields = [
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
  { key: "code", render: (item) => `รหัสอัตโนมัติ: ${item.code}` },
  {
    key: "quota",
    render: (item) => (item.annualQuotaDays == null ? "โควตา: ไม่จำกัด" : `โควตา: ${item.annualQuotaDays} วัน/ปี`),
  },
];

export default function SettingsModule() {
  const user = useHrmRole() ?? {};
  const permissions = user.permissions ?? [];
  const showOtRates = canManageOtRates(user);
  const showDepartments = canManageDepartments(permissions);
  const showPositions = canManagePositions(permissions);
  const showEmploymentSettings = canManageEmploymentSettings(permissions);
  const showLeaveTypes = canManageLeaveTypes(permissions);
  const showUserPermissions = canManageUserPermissions(permissions);
  const defaultTab = showDepartments ? "departments"
    : showPositions ? "positions"
      : showEmploymentSettings ? "employment-statuses"
        : showOtRates ? "ot-rates"
          : showLeaveTypes ? "leave-types"
            : "user-permissions";

  return (
    <div className="hrm-page">
      <PageHeader
        eyebrow="ระบบ · ตั้งค่า"
        title="ตั้งค่าระบบ"
        description="จัดการข้อมูลหลักที่ใช้ร่วมกันทั้งระบบ เช่น แผนก ตำแหน่ง สถานะและประเภทการจ้างงาน และประเภทการลา"
      />
      <Tabs defaultSelectedKey={defaultTab}>
        <TabList aria-label="หมวดหมู่การตั้งค่า" className="flex-wrap">
          {showDepartments ? <Tab id="departments" icon={RiBuildingLine}>แผนก</Tab> : null}
          {showPositions ? <Tab id="positions" icon={RiBriefcaseLine}>ตำแหน่ง</Tab> : null}
          {showEmploymentSettings ? <Tab id="employment-statuses" icon={RiShieldUserLine}>สถานะพนักงาน</Tab> : null}
          {showEmploymentSettings ? <Tab id="employment-types" icon={RiUserSettingsLine}>ประเภทการจ้างงาน</Tab> : null}
          {showOtRates ? <Tab id="ot-rates" icon={RiMoneyDollarCircleLine}>เรท OT</Tab> : null}
          {showLeaveTypes ? <Tab id="leave-types" icon={RiCalendarTodoLine}>ประเภทการลา</Tab> : null}
          {showUserPermissions ? <Tab id="user-permissions" icon={RiShieldUserLine}>สิทธิ์ผู้ใช้</Tab> : null}
        </TabList>
        {showDepartments ?
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
          : null}
        {showPositions ?
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
          : null}
        {showEmploymentSettings ? <>
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
        </> : null}
        {showOtRates ? <TabPanel id="ot-rates"><OtRateSettingsTab /></TabPanel> : null}
        {showLeaveTypes ? <TabPanel id="leave-types">
          <ResourceTab
            resourceKey="leave-types"
            title="ประเภทการลา"
            description="เพิ่ม แก้ไข เปิดหรือปิดใช้งานประเภทการลา และกำหนดโควตาต่อปี"
            addLabel="เพิ่มประเภทการลา"
            endpoint="/api/leave-types"
            idKey="code"
            formFields={leaveTypeFormFields}
            detailFields={leaveTypeDetailFields}
            emptyLabel="ยังไม่มีประเภทการลา"
          />
        </TabPanel> : null}
        {showUserPermissions ? <TabPanel id="user-permissions"><UserPermissionsTab /></TabPanel> : null}
      </Tabs>
    </div>
  );
}
