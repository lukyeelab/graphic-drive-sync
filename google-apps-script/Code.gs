/**
 * Graphic Drive Sync - Google Apps Script Backend (v3.1)
 * ---------------------------------------------------------------------
 * สคริปต์จัดการ Google Sheets & Drive Automation:
 * 1. ดึงงานทุกแถว แม้ช่อง Link (Col F) จะว่างอยู่ก็ตาม
 * 2. ค้นหาชื่อพนักงานเฉพาะคนที่มีชื่อจริง ไม่ดึงแถวที่ว่าง
 * 3. จำกัดการค้นหาแบบ ALL เฉพาะ 10 แผ่นงานล่าสุด เพื่อให้รวดเร็วและไม่ Timeout
 * 4. สร้างโฟลเดอร์ Google Drive (TH & INTER) และแปะลิงก์ใน Col F พร้อมเปลี่ยนสถานะเป็น "เสร็จสิ้น"
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

function extractFolderId(urlOrId) {
  if (!urlOrId) return null;
  const match = urlOrId.match(/[-\w]{25,}/);
  return match ? match[0] : urlOrId;
}

function getOrCreateSubFolder(parentFolder, folderName) {
  const cleanName = folderName.toString().trim();
  const subFolders = parentFolder.getFoldersByName(cleanName);
  if (subFolders.hasNext()) {
    return subFolders.next();
  }
  return parentFolder.createFolder(cleanName);
}

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

    // ดึงรายชื่อพนักงานจาก Col J (ผู้รับงาน)
    const lastRow = sheet.getLastRow();
    if (lastRow >= CONFIG.DATA_START_ROW) {
      const assignees = sheet.getRange(CONFIG.DATA_START_ROW, CONFIG.COL_ASSIGNEE, lastRow - CONFIG.DATA_START_ROW + 1, 1).getValues();
      for (let r = 0; r < assignees.length; r++) {
        const val = assignees[r][0]?.toString().trim();
        if (val && val !== "-" && val !== "ผู้รับงาน" && val !== "undefined" && val.length > 0) {
          staffSet[val] = true;
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
 * อ่านงานจากแผ่นงาน
 */
function getStaffTasks(assignee, targetSheet, pendingOnly) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allSheets = ss.getSheets();

  let sheetsToSearch = [];
  if (targetSheet && targetSheet !== "ALL") {
    const s = ss.getSheetByName(targetSheet);
    if (s) {
      sheetsToSearch.push(s);
    } else {
      return { success: false, error: `ไม่พบแผ่นงานชื่อ: ${targetSheet}` };
    }
  } else {
    // ถ้าค้นหา ALL ให้ค้นหาเฉพาะ 10 แท็บแรก (เช่น แท็บเดือนปัจจุบัน) เพื่อไม่ให้ติด Timeout
    const validSheets = allSheets.filter(s => s.getName().trim() !== "TEM");
    sheetsToSearch = validSheets.slice(0, 10);
  }

  const tasks = [];
  const searchName = (assignee || "").toLowerCase().trim();

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

      // ถ้าไม่มีผู้รับงาน และเรากำลังค้นหาตามชื่อ ให้ข้ามทันที
      if (searchName && searchName !== "all") {
        if (!rowAssignee || rowAssignee === "") continue;
        const rowNameLower = rowAssignee.toLowerCase();
        if (rowNameLower !== searchName && !rowNameLower.includes(searchName)) {
          continue;
        }
      } else {
        if (!rowAssignee && !noVal && !uploadCellText) {
          continue;
        }
      }

      const isCompleted = status === "เสร็จสิ้น" || (uploadUrl !== "" && uploadCellText !== "");

      // ถ้าเลือกเฉพาะงานที่ยังไม่เสร็จ แล้วงานนี้เสร็จแล้ว ให้ข้าม
      if (pendingOnly && isCompleted) {
        continue;
      }

      // ถ้าชื่องานในช่อง F ว่าง ให้สร้างชื่องานเริ่มต้น เช่น "2_หวย APB_7 พย"
      const taskName = uploadCellText !== "" ? uploadCellText : `${noVal || 1}_${currentCategory || "งาน"}_${sheetName}`;

      tasks.push({
        sheetName: sheetName,
        row: r,
        category: currentCategory || "ทั่วไป",
        briefLink: currentBriefLink,
        no: noVal || 1,
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

  const sheetNames = allSheets.map(s => s.getName()).filter(n => n.trim() !== "TEM");

  return {
    success: true,
    sheetName: targetSheet,
    sheets: sheetNames,
    assignee: assignee,
    totalFound: tasks.length,
    tasks: tasks,
  };
}

/**
 * สร้างโฟลเดอร์ Google Drive และอัปเดตชีต
 */
function createFoldersAndSyncBatch(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tasks = payload.tasks || [];
  if (tasks.length === 0) {
    throw new Error("ไม่มีรายการงานที่เลือก");
  }

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

    const { thFolder, interFolder } = getMonthlyRootFolders(sheet);
    const thDateFolder = getOrCreateSubFolder(thFolder, sName);
    const interDateFolder = interFolder ? getOrCreateSubFolder(interFolder, sName) : null;

    const sheetTasks = grouped[sName];
    for (let t = 0; t < sheetTasks.length; t++) {
      const task = sheetTasks[t];
      const category = task.category || "ทั่วไป";
      const taskName = task.taskName;
      const row = task.row;

      const thCatFolder = getOrCreateSubFolder(thDateFolder, category);
      let interCatFolder = null;
      if (interDateFolder) {
        interCatFolder = getOrCreateSubFolder(interDateFolder, category);
      }

      const thTaskFolder = getOrCreateSubFolder(thCatFolder, taskName);
      let interTaskFolder = null;
      if (interCatFolder) {
        interTaskFolder = getOrCreateSubFolder(interCatFolder, taskName);
      }

      const thUrl = thTaskFolder.getUrl();
      const interUrl = interTaskFolder ? interTaskFolder.getUrl() : "";

      // แปะลิงก์ใน Col F
      const cellF = sheet.getRange(row, CONFIG.COL_UPLOAD_LINK);
      const richValue = SpreadsheetApp.newRichTextValue()
        .setText(taskName)
        .setLinkUrl(thUrl)
        .build();
      cellF.setRichTextValue(richValue);

      // เปลี่ยนสถานะ Col L เป็น "เสร็จสิ้น"
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

function doGet(e) {
  try {
    const action = e.parameter.action || "getTasks";

    let data;
    if (action === "getMetadata") {
      data = getInitialMetadata();
    } else if (action === "getSheets") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheetNames = ss.getSheets().map(s => s.getName()).filter(n => n.trim() !== "TEM");
      data = { success: true, sheets: sheetNames };
    } else if (action === "getTasks") {
      const assignee = e.parameter.assignee || "";
      const sheet = e.parameter.sheet || "";
      const pendingOnly = e.parameter.pendingOnly === "true";
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
