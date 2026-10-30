/**
 * Graphic Drive Sync - Google Apps Script Backend
 * ---------------------------------------------------------------------
 * สคริปต์นี้ใช้สำหรับติดตั้งใน Google Sheets:
 * ไปที่ ส่วนขยาย (Extensions) > Apps Script > วางโค้ดนี้แทนที่ทั้งหมด
 */

// โครงสร้าง Config และค่าเริ่มต้น
const CONFIG = {
  HEADER_ROW: 3,         // แถวที่ 3 มีลิงก์โฟลเดอร์หลัก TH (Col F) และ INTER (Col G)
  DATA_START_ROW: 4,     // แถวที่ 4 เริ่มต้นรายการงาน
  COL_CATEGORY_NAME: 3,  // Col C: หมวด (สล็อต, คาสิโน, บอล ฯลฯ - merged)
  COL_BRIEF_LINK: 4,     // Col D: ใบบรีฟ (merged)
  COL_NO: 5,             // Col E: No. (ลำดับงาน)
  COL_UPLOAD_LINK: 6,    // Col F: Link อัปไฟล์งาน (F-G merged)
  COL_TEAM: 9,           // Col I: ทีม (A TH, B TH)
  COL_ASSIGNEE: 10,      // Col J: ผู้รับงาน (เช่น ลูกหยี, บอย, วิน)
  COL_ASSIGN_DATE: 11,   // Col K: วันที่จ่ายงาน
  COL_STATUS: 12,        // Col L: Status (เสร็จสิ้น, กำลังทำ ฯลฯ)
  COL_RECEIVER: 14,      // Col N: ชื่อคนรับ
};

/**
 * ดึง Folder ID จาก Google Drive URL หรือ ID ตรงๆ
 */
function extractFolderId(urlOrId) {
  if (!urlOrId) return null;
  const match = urlOrId.match(/[-\w]{25,}/);
  return match ? match[0] : urlOrId;
}

/**
 * ดึงหรือสร้างโฟลเดอร์ลูก โดยไม่สร้างซ้ำถ้ามีอยู่แล้ว
 */
function getOrCreateSubFolder(parentFolder, folderName) {
  const cleanName = folderName.toString().trim();
  const subFolders = parentFolder.getFoldersByName(cleanName);
  if (subFolders.hasNext()) {
    return subFolders.next();
  }
  return parentFolder.createFolder(cleanName);
}

/**
 * ดึงโฟลเดอร์หลัก TH และ INTER จากแถวที่ 3
 */
function getMonthlyRootFolders(sheet) {
  // ดึง RichText หรือค่าธรรมดาจาก F3 (TH) และ G3 (INTER)
  const cellF3 = sheet.getRange(3, 6);
  const cellG3 = sheet.getRange(3, 7);

  let thUrl = null;
  let interUrl = null;

  // ลองดึง RichText Hyperlink
  const richF3 = cellF3.getRichTextValue();
  if (richF3 && richF3.getLinkUrl()) {
    thUrl = richF3.getLinkUrl();
  } else {
    thUrl = cellF3.getValue();
  }

  const richG3 = cellG3.getRichTextValue();
  if (richG3 && richG3.getLinkUrl()) {
    interUrl = richG3.getLinkUrl();
  } else {
    interUrl = cellG3.getValue();
  }

  const thFolderId = extractFolderId(thUrl);
  const interFolderId = extractFolderId(interUrl);

  if (!thFolderId) {
    throw new Error("ไม่พบ Link โฟลเดอร์ TH ในช่อง F3");
  }

  const thFolder = DriveApp.getFolderById(thFolderId);
  const interFolder = interFolderId ? DriveApp.getFolderById(interFolderId) : null;

  return { thFolder, interFolder };
}

/**
 * อ่านรายการงานทั้งหมดใน Sheet (แท็บ) ที่ระบุ พร้อม Handle Merged Cells
 */
function getSheetTasks(sheetName, filterAssignee) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
  
  if (!sheet) {
    return { success: false, error: `ไม่พบชีตชื่อ: ${sheetName}` };
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) {
    return { success: true, tasks: [], sheetName: sheet.getName() };
  }

  const range = sheet.getRange(1, 1, lastRow, 15);
  const values = range.getValues();
  const richTexts = range.getRichTextValues();

  const tasks = [];
  let currentCategory = "";
  let currentBriefLink = "";

  for (let r = CONFIG.DATA_START_ROW; r <= lastRow; r++) {
    const rowIdx = r - 1; // 0-based index

    // Handle Merged Cells สำหรับหมวดหมู่ (Col C) และใบบรีฟ (Col D)
    const categoryCell = values[rowIdx][CONFIG.COL_CATEGORY_NAME - 1];
    if (categoryCell && categoryCell.toString().trim() !== "") {
      currentCategory = categoryCell.toString().trim();
    }

    const briefCell = values[rowIdx][CONFIG.COL_BRIEF_LINK - 1];
    const briefRich = richTexts[rowIdx][CONFIG.COL_BRIEF_LINK - 1];
    if (briefRich && briefRich.getLinkUrl()) {
      currentBriefLink = briefRich.getLinkUrl();
    } else if (briefCell && briefCell.toString().trim() !== "") {
      currentBriefLink = briefCell.toString().trim();
    }

    const noVal = values[rowIdx][CONFIG.COL_NO - 1];
    const taskNameVal = values[rowIdx][CONFIG.COL_UPLOAD_LINK - 1];
    const uploadRich = richTexts[rowIdx][CONFIG.COL_UPLOAD_LINK - 1];
    let uploadUrl = "";
    if (uploadRich && uploadRich.getLinkUrl()) {
      uploadUrl = uploadRich.getLinkUrl();
    }

    const assignee = values[rowIdx][CONFIG.COL_ASSIGNEE - 1]?.toString().trim() || "";
    const team = values[rowIdx][CONFIG.COL_TEAM - 1]?.toString().trim() || "";
    const assignDate = values[rowIdx][CONFIG.COL_ASSIGN_DATE - 1];
    const status = values[rowIdx][CONFIG.COL_STATUS - 1]?.toString().trim() || "";

    // ถ้าไม่มีชื่องาน ให้ข้ามแถวว่าง
    if (!taskNameVal || taskNameVal.toString().trim() === "") continue;

    // กรองตามผู้รับงาน ถ้ามีการระบุ
    if (filterAssignee && filterAssignee !== "ALL") {
      if (assignee.toLowerCase() !== filterAssignee.toLowerCase()) {
        continue;
      }
    }

    tasks.push({
      row: r,
      category: currentCategory,
      briefLink: currentBriefLink,
      no: noVal,
      taskName: taskNameVal.toString().trim(),
      uploadUrl: uploadUrl,
      team: team,
      assignee: assignee,
      assignDate: assignDate instanceof Date ? Utilities.formatDate(assignDate, "GMT+7", "dd/MM/yyyy") : assignDate,
      status: status,
      isCompleted: status === "เสร็จสิ้น" || !!uploadUrl
    });
  }

  // ดึงรายชื่อแท็บทั้งหมด (วันที่)
  const allSheets = ss.getSheets().map(s => s.getName()).filter(name => name !== "TEM");

  return {
    success: true,
    sheetName: sheet.getName(),
    sheets: allSheets,
    tasks: tasks
  };
}

