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
  if (!urlOrId || typeof urlOrId !== "string") return null;
  const str = urlOrId.trim();
  // 1. ตรวจสอบ pattern /folders/ID
  const folderMatch = str.match(/\/folders\/([-\w]{25,})/i);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }
  // 2. ตรวจสอบ id=ID ใน URL
  const idParamMatch = str.match(/[?&]id=([-\w]{25,})/i);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }
  // 3. ตรวจสอบหากเป็น ID เพียวๆ ความยาวอย่างน้อย 25 ตัวอักษร
  const generalMatch = str.match(/^[-\w]{25,}$/);
  if (generalMatch) {
    return generalMatch[0];
  }
  const embeddedMatch = str.match(/[-\w]{25,}/);
  return embeddedMatch ? embeddedMatch[0] : null;
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
 * ค้นหา URL ของไฟล์หรือโฟลเดอร์ใบบรีฟใน Google Drive ตามชื่อ (เน้น Google Slides Presentation)
 */
function findDriveFileOrFolderUrl(title) {
  if (!title || typeof title !== "string") return "";
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length < 2) return "";

  const singleSpaced = cleanTitle.replace(/\s+/g, " ");

  // 1. ค้นหา Google Slides (Presentation) โดยตรง (เพราะใบบรีฟส่วนใหญ่เป็น Google Slides Presentation)
  try {
    const segments = singleSpaced.split(/[-–—]/);
    const mainKey = (segments[0] || singleSpaced).trim().replace(/['"\\]/g, "");

    if (mainKey.length >= 3) {
      const q = `title contains '${mainKey}' and mimeType = 'application/vnd.google-apps.presentation' and trashed = false`;
      const slides = DriveApp.searchFiles(q);
      if (slides.hasNext()) {
        const slide = slides.next();
        return slide.getUrl(); // คืนค่าเป็น https://docs.google.com/presentation/d/.../edit
      }
    }
  } catch (e) {
    Logger.log("Slides search error: " + e.message);
  }

  // 2. ลองค้นหาไฟล์ตรงตามชื่อ (ทุก MimeType)
  try {
    const files = DriveApp.getFilesByName(singleSpaced);
    while (files.hasNext()) {
      const f = files.next();
      if (!f.isTrashed()) {
        return f.getUrl();
      }
    }
  } catch (e) {}

  try {
    const files = DriveApp.getFilesByName(cleanTitle);
    while (files.hasNext()) {
      const f = files.next();
      if (!f.isTrashed()) {
        return f.getUrl();
      }
    }
  } catch (e) {}

  // 3. ค้นหาแบบ title contains ทั่วไป
  try {
    const safeTitle = singleSpaced.replace(/['"\\]/g, "");
    const qGeneral = `title contains '${safeTitle.slice(0, 25)}' and trashed = false`;
    const iter = DriveApp.searchFiles(qGeneral);
    if (iter.hasNext()) {
      return iter.next().getUrl();
    }
  } catch (e) {}

  // 4. ลองค้นหาเป็นโฟลเดอร์ใน Drive
  try {
    const folders = DriveApp.getFoldersByName(cleanTitle);
    while (folders.hasNext()) {
      const folder = folders.next();
      if (!folder.isTrashed()) {
        return folder.getUrl();
      }
    }
  } catch (e) {}

  return "";
}

/**
 * ดึง ID ของโฟลเดอร์ Google Drive จากเซลล์ (รองรับ Formula =HYPERLINK, RichText, และ Text)
 */
function extractDriveFolderFromCell(cell) {
  if (!cell) return null;

  // 1. ตรวจสอบ Formula เช่น =HYPERLINK("https://drive.google.com/...", "TH M11")
  try {
    const formula = cell.getFormula();
    if (formula && typeof formula === "string" && formula.toUpperCase().indexOf("HYPERLINK") !== -1) {
      const match = formula.match(/HYPERLINK\(\s*["']([^"']+)["']/i);
      if (match && match[1]) {
        const id = extractFolderId(match[1]);
        if (id) return id;
      }
    }
  } catch (e) {}

  // 2. ตรวจสอบ RichTextValue (LinkUrl หลัก และ runs)
  try {
    const rich = cell.getRichTextValue();
    if (rich) {
      const directUrl = rich.getLinkUrl();
      if (directUrl) {
        const id = extractFolderId(directUrl);
        if (id) return id;
      }
      const runs = rich.getRuns();
      if (runs && runs.length > 0) {
        for (let i = 0; i < runs.length; i++) {
          const runUrl = runs[i].getLinkUrl();
          if (runUrl) {
            const id = extractFolderId(runUrl);
            if (id) return id;
          }
        }
      }
    }
  } catch (e) {}

  // 3. ตรวจสอบ Value ธรรมดา
  try {
    const val = cell.getValue();
    if (val && typeof val === "string") {
      const id = extractFolderId(val);
      if (id) return id;
    }
  } catch (e) {}

  return null;
}

/**
 * ค้นหาโฟลเดอร์ Google Drive ตามชื่อ (เช่น "TH M11" -> ค้นหา "M11" ก่อน)
 */
function findFolderByNameSmart(cellText, fallbackNames) {
  const candidates = [];
  if (cellText && typeof cellText === "string") {
    const raw = cellText.trim();
    // ตัดคำว่า TH หรือ INTER และช่องว่างออก เช่น "TH M11" -> "M11", "INTER  เดือน 11" -> "เดือน 11"
    const stripped = raw.replace(/^(TH|INTER)\s*/i, "").trim();
    if (stripped) candidates.push(stripped);
    if (raw !== stripped) candidates.push(raw);
  }

  if (fallbackNames && Array.isArray(fallbackNames)) {
    for (let i = 0; i < fallbackNames.length; i++) {
      if (!candidates.includes(fallbackNames[i])) {
        candidates.push(fallbackNames[i]);
      }
    }
  }

  for (let i = 0; i < candidates.length; i++) {
    const name = candidates[i];
    try {
      const iter = DriveApp.getFoldersByName(name);
      while (iter.hasNext()) {
        const folder = iter.next();
        if (!folder.isTrashed()) {
          return folder;
        }
      }
    } catch (e) {
      Logger.log(`ค้นหาโฟลเดอร์ ${name} ไม่สำเร็จ: ${e.message}`);
    }
  }

  return null;
}

/**
 * ดึง URI ของ Google Drive Smart Chip จากช่องที่ระบุผ่าน Google Sheets API v4
 */
function getCellSmartChipUri(spreadsheetId, sheetName, a1Notation) {
  try {
    const token = ScriptApp.getOAuthToken();
    const encodedRange = encodeURIComponent(`'${sheetName}'!${a1Notation}`);
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?ranges=${encodedRange}&fields=sheets(data(rowData(values(chipRuns))))`;
    
    const res = UrlFetchApp.fetch(apiUrl, {
      method: "get",
      headers: { "Authorization": "Bearer " + token },
      muteHttpExceptions: true
    });

    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      const rows = data.sheets?.[0]?.data?.[0]?.rowData;
      if (rows && rows.length > 0) {
        for (let r = 0; r < rows.length; r++) {
          const vals = rows[r].values;
          if (!vals) continue;
          for (let c = 0; c < vals.length; c++) {
            const chips = vals[c].chipRuns;
            if (chips && chips.length > 0) {
              for (let k = 0; k < chips.length; k++) {
                const uri = chips[k].chip?.richLinkProperties?.uri;
                if (uri) return uri;
              }
            }
          }
        }
      }
    }
  } catch (e) {
    Logger.log("Error in getCellSmartChipUri: " + e.message);
  }
  return null;
}

/**
 * ดึงแผนที่ Smart Chips ทั้งหมดในแผ่นงาน (สำหรับใบบรีฟ และโฟลเดอร์)
 */
function getSheetSmartChipsMap(spreadsheetId, sheetName, lastRow) {
  const chipMap = {};
  try {
    const token = ScriptApp.getOAuthToken();
    const encodedRange = encodeURIComponent(`'${sheetName}'!A1:N${lastRow}`);
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?ranges=${encodedRange}&fields=sheets(data(rowData(values(chipRuns))))`;
    
    const res = UrlFetchApp.fetch(apiUrl, {
      method: "get",
      headers: { "Authorization": "Bearer " + token },
      muteHttpExceptions: true
    });

    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      const rows = data.sheets?.[0]?.data?.[0]?.rowData;
      if (rows && rows.length > 0) {
        for (let r = 0; r < rows.length; r++) {
          const vals = rows[r].values;
          if (!vals) continue;
          for (let c = 0; c < vals.length; c++) {
            const chips = vals[c].chipRuns;
            if (chips && chips.length > 0) {
              for (let k = 0; k < chips.length; k++) {
                const uri = chips[k].chip?.richLinkProperties?.uri;
                if (uri) {
                  chipMap[`${r + 1}_${c + 1}`] = uri;
                  break;
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    Logger.log("Error in getSheetSmartChipsMap: " + e.message);
  }
  return chipMap;
}

/**
 * ดึง Root Folders ประจำเดือนของ TH (Col F แถว 3) และ INTER (Col G แถว 3)
 * รองรับทั้ง Google Drive Smart Chip (เช่น M11, เดือน 11), Link Hyperlink, และการค้นหาตามชื่อโฟลเดอร์
 */
function getMonthlyRootFolders(sheet) {
  const ss = sheet.getParent();
  const ssId = ss.getId();
  const sheetName = sheet.getName();

  let thFolder = null;
  let interFolder = null;

  // 1. ลองดึงจาก Google Sheets API ผ่าน UrlFetchApp (สำหรับ Smart Chips เช่น M11 และ เดือน 11)
  try {
    const chipF3Url = getCellSmartChipUri(ssId, sheetName, "F3");
    if (chipF3Url) {
      const id = extractFolderId(chipF3Url);
      if (id) {
        try { thFolder = DriveApp.getFolderById(id); } catch(e) {}
      }
    }
  } catch (e) {
    Logger.log("Chip F3 fetch: " + e.message);
  }

  try {
    const chipG3Url = getCellSmartChipUri(ssId, sheetName, "G3");
    if (chipG3Url) {
      const id = extractFolderId(chipG3Url);
      if (id) {
        try { interFolder = DriveApp.getFolderById(id); } catch(e) {}
      }
    }
  } catch (e) {
    Logger.log("Chip G3 fetch: " + e.message);
  }

  // 2. ถ้ายังไม่ได้ ลองดึงจาก Formula (=HYPERLINK) หรือ RichText ของเซลล์ปกติ
  if (!thFolder) {
    const cellF3 = sheet.getRange(3, 6);
    const f3Id = extractDriveFolderFromCell(cellF3);
    if (f3Id) {
      try { thFolder = DriveApp.getFolderById(f3Id); } catch(e) {}
    }
  }

  if (!interFolder) {
    const cellG3 = sheet.getRange(3, 7);
    const g3Id = extractDriveFolderFromCell(cellG3);
    if (g3Id) {
      try { interFolder = DriveApp.getFolderById(g3Id); } catch(e) {}
    }
  }

  // 3. Fallback สำคัญ: ค้นหาโฟลเดอร์ใน Google Drive โดยตรงจากชื่อของ Smart Chip และชื่อโฟลเดอร์จริงตามเดือน
  const dateInfo = parseDateFormats(sheetName);
  const thDynamicNames = [
    `ใบขาย ${dateInfo.thMonth} ${dateInfo.interMonth} ${dateInfo.thYear}`,
    `ใบขาย ${dateInfo.thMonth}`,
    "ใบขาย พ.ย. NOV 69",
    `M${dateInfo.padMonth}`,
    `TH M${dateInfo.padMonth}`,
    "M11",
    "TH M11",
  ];
  const interDynamicNames = [
    `[${dateInfo.padMonth}] ${dateInfo.interMonth} ${dateInfo.engYear}`,
    `${dateInfo.padMonth} ${dateInfo.interMonth} ${dateInfo.engYear}`,
    `[${dateInfo.padMonth}] ${dateInfo.interMonth}`,
    "[11] NOV 2026",
    "11 NOV 2026",
    `เดือน ${dateInfo.padMonth}`,
    `เดือน ${parseInt(dateInfo.padMonth, 10)}`,
    "เดือน 11",
    "INTER  เดือน 11",
    "INTER เดือน 11",
  ];

  if (!thFolder) {
    const f3Val = sheet.getRange(3, 6).getValue()?.toString() || "";
    thFolder = findFolderByNameSmart(f3Val, thDynamicNames);
  }

  if (!interFolder) {
    const g3Val = sheet.getRange(3, 7).getValue()?.toString() || "";
    interFolder = findFolderByNameSmart(g3Val, interDynamicNames);
  }

  if (!thFolder) {
    const f3Val = sheet.getRange(3, 6).getValue() || "";
    throw new Error(`ไม่พบโฟลเดอร์ Google Drive ของ TH ในช่อง F3 (ค่าในช่องคือ "${f3Val}") กรุณาตรวจสอบว่ามีโฟลเดอร์ชื่อ M11 หรือ ใบขาย พ.ย. NOV 69 ใน Google Drive`);
  }

  return { thFolder: thFolder, interFolder: interFolder };
}

/**
 * ดึงรายชื่อพนักงานและแท็บวันที่ทั้งหมด (เพิ่ม CacheService โหลดไวในพริบตา)
 */
function getInitialMetadata() {
  const cache = CacheService.getScriptCache();
  const cachedMeta = cache.get("INITIAL_METADATA_V4");
  if (cachedMeta) {
    try {
      return JSON.parse(cachedMeta);
    } catch (e) {}
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allSheets = ss.getSheets();
  const sheetNames = [];
  const staffSet = { "ลูกหยี": true };

  for (let s = 0; s < allSheets.length; s++) {
    const sheet = allSheets[s];
    const name = sheet.getName().trim();
    if (name === "TEM") continue;
    sheetNames.push(name);
  }

  // สแกนรายชื่อพนักงานเฉพาะ 3 แผ่นงานแรก เพื่อให้โหลดเสร็จภายในเสี้ยววินาที
  const sheetsToCheck = allSheets.filter(s => s.getName().trim() !== "TEM").slice(0, 3);
  for (let s = 0; s < sheetsToCheck.length; s++) {
    const sheet = sheetsToCheck[s];
    const lastRow = sheet.getLastRow();
    if (lastRow >= CONFIG.DATA_START_ROW) {
      const assignees = sheet.getRange(CONFIG.DATA_START_ROW, CONFIG.COL_ASSIGNEE, Math.min(lastRow - CONFIG.DATA_START_ROW + 1, 100), 1).getValues();
      for (let r = 0; r < assignees.length; r++) {
        const val = assignees[r][0]?.toString().trim();
        if (val && val !== "-" && val !== "ผู้รับงาน" && val !== "undefined" && val.length > 0) {
          staffSet[val] = true;
        }
      }
    }
  }

  const result = {
    success: true,
    sheetNames: sheetNames,
    staffList: Object.keys(staffSet).sort(),
  };

  // แคชข้อมูล Metadata ไว้ 10 นาที (600 วินาที)
  try {
    cache.put("INITIAL_METADATA_V4", JSON.stringify(result), 600);
  } catch (e) {}

  return result;
}

/**
 * ฟังก์ชันช่วยดึงข้อมูลชีตแบบ Ultra-Fast ผ่าน Google Sheets API v4 ในครั้งเดียว
 * ได้ทั้งค่าข้อความ, Hyperlink, Smart Chip URI และ Note โดยไม่ต้องเรียก getRichTextValues() ที่ช้า
 */
function fetchSheetsGridDataFast(spreadsheetId, sheetNames) {
  try {
    const token = ScriptApp.getOAuthToken();
    const rangesParam = sheetNames
      .map(name => `ranges=${encodeURIComponent(`'${name}'!A1:N600`)}`)
      .join("&");
    const fields = "sheets(properties(title),data(rowData(values(formattedValue,hyperlink,note,textFormatRuns(format(link(uri))),chipRuns(chip(richLinkProperties(uri)))))))";
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${rangesParam}&fields=${encodeURIComponent(fields)}`;

    const res = UrlFetchApp.fetch(apiUrl, {
      method: "get",
      headers: { "Authorization": "Bearer " + token },
      muteHttpExceptions: true
    });

    if (res.getResponseCode() !== 200) {
      Logger.log("fetchSheetsGridDataFast error code: " + res.getResponseCode());
      return null;
    }
    return JSON.parse(res.getContentText());
  } catch (e) {
    Logger.log("fetchSheetsGridDataFast exception: " + e.message);
    return null;
  }
}

/**
 * ดึงลิงก์และข้อความจาก Cell Object ของ Sheets API v4 (รองรับทั้ง Smart Chip, Hyperlink และ Runs)
 */
function extractApiCellInfo(cellObj) {
  if (!cellObj) return { title: "", link: "", note: "" };
  const title = (cellObj.formattedValue || "").toString().trim();
  const note = (cellObj.note || "").toString().trim();
  let link = cellObj.hyperlink || "";

  // 1. ดึงลิงก์จาก Google Drive Smart Chip ทันที (ไม่ต้องค้นหาใน DriveApp!)
  if (!link && cellObj.chipRuns && cellObj.chipRuns.length > 0) {
    for (let i = 0; i < cellObj.chipRuns.length; i++) {
      const uri = cellObj.chipRuns[i].chip?.richLinkProperties?.uri;
      if (uri) {
        link = uri.trim();
        break;
      }
    }
  }

  // 2. ดึงจาก textFormatRuns เผื่อมี hyperlink อยู่ใน run
  if (!link && cellObj.textFormatRuns && cellObj.textFormatRuns.length > 0) {
    for (let i = 0; i < cellObj.textFormatRuns.length; i++) {
      const uri = cellObj.textFormatRuns[i].format?.link?.uri;
      if (uri) {
        link = uri.trim();
        break;
      }
    }
  }

  // 3. กรณีวาง URL ตรงๆ ในช่อง
  if (!link && title) {
    if (title.startsWith("http://") || title.startsWith("https://")) {
      link = title;
    } else if (title.startsWith("drive.google.com") || title.startsWith("docs.google.com")) {
      link = "https://" + title;
    }
  }

  return { title: title, link: link, note: note };
}

/**
 * ดึงรายการงานตามชื่อพนักงาน (Ultra-Fast Version: ใช้ Sheets API Batch + CacheService)
 */
function getStaffTasks(assignee, targetSheet, pendingOnly) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ssId = ss.getId();
  const allSheets = ss.getSheets();
  const allSheetNames = allSheets.map(s => s.getName()).filter(n => n.trim() !== "TEM");

  let targetSheetNames = [];
  if (targetSheet && targetSheet !== "ALL") {
    if (allSheetNames.includes(targetSheet)) {
      targetSheetNames.push(targetSheet);
    } else {
      return { success: false, error: `ไม่พบแผ่นงานชื่อ: ${targetSheet}` };
    }
  } else {
    // กรณี ALL ค้นหาเฉพาะ 8 แผ่นงานแรกของเดือนปัจจุบันเพื่อความรวดเร็ว
    targetSheetNames = allSheetNames.slice(0, 8);
  }

  const tasks = [];
  const searchName = (assignee || "").toLowerCase().trim();
  const scriptCache = CacheService.getScriptCache();
  const memoryBriefCache = {};

  // ดึงข้อมูลทุกแผ่นงานที่ต้องการใน HTTP Request เดียว (เร็วกว่า getRichTextValues 10-20 เท่า)
  const apiData = fetchSheetsGridDataFast(ssId, targetSheetNames);

  if (apiData && apiData.sheets && apiData.sheets.length > 0) {
    for (let sIdx = 0; sIdx < apiData.sheets.length; sIdx++) {
      const sheetObj = apiData.sheets[sIdx];
      const sheetName = sheetObj.properties?.title || targetSheetNames[sIdx];
      const rowData = sheetObj.data?.[0]?.rowData || [];

      let currentCategory = "";
      let currentBriefLink = "";
      let currentBriefTitle = "";

      for (let r = CONFIG.DATA_START_ROW; r <= rowData.length; r++) {
        const rowIdx = r - 1;
        const vals = rowData[rowIdx]?.values;
        if (!vals || vals.length === 0) continue;

        // 1. จัดการหมวดหมู่ (Col C: Merged Cell)
        const categoryCell = vals[CONFIG.COL_CATEGORY_NAME - 1]?.formattedValue;
        if (categoryCell && categoryCell.toString().trim() !== "") {
          currentCategory = categoryCell.toString().trim();
          currentBriefLink = "";
          currentBriefTitle = "";
        }

        // 2. จัดการใบบรีฟ (Col D: Merged Cell - ได้ลิงก์ Smart Chip ทันทีจาก API)
        const briefInfo = extractApiCellInfo(vals[CONFIG.COL_BRIEF_LINK - 1]);
        if (briefInfo.link) {
          currentBriefLink = briefInfo.link;
        }
        if (briefInfo.title) {
          currentBriefTitle = briefInfo.title;
        }

        // 3. กรองตามชื่อพนักงานทันที
        const rowAssignee = (vals[CONFIG.COL_ASSIGNEE - 1]?.formattedValue || "").toString().trim();
        const noVal = vals[CONFIG.COL_NO - 1]?.formattedValue || "";
        const uploadInfo = extractApiCellInfo(vals[CONFIG.COL_UPLOAD_LINK - 1]);
        const uploadCellText = uploadInfo.title;
        const status = (vals[CONFIG.COL_STATUS - 1]?.formattedValue || "").toString().trim();

        if (searchName && searchName !== "all") {
          if (!rowAssignee) continue;
          const rowNameLower = rowAssignee.toLowerCase();
          if (rowNameLower !== searchName && !rowNameLower.includes(searchName)) {
            continue;
          }
        } else {
          if (!rowAssignee && !noVal && !uploadCellText) {
            continue;
          }
        }

        const uploadUrl = uploadInfo.link;
        const cellNote = uploadInfo.note;
        let interFolderUrl = "";
        const noteMatch = cellNote.match(/INTER:\s*(https:\/\/[^\s]+)/i);
        if (noteMatch && noteMatch[1]) {
          interFolderUrl = noteMatch[1].trim();
        }

        const isCompleted = status.includes("เสร็จสิ้น") || (uploadUrl !== "" && uploadCellText !== "");

        if (pendingOnly && isCompleted) {
          continue;
        }

        // 4. ดึงลิงก์ใบบรีฟ (ถ้าเป็น Smart Chip จะได้จาก currentBriefLink ทันที แต่ถ้าเป็นข้อความธรรมดาจะดึงจาก CacheService)
        let taskBriefLink = currentBriefLink;
        if (!taskBriefLink && currentBriefTitle) {
          const cacheKey = "BRIEF_URL_" + Utilities.base64EncodeWebSafe(currentBriefTitle).slice(0, 60);
          if (memoryBriefCache[currentBriefTitle] !== undefined) {
            taskBriefLink = memoryBriefCache[currentBriefTitle];
          } else {
            const cachedUrl = scriptCache.get(cacheKey);
            if (cachedUrl !== null) {
              taskBriefLink = cachedUrl;
              memoryBriefCache[currentBriefTitle] = cachedUrl;
            } else {
              taskBriefLink = findDriveFileOrFolderUrl(currentBriefTitle);
              memoryBriefCache[currentBriefTitle] = taskBriefLink;
              try {
                scriptCache.put(cacheKey, taskBriefLink || "", 21600); // แคชไว้นาน 6 ชั่วโมง
              } catch (e) {}
            }
          }
        }

        const team = (vals[CONFIG.COL_TEAM - 1]?.formattedValue || "").toString().trim();
        const assignDate = vals[CONFIG.COL_ASSIGN_DATE - 1]?.formattedValue || "";

        tasks.push({
          sheetName: sheetName,
          row: r,
          category: currentCategory || "ทั่วไป",
          briefLink: taskBriefLink,
          briefTitle: currentBriefTitle,
          no: noVal || 1,
          taskName: uploadCellText,
          uploadUrl: uploadUrl,
          interFolderUrl: interFolderUrl,
          hasUploadLink: !!uploadUrl,
          team: team,
          assignee: rowAssignee,
          assignDate: assignDate,
          status: status || "กำลังทำ",
          isCompleted: isCompleted,
        });
      }
    }
  } else {
    // Fallback: กรณี API มีปัญหา ให้ใช้วิธีอ่านปกติของ SpreadsheetApp
    Logger.log("Falling back to standard SpreadsheetApp reading");
    for (let sIdx = 0; sIdx < targetSheetNames.length; sIdx++) {
      const sName = targetSheetNames[sIdx];
      const sheet = ss.getSheetByName(sName);
      if (!sheet) continue;
      const lastRow = sheet.getLastRow();
      if (lastRow < CONFIG.DATA_START_ROW) continue;

      const range = sheet.getRange(1, 1, lastRow, 14);
      const values = range.getValues();
      const richTexts = range.getRichTextValues();
      const formulas = range.getFormulas();
      const notes = range.getNotes();

      let currentCategory = "";
      let currentBriefLink = "";
      let currentBriefTitle = "";

      for (let r = CONFIG.DATA_START_ROW; r <= lastRow; r++) {
        const rowIdx = r - 1;
        const categoryCell = values[rowIdx][CONFIG.COL_CATEGORY_NAME - 1];
        if (categoryCell && categoryCell.toString().trim() !== "") {
          currentCategory = categoryCell.toString().trim();
          currentBriefLink = "";
          currentBriefTitle = "";
        }

        const briefVal = values[rowIdx][CONFIG.COL_BRIEF_LINK - 1];
        const briefRich = richTexts[rowIdx][CONFIG.COL_BRIEF_LINK - 1];
        const briefFormula = formulas[rowIdx][CONFIG.COL_BRIEF_LINK - 1];
        const extractedBrief = extractCellLinkAndTitle(briefVal, briefRich, briefFormula);

        if (extractedBrief.link) currentBriefLink = extractedBrief.link;
        if (extractedBrief.title) currentBriefTitle = extractedBrief.title;

        const rowAssignee = values[rowIdx][CONFIG.COL_ASSIGNEE - 1]?.toString().trim() || "";
        const noVal = values[rowIdx][CONFIG.COL_NO - 1];
        const uploadCellText = values[rowIdx][CONFIG.COL_UPLOAD_LINK - 1]?.toString().trim() || "";
        const status = values[rowIdx][CONFIG.COL_STATUS - 1]?.toString().trim() || "";

        if (searchName && searchName !== "all") {
          if (!rowAssignee || (rowAssignee.toLowerCase() !== searchName && !rowAssignee.toLowerCase().includes(searchName))) continue;
        } else {
          if (!rowAssignee && !noVal && !uploadCellText) continue;
        }

        const uploadRich = richTexts[rowIdx][CONFIG.COL_UPLOAD_LINK - 1];
        const uploadFormula = formulas[rowIdx][CONFIG.COL_UPLOAD_LINK - 1];
        const extractedUpload = extractCellLinkAndTitle(uploadCellText, uploadRich, uploadFormula);
        const uploadUrl = extractedUpload.link;

        const cellNote = (notes[rowIdx] && notes[rowIdx][CONFIG.COL_UPLOAD_LINK - 1]) || "";
        let interFolderUrl = "";
        const noteMatch = cellNote.match(/INTER:\s*(https:\/\/[^\s]+)/i);
        if (noteMatch && noteMatch[1]) {
          interFolderUrl = noteMatch[1].trim();
        }

        const isCompleted = status.includes("เสร็จสิ้น") || (uploadUrl !== "" && uploadCellText !== "");
        if (pendingOnly && isCompleted) continue;

        let taskBriefLink = currentBriefLink;
        if (!taskBriefLink && currentBriefTitle) {
          taskBriefLink = findDriveFileOrFolderUrl(currentBriefTitle);
        }

        const team = values[rowIdx][CONFIG.COL_TEAM - 1]?.toString().trim() || "";
        const assignDate = values[rowIdx][CONFIG.COL_ASSIGN_DATE - 1];

        tasks.push({
          sheetName: sName,
          row: r,
          category: currentCategory || "ทั่วไป",
          briefLink: taskBriefLink,
          briefTitle: currentBriefTitle,
          no: noVal || 1,
          taskName: uploadCellText,
          uploadUrl: uploadUrl,
          interFolderUrl: interFolderUrl,
          hasUploadLink: !!uploadUrl,
          team: team,
          assignee: rowAssignee,
          assignDate: assignDate instanceof Date ? Utilities.formatDate(assignDate, "GMT+7", "dd/MM/yyyy") : assignDate,
          status: status || "กำลังทำ",
          isCompleted: isCompleted,
        });
      }
    }
  }

  return {
    success: true,
    sheetName: targetSheet,
    sheets: allSheetNames,
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
        const interAliases = [
          `${task.no || 1}`,
          `${task.no || 1} ${dateInfo.dayNumber}.${parseInt(dateInfo.padMonth, 10)}`,
          `${task.no || 1} ${dateInfo.interDateSuffix}`,
          `${task.no || 1} (${dateInfo.dayNumber}.${parseInt(dateInfo.padMonth, 10)})`,
        ];
        const interTaskFolder = getOrCreateFolderFlexible(interCatFolder, interTaskName, interAliases);
        interUrl = interTaskFolder.getUrl();
      }

      // 7. เขียน Link กลับเข้า Google Sheets ใน Col F (Link อัปไฟล์งาน)
      const cellF = sheet.getRange(row, CONFIG.COL_UPLOAD_LINK);
      const richValue = SpreadsheetApp.newRichTextValue()
        .setText(taskName)
        .setLinkUrl(thUrl)
        .build();
      cellF.setRichTextValue(richValue);

      // แนบลิงก์ INTER ไว้ใน Note ของเซลล์ Col F เพื่อให้เปิดได้ทั้งสองลิงก์เสมอ
      if (interUrl) {
        try {
          cellF.setNote(`INTER: ${interUrl}`);
        } catch (e) {
          Logger.log(`ไม่สามารถบันทึก Note ในแถว ${row}: ${e.message}`);
        }
      }

      // 8. เปลี่ยนสถานะ Col L เป็น "เสร็จสิ้น ✅" ตามกฎ Data Validation ของชีต
      const cellL = sheet.getRange(row, CONFIG.COL_STATUS);
      try {
        cellL.setValue("เสร็จสิ้น ✅");
      } catch (e1) {
        try {
          cellL.setValue("เสร็จสิ้น");
        } catch (e2) {
          Logger.log(`ไม่สามารถตั้งค่าสถานะแถว ${row}: ${e2.message}`);
        }
      }

      results.push({
        sheetName: sName,
        row: row,
        taskName: taskName,
        thFolderUrl: thUrl,
        interFolderUrl: interUrl,
        status: "เสร็จสิ้น ✅",
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
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: err.toString(),
      message: err.toString()
    }))
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
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: err.toString(),
      message: err.toString()
    }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
