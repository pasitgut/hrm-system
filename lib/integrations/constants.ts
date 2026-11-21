export type IntegrationKey = "googleDrive" | "cloudinary" | "checker";

export type IntegrationStatusItem = {
  key: IntegrationKey;
  name: string;
  feature: string;
  configured: boolean;
};

export type IntegrationStatusSummary = {
  googleDrive: boolean;
  cloudinary: boolean;
  checker: boolean;
  unconfigured: IntegrationStatusItem[];
};

export const INTEGRATION_METADATA: Record<
  IntegrationKey,
  { name: string; feature: string; unavailableTitle: string; unavailableDescription: string }
> = {
  googleDrive: {
    name: "Google Drive",
    feature: "อัปโหลดและดาวน์โหลดเอกสารพนักงาน",
    unavailableTitle: "ระบบจัดเก็บเอกสาร (Google Drive) ยังไม่พร้อมใช้งาน",
    unavailableDescription:
      "ยังไม่ได้ตั้งค่าการเชื่อมต่อ Google Drive ในระบบ จึงยังไม่สามารถอัปโหลดหรือดาวน์โหลดไฟล์เอกสารได้ในขณะนี้ แต่สามารถดูรายการและใช้งานส่วนอื่นของระบบได้ตามปกติ",
  },
  cloudinary: {
    name: "Cloudinary",
    feature: "อัปโหลดรูปโปรไฟล์ รูปทรัพย์สิน และรูปในสัญญา",
    unavailableTitle: "ระบบอัปโหลดรูปภาพ (Cloudinary) ยังไม่พร้อมใช้งาน",
    unavailableDescription:
      "ยังไม่ได้ตั้งค่าการเชื่อมต่อ Cloudinary ในระบบ จึงยังไม่สามารถอัปโหลดรูปภาพใหม่ได้ในขณะนี้ แต่การบันทึกและจัดการข้อมูลในฐานข้อมูลยังใช้งานได้ตามปกติ",
  },
  checker: {
    name: "API Checker",
    feature: "ซิงก์ข้อมูลงานตรวจบ้านจากระบบภายนอก",
    unavailableTitle: "ระบบซิงก์ข้อมูล API Checker ยังไม่พร้อมใช้งาน",
    unavailableDescription:
      "ยังไม่ได้ตั้งค่าการเชื่อมต่อ API Checker ในระบบ หน้านี้จะแสดงและจัดการเฉพาะข้อมูลที่บันทึกอยู่ในฐานข้อมูล HRM ตามปกติ",
  },
};

export const DEFAULT_INTEGRATION_STATUS: IntegrationStatusSummary = {
  googleDrive: true,
  cloudinary: true,
  checker: true,
  unconfigured: [],
};
