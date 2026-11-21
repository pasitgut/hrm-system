# สลิปเงินเดือนบน Local

หน้าหลัก `/payroll` ในเฟสปัจจุบันเน้นการสร้างและส่งออก **สลิปเงินเดือน (.pdf / .xlsx)** จาก **ไฟล์ Excel (`.xlsx`) ที่นำเข้าเป็นหลักเท่านั้น** เพื่อคำนวณยอดสะสมรายปี (YTD) และสร้างสลิปให้ดาวน์โหลดทันทีแบบ Stateless (ไม่บันทึกลงฐานข้อมูล)

การติดตั้งใช้ PostgreSQL และบัญชี HRM ตามขั้นตอนปกติ ผู้ใช้ต้องมีสิทธิ์ `salary_slips.view` และ `employees.compensation.view` เพื่อเข้าใช้งานหน้า `/payroll` และต้องมีสิทธิ์ `salary_slips.export` เพื่อตรวจพรีวิวและดาวน์โหลด PDF / Excel

หมายเหตุเพิ่มเติม:
- ฝั่ง Backend ยังคงเก็บโมดูลคำนวณเงินเดือนจากฐานข้อมูล (`lib/payroll/*` และ `/api/payroll`) ไว้ตามเดิมสำหรับเชื่อมต่อในเฟสถัดไป — ดูแนวทางออกแบบที่ [docs/specs/payroll-excel-to-hrm-integration.md](specs/payroll-excel-to-hrm-integration.md)
- ขอบเขตและสูตรของเอนจินคำนวณเงินเดือนภายใน ดูที่ [PAYROLL_DATA.md](PAYROLL_DATA.md)
