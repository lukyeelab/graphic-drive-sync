/**
 * Graphic Drive Sync - Google Apps Script Backend (v4 - Exact Folder Naming)
 * ---------------------------------------------------------------------
 * รองรับการตั้งชื่อโฟลเดอร์ตามมาตรฐานจริงของบริษัท:
 * 
 * 🇹🇭 ฝั่ง TH:
 *   - โฟลเดอร์วันที่: "07 พ.ย. 69" (DD พ.ย. 69)
 *   - โฟลเดอร์หมวดหมู่: "หวย APB", "สล็อต SLOT", "คาสิโน CASINO", "บอล FOOTBALL", "มวย BOXING" ฯลฯ
 *   - โฟลเดอร์งาน: ตั้งตามชื่องานที่พิมพ์จาก Web App (เช่น "2 หวยรอบเที่ยง แจกโชคหลักล้าน ที่ APB")
 *   - นำลิงก์ TH ไปแปะใน Col F พร้อมเปลี่ยนสถานะ Col L เป็น "เสร็จสิ้น"
 * 
 * 🌐 ฝั่ง INTER:
 *   - โฟลเดอร์วันที่: "NOV 07,2026" (MONTH DD,YYYY)
 *   - โฟลเดอร์หมวดหมู่: "APB", "SLOT", "CASINO", "FOOTBALL", "BOXING" ฯลฯ
 *   - โฟลเดอร์งาน: "2 (07.11)" หรือเลขงานตามวันที่
 * 
 * คืนค่าลิงก์ทั้งฝั่ง TH และ INTER ให้แสดงบน Web App เพื่อให้อัปโหลดงานได้ทันที
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

// การแปลงหมวดหมู่งานเป็นชื่อโฟลเดอร์ของ TH และ INTER
const CATEGORY_MAP_TH = {
  "สล็อต": "สล็อต SLOT",
  "เกมสล็อต": "สล็อต SLOT",
  "คาสิโน": "คาสิโน CASINO",
  "บอล": "บอล FOOTBALL",
  "มวย": "มวย BOXING",
  "ไก่ชน": "ไก่ชน COCK FIGHTING",
  "วัวชน": "วัวชน COW FIGHTING",
  "กีฬาอื่นๆ": "กีฬาอื่นๆ Other Sports",
  "หวย APB": "หวย APB",
  "UFA NEWS": "UFA NEWS",
  "แคมเปญ": "แคมเปญ",
  "กิจกรรมกลาง": "กิจกรรมกลาง",
};

const CATEGORY_MAP_INTER = {
  "สล็อต": "SLOT",
  "เกมสล็อต": "SLOT",
  "คาสิโน": "CASINO",
  "บอล": "FOOTBALL",
  "มวย": "BOXING",
  "ไก่ชน": "COCK FIGHTING",
  "วัวชน": "COW FIGHTING",
  "กีฬาอื่นๆ": "OTHER SPORTS",
  "หวย APB": "APB",
  "UFA NEWS": "UFA NEWS",
  "แคมเปญ": "CAMPAIGN",
  "กิจกรรมกลาง": "MAIN ACTIVITY",
};

function extractFolderId(urlOrId) {
  if (!urlOrId) return null;
  const match = urlOrId.match(/[-\w]{25,}/);
  return match ? match[0] : urlOrId;
}

/**
 * แปลงชื่อแผ่นงาน (เช่น "7 พย") เป็นชื่อโฟลเดอร์ TH, INTER, และรหัสวันที่
 */
function parseDateFormats(sheetName) {
  const match = sheetName.trim().match(/^(\d+)\s*([^\d\s]+)?/);
  const day = match ? parseInt(match[1], 10) : 7;
  const padDay = day < 10 ? "0" + day : "" + day;
  const monthStr = match && match[2] ? match[2].trim() : "พย";

  let thMonth = "พ.ย.";
  let interMonth = "NOV";
  let numMonth = "11";
  let thYear = "69";
  let engYear = "2026";

  if (monthStr.includes("ตค") || monthStr.includes("ต.ค.")) {
    thMonth = "ต.ค.";
    interMonth = "OCT";
    numMonth = "10";
  } else if (monthStr.includes("ธค") || monthStr.includes("ธ.ค.")) {
    thMonth = "ธ.ค.";
    interMonth = "DEC";
    numMonth = "12";
  }

  return {
    dayNumber: day,
    padDay: padDay,
    padMonth: numMonth,
    // ตัวอย่าง: "07 พ.ย. 69"
    thFolderName: `${padDay} ${thMonth} ${thYear}`,
    // ตัวอย่าง: "NOV 07,2026"
    interFolderName: `${interMonth} ${padDay},${engYear}`,
    // ตัวอย่าง: "07.11"
    interDateSuffix: `${padDay}.${numMonth}`,
  };
}

