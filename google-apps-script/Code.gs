/**
 * Graphic Drive Sync - Google Apps Script Backend (v2)
 * ---------------------------------------------------------------------
 * สคริปต์จัดการ Google Sheets & Drive Automation:
 * - ค้นหางานที่ยังไม่ได้อัปโหลดตามชื่อพนักงานข้ามทุกวัน/วันที่เลือก
 * - ดึงรายชื่อพนักงานทั้งหมดและรายชื่อวันที่ล่าสุดอัตโนมัติ
 * - สร้างโฟลเดอร์ Google Drive (TH และ INTER) โดยไม่สร้างซ้ำ
 * - นำลิงก์ TH ไปแปะลงในช่อง Link อัปไฟล์งาน (Col F-G) พร้อมเปลี่ยนสถานะเป็น "เสร็จสิ้น"
 */

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
 * ดึงโฟลเดอร์หลัก TH และ INTER จากแถวที่ 3 ของ Sheet นั้นๆ
 */
function getMonthlyRootFolders(sheet) {
  const cellF3 = sheet.getRange(3, 6);
  const cellG3 = sheet.getRange(3, 7);

  let thUrl = null;
  let interUrl = null;

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
    throw new Error(`ไม่พบ Link โฟลเดอร์ TH ในช่อง F3 ของแผ่นงาน: ${sheet.getName()}`);
  }

  const thFolder = DriveApp.getFolderById(thFolderId);
  const interFolder = interFolderId ? DriveApp.getFolderById(interFolderId) : null;

  return { thFolder, interFolder };
}

/**
 * ดึงข้อมูลเบื้องต้น: รายชื่อแท็บวันที่ทั้งหมด และรายชื่อพนักงานทุกคนที่มีในชีต
 */
function getInitialMetadata() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allSheets = ss.getSheets();
  const sheetNames = [];
  const staffSet = {};

  for (let s = 0; s < allSheets.length; s++) {
    const sheet = allSheets[s];
    const name = sheet.getName().trim();
    if (name === "TEM") continue;
    sheetNames.push(name);

    // ดึงรายชื่อพนักงานจาก Col J (เฉพาะ 10 แผ่นงานล่าสุดเพื่อความรวดเร็ว)
    if (sheetNames.length <= 15) {
      const lastRow = Math.min(sheet.getLastRow(), 80);
      if (lastRow >= CONFIG.DATA_START_ROW) {
        const assignees = sheet.getRange(CONFIG.DATA_START_ROW, CONFIG.COL_ASSIGNEE, lastRow - CONFIG.DATA_START_ROW + 1, 1).getValues();
        for (let r = 0; r < assignees.length; r++) {
          const val = assignees[r][0]?.toString().trim();
          if (val && val !== "-" && val !== "ผู้รับงาน") {
            staffSet[val] = true;
          }
        }
      }
    }
  }

  return {
    success: true,
    sheetNames: sheetNames,
    staffList: Object.keys(staffSet).sort(),
  };
}

/**
 * ค้นหางานตามชื่อพนักงาน:
 * - ถ้า searchAllSheets = true: วิ่งตรวจทุกแผ่นงาน (หรือ 10 แผ่นงานล่าสุด)
 * - ดึงเฉพาะงานที่ "ยังไม่ได้อัปงาน" (ช่อง Col F ว่าง หรือไม่มีลิงก์ หรือสถานะไม่ใช่ เสร็จสิ้น)
 */
function getStaffTasks(assignee, targetSheet, pendingOnly) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allSheets = ss.getSheets();

  // กำหนดแผ่นงานที่จะค้นหา
  let sheetsToSearch = [];
  if (targetSheet && targetSheet !== "ALL") {
    const s = ss.getSheetByName(targetSheet);
    if (s) sheetsToSearch.push(s);
  } else {
    sheetsToSearch = allSheets.filter(s => s.getName().trim() !== "TEM");
  }

  const tasks = [];
  const normalizedAssignee = (assignee || "").toLowerCase().trim();

  for (let sIdx = 0; sIdx < sheetsToSearch.length; sIdx++) {
    const sheet = sheetsToSearch[sIdx];
    const sheetName = sheet.getName();
    const lastRow = sheet.getLastRow();
    if (lastRow < CONFIG.DATA_START_ROW) continue;

    const range = sheet.getRange(1, 1, lastRow, 14);
    const values = range.getValues();
    const richTexts = range.getRichTextValues();

    let currentCategory = "";
    let currentBriefLink = "";

    for (let r = CONFIG.DATA_START_ROW; r <= lastRow; r++) {
      const rowIdx = r - 1;

      // Handle Category & Brief ที่ Merge Cells ไว้
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

      const rowAssignee = values[rowIdx][CONFIG.COL_ASSIGNEE - 1]?.toString().trim() || "";
      if (!rowAssignee) continue;

      // กรองตามชื่อพนักงาน
      if (normalizedAssignee && rowAssignee.toLowerCase() !== normalizedAssignee) {
        continue;
      }

      const noVal = values[rowIdx][CONFIG.COL_NO - 1];
      const uploadCellText = values[rowIdx][CONFIG.COL_UPLOAD_LINK - 1]?.toString().trim() || "";
      const uploadRich = richTexts[rowIdx][CONFIG.COL_UPLOAD_LINK - 1];
      let uploadUrl = "";
      if (uploadRich && uploadRich.getLinkUrl()) {
        uploadUrl = uploadRich.getLinkUrl();
      }

      const team = values[rowIdx][CONFIG.COL_TEAM - 1]?.toString().trim() || "";
      const assignDate = values[rowIdx][CONFIG.COL_ASSIGN_DATE - 1];
      const status = values[rowIdx][CONFIG.COL_STATUS - 1]?.toString().trim() || "";

      const isCompleted = status === "เสร็จสิ้น" || (uploadUrl !== "" && uploadCellText !== "");

      // ถ้าเลือก pendingOnly = true ให้ข้ามงานที่เสร็จแล้ว
      if (pendingOnly && isCompleted) {
        continue;
      }

      // ถ้าช่องชื่องานว่าง ให้ตั้งชื่อแนะนำเบื้องต้น เช่น "1_สล็อต" หรือ "2_คาสิโน"
      const taskName = uploadCellText !== "" ? uploadCellText : `${noVal || 1}_${currentCategory}_${sheetName}`;

      tasks.push({
        sheetName: sheetName,
        row: r,
        category: currentCategory,
        briefLink: currentBriefLink,
        no: noVal,
        taskName: taskName,
        uploadUrl: uploadUrl,
        hasUploadLink: !!uploadUrl,
        team: team,
        assignee: rowAssignee,
        assignDate: assignDate instanceof Date ? Utilities.formatDate(assignDate, "GMT+7", "dd/MM/yyyy") : assignDate,
        status: status || "กำลังทำ",
        isCompleted: isCompleted,
      });
    }
  }

  return {
    success: true,
    assignee: assignee,
    targetSheet: targetSheet,
    totalFound: tasks.length,
    tasks: tasks,
  };
}

