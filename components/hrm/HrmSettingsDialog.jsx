"use client";

import { useState } from "react";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";

export function HrmSettingsDialog({ open, onClose }) {
  const [language, setLanguage] = useState("ไทย");
  const [timezone, setTimezone] = useState("Asia/Bangkok");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [approvalAlerts, setApprovalAlerts] = useState(true);
  const [saved, setSaved] = useState(false);

  return (
    <HrmDialog
      open={open}
      onClose={onClose}
      title="ตั้งค่าระบบ"
      description="จัดการข้อมูลบัญชีและวิธีรับการแจ้งเตือน"
      size="lg"
      footer={<><Button variant="outline" onClick={onClose}>ยกเลิก</Button><Button onClick={() => setSaved(true)}>บันทึกการตั้งค่า</Button></>}
    >
      <Tabs defaultSelectedKey="general">
        <TabList aria-label="หมวดการตั้งค่า" className="w-full sm:w-auto">
          <Tab id="general">ทั่วไป</Tab>
          <Tab id="profile">โปรไฟล์</Tab>
          <Tab id="notifications">การแจ้งเตือน</Tab>
        </TabList>
        <TabPanel id="general" className="pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">ภาษา</span>
              <Select aria-label="ภาษา" selectedKey={language} onSelectionChange={(value) => setLanguage(String(value))}>
                <SelectItem id="ไทย">ไทย</SelectItem>
                <SelectItem id="English">English</SelectItem>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">เขตเวลา</span>
              <Select aria-label="เขตเวลา" selectedKey={timezone} onSelectionChange={(value) => setTimezone(String(value))}>
                <SelectItem id="Asia/Bangkok">กรุงเทพฯ (UTC+7)</SelectItem>
                <SelectItem id="Asia/Singapore">สิงคโปร์ (UTC+8)</SelectItem>
              </Select>
            </div>
            <Input label="เวลาเริ่มงาน" type="time" defaultValue="09:00" />
            <Input label="เวลาเลิกงาน" type="time" defaultValue="18:00" />
          </div>
        </TabPanel>
        <TabPanel id="profile" className="pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="ชื่อ-สกุล" defaultValue="นภัสสร สายทอง" />
            <Input label="ตำแหน่ง" defaultValue="HR Manager" />
            <Input label="อีเมล" type="email" defaultValue="napatsorn@peopleos.co.th" />
            <Input label="เบอร์โทรศัพท์" type="tel" defaultValue="081-234-5678" />
          </div>
        </TabPanel>
        <TabPanel id="notifications" className="space-y-4 pt-4">
          <label className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <span><strong className="block text-sm font-medium">แจ้งเตือนทางอีเมล</strong><span className="mt-1 block text-sm text-muted-foreground">ส่งสรุปรายการและสถานะคำขอไปยังอีเมลของคุณ</span></span>
            <Switch aria-label="แจ้งเตือนทางอีเมล" isSelected={emailAlerts} onChange={setEmailAlerts} />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <span><strong className="block text-sm font-medium">คำขอรออนุมัติ</strong><span className="mt-1 block text-sm text-muted-foreground">แจ้งเตือนเมื่อมีรายการใหม่จากทีม</span></span>
            <Switch aria-label="คำขอรออนุมัติ" isSelected={approvalAlerts} onChange={setApprovalAlerts} />
          </label>
        </TabPanel>
      </Tabs>
      {saved ? <p role="status" className="mt-4 text-sm text-status-success">บันทึกการตั้งค่าแล้ว</p> : null}
    </HrmDialog>
  );
}