/**
 * ดึงหรือสร้างโฟลเดอร์ โดยตรวจสอบว่ามีโฟลเดอร์ที่มีชื่อใกล้เคียงกันอยู่แล้วหรือไม่
 */
function getOrCreateFolderFlexible(parentFolder, targetName, aliases) {
  const cleanTarget = targetName.trim().toLowerCase();
  const subFolders = parentFolder.getFolders();
  
  // ตรวจสอบโฟลเดอร์ที่มีอยู่ก่อน
  while (subFolders.hasNext()) {
    const f = subFolders.next();
    const fName = f.getName().trim().toLowerCase();
    
    if (fName === cleanTarget) {
      return f;
    }
    
    // ตรวจสอบชื่อทางเลือก (aliases)
    if (aliases && Array.isArray(aliases)) {
      for (let a = 0; a < aliases.length; a++) {
        if (fName === aliases[a].trim().toLowerCase()) {
          return f;
        }
      }
    }
  }

  // ถ้าไม่มี ให้สร้างใหม่ตาม targetName
  return parentFolder.createFolder(targetName.trim());
}

/**
 * ดึงลิงก์และข้อความจากเซลล์ (รองรับทั้ง Formula =HYPERLINK, RichText runs, Smart Chips, และ URL ตรง)
 */