/**
 * สร้างโฟลเดอร์ใน Drive และอัปเดต Google Sheets
 * payload: {
 *   sheetName: "7 พย",
 *   dateFolderName: "7 พย",
 *   tasks: [ { row: 4, category: "สล็อต", taskName: "1_ใหม่มาจองสวรรค์ 1000_0711" } ]
 * }
 */
function createFoldersAndSyncSheet(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(payload.sheetName);
  
  if (!sheet) {
    throw new Error(`ไม่พบแผ่นงาน: ${payload.sheetName}`);
  }

  // 1. ดึง Root Folders ประจำเดือนจากแถวที่ 3
  const { thFolder, interFolder } = getMonthlyRootFolders(sheet);

  // 2. ชื่อโฟลเดอร์วันที่ เช่น "7 พย" หรือ "วันที่ 7"
  const dateFolderName = payload.dateFolderName || payload.sheetName;

  // 3. หาหรือสร้างโฟลเดอร์วันที่ใน TH และ INTER
  const thDateFolder = getOrCreateSubFolder(thFolder, dateFolderName);
  const interDateFolder = interFolder ? getOrCreateSubFolder(interFolder, dateFolderName) : null;

  const results = [];

  for (const item of payload.tasks) {
    const row = item.row;
    const category = item.category || "ทั่วไป";
    const taskName = item.taskName;

    // 4. สร้างหรือค้นหาโฟลเดอร์หมวดหมู่ (เช่น สล็อต, บอล, มวย)
    const thCatFolder = getOrCreateSubFolder(thDateFolder, category);
    let interCatFolder = null;
    if (interDateFolder) {
      interCatFolder = getOrCreateSubFolder(interDateFolder, category);
    }

    // 5. สร้างโฟลเดอร์ชื่องาน
    const thTaskFolder = getOrCreateSubFolder(thCatFolder, taskName);
    let interTaskFolder = null;
    if (interCatFolder) {
      interTaskFolder = getOrCreateSubFolder(interCatFolder, taskName);
    }

    const thFolderUrl = thTaskFolder.getUrl();
    const interFolderUrl = interTaskFolder ? interTaskFolder.getUrl() : "";

    // 6. เขียน Link กลับเข้า Google Sheets (Col F: Link อัปไฟล์งาน)
    // ใช้ RichText เพื่อให้ข้อความยังเป็นชื่องานเดิมแต่คลิกแล้วเปิดลิงก์ได้
    const cellF = sheet.getRange(row, CONFIG.COL_UPLOAD_LINK);
    const richValue = SpreadsheetApp.newRichTextValue()
      .setText(taskName)
      .setLinkUrl(thFolderUrl)
      .build();
    cellF.setRichTextValue(richValue);

    // 7. เปลี่ยนสถานะ Col L เป็น "เสร็จสิ้น"
    const cellL = sheet.getRange(row, CONFIG.COL_STATUS);
    cellL.setValue("เสร็จสิ้น");

    results.push({
      row: row,
      taskName: taskName,
      thFolderUrl: thFolderUrl,
      interFolderUrl: interFolderUrl,
      status: "เสร็จสิ้น"
    });
  }

  return {
    success: true,
    message: `สร้างและอัปเดตสำเร็จ ${results.length} รายการ`,
    updatedTasks: results
  };
}

/**
 * API GET Handler
 */
function doGet(e) {
  try {
    const action = e.parameter.action || "getTasks";
    const sheetName = e.parameter.sheet || "";
    const assignee = e.parameter.assignee || "";

    let data;
    if (action === "getTasks") {
      data = getSheetTasks(sheetName, assignee);
    } else if (action === "getSheets") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheets = ss.getSheets().map(s => s.getName()).filter(name => name !== "TEM");
      data = { success: true, sheets: sheets };
    } else {
      data = { success: false, error: "Invalid action" };
    }

    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * API POST Handler
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action || "createFolders";

    let data;
    if (action === "createFolders") {
      data = createFoldersAndSyncSheet(postData);
    } else {
      data = { success: false, error: "Invalid POST action" };
    }

    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
