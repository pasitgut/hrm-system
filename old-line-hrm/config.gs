// @ts-nocheck
// === CONFIG ===
const SHEET_ID = '';
const CALENDAR_ID = '';
const LINE_TOKEN = '';
const ADMIN_IDS = ['Uabc8c8dd33f417a33e4cc0f40bed5e8e', 'U4b1ede6a558298fea4143598f79a1df5', 'Ua1d3f2c129cfc719ecc529f437a07341', 'U434ade49d3040167eaac1bd627ea483d']; 

function isAdmin(uid) {
  return ADMIN_IDS.includes(uid);
}


function getLineProfile() {
  // บังคับให้พ่น Log ออกมาทันทีที่เริ่มรัน เพื่อเช็คว่าฟังก์ชันนี้ทำงานจริงไหม
  console.log("--- เริ่มต้นการทำงานฟังก์ชัน getLineProfile ---");
  
  const userId = 'example-userId'; 

  try {
    var options = {
      "method" : "GET",
      "headers" : {
        "Authorization" : "Bearer " + LINE_TOKEN,
        "Accept" : "application/json"
      },
      "muteHttpExceptions" : true
    };
    
    console.log(`กำลังดึงข้อมูลจาก LINE API สำหรับ User: ${userId}`);
    var response = UrlFetchApp.fetch("https://api.line.me/v2/bot/profile/" + userId, options);
    
    console.log(`Response Code ที่ได้รับ: ${response.getResponseCode()}`);
    
    if (response.getResponseCode() !== 200) {
      var errorMsg = "Error: HTTP " + response.getResponseCode() + " - " + response.getContentText();
      console.error(errorMsg); 
      return errorMsg;
    }
    
    var json = response.getContentText();
    var data = JSON.parse(json);
    
    // แสดงผลข้อมูลที่ได้ลงใน Log
    console.log("ดึงข้อมูลสำเร็จ! Data:", data.displayName); 
    return "Success";
    
  } catch (err) {
    console.error("เกิดข้อผิดพลาดในระบบ:", err.toString());
    return "Error: " + err.toString();
  }
}