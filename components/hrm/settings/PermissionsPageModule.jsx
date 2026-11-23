"use client";

import { PageHeader } from "@/components/hrm/PageHeader";
import UserPermissionsTab from "@/components/hrm/settings/UserPermissionsTab";

export default function PermissionsPageModule() {
  return (
    <div className="hrm-page">
      <PageHeader
        eyebrow="ระบบ · สิทธิ์การเข้าถึง"
        title="จัดการสิทธิ์และการเข้าถึงหน้า"
        description="เปิดปิดการเข้าถึงแต่ละหน้าเมนู และกำหนดสิทธิ์การใช้งานแยกตามบทบาทและรายบุคคล"
      />
      <UserPermissionsTab hideHeader />
    </div>
  );
}
