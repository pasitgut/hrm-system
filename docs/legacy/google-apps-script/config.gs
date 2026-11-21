// @ts-nocheck

// === CONFIG ===

const SHEET_ID = "REDACTED";

const CALENDAR_ID = "REDACTED";

const LINE_TOKEN = "REDACTED";

const ADMIN_IDS = [];



function isAdmin(uid) {

  return ADMIN_IDS.includes(uid);

}





function getLineProfile() {

  // บังคับให้พ่น Log ออกมาทันทีที่เริ่มรัน เพื่อเช็คว่าฟังก์ชันนี้ทำงานจริงไหม

  console.log("--- เริ่มต้นการทำงานฟังก์ชัน getLineProfile ---");



  const userId = "REDACTED";



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
