"use client";

import { useState } from "react";
import Link from "next/link";
import { RiUpload2Line } from "@remixicon/react";
import { PageHeader } from "@/components/hrm/PageHeader";
import { Button } from "@/components/ui/button";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { hasPermission } from "@/lib/auth/permissions";
import SalarySlipsModule from "@/components/hrm/salary-slips/SalarySlipsModule";
import SocialSecurityReportForm from "@/components/hrm/payroll/SocialSecurityReportForm";

export default function PayrollModule({ permissions = [] }) {
  const [activeTab, setActiveTab] = useState("payroll");
  const canExportSocialSecurity = hasPermission(permissions, "salary_slips.export");

  return (
    <div className="hrm-page">
      <PageHeader
        eyebrow="ข้อมูล · Payroll"
        title={activeTab === "social-security" ? "ประกันสังคม" : "เงินเดือน"}
        description={activeTab === "social-security"
          ? "สร้างรายการนำส่งจากสลิปเงินเดือนและข้อมูลพนักงานในระบบ"
          : "ตรวจสอบข้อมูลรายรับ–รายหักจากสลิปเงินเดือนที่บันทึกไว้ในระบบ"}
        actions={activeTab === "payroll" && hasPermission(permissions, "salary_slips.import") ? (
          <Button asChild leadingIcon={RiUpload2Line}>
            <Link href="/salary-slips/import">นำเข้า Excel</Link>
          </Button>
        ) : null}
      />

      <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(String(key))}>
        <TabList aria-label="ส่วนงาน Payroll" className="mt-1">
          <Tab id="payroll">เงินเดือน</Tab>
          <Tab id="social-security">ประกันสังคม</Tab>
        </TabList>

        <TabPanel id="payroll" className="mt-4">
          <SalarySlipsModule permissions={permissions} showHeader={false} />
        </TabPanel>

        <TabPanel id="social-security" className="mt-4">
          <SocialSecurityReportForm canExport={canExportSocialSecurity} />
        </TabPanel>
      </Tabs>
    </div>
  );
}