/**
 * สร้างโฟลเดอร์ Google Drive ข้ามวันและอัปเดต Google Sheets
 * payload: {
 *   tasks: [
 *     { sheetName: "7 พย", row: 4, category: "สล็อต", taskName: "1_ใหม่มาจองสวรรค์ 1000_0711" },
 *     { sheetName: "8 พย", row: 5, category: "บอล", taskName: "2_UFABET_0811" }
 *   ]
 * }
 */
function createFoldersAndSyncBatch(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tasks = payload.tasks || [];
  if (tasks.length === 0) {
    throw new Error("ไม่มีรายการงานที่เลือก");
  }

  // จัดกลุ่มงานตาม Sheet Name (วันที่)
  const grouped = {};
  for (let i = 0; i < tasks.length; i++) {
    const item = tasks[i];
    if (!grouped[item.sheetName]) {
      grouped[item.sheetName] = [];
    }
    grouped[item.sheetName].push(item);
  }

  const results = [];

  for (const sName in grouped) {
    const sheet = ss.getSheetByName(sName);
    if (!sheet) continue;

    // 1. ดึง Root Folders ประจำเดือนจากแถวที่ 3 ของชีตนี้
    const { thFolder, interFolder } = getMonthlyRootFolders(sheet);

    // 2. หาหรือสร้างโฟลเดอร์วันที่ใน TH และ INTER (เช่น "7 พย")
    const thDateFolder = getOrCreateSubFolder(thFolder, sName);
    const interDateFolder = interFolder ? getOrCreateSubFolder(interFolder, sName) : null;

    const sheetTasks = grouped[sName];
    for (let t = 0; t < sheetTasks.length; t++) {
      const task = sheetTasks[t];
      const category = task.category || "ทั่วไป";
      const taskName = task.taskName;
      const row = task.row;

      // 3. หาหรือสร้างโฟลเดอร์หมวดหมู่ (เช่น สล็อต, บอล, คาสิโน)
      const thCatFolder = getOrCreateSubFolder(thDateFolder, category);
      let interCatFolder = null;
      if (interDateFolder) {
        interCatFolder = getOrCreateSubFolder(interDateFolder, category);
      }

      // 4. สร้างโฟลเดอร์ชื่องาน ทั้ง TH และ INTER
      const thTaskFolder = getOrCreateSubFolder(thCatFolder, taskName);
      let interTaskFolder = null;
      if (interCatFolder) {
        interTaskFolder = getOrCreateSubFolder(interCatFolder, taskName);
      }

      const thUrl = thTaskFolder.getUrl();
      const interUrl = interTaskFolder ? interTaskFolder.getUrl() : "";

      // 5. เขียน Link กลับเข้า Google Sheets (Col F: Link อัปไฟล์งาน)
      const cellF = sheet.getRange(row, CONFIG.COL_UPLOAD_LINK);
      const richValue = SpreadsheetApp.newRichTextValue()
        .setText(taskName)
        .setLinkUrl(thUrl)
        .build();
      cellF.setRichTextValue(richValue);

      // 6. เปลี่ยนสถานะ Col L เป็น "เสร็จสิ้น"
      const cellL = sheet.getRange(row, CONFIG.COL_STATUS);
      cellL.setValue("เสร็จสิ้น");

      results.push({
        sheetName: sName,
        row: row,
        taskName: taskName,
        thFolderUrl: thUrl,
        interFolderUrl: interUrl,
        status: "เสร็จสิ้น",
      });
    }
  }

  return {
    success: true,
    message: `สร้างโฟลเดอร์และอัปเดตชีตสำเร็จ ${results.length} รายการ`,
    updatedTasks: results,
  };
}

/**
 * API GET Handler
 */
function doGet(e) {
  try {
    const action = e.parameter.action || "getTasks";

    let data;
    if (action === "getMetadata") {
      data = getInitialMetadata();
    } else if (action === "getTasks") {
      const assignee = e.parameter.assignee || "";
      const sheet = e.parameter.sheet || "ALL";
      const pendingOnly = e.parameter.pendingOnly !== "false"; // default true
      data = getStaffTasks(assignee, sheet, pendingOnly);
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
      data = createFoldersAndSyncBatch(postData);
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