function extractCellLinkAndTitle(val, richText, formula) {
  let link = "";
  let title = (val || "").toString().trim();

  // 1. ตรวจสอบจาก Formula (เช่น =HYPERLINK("https://...", "Asia PowerBall..."))
  if (formula && typeof formula === "string" && formula.toUpperCase().indexOf("HYPERLINK") !== -1) {
    const match = formula.match(/HYPERLINK\(\s*["']([^"']+)["']/i);
    if (match && match[1]) {
      link = match[1].trim();
    }
  }

  // 2. ตรวจสอบจาก RichTextValue (LinkUrl หลัก)
  if (!link && richText) {
    const directUrl = richText.getLinkUrl();
    if (directUrl) {
      link = directUrl.trim();
    } else {
      // 3. ตรวจสอบจาก RichText Runs (กรณีจัดรูปแบบข้อความ หรือมีไฮเปอร์ลิงก์อยู่ในข้อความบางส่วน)
      const runs = richText.getRuns();
      if (runs && runs.length > 0) {
        for (let i = 0; i < runs.length; i++) {
          const runUrl = runs[i].getLinkUrl();
          if (runUrl) {
            link = runUrl.trim();
            break;
          }
        }
      }
    }
  }

  // 4. ตรวจสอบจากข้อความตรงๆ กรณีผู้ใช้แปะ URL ลงมาตรงๆ
  if (!link && title) {
    if (title.startsWith("http://") || title.startsWith("https://")) {
      link = title;
    } else if (title.startsWith("drive.google.com") || title.startsWith("docs.google.com")) {
      link = "https://" + title;
    }
  }

  return { link: link, title: title };
}

/**
 * ดึง Root Folders ประจำเดือนของ TH (Col F3) และ INTER (Col G3)
 */
function getMonthlyRootFolders(sheet) {
  const cellF3 = sheet.getRange(3, 6);
  const cellG3 = sheet.getRange(3, 7);

  const f3Extracted = extractCellLinkAndTitle(
    cellF3.getValue(),
    cellF3.getRichTextValue(),
    cellF3.getFormula()
  );
  const g3Extracted = extractCellLinkAndTitle(
    cellG3.getValue(),
    cellG3.getRichTextValue(),
    cellG3.getFormula()
  );

  const thUrl = f3Extracted.link || f3Extracted.title;
  const interUrl = g3Extracted.link || g3Extracted.title;

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
 * ดึงรายชื่อพนักงานและแท็บวันที่ทั้งหมด
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
 * ดึงรายการงานตามชื่อพนักงาน
 * - ถ้า Col F ว่าง ให้ taskName ส่งค่าเป็น "" (ว่างเปล่า) เพื่อให้หน้าเว็บพิมพ์เอง
 * - แสดงเฉพาะงานที่ยังไม่เสร็จสิ้น หรือทั้งหมดตามที่เลือก
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
    // กรณี ALL ค้นหาเฉพาะ 12 แผ่นงานแรกของเดือนปัจจุบันเพื่อความรวดเร็ว
    const validSheets = allSheets.filter(s => s.getName().trim() !== "TEM");
    sheetsToSearch = validSheets.slice(0, 15);
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
    const formulas = range.getFormulas();

    let currentCategory = "";
    let currentBriefLink = "";
    let currentBriefTitle = "";

    for (let r = CONFIG.DATA_START_ROW; r <= lastRow; r++) {
      const rowIdx = r - 1;

      // จัดการหมวดหมู่ (Col C: Merged Cell)
      const categoryCell = values[rowIdx][CONFIG.COL_CATEGORY_NAME - 1];
      if (categoryCell && categoryCell.toString().trim() !== "") {
        currentCategory = categoryCell.toString().trim();
        // เมื่อขึ้นหมวดหมู่ใหม่ ให้รีเซ็ตใบบรีฟเดิม
        currentBriefLink = "";
        currentBriefTitle = "";
      }

      // จัดการใบบรีฟ (Col D: Merged Cell) - ตรวจสอบทั้ง Formula, RichText runs และ URL ตรง
      const briefVal = values[rowIdx][CONFIG.COL_BRIEF_LINK - 1];
      const briefRich = richTexts[rowIdx][CONFIG.COL_BRIEF_LINK - 1];
      const briefFormula = formulas[rowIdx][CONFIG.COL_BRIEF_LINK - 1];
      const extractedBrief = extractCellLinkAndTitle(briefVal, briefRich, briefFormula);

      if (extractedBrief.link) {
        currentBriefLink = extractedBrief.link;
      }
      if (extractedBrief.title) {
        currentBriefTitle = extractedBrief.title;
      }

      const rowAssignee = values[rowIdx][CONFIG.COL_ASSIGNEE - 1]?.toString().trim() || "";
      const noVal = values[rowIdx][CONFIG.COL_NO - 1];

      // จัดการลิงก์อัปงาน Col F (รองรับทั้ง RichText, Formula, และ Plain Text)
      const uploadCellText = values[rowIdx][CONFIG.COL_UPLOAD_LINK - 1]?.toString().trim() || "";
      const uploadRich = richTexts[rowIdx][CONFIG.COL_UPLOAD_LINK - 1];
      const uploadFormula = formulas[rowIdx][CONFIG.COL_UPLOAD_LINK - 1];
      const extractedUpload = extractCellLinkAndTitle(uploadCellText, uploadRich, uploadFormula);
      const uploadUrl = extractedUpload.link;

      const team = values[rowIdx][CONFIG.COL_TEAM - 1]?.toString().trim() || "";
      const assignDate = values[rowIdx][CONFIG.COL_ASSIGN_DATE - 1];
      const status = values[rowIdx][CONFIG.COL_STATUS - 1]?.toString().trim() || "";

      // ถ้าค้นหาตามชื่อ ต้องมีผู้รับงานและชื่อต้องตรงกัน
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

      const isCompleted = status.includes("เสร็จสิ้น") || (uploadUrl !== "" && uploadCellText !== "");

      // ถ้าเลือกเฉพาะงานที่ยังไม่เสร็จสิ้น แล้วงานนี้เสร็จแล้ว ให้ข้าม
      if (pendingOnly && isCompleted) {
        continue;
      }

      // ถ้า Col F ว่าง ให้ taskName เป็นค่าว่าง เพื่อให้หน้าเว็บว่างไว้สำหรับพิมพ์
      const taskName = uploadCellText;

      tasks.push({
        sheetName: sheetName,
        row: r,
        category: currentCategory || "ทั่วไป",
        briefLink: currentBriefLink,   // URL ของใบบรีฟ
        briefTitle: currentBriefTitle, // ข้อความ/ชื่อใบบรีฟ
        no: noVal || 1,
        taskName: taskName, // ว่างเปล่าถ้ายังไม่ได้ใส่
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
 * สร้างโฟลเดอร์ Google Drive สำหรับ TH และ INTER ตามรูปแบบมาตรฐาน
 */
function createFoldersAndSyncBatch(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tasks = payload.tasks || [];
  if (tasks.length === 0) {
    throw new Error("ไม่มีรายการงานที่เลือก");
  }

  // จัดกลุ่มงานตาม sheetName (วันที่)
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

    // 1. ดึง Root Folders จากแถว 3
    const { thFolder, interFolder } = getMonthlyRootFolders(sheet);

    // 2. คำนวณชื่อโฟลเดอร์วันที่ตามมาตรฐาน (เช่น "07 พ.ย. 69" และ "NOV 07,2026")
    const dateInfo = parseDateFormats(sName);

    // สร้าง/ค้นหาโฟลเดอร์วันที่ฝั่ง TH: "07 พ.ย. 69" (หรือชื่อ "7 พย", "07 พย 69")
    const thDateAliases = [sName, `${dateInfo.dayNumber} พ.ย. 69`, `${dateInfo.padDay} พย 69`];
    const thDateFolder = getOrCreateFolderFlexible(thFolder, dateInfo.thFolderName, thDateAliases);

    // สร้าง/ค้นหาโฟลเดอร์วันที่ฝั่ง INTER: "NOV 07,2026"
    let interDateFolder = null;
    if (interFolder) {
      const interAliases = [`NOV ${dateInfo.dayNumber},2026`, `${dateInfo.padDay} NOV 2026`];
      interDateFolder = getOrCreateFolderFlexible(interFolder, dateInfo.interFolderName, interAliases);
    }

    const sheetTasks = grouped[sName];
    for (let t = 0; t < sheetTasks.length; t++) {
      const task = sheetTasks[t];
      const rawCategory = task.category || "ทั่วไป";
      const taskName = task.taskName || `${task.no || 1}_${rawCategory}`;
      const row = task.row;

      // 3. หมวดหมู่ฝั่ง TH (เช่น "หวย APB", "สล็อต SLOT", "คาสิโน CASINO")
      const thCatTargetName = CATEGORY_MAP_TH[rawCategory] || rawCategory;
      const thCatAliases = [rawCategory];
      const thCatFolder = getOrCreateFolderFlexible(thDateFolder, thCatTargetName, thCatAliases);

      // 4. หมวดหมู่ฝั่ง INTER (เช่น "APB", "SLOT", "CASINO", "FOOTBALL")
      let interCatFolder = null;
      if (interDateFolder) {
        const interCatTargetName = CATEGORY_MAP_INTER[rawCategory] || rawCategory;
        const interCatAliases = [rawCategory];
        interCatFolder = getOrCreateFolderFlexible(interDateFolder, interCatTargetName, interCatAliases);
      }

      // 5. โฟลเดอร์งานฝั่ง TH: ตั้งชื่อตามชื่องาน (เช่น "2 หวยรอบเที่ยง แจกโชคหลักล้าน ที่ APB")
      const thTaskFolder = getOrCreateFolderFlexible(thCatFolder, taskName, []);
      const thUrl = thTaskFolder.getUrl();

      // 6. โฟลเดอร์งานฝั่ง INTER: "2 (07.11)" หรือตามลำดับงาน
      let interUrl = "";
      if (interCatFolder) {
        const interTaskName = `${task.no || 1} (${dateInfo.interDateSuffix})`;
        const interTaskFolder = getOrCreateFolderFlexible(interCatFolder, interTaskName, [`${task.no || 1}`]);
        interUrl = interTaskFolder.getUrl();
      }

      // 7. เขียน Link กลับเข้า Google Sheets ใน Col F (Link อัปไฟล์งาน)
      const cellF = sheet.getRange(row, CONFIG.COL_UPLOAD_LINK);
      const richValue = SpreadsheetApp.newRichTextValue()
        .setText(taskName)
        .setLinkUrl(thUrl)
        .build();
      cellF.setRichTextValue(richValue);

      // 8. เปลี่ยนสถานะ Col L เป็น "เสร็จสิ้น"
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
    message: `สร้างโฟลเดอร์ TH & INTER และอัปเดตชีตสำเร็จ ${results.length} รายการ`,
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
