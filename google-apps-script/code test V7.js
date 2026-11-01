/**
 * Graphic Drive Sync - Google Apps Script Backend (v4 - Exact Folder Naming - Ultra Fast Optimized)
 * ---------------------------------------------------------------------
 * รองรับการตั้งชื่อโฟลเดอร์ตามมาตรฐานจริงของบริษัท:
 * 
 * ฝั่ง TH:
 *   - โฟลเดอร์วันที่: "07 พ.ย. 69" (DD พ.ย. 69)
 *   - โฟลเดอร์หมวดหมู่: "หวย APB", "สล็อต SLOT", "คาสิโน CASINO", "บอล FOOTBALL", "มวย BOXING" ฯลฯ
 *   - โฟลเดอร์งาน: ตั้งตามชื่องานที่พิมพ์จาก Web App (เช่น "2 หวยรอบเที่ยง แจกโชคหลักล้าน ที่ APB")
 *   - นำลิงก์ TH ไปแปะใน Col F พร้อมเปลี่ยนสถานะ Col L เป็น "เสร็จสิ้น"
 * 
 * ฝั่ง INTER:
 *   - โฟลเดอร์วันที่: "NOV 07,2026" (MONTH DD,YYYY)
 *   - โฟลเดอร์หมวดหมู่: "APB", "SLOT", "CASINO", "FOOTBALL", "BOXING" ฯลฯ
 *   - โฟลเดอร์งาน: "2 (07.11)" หรือเลขงานตามวันที่
 * 
 * คืนค่าลิงก์ทั้งฝั่ง TH และ INTER ให้แสดงบน Web App เพื่อให้อัปโหลดงานได้ทันที
 */

const CONFIG = {
  HEADER_ROW: 3,               // แถวที่ 3 มีลิงก์โฟลเดอร์หลัก TH (Col F) และ INTER (Col G)
  DATA_START_ROW: 4,           // แถวที่ 4 เริ่มต้นรายการงาน
  COL_CATEGORY_NAME: 3,        // Col C: หมวด (สล็อต, คาสิโน, บอล ฯลฯ - merged)
  COL_BRIEF_LINK: 4,           // Col D: ใบบรีฟ (merged)
  COL_NO: 5,                   // Col E: No. (ลำดับงาน)
  COL_UPLOAD_LINK: 6,          // Col F: Link อัปไฟล์งาน (F-G merged)
  COL_TEAM: 9,                 // Col I: ทีม (A TH, B TH)
  COL_ASSIGNEE: 10,            // Col J: ผู้รับงาน (เช่น ลูกหยี, บอย, วิน)
  COL_ASSIGN_DATE: 11,         // Col K: วันที่จ่ายงาน
  COL_STATUS: 12,              // Col L: Status (เสร็จสิ้น, กำลังทำ ฯลฯ)
  COL_RECEIVER: 14,            // Col N: ชื่อคนรับ
  EMPTY_ROW_STREAK_LIMIT: 25,  // หยุดกวาดทันทีเมื่อเจอแถวว่างติดต่อกันครบ 25 แถว
};

// In-Memory Cache สำหรับเก็บรายการโฟลเดอร์ย่อยระหว่างรัน เพื่อลดการเรียก DriveApp.getFolders() ซ้ำซ้อน
const FOLDER_CHILDREN_CACHE = {};
const CATEGORY_INFO_CACHE = {};
const DATE_FORMAT_CACHE = {};
const B64_KEY_CACHE = {};
let CACHED_OAUTH_TOKEN = null;
let CACHED_SPREADSHEET_ID = null;
let CACHED_ACTIVE_SS = null;

/**
 * ดึง OAuth Token โดยจำค่าไว้ในตัวแปรตลอดรอบรัน (ไม่ต้องเรียก ScriptApp ซ้ำ)
 */
function getFastOAuthToken() {
  if (!CACHED_OAUTH_TOKEN) {
    CACHED_OAUTH_TOKEN = ScriptApp.getOAuthToken();
  }
  return CACHED_OAUTH_TOKEN;
}

/**
 * ดึง Active Spreadsheet Object โดยจำค่าไว้ในตัวแปรตลอดรอบรัน
 */
function getFastActiveSpreadsheet() {
  if (!CACHED_ACTIVE_SS) {
    CACHED_ACTIVE_SS = SpreadsheetApp.getActiveSpreadsheet();
  }
  return CACHED_ACTIVE_SS;
}

/**
 * ดึง Spreadsheet ID แบบเร็วพิเศษจาก Cache หรือ Memory โดยไม่ต้องปลุก SpreadsheetApp หากไม่จำเป็น
 */
function getFastSpreadsheetId() {
  if (CACHED_SPREADSHEET_ID) return CACHED_SPREADSHEET_ID;
  const cache = CacheService.getScriptCache();
  const cachedId = cache.get("STATIC_SS_ID_V1");
  if (cachedId) {
    CACHED_SPREADSHEET_ID = cachedId;
    return cachedId;
  }
  const ss = getFastActiveSpreadsheet();
  CACHED_SPREADSHEET_ID = ss.getId();
  try {
    cache.put("STATIC_SS_ID_V1", CACHED_SPREADSHEET_ID, 21600);
  } catch (e) {}
  return CACHED_SPREADSHEET_ID;
}

/**
 * แปลงข้อความเป็นรหัส Base64 สำหรับทำ Cache Key พร้อมจำค่าไว้ใน Memory (ไม่ต้องคำนวณซ้ำในลูป)
 */
function getSafeB64Key(str, maxLen) {
  const limit = maxLen || 35;
  const cacheKey = `${limit}_${str}`;
  if (B64_KEY_CACHE[cacheKey] !== undefined) {
    return B64_KEY_CACHE[cacheKey];
  }
  const encoded = Utilities.base64EncodeWebSafe(str).slice(0, limit);
  B64_KEY_CACHE[cacheKey] = encoded;
  return encoded;
}

/**
 * ดึงรายการโฟลเดอร์ย่อยพร้อมจำค่าไว้ใน In-Memory Cache (เรียก DriveApp เพียง 1 ครั้งต่อโฟลเดอร์หลัก)
 */
function getCachedSubFoldersList(parentFolder) {
  if (!parentFolder) return [];
  const parentId = parentFolder.getId();
  let folderList = FOLDER_CHILDREN_CACHE[parentId];
  if (!folderList) {
    folderList = [];
    const subFolders = parentFolder.getFolders();
    while (subFolders.hasNext()) {
      const f = subFolders.next();
      const fName = f.getName();
      const cleanName = normalizeStringFuzzy(fName);
      folderList.push({
        folder: f,
        name: fName,
        clean: cleanName,
        noDiacritics: stripThaiDiacritics(cleanName),
      });
    }
    FOLDER_CHILDREN_CACHE[parentId] = folderList;
  }
  return folderList;
}

/**
 * ระบบ Auto-Heal (In-Memory): ตรวจสอบและย้ายโฟลเดอร์วันที่ที่อาจเคยถูกสร้างสลับที่ระหว่าง TH และ INTER
 * Optimized: ตรวจสอบจาก Memory Cache ทันทีใน 0ms โดยไม่ต้องยิง DriveApp.getFoldersByName() ซ้ำในลูป
 */
function autoHealMisplacedDateFolders(thFolder, interFolder, dateInfo) {
  if (!thFolder || !interFolder) return;
  try {
    const thList = getCachedSubFoldersList(thFolder);
    const interList = getCachedSubFoldersList(interFolder);
    const targetInterClean = dateInfo ? normalizeStringFuzzy(dateInfo.interFolderName) : null;
    const targetThClean = dateInfo ? normalizeStringFuzzy(dateInfo.thFolderName) : null;

    const interDatePattern = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2},?\s*\d{4}/i;
    const thDatePattern = /^\d{1,2}\s+(ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?)\s+\d{2,4}/i;

    for (let i = thList.length - 1; i >= 0; i--) {
      const isInter = (targetInterClean && (thList[i].clean === targetInterClean || thList[i].name === dateInfo.interFolderName)) || interDatePattern.test(thList[i].name);
      if (isInter) {
        const wf = thList[i].folder;
        Logger.log(`[Auto-Heal] ย้ายโฟลเดอร์ ${wf.getName()} จาก TH (${thFolder.getName()}) ไปยัง INTER (${interFolder.getName()})`);
        try {
          wf.moveTo(interFolder);
        } catch (eM1) {
          interFolder.addFolder(wf);
          thFolder.removeFolder(wf);
        }
        const movedItem = thList.splice(i, 1)[0];
        interList.push(movedItem);
      }
    }

    for (let i = interList.length - 1; i >= 0; i--) {
      const isTh = (targetThClean && (interList[i].clean === targetThClean || interList[i].name === dateInfo.thFolderName)) || thDatePattern.test(interList[i].name);
      if (isTh) {
        const wf = interList[i].folder;
        Logger.log(`[Auto-Heal] ย้ายโฟลเดอร์ ${wf.getName()} จาก INTER (${interFolder.getName()}) ไปยัง TH (${thFolder.getName()})`);
        try {
          wf.moveTo(thFolder);
        } catch (eM2) {
          thFolder.addFolder(wf);
          interFolder.removeFolder(wf);
        }
        const movedItem = interList.splice(i, 1)[0];
        thList.push(movedItem);
      }
    }
  } catch (eHeal) {
    Logger.log("[Auto-Heal] Error moving misplaced date folders: " + eHeal.message);
  }
}

/**
 * ฟังก์ชันช่วยตรวจสอบและให้สิทธิ์การเข้าถึง (Authorization)
 */
function authorizePermissions() {
  const token = ScriptApp.getOAuthToken();
  Logger.log("OAuth Token: " + (token ? "พร้อมใช้งาน" : "ไม่พบ"));
  try {
    const res = UrlFetchApp.fetch("https://www.google.com", { muteHttpExceptions: true });
    Logger.log("UrlFetchApp สิทธิ์ถูกต้องสมบูรณ์ (Response: " + res.getResponseCode() + ")");
  } catch (e) {
    Logger.log("UrlFetchApp authorization error: " + e.message);
  }
}

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
  const folderMatch = str.match(/\/folders\/([-\w]{25,})/i);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }
  const idParamMatch = str.match(/[?&]id=([-\w]{25,})/i);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }
  const generalMatch = str.match(/^[-\w]{25,}$/);
  if (generalMatch) {
    return generalMatch[0];
  }
  const embeddedMatch = str.match(/[-\w]{25,}/);
  return embeddedMatch ? embeddedMatch[0] : null;
}

/**
 * แปลงชื่อแผ่นงาน (เช่น "7 พย", "15 ธค", "5 มค") เป็นชื่อโฟลเดอร์ TH, INTER, และรหัสวันที่ (รองรับครบ 12 เดือน)
 */
function parseDateFormats(sheetName) {
  const cleanKey = (sheetName || "").toString().trim();
  if (DATE_FORMAT_CACHE[cleanKey]) {
    return DATE_FORMAT_CACHE[cleanKey];
  }

  const match = cleanKey.match(/^(\d+)\s*([^\d\s]+)?/);
  const day = match ? parseInt(match[1], 10) : 7;
  const padDay = day < 10 ? "0" + day : "" + day;
  const monthStr = match && match[2] ? match[2].trim() : "พย";

  const MONTH_LIST = [
    { keys: ["มค", "ม.ค."], th: "ม.ค.", inter: "JAN", num: "01" },
    { keys: ["กพ", "ก.พ."], th: "ก.พ.", inter: "FEB", num: "02" },
    { keys: ["มีค", "มี.ค."], th: "มี.ค.", inter: "MAR", num: "03" },
    { keys: ["เมย", "เม.ย."], th: "เม.ย.", inter: "APR", num: "04" },
    { keys: ["พค", "พ.ค."], th: "พ.ค.", inter: "MAY", num: "05" },
    { keys: ["มิย", "มิ.ย."], th: "มิ.ย.", inter: "JUN", num: "06" },
    { keys: ["กค", "ก.ค."], th: "ก.ค.", inter: "JUL", num: "07" },
    { keys: ["สค", "ส.ค."], th: "ส.ค.", inter: "AUG", num: "08" },
    { keys: ["กย", "ก.ย."], th: "ก.ย.", inter: "SEP", num: "09" },
    { keys: ["ตค", "ต.ค."], th: "ต.ค.", inter: "OCT", num: "10" },
    { keys: ["พย", "พ.ย."], th: "พ.ย.", inter: "NOV", num: "11" },
    { keys: ["ธค", "ธ.ค."], th: "ธ.ค.", inter: "DEC", num: "12" }
  ];

  let thMonth = "พ.ย.";
  let interMonth = "NOV";
  let numMonth = "11";
  let thYear = "69";
  let engYear = "2026";

  try {
    const now = new Date();
    engYear = now.getFullYear().toString();
    thYear = (now.getFullYear() + 543).toString().slice(-2);
  } catch (e) {}

  for (let i = 0; i < MONTH_LIST.length; i++) {
    const m = MONTH_LIST[i];
    if (m.keys.some(k => monthStr.includes(k))) {
      thMonth = m.th;
      interMonth = m.inter;
      numMonth = m.num;
      break;
    }
  }

  const parsedResult = {
    dayNumber: day,
    padDay: padDay,
    padMonth: numMonth,
    thMonth: thMonth,
    interMonth: interMonth,
    thYear: thYear,
    engYear: engYear,
    thFolderName: `${padDay} ${thMonth} ${thYear}`,
    interFolderName: `${interMonth} ${padDay},${engYear}`,
    interDateSuffix: `${padDay}.${numMonth}`,
  };
  DATE_FORMAT_CACHE[cleanKey] = parsedResult;
  return parsedResult;
}

function stripThaiDiacritics(str) {
  if (!str || typeof str !== "string") return "";
  return str.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, "");
}

function normalizeStringFuzzy(str) {
  if (!str || typeof str !== "string") return "";
  return str.toLowerCase().replace(/\s+/g, " ").trim();
}

function getCategoryInfoSmart(rawCategory) {
  const cat = (rawCategory || "").toString().trim();
  if (CATEGORY_INFO_CACHE[cat]) {
    return CATEGORY_INFO_CACHE[cat];
  }

  const catLower = cat.toLowerCase();
  const catClean = stripThaiDiacritics(catLower).replace(/\s+/g, "");
  let result = null;

  if (catClean.includes("สลอต") || catLower.includes("slot")) {
    result = {
      thTarget: "สล็อต SLOT",
      interTarget: "SLOT",
      keywords: ["สล็อต", "slot", "สลอต", "เกมสล็อต"]
    };
  } else if (catClean.includes("คาสโน") || catLower.includes("casino") || catClean.includes("บาคารา")) {
    result = {
      thTarget: "คาสิโน CASINO",
      interTarget: "CASINO",
      keywords: ["คาสิโน", "casino", "คาสโน", "บาคาร่า"]
    };
  } else if (catClean.includes("บอล") || catLower.includes("football") || catLower.includes("soccer")) {
    result = {
      thTarget: "บอล FOOTBALL",
      interTarget: "FOOTBALL",
      keywords: ["บอล", "football", "ฟุตบอล", "soccer"]
    };
  } else if (catClean.includes("มวย") || catLower.includes("boxing")) {
    result = {
      thTarget: "มวย BOXING",
      interTarget: "BOXING",
      keywords: ["มวย", "boxing", "มวยไทย"]
    };
  } else if (catClean.includes("ไกชน") || catClean.includes("ไก") || catLower.includes("cock")) {
    result = {
      thTarget: "ไก่ชน COCK FIGHTING",
      interTarget: "COCK FIGHTING",
      keywords: ["ไก่ชน", "ไก่", "cock"]
    };
  } else if (catClean.includes("ววชน") || catClean.includes("วว") || catLower.includes("cow")) {
    result = {
      thTarget: "วัวชน COW FIGHTING",
      interTarget: "COW FIGHTING",
      keywords: ["วัวชน", "วัว", "cow"]
    };
  } else if (catClean.includes("หวย") || catLower.includes("apb") || catLower.includes("lotto")) {
    result = {
      thTarget: "หวย APB",
      interTarget: "APB",
      keywords: ["หวย APB", "หวย", "apb", "lotto"]
    };
  } else if (catLower.includes("ufa") || catLower.includes("news")) {
    result = {
      thTarget: "UFA NEWS",
      interTarget: "UFA NEWS",
      keywords: ["ufa news", "ufa", "news"]
    };
  } else if (catClean.includes("แคมเปญ") || catLower.includes("campaign")) {
    result = {
      thTarget: "แคมเปญ",
      interTarget: "CAMPAIGN",
      keywords: ["แคมเปญ", "campaign"]
    };
  } else if (catClean.includes("กจกรรม") || catLower.includes("activity")) {
    result = {
      thTarget: "กิจกรรมกลาง",
      interTarget: "MAIN ACTIVITY",
      keywords: ["กิจกรรมกลาง", "กิจกรรม", "activity"]
    };
  } else if (catClean.includes("กฬา") || catLower.includes("sport")) {
    result = {
      thTarget: "กีฬาอื่นๆ Other Sports",
      interTarget: "OTHER SPORTS",
      keywords: ["กีฬาอื่นๆ", "กีฬา", "sport"]
    };
  } else {
    result = {
      thTarget: CATEGORY_MAP_TH[cat] || cat || "ทั่วไป",
      interTarget: CATEGORY_MAP_INTER[cat] || cat || "GENERAL",
      keywords: [cat]
    };
  }

  CATEGORY_INFO_CACHE[cat] = result;
  return result;
}

/**
 * ดึงหรือสร้างโฟลเดอร์แบบ Fuzzy & Smart พร้อมระบบ In-Memory Cache ลดการเรียก DriveApp ซ้ำซ้อน
 */
function getOrCreateFolderSmart(parentFolder, targetName, aliases, matchOptions) {
  if (!parentFolder) return null;
  const targetClean = normalizeStringFuzzy(targetName);
  const targetNoDiacritics = stripThaiDiacritics(targetClean);
  const cleanAliases = (aliases || []).map(a => normalizeStringFuzzy(a)).filter(Boolean);

  const folderList = getCachedSubFoldersList(parentFolder);

  // Tier 1: ตรงเป๊ะ
  for (let i = 0; i < folderList.length; i++) {
    const item = folderList[i];
    if (item.clean === targetClean) {
      return item.folder;
    }
  }

  // Tier 2: ตรงกับ Aliases ใดๆ
  for (let i = 0; i < folderList.length; i++) {
    const item = folderList[i];
    if (cleanAliases.includes(item.clean)) {
      return item.folder;
    }
  }

  // Tier 3: ลบวรรณยุกต์ไทยออกแล้วตรงกัน
  for (let i = 0; i < folderList.length; i++) {
    const item = folderList[i];
    if (item.noDiacritics === targetNoDiacritics) {
      return item.folder;
    }
    for (let a = 0; a < cleanAliases.length; a++) {
      if (item.noDiacritics === stripThaiDiacritics(cleanAliases[a])) {
        return item.folder;
      }
    }
  }

  // Tier 4: ตรวจจับกรณีคนตั้งแค่เลข 1, 2, 3 ตามลำดับงาน (Task Number Match)
  if (matchOptions && matchOptions.taskNo !== undefined && matchOptions.taskNo !== null && matchOptions.taskNo !== "") {
    const noStr = matchOptions.taskNo.toString().trim();
    const noRegex = new RegExp(`^0*${noStr}([\\s_\\(\\.\\-]|$)`, "i");
    for (let i = 0; i < folderList.length; i++) {
      const item = folderList[i];
      if (item.clean === noStr || noRegex.test(item.clean)) {
        return item.folder;
      }
    }
  }

  // Tier 5: ตรวจจับหมวดหมู่ที่มีคำหลักปรากฏ (Category Keyword Fuzzy Match)
  if (matchOptions && matchOptions.isCategory && matchOptions.keywords && matchOptions.keywords.length > 0) {
    for (let i = 0; i < folderList.length; i++) {
      const item = folderList[i];
      for (let k = 0; k < matchOptions.keywords.length; k++) {
        const kw = normalizeStringFuzzy(matchOptions.keywords[k]);
        if (kw && item.clean.includes(kw)) {
          return item.folder;
        }
      }
    }
  }

  // Tier 6: ตรวจจับโฟลเดอร์วันที่อย่างแม่นยำ (ป้องกันเลขวัน 2, 6, 9, 20 ไปชนกับเลขปี 69 หรือ 2026 เด็ดขาด 100%)
  if (matchOptions && matchOptions.isDate && matchOptions.dayNumber) {
    const dNum = parseInt(matchOptions.dayNumber, 10);
    const exactDayBoundaryRegex = new RegExp(`(?:^|[^\\d])0*${dNum}(?:[^\\d]|$)`);
    for (let i = 0; i < folderList.length; i++) {
      const item = folderList[i];
      const strWithoutYear = item.clean
        .replace(/\b20\d{2}\b/g, " ")
        .replace(/\b25\d{2}\b/g, " ")
        .replace(/(ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?)\s*\d{2}\b/g, "$1 ");

      if (exactDayBoundaryRegex.test(strWithoutYear) && matchOptions.monthKeywords) {
        if (matchOptions.monthKeywords.some(mk => item.clean.includes(normalizeStringFuzzy(mk)))) {
          return item.folder;
        }
      }
    }
  }

  // Tier 7: สร้างโฟลเดอร์ใหม่และบันทึกเข้า Memory Cache ทันที
  const newFolderName = targetName.trim();
  const newFolder = parentFolder.createFolder(newFolderName);
  const cleanNew = normalizeStringFuzzy(newFolderName);
  folderList.push({
    folder: newFolder,
    name: newFolderName,
    clean: cleanNew,
    noDiacritics: stripThaiDiacritics(cleanNew),
  });
  return newFolder;
}

function getOrCreateFolderFlexible(parentFolder, targetName, aliases) {
  return getOrCreateFolderSmart(parentFolder, targetName, aliases, {});
}

function extractCellLinkAndTitle(val, richText, formula) {
  let link = "";
  let title = (val || "").toString().trim();

  if (formula && typeof formula === "string" && formula.toUpperCase().indexOf("HYPERLINK") !== -1) {
    const match = formula.match(/HYPERLINK\(\s*["']([^"']+)["']/i);
    if (match && match[1]) {
      link = match[1].trim();
    }
  }

  if (!link && richText) {
    const directUrl = richText.getLinkUrl();
    if (directUrl) {
      link = directUrl.trim();
    } else {
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

  if (!link && title) {
    if (title.startsWith("http://") || title.startsWith("https://")) {
      link = title;
    } else if (title.startsWith("drive.google.com") || title.startsWith("docs.google.com")) {
      link = "https://" + title;
    }
  }

  return { link: link, title: title };
}

function findDriveFileOrFolderUrl(title) {
  if (!title || typeof title !== "string") return "";
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length < 2) return "";

  const singleSpaced = cleanTitle.replace(/\s+/g, " ");
  const titleWithoutExt = singleSpaced.replace(/\.(pptx?|pdf|docx?)$/i, "").trim();

  const namesToCheck = [cleanTitle, singleSpaced, titleWithoutExt];
  if (singleSpaced.includes("-")) {
    const withSpacedDash = singleSpaced.replace(/\s*-\s*/g, " - ");
    const withNoSpacedDash = singleSpaced.replace(/\s*-\s*/g, "-");
    namesToCheck.push(withSpacedDash);
    namesToCheck.push(withNoSpacedDash);
    namesToCheck.push(withSpacedDash.replace(/\.(pptx?|pdf|docx?)$/i, "").trim());
    namesToCheck.push(withNoSpacedDash.replace(/\.(pptx?|pdf|docx?)$/i, "").trim());
  }

  const extList = [".pptx", ".ppt"];
  const baseCount = namesToCheck.length;
  for (let i = 0; i < baseCount; i++) {
    for (let j = 0; j < extList.length; j++) {
      namesToCheck.push(namesToCheck[i] + extList[j]);
    }
  }

  const uniqueNames = [];
  const checkedSet = {};
  for (let n = 0; n < namesToCheck.length; n++) {
    const name = namesToCheck[n].trim();
    if (name && !checkedSet[name]) {
      checkedSet[name] = true;
      uniqueNames.push(name);
    }
  }

  try {
    const titleQueries = uniqueNames.map(n => `title = '${n.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`).join(" or ");
    const batchQuery = `(${titleQueries}) and trashed = false`;
    const files = DriveApp.searchFiles(batchQuery);
    while (files.hasNext()) {
      const f = files.next();
      const mType = f.getMimeType();
      if (
        mType === "application/vnd.google-apps.presentation" ||
        mType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        f.getName().toLowerCase().endsWith(".pptx")
      ) {
        return `https://docs.google.com/presentation/d/${f.getId()}/edit`;
      }
      return f.getUrl();
    }
  } catch (e) {
    for (let n = 0; n < Math.min(uniqueNames.length, 3); n++) {
      try {
        const files = DriveApp.getFilesByName(uniqueNames[n]);
        while (files.hasNext()) {
          const f = files.next();
          if (!f.isTrashed()) {
            const mType = f.getMimeType();
            if (
              mType === "application/vnd.google-apps.presentation" ||
              mType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
              f.getName().toLowerCase().endsWith(".pptx")
            ) {
              return `https://docs.google.com/presentation/d/${f.getId()}/edit`;
            }
            return f.getUrl();
          }
        }
      } catch (err) {}
    }
  }

  try {
    const words = titleWithoutExt.split(/[\s\-–—]+/).filter(w => w.length >= 3 && !/^\d+$/.test(w));
    if (words.length >= 2) {
      const w0 = words[0].replace(/['"\\]/g, "");
      const w1 = words[1].replace(/['"\\]/g, "");
      const q = `title contains '${w0}' and title contains '${w1}' and trashed = false`;
      const slides = DriveApp.searchFiles(q);
      while (slides.hasNext()) {
        const f = slides.next();
        if (!f.isTrashed()) {
          const mType = f.getMimeType();
          if (
            mType === "application/vnd.google-apps.presentation" ||
            mType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
            f.getName().toLowerCase().endsWith(".pptx")
          ) {
            return `https://docs.google.com/presentation/d/${f.getId()}/edit`;
          }
          return f.getUrl();
        }
      }
    }
  } catch (e) {
    Logger.log("Keyword search error: " + e.message);
  }

  return "";
}

function resolveBriefSlideUrl(title) {
  if (!title || typeof title !== "string") return "";
  const cleanTitle = title.trim();
  if (!cleanTitle) return "";

  const scriptCache = CacheService.getScriptCache();
  const cacheKey = "RESOLVE_BRIEF_SLIDE_V3_" + getSafeB64Key(cleanTitle, 60);
  try {
    const cached = scriptCache.get(cacheKey);
    if (cached) return cached;
  } catch (e) {}

  const slideUrl = findDriveFileOrFolderUrl(cleanTitle);
  if (slideUrl) {
    try {
      scriptCache.put(cacheKey, slideUrl, 21600);
    } catch (e) {}
    return slideUrl;
  }
  return "";
}

function normalizeToPresentationUrl(rawUrl, briefTitle, scriptCache, memoryBriefCache, allowDriveSearch) {
  let url = (rawUrl || "").toString().trim();

  if (url.includes("docs.google.com/presentation/d/")) {
    return url;
  }

  if (url && !url.includes("/folders/")) {
    const dMatch = url.match(/\/d\/([-\w]{25,})/i);
    const idMatch = url.match(/[?&]id=([-\w]{25,})/i);
    const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);
    if (fileId) {
      return `https://docs.google.com/presentation/d/${fileId}/edit`;
    }
  }

  if (briefTitle) {
    const cacheKey = "SLIDE_URL_V2_" + getSafeB64Key(briefTitle, 60);
    if (memoryBriefCache && memoryBriefCache[briefTitle] !== undefined) {
      return memoryBriefCache[briefTitle] || url;
    }
    const cachedUrl = scriptCache ? scriptCache.get(cacheKey) : null;
    if (cachedUrl !== null) {
      if (memoryBriefCache) memoryBriefCache[briefTitle] = cachedUrl;
      return cachedUrl || url;
    }

    if (allowDriveSearch) {
      const foundSlideUrl = findDriveFileOrFolderUrl(briefTitle);
      const finalUrl = foundSlideUrl || url;
      if (memoryBriefCache) memoryBriefCache[briefTitle] = finalUrl;
      try {
        if (scriptCache) {
          scriptCache.put(cacheKey, finalUrl || "", 21600);
        }
      } catch (e) {}
      return finalUrl;
    }
  }

  return url;
}

function extractDriveFolderFromCell(cell) {
  if (!cell) return null;

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

  try {
    const val = cell.getValue();
    if (val && typeof val === "string") {
      const id = extractFolderId(val);
      if (id) return id;
    }
  } catch (e) {}

  return null;
}

function findFolderByNameSmart(cellText, fallbackNames) {
  const candidates = [];
  if (cellText && typeof cellText === "string") {
    const raw = cellText.trim();
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

function getCellSmartChipUri(spreadsheetId, sheetName, a1Notation) {
  try {
    const token = getFastOAuthToken();
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

function getSheetSmartChipsMap(spreadsheetId, sheetName, lastRow) {
  const chipMap = {};
  try {
    const token = getFastOAuthToken();
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

function isInterMonthlyFolderName(name) {
  if (!name || typeof name !== "string") return false;
  const n = name.toUpperCase().trim();
  if (/[ก-๙]/.test(n)) return false;

  if (n.includes("INTER")) return true;
  if (/^M\d{1,2}$/i.test(n) || /^INTER\s*M\d{1,2}$/i.test(n)) return true;
  if (/^\[\d{1,2}\]/.test(n)) return true;
  if (/^\d{1,2}\s*[-/]?\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i.test(n)) return true;
  if (/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i.test(n)) return true;
  return false;
}

function isThMonthlyFolderName(name) {
  if (!name || typeof name !== "string") return false;
  const n = name.toUpperCase().trim();
  if (n.includes("INTER")) return false;
  if (/[ก-๙]/.test(n)) return true;
  if (/\bTH\b/i.test(n) || n.startsWith("TH ") || n.endsWith(" TH")) return true;
  return false;
}

function getExactCellsSmartChipUrisBatch(spreadsheetId, sheetName, a1NotationList) {
  const result = {};
  if (!a1NotationList || a1NotationList.length === 0) return result;

  try {
    if (typeof Sheets !== "undefined" && Sheets && Sheets.Spreadsheets && typeof Sheets.Spreadsheets.get === "function") {
      try {
        const ranges = a1NotationList.map(a1 => `'${sheetName}'!${a1}`);
        const res = Sheets.Spreadsheets.get(spreadsheetId, {
          ranges: ranges,
          fields: "sheets(data(rowData(values(chipRuns))))"
        });
        const dataBlocks = res?.sheets?.[0]?.data || [];
        for (let i = 0; i < a1NotationList.length; i++) {
          const chips = dataBlocks[i]?.rowData?.[0]?.values?.[0]?.chipRuns;
          if (chips && chips.length > 0) {
            for (let k = 0; k < chips.length; k++) {
              const uri = chips[k].chip?.richLinkProperties?.uri;
              if (uri) {
                result[a1NotationList[i]] = uri;
                break;
              }
            }
          }
        }
        return result;
      } catch (eAdv) {}
    }

    const token = getFastOAuthToken();
    const rangesParam = a1NotationList
      .map(a1 => `ranges=${encodeURIComponent(`'${sheetName}'!${a1}`)}`)
      .join("&");
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${rangesParam}&fields=sheets(data(rowData(values(chipRuns))))`;
    const res = UrlFetchApp.fetch(apiUrl, {
      method: "get",
      headers: { "Authorization": "Bearer " + token },
      muteHttpExceptions: true
    });

    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      const dataBlocks = data.sheets?.[0]?.data || [];
      for (let i = 0; i < a1NotationList.length; i++) {
        const chips = dataBlocks[i]?.rowData?.[0]?.values?.[0]?.chipRuns;
        if (chips && chips.length > 0) {
          for (let k = 0; k < chips.length; k++) {
            const uri = chips[k].chip?.richLinkProperties?.uri;
            if (uri) {
              result[a1NotationList[i]] = uri;
              break;
            }
          }
        }
      }
    }
  } catch (e) {
    Logger.log("Error in getExactCellsSmartChipUrisBatch: " + e.message);
  }
  return result;
}

function getDriveFolderFromExactCell(sheet, row, col, a1Notation, preFetchedChipUri) {
  let chipUri = preFetchedChipUri;
  if (chipUri === undefined) {
    const ss = sheet.getParent();
    chipUri = getCellSmartChipUri(ss.getId(), sheet.getName(), a1Notation);
  }
  if (chipUri) {
    const id = extractFolderId(chipUri);
    if (id) {
      try {
        const f = DriveApp.getFolderById(id);
        if (f && !f.isTrashed()) return f;
      } catch (e) {}
    }
  }

  try {
    const cell = sheet.getRange(row, col);
    const directId = extractDriveFolderFromCell(cell);
    if (directId) {
      try {
        const f = DriveApp.getFolderById(directId);
        if (f && !f.isTrashed()) return f;
      } catch (e) {}
    }

    const note = cell.getNote() || "";
    if (note) {
      const noteId = extractFolderId(note);
      if (noteId) {
        try {
          const f = DriveApp.getFolderById(noteId);
          if (f && !f.isTrashed()) return f;
        } catch (e) {}
      }
    }
  } catch (eCell) {}

  return null;
}

function getMonthlyRootFolders(sheet) {
  const ss = sheet.getParent();
  const ssId = ss.getId();
  const sheetName = sheet.getName();
  const cache = CacheService.getScriptCache();
  const cacheKey = "ROOT_FOLDERS_V5_" + getSafeB64Key(sheetName, 50);

  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const thF = parsed.thId ? DriveApp.getFolderById(parsed.thId) : null;
      const interF = parsed.interId ? DriveApp.getFolderById(parsed.interId) : null;
      if (thF) {
        if (!parsed.verified) {
          if (!thF.isTrashed() && !isInterMonthlyFolderName(thF.getName())) {
            return { thFolder: thF, interFolder: interF };
          }
        } else {
          return { thFolder: thF, interFolder: interF };
        }
      }
    } catch (e) {}
  }

  const chipUris = getExactCellsSmartChipUrisBatch(ssId, sheetName, ["F3", "G3"]);
  let thFolder = getDriveFolderFromExactCell(sheet, 3, 6, "F3", chipUris["F3"] || null);
  let interFolder = getDriveFolderFromExactCell(sheet, 3, 7, "G3", chipUris["G3"] || null);

  const dateInfo = parseDateFormats(sheetName);
  const thDynamicNames = [
    `TH ใบขาย ${dateInfo.thMonth} ${dateInfo.interMonth} ${dateInfo.thYear}`,
    `ใบขาย ${dateInfo.thMonth} ${dateInfo.interMonth} ${dateInfo.thYear}`,
    "TH ใบขาย พ.ย. NOV 69",
    "ใบขาย พ.ย. NOV 69",
    `เดือน ${dateInfo.padMonth}`,
    `เดือน ${parseInt(dateInfo.padMonth, 10)}`,
    "เดือน 11",
    `TH เดือน ${dateInfo.padMonth}`,
    `ใบขาย ${dateInfo.thMonth}`,
  ];
  const interDynamicNames = [
    `INTER [${dateInfo.padMonth}] ${dateInfo.interMonth} ${dateInfo.engYear}`,
    `INTER  [${dateInfo.padMonth}] ${dateInfo.interMonth} ${dateInfo.engYear}`,
    `[${dateInfo.padMonth}] ${dateInfo.interMonth} ${dateInfo.engYear}`,
    "INTER [11] NOV 2026",
    "[11] NOV 2026",
    `M${dateInfo.padMonth}`,
    `M${parseInt(dateInfo.padMonth, 10)}`,
    "M11",
    `INTER M${dateInfo.padMonth}`,
    `[${dateInfo.padMonth}] ${dateInfo.interMonth}`,
    `${dateInfo.padMonth} ${dateInfo.interMonth} ${dateInfo.engYear}`,
    "INTER",
  ];

  if (!thFolder) {
    const f3Val = sheet.getRange(3, 6).getValue()?.toString() || "";
    thFolder = findFolderByNameSmart(f3Val, thDynamicNames);
  }

  if (!interFolder) {
    const g3Val = sheet.getRange(3, 7).getValue()?.toString() || "";
    interFolder = findFolderByNameSmart(g3Val, interDynamicNames);
  }

  if (thFolder || interFolder) {
    const thName = thFolder ? thFolder.getName() : "";
    const interName = interFolder ? interFolder.getName() : "";

    const thLooksInter = isInterMonthlyFolderName(thName);
    const thLooksTh = isThMonthlyFolderName(thName);
    const interLooksTh = isThMonthlyFolderName(interName);

    if (thLooksInter && (interLooksTh || !interFolder)) {
      Logger.log(`[Anti-Swap] สลับกลับตำแหน่งที่ถูกต้อง: F3="${thName}" (เป็น INTER), G3="${interName}" (เป็น TH)`);
      const temp = thFolder;
      thFolder = interFolder;
      interFolder = temp;
    } else if (interLooksTh && !thLooksTh) {
      Logger.log(`[Anti-Swap] ตรวจพบว่า G3 เป็น TH: G3="${interName}"`);
      const temp = thFolder;
      thFolder = interFolder;
      interFolder = temp;
    }
  }

  if (!thFolder) {
    const f3Val = sheet.getRange(3, 6).getValue() || "";
    throw new Error(`ไม่พบโฟลเดอร์ Google Drive ของ TH ในช่อง F3 (ค่าในช่องคือ "${f3Val}") กรุณาตรวจสอบว่ามีโฟลเดอร์ชื่อ เดือน 11 หรือ ใบขาย พ.ย. NOV 69 ใน Google Drive`);
  }

  try {
    cache.put(cacheKey, JSON.stringify({
      thId: thFolder.getId(),
      interId: interFolder ? interFolder.getId() : "",
      verified: true
    }), 21600);
  } catch (e) {}

  return { thFolder: thFolder, interFolder: interFolder };
}

function fetchSheetNamesViaApiFast(spreadsheetId) {
  if (typeof Sheets !== "undefined" && Sheets && Sheets.Spreadsheets && typeof Sheets.Spreadsheets.get === "function") {
    try {
      const res = Sheets.Spreadsheets.get(spreadsheetId, { fields: "sheets.properties.title" });
      if (res && res.sheets) {
        return res.sheets.map(s => s.properties.title).filter(n => n.trim() !== "TEM");
      }
    } catch (e) {}
  }

  try {
    const token = getFastOAuthToken();
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
    const res = UrlFetchApp.fetch(apiUrl, {
      method: "get",
      headers: { "Authorization": "Bearer " + token },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      if (data && data.sheets) {
        return data.sheets.map(s => s.properties.title).filter(n => n.trim() !== "TEM");
      }
    }
  } catch (e) {}

  const allSheets = getFastActiveSpreadsheet().getSheets();
  return allSheets.map(s => s.getName()).filter(n => n.trim() !== "TEM");
}

function getInitialMetadata(force) {
  const cache = CacheService.getScriptCache();
  if (!force) {
    const cachedMeta = cache.get("INITIAL_METADATA_V6");
    if (cachedMeta) {
      try {
        return JSON.parse(cachedMeta);
      } catch (e) {}
    }
  }

  const ssId = getFastSpreadsheetId();
  const sheetNames = fetchSheetNamesViaApiFast(ssId);
  const staffSet = { "ลูกหยี": true };

  const sortedForStaff = sortSheetNamesDesc(sheetNames);
  const dateSheets = sortedForStaff.filter(n => {
    const t = n.trim();
    return t !== "TEM" && /^\d+\s*[\u0E00-\u0E7F]/.test(t);
  });
  const sheetsToCheck = dateSheets.length > 0 ? dateSheets.slice(0, 40) : sortedForStaff.slice(0, 40);
  let apiFetched = false;

  if (typeof Sheets !== "undefined" && Sheets && Sheets.Spreadsheets && Sheets.Spreadsheets.Values && typeof Sheets.Spreadsheets.Values.batchGet === "function") {
    try {
      const ranges = sheetsToCheck.map(n => `'${n}'!J${CONFIG.DATA_START_ROW}:J`);
      const res = Sheets.Spreadsheets.Values.batchGet(ssId, {
        ranges: ranges,
        fields: "valueRanges(values)"
      });
      if (res && res.valueRanges) {
        for (let i = 0; i < res.valueRanges.length; i++) {
          const rows = res.valueRanges[i].values || [];
          for (let r = 0; r < rows.length; r++) {
            const val = (rows[r][0] || "").toString().trim();
            if (val && val !== "-" && val !== "ผู้รับงาน" && val !== "กราฟิก" && val !== "ชื่อ" && val !== "undefined" && val.length > 0) {
              staffSet[val] = true;
            }
          }
        }
        apiFetched = true;
      }
    } catch (eAdv) {
      Logger.log("getInitialMetadata Advanced Service error: " + eAdv.message);
    }
  }

  if (!apiFetched) {
    try {
      const token = getFastOAuthToken();
      const chunkSize = 20;
      const requests = [];
      for (let c = 0; c < sheetsToCheck.length; c += chunkSize) {
        const chunk = sheetsToCheck.slice(c, c + chunkSize);
        const rangesParam = chunk
          .map(n => `ranges=${encodeURIComponent(`'${n}'!J${CONFIG.DATA_START_ROW}:J`)}`)
          .join("&");
        const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values:batchGet?${rangesParam}&fields=valueRanges(values)`;
        requests.push({
          url: apiUrl,
          method: "get",
          headers: { "Authorization": "Bearer " + token },
          muteHttpExceptions: true
        });
      }
      const responses = UrlFetchApp.fetchAll(requests);
      for (let rIdx = 0; rIdx < responses.length; rIdx++) {
        const res = responses[rIdx];
        if (res.getResponseCode() === 200) {
          const data = JSON.parse(res.getContentText());
          const valueRanges = data.valueRanges || [];
          for (let i = 0; i < valueRanges.length; i++) {
            const rows = valueRanges[i].values || [];
            for (let r = 0; r < rows.length; r++) {
              const val = (rows[r][0] || "").toString().trim();
              if (val && val !== "-" && val !== "ผู้รับงาน" && val !== "กราฟิก" && val !== "ชื่อ" && val !== "undefined" && val.length > 0) {
                staffSet[val] = true;
              }
            }
          }
          apiFetched = true;
        }
      }
    } catch (e) {
      Logger.log("getInitialMetadata UrlFetchApp error: " + e.message);
    }
  }

  if (!apiFetched) {
    const ss = getFastActiveSpreadsheet();
    const fallbackSheets = sheetsToCheck.slice(0, 15);
    for (let s = 0; s < fallbackSheets.length; s++) {
      const sheet = ss.getSheetByName(fallbackSheets[s]);
      if (!sheet) continue;
      const lastRow = sheet.getLastRow();
      if (lastRow >= CONFIG.DATA_START_ROW) {
        const assignees = sheet.getRange(CONFIG.DATA_START_ROW, CONFIG.COL_ASSIGNEE, lastRow - CONFIG.DATA_START_ROW + 1, 1).getValues();
        for (let r = 0; r < assignees.length; r++) {
          const val = assignees[r][0]?.toString().trim();
          if (val && val !== "-" && val !== "ผู้รับงาน" && val !== "กราฟิก" && val !== "ชื่อ" && val !== "undefined" && val.length > 0) {
            staffSet[val] = true;
          }
        }
      }
    }
  }

  const result = {
    success: true,
    sheetNames: sheetNames,
    staffList: Object.keys(staffSet).sort(),
  };

  try {
    cache.put("INITIAL_METADATA_V6", JSON.stringify(result), 1800);
  } catch (e) {}

  return result;
}

function getSheetNamesFast(ss) {
  const cache = CacheService.getScriptCache();
  const cachedMeta = cache.get("INITIAL_METADATA_V6");
  if (cachedMeta) {
    try {
      const parsed = JSON.parse(cachedMeta);
      if (parsed && Array.isArray(parsed.sheetNames) && parsed.sheetNames.length > 0) {
        return parsed.sheetNames;
      }
    } catch (e) {}
  }
  const ssId = ss ? ss.getId() : getFastSpreadsheetId();
  return fetchSheetNamesViaApiFast(ssId);
}

function cleanAssigneeName(str) {
  if (!str) return "";
  return str.toString().replace(/[\u200B-\u200D\uFEFF]/g, "").toLowerCase().trim();
}

function getMatchingSheetsForStaff(assignee, targetSheet) {
  const ssId = getFastSpreadsheetId();
  const allSheetNames = getSheetNamesFast(null);
  const searchNameClean = cleanAssigneeName(assignee);

  let sheetsToScan = [];
  if (targetSheet && targetSheet !== "ALL") {
    const rawList = targetSheet.split(",").map(s => s.trim()).filter(Boolean);
    const trimmedMap = {};
    for (let i = 0; i < allSheetNames.length; i++) {
      trimmedMap[allSheetNames[i].trim()] = allSheetNames[i];
    }
    for (let i = 0; i < rawList.length; i++) {
      if (trimmedMap[rawList[i]]) sheetsToScan.push(trimmedMap[rawList[i]]);
    }
  } else {
    sheetsToScan = sortSheetNamesDesc(allSheetNames);
  }

  if (!searchNameClean || searchNameClean === "all" || sheetsToScan.length === 0) {
    return {
      success: true,
      assignee: assignee,
      matchingSheets: sheetsToScan,
      totalSheetsScanned: sheetsToScan.length
    };
  }

  const startRow = CONFIG.DATA_START_ROW;
  let valueRanges = null;

  if (typeof Sheets !== "undefined" && Sheets && Sheets.Spreadsheets && Sheets.Spreadsheets.Values && typeof Sheets.Spreadsheets.Values.batchGet === "function") {
    try {
      const ranges = sheetsToScan.map(n => `'${n}'!J${startRow}:J`);
      const res = Sheets.Spreadsheets.Values.batchGet(ssId, {
        ranges: ranges,
        fields: "valueRanges(values)"
      });
      if (res && res.valueRanges) valueRanges = res.valueRanges;
    } catch (eAdv) {}
  }

  if (!valueRanges) {
    try {
      const token = getFastOAuthToken();
      const chunkSize = 25;
      const requests = [];
      for (let c = 0; c < sheetsToScan.length; c += chunkSize) {
        const chunk = sheetsToScan.slice(c, c + chunkSize);
        const rangesParam = chunk
          .map(n => `ranges=${encodeURIComponent(`'${n}'!J${startRow}:J`)}`)
          .join("&");
        requests.push({
          url: `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values:batchGet?${rangesParam}&fields=valueRanges(values)`,
          method: "get",
          headers: { "Authorization": "Bearer " + token },
          muteHttpExceptions: true
        });
      }
      const responses = UrlFetchApp.fetchAll(requests);
      valueRanges = [];
      for (let r = 0; r < responses.length; r++) {
        if (responses[r].getResponseCode() === 200) {
          const data = JSON.parse(responses[r].getContentText());
          if (data.valueRanges) valueRanges.push(...data.valueRanges);
        }
      }
    } catch (e) {}
  }

  const matchingSheets = [];
  if (valueRanges && valueRanges.length === sheetsToScan.length) {
    for (let i = 0; i < sheetsToScan.length; i++) {
      const rows = valueRanges[i].values || [];
      let found = false;
      for (let r = 0; r < rows.length; r++) {
        const cellVal = cleanAssigneeName(rows[r][0]);
        if (cellVal && (cellVal === searchNameClean || cellVal.includes(searchNameClean))) {
          found = true;
          break;
        }
      }
      if (found) {
        matchingSheets.push(sheetsToScan[i]);
      }
    }
  } else {
    return {
      success: true,
      assignee: assignee,
      matchingSheets: sheetsToScan,
      totalSheetsScanned: sheetsToScan.length
    };
  }

  return {
    success: true,
    assignee: assignee,
    matchingSheets: matchingSheets,
    totalSheetsScanned: sheetsToScan.length
  };
}

/**
 * กวาดข้อมูลจากบนลงล่าง และหยุดทันทีเมื่อเจอแถวว่างติดต่อกันครบ 25 แถว (CONFIG.EMPTY_ROW_STREAK_LIMIT = 25)
 * - เช่น แถวสุดท้ายที่มีงานคือแถว 50 และแถวที่ 51-75 เป็นแถวว่างติดต่อกัน 25 แถว ระบบจะหยุดกวาดทันทีและตัดจบที่แถว 50
 * - ปลอดภัย 100% สำหรับแถวว่างที่คั่นระหว่างหมวดหมู่ (เช่น ว่างคั่น 1-15 แถว จะไม่ถูกตัดทิ้ง)
 * - ป้องกันกรณีมีคนเผลอพิมพ์ข้อความขยะทิ้งไว้ที่แถวล่างสุดของชีต (เช่น แถว 800) ไม่ให้ระบบต้องกวาดลงไปถึงแถว 800
 */
function trimRowsAtFirstEmptyBoundary(rawRows) {
  if (!rawRows || rawRows.length === 0) return [];
  const COL_OFFSET = 3; // คอลัมน์ C คือ Index 0
  const CAT_IDX = CONFIG.COL_CATEGORY_NAME - COL_OFFSET;   // Col C (Index 0): หมวดหมู่
  const BRIEF_IDX = CONFIG.COL_BRIEF_LINK - COL_OFFSET;    // Col D (Index 1): ใบบรีฟ
  const NO_IDX = CONFIG.COL_NO - COL_OFFSET;               // Col E (Index 2): ลำดับงาน (No.)
  const UPLOAD_IDX = CONFIG.COL_UPLOAD_LINK - COL_OFFSET;  // Col F (Index 3): ชื่องาน/ลิงก์อัปไฟล์
  const ASSIGNEE_IDX = CONFIG.COL_ASSIGNEE - COL_OFFSET;   // Col J (Index 7): ผู้รับงาน
  const MAX_EMPTY_STREAK = CONFIG.EMPTY_ROW_STREAK_LIMIT || 25;

  let consecutiveEmpty = 0;
  let lastDataRowIndex = -1;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const hasData = row && (
      (row[NO_IDX] !== undefined && row[NO_IDX].toString().trim() !== "") ||
      (row[UPLOAD_IDX] !== undefined && row[UPLOAD_IDX].toString().trim() !== "") ||
      (row[ASSIGNEE_IDX] !== undefined && row[ASSIGNEE_IDX].toString().trim() !== "") ||
      (row[CAT_IDX] !== undefined && row[CAT_IDX].toString().trim() !== "") ||
      (row[BRIEF_IDX] !== undefined && row[BRIEF_IDX].toString().trim() !== "")
    );

    if (hasData) {
      consecutiveEmpty = 0;
      lastDataRowIndex = i;
    } else {
      consecutiveEmpty++;
      if (consecutiveEmpty >= MAX_EMPTY_STREAK) {
        // พบแถวว่างติดต่อกันครบ 25 แถวแล้ว หยุดกวาดต่อทันที!
        break;
      }
    }
  }

  return lastDataRowIndex >= 0 ? rawRows.slice(0, lastDataRowIndex + 1) : [];
}

/**
 * ดึงค่าข้อความดิบแบบ Open-Range (C4:L ไม่จำกัดเพดานแถว maxRow) ของทุกชีตที่เลือกในครั้งเดียว (~0.12 วินาที)
 * และตัดจบด้วย trimRowsAtFirstEmptyBoundary เมื่อเจอแถวว่างติดกัน 25 แถว
 */
function fetchSheetsValuesAndChecksumFast(spreadsheetId, sheetNames) {
  const startRow = CONFIG.DATA_START_ROW;
  const checksumMap = {};
  const valuesMap = {};

  try {
    let valueRanges = null;

    if (typeof Sheets !== "undefined" && Sheets && Sheets.Spreadsheets && Sheets.Spreadsheets.Values && typeof Sheets.Spreadsheets.Values.batchGet === "function") {
      try {
        const ranges = sheetNames.map(name => `'${name}'!C${startRow}:L`);
        const res = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
          ranges: ranges,
          valueRenderOption: "FORMATTED_VALUE",
          fields: "valueRanges(values)"
        });
        if (res && res.valueRanges) valueRanges = res.valueRanges;
      } catch (eAdv) {}
    }

    if (!valueRanges) {
      const token = getFastOAuthToken();
      const chunkSize = 20;
      if (sheetNames.length <= chunkSize) {
        const rangesParam = sheetNames
          .map(name => `ranges=${encodeURIComponent(`'${name}'!C${startRow}:L`)}`)
          .join("&");
        const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${rangesParam}&valueRenderOption=FORMATTED_VALUE&fields=valueRanges(values)`;
        const res = UrlFetchApp.fetch(apiUrl, {
          method: "get",
          headers: { "Authorization": "Bearer " + token },
          muteHttpExceptions: true
        });
        if (res.getResponseCode() === 200) {
          const data = JSON.parse(res.getContentText());
          valueRanges = data.valueRanges || [];
        }
      } else {
        const requests = [];
        for (let c = 0; c < sheetNames.length; c += chunkSize) {
          const chunk = sheetNames.slice(c, c + chunkSize);
          const rangesParam = chunk
            .map(name => `ranges=${encodeURIComponent(`'${name}'!C${startRow}:L`)}`)
            .join("&");
          requests.push({
            url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${rangesParam}&valueRenderOption=FORMATTED_VALUE&fields=valueRanges(values)`,
            method: "get",
            headers: { "Authorization": "Bearer " + token },
            muteHttpExceptions: true
          });
        }
        const responses = UrlFetchApp.fetchAll(requests);
        valueRanges = [];
        for (let r = 0; r < responses.length; r++) {
          if (responses[r].getResponseCode() === 200) {
            const data = JSON.parse(responses[r].getContentText());
            if (data.valueRanges) valueRanges.push(...data.valueRanges);
          }
        }
      }
    }

    if (valueRanges && valueRanges.length === sheetNames.length) {
      for (let i = 0; i < sheetNames.length; i++) {
        const sName = sheetNames[i];
        const rows = trimRowsAtFirstEmptyBoundary(valueRanges[i].values || []);
        valuesMap[sName] = rows;
        const rawVals = JSON.stringify(rows);
        const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, rawVals, Utilities.Charset.UTF_8);
        checksumMap[sName] = Utilities.base64EncodeWebSafe(digest).slice(0, 16);
      }
      return { checksumMap: checksumMap, valuesMap: valuesMap };
    }
  } catch (e) {
    Logger.log("fetchSheetsValuesAndChecksumFast error: " + e.message);
  }
  return null;
}

/**
 * ดึงเฉพาะข้อมูล Links, Smart Chips และ Notes ของคอลัมน์ F คอลัมน์เดียว (F4:F{maxRow} - ลิงก์อัปงาน TH และ Note INTER)
 * Optimized: ตัดการดึง chipRuns ของคอลัมน์ D (ใบบรีฟ) ออก ทำให้ขนาดข้อมูลเล็กลงอีก 67% และดึงเฉพาะแผ่นงานที่มีข้อมูลใน Col F เท่านั้น!
 */
function fetchSheetsLinksGridDataFast(spreadsheetId, sheetRequests) {
  if (!sheetRequests || sheetRequests.length === 0) return null;
  const startRow = CONFIG.DATA_START_ROW; // แถวที่ 4
  const fields = "sheets(properties(title),data(rowData(values(formattedValue,hyperlink,note,userEnteredValue(formulaValue),textFormatRuns(format(link(uri))),chipRuns))))";

  if (typeof Sheets !== "undefined" && Sheets && Sheets.Spreadsheets && typeof Sheets.Spreadsheets.get === "function") {
    try {
      const ranges = sheetRequests.map(req => `'${req.name}'!F${startRow}:F${req.maxRow}`);
      const res = Sheets.Spreadsheets.get(spreadsheetId, { ranges: ranges, fields: fields });
      if (res && res.sheets) {
        return res;
      }
    } catch (eAdv) {
      Logger.log("fetchSheetsLinksGridDataFast Advanced Service: " + eAdv.message);
    }
  }

  try {
    const token = getFastOAuthToken();
    const chunkSize = 15;
    if (sheetRequests.length <= chunkSize) {
      const rangesParam = sheetRequests
        .map(req => `ranges=${encodeURIComponent(`'${req.name}'!F${startRow}:F${req.maxRow}`)}`)
        .join("&");
      const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${rangesParam}&fields=${encodeURI(fields)}`;

      const res = UrlFetchApp.fetch(apiUrl, {
        method: "get",
        headers: { "Authorization": "Bearer " + token },
        muteHttpExceptions: true
      });

      if (res.getResponseCode() !== 200) {
        Logger.log("fetchSheetsLinksGridDataFast error code: " + res.getResponseCode());
        return null;
      }
      return JSON.parse(res.getContentText());
    } else {
      const requests = [];
      for (let c = 0; c < sheetRequests.length; c += chunkSize) {
        const chunk = sheetRequests.slice(c, c + chunkSize);
        const rangesParam = chunk
          .map(req => `ranges=${encodeURIComponent(`'${req.name}'!F${startRow}:F${req.maxRow}`)}`)
          .join("&");
        const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${rangesParam}&fields=${encodeURI(fields)}`;
        requests.push({
          url: apiUrl,
          method: "get",
          headers: { "Authorization": "Bearer " + token },
          muteHttpExceptions: true
        });
      }
      const responses = UrlFetchApp.fetchAll(requests);
      const combinedSheets = [];
      for (let r = 0; r < responses.length; r++) {
        if (responses[r].getResponseCode() !== 200) {
          return null;
        }
        const part = JSON.parse(responses[r].getContentText());
        if (part && part.sheets) {
          combinedSheets.push(...part.sheets);
        }
      }
      return { sheets: combinedSheets };
    }
  } catch (e) {
    Logger.log("fetchSheetsLinksGridDataFast exception: " + e.message);
    return null;
  }
}

function sortSheetNamesDesc(sheets) {
  const monthWeights = {
    "ธค": 12, "ธ.ค.": 12, "พย": 11, "พ.ย.": 11, "ตค": 10, "ต.ค.": 10,
    "กย": 9, "ก.ย.": 9, "สค": 8, "ส.ค.": 8, "กค": 7, "ก.ค.": 7,
    "มิย": 6, "มิ.ย.": 6, "พค": 5, "พ.ค.": 5, "เมย": 4, "เม.ย.": 4,
    "มีค": 3, "มี.ค.": 3, "กพ": 2, "ก.พ.": 2, "มค": 1, "ม.ค.": 1
  };
  return sheets
    .map(name => {
      const match = name.trim().match(/^(\d+)\s*([^\d\s]+)?/);
      if (!match) return { name: name, day: 0, mWeight: 0 };
      const day = parseInt(match[1], 10);
      const mStr = (match[2] || "").trim();
      return { name: name, day: day, mWeight: monthWeights[mStr] || 0 };
    })
    .sort((pA, pB) => (pA.mWeight !== pB.mWeight ? pB.mWeight - pA.mWeight : pB.day - pA.day))
    .map(item => item.name);
}

function extractDeepUriOrId(obj, depth) {
  if (!obj || typeof obj !== "object" || (depth || 0) > 6) return "";
  if (obj.uri && typeof obj.uri === "string" && obj.uri.startsWith("http")) return obj.uri.trim();
  if (obj.url && typeof obj.url === "string" && obj.url.startsWith("http")) return obj.url.trim();
  if (obj.fileId && typeof obj.fileId === "string" && obj.fileId.length >= 20) {
    return "https://drive.google.com/open?id=" + obj.fileId.trim();
  }
  if (obj.driveFileId && typeof obj.driveFileId === "string" && obj.driveFileId.length >= 20) {
    return "https://drive.google.com/open?id=" + obj.driveFileId.trim();
  }
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const val = obj[k];
      if (typeof val === "string" && (val.startsWith("https://drive.google.com") || val.startsWith("https://docs.google.com"))) {
        return val.trim();
      }
      if (typeof val === "object" && val !== null) {
        const found = extractDeepUriOrId(val, (depth || 0) + 1);
        if (found) return found;
      }
    }
  }
  return "";
}

function extractApiCellInfo(cellObj) {
  if (!cellObj) return { title: "", link: "", note: "" };
  const title = (cellObj.formattedValue || "").toString().trim();
  const note = (cellObj.note || "").toString().trim();
  let link = cellObj.hyperlink || "";

  if (!link && cellObj.userEnteredValue && cellObj.userEnteredValue.formulaValue) {
    const f = cellObj.userEnteredValue.formulaValue;
    if (typeof f === "string" && f.toUpperCase().includes("HYPERLINK")) {
      const m = f.match(/HYPERLINK\(\s*["']([^"']+)["']/i);
      if (m && m[1]) link = m[1].trim();
    }
  }

  if (!link && cellObj.chipRuns && cellObj.chipRuns.length > 0) {
    for (let i = 0; i < cellObj.chipRuns.length; i++) {
      const chipObj = cellObj.chipRuns[i];
      const deepUri = extractDeepUriOrId(chipObj);
      if (deepUri) {
        link = deepUri;
        break;
      }
    }
  }

  if (!link && cellObj.textFormatRuns && cellObj.textFormatRuns.length > 0) {
    for (let i = 0; i < cellObj.textFormatRuns.length; i++) {
      const uri = cellObj.textFormatRuns[i].format?.link?.uri;
      if (uri) {
        link = uri.trim();
        break;
      }
    }
  }

  if (!link && title) {
    if (title.startsWith("http://") || title.startsWith("https://")) {
      link = title;
    } else if (title.startsWith("drive.google.com") || title.startsWith("docs.google.com")) {
      link = "https://" + title;
    }
  }

  return { title: title, link: link, note: note };
}

function fastFormatPresentationUrl(rawUrl) {
  const url = (rawUrl || "").toString().trim();
  if (!url) return "";
  if (url.includes("docs.google.com/presentation/d/")) return url;

  if (!url.includes("/folders/")) {
    const dMatch = url.match(/\/d\/([-\w]{25,})/i);
    const idMatch = url.match(/[?&]id=([-\w]{25,})/i);
    const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);
    if (fileId) {
      return `https://docs.google.com/presentation/d/${fileId}/edit`;
    }
  }
  return url;
}

/**
 * สร้างรายการงานของแผ่นงานจากตารางข้อความดิบ (valuesRows C4:L) ผสานกับข้อมูลลิงก์อัปงาน (colFRowData F4:F)
 * ตัดภาระการแกะ chipRuns ของใบบรีฟ (Col D) ออก 100% เพื่อความเร็วสูงสุด
 */
function buildSheetTasksFromHybridData(sheetName, valuesRows, colFRowData) {
  const parsedSheetTasks = [];
  const totalRows = Math.max(valuesRows ? valuesRows.length : 0, colFRowData ? colFRowData.length : 0);
  const COL_OFFSET = 3; // เริ่มที่คอลัมน์ C (Index 0 = C)

  let currentCategory = "";
  let currentBriefTitle = "";

  for (let rIdx = 0; rIdx < totalRows; rIdx++) {
    const actualRowNumber = CONFIG.DATA_START_ROW + rIdx;
    const vRow = (valuesRows && valuesRows[rIdx]) ? valuesRows[rIdx] : [];
    const fVals = (colFRowData && colFRowData[rIdx] && colFRowData[rIdx].values) ? colFRowData[rIdx].values : [];

    // คอลัมน์ C: หมวดหมู่งาน (Index 0 ใน vRow)
    const categoryCell = vRow[CONFIG.COL_CATEGORY_NAME - COL_OFFSET];
    if (categoryCell && categoryCell.toString().trim() !== "") {
      const newCat = categoryCell.toString().trim();
      if (newCat !== currentCategory) {
        currentCategory = newCat;
        currentBriefTitle = "";
      }
    }

    // คอลัมน์ D: เก็บเฉพาะชื่อใบบรีฟจากข้อความดิบ (ไม่ต้องดึง chipRuns ของใบบรีฟ)
    const rawBriefText = (vRow[CONFIG.COL_BRIEF_LINK - COL_OFFSET] || "").toString().trim();
    if (rawBriefText) {
      currentBriefTitle = rawBriefText;
    }

    // คอลัมน์ E, F, I, J, K, L
    const rowAssignee = (vRow[CONFIG.COL_ASSIGNEE - COL_OFFSET] || "").toString().trim();
    const noVal = vRow[CONFIG.COL_NO - COL_OFFSET] || "";
    const uploadInfo = extractApiCellInfo(fVals[0]); // คอลัมน์ F คือ Index 0 ใน fVals (เนื่องจากดึงเฉพาะ F4:F)
    const rawUploadText = (vRow[CONFIG.COL_UPLOAD_LINK - COL_OFFSET] || "").toString().trim();
    const uploadCellText = uploadInfo.title || rawUploadText;
    const status = (vRow[CONFIG.COL_STATUS - COL_OFFSET] || "").toString().trim();

    if (!rowAssignee && !noVal && !uploadCellText) continue;

    let uploadUrl = uploadInfo.link;
    if (!uploadUrl && rawUploadText && (rawUploadText.startsWith("http://") || rawUploadText.startsWith("https://"))) {
      uploadUrl = rawUploadText;
    }

    const cellNote = uploadInfo.note;
    let interFolderUrl = "";
    if (cellNote) {
      const noteMatch = cellNote.match(/INTER:\s*(https:\/\/[^\s]+)/i);
      if (noteMatch && noteMatch[1]) {
        interFolderUrl = noteMatch[1].trim();
      }
    }

    const hasName = !!(uploadCellText && uploadCellText.trim() !== "");
    const hasLink = !!(uploadUrl && uploadUrl.trim() !== "");
    const isCompleted = (hasName && hasLink) ? (status.includes("เสร็จสิ้น") || uploadUrl !== "") : false;
    const team = (vRow[CONFIG.COL_TEAM - COL_OFFSET] || "").toString().trim();
    const assignDate = vRow[CONFIG.COL_ASSIGN_DATE - COL_OFFSET] || "";

    parsedSheetTasks.push({
      sheetName: sheetName,
      row: actualRowNumber,
      category: currentCategory || "ทั่วไป",
      briefLink: "",
      briefTitle: currentBriefTitle,
      no: noVal || 1,
      taskName: uploadCellText,
      uploadUrl: uploadUrl,
      interFolderUrl: interFolderUrl,
      hasUploadLink: !!uploadUrl,
      team: team,
      assignee: rowAssignee,
      assignDate: assignDate,
      status: status,
      isCompleted: isCompleted,
    });
  }

  return parsedSheetTasks;
}

/**
 * ดึงรายการงานตามชื่อพนักงาน (Ultra-Light Col-F Hybrid Version + Multi-Staff Shared Cache + IndexedDB Delta Sync)
 * - กวาด 1 ครั้ง เก็บข้อมูลของพนักงานทุกคนในชีตนั้นลง Cache ทันที
 * - รองรับ knownHashes จาก IndexedDB ของหน้าบ้าน: หากแผ่นงานไหนรหัส Checksum ตรงกับใน IndexedDB ของหน้าบ้านอยู่แล้ว
 *   จะข้ามการดึงและไม่ต้องส่งข้อมูลซ้ำกลับไป (ประหยัดเวลาและ Bandwidth สูงสุด)
 */
function getStaffTasks(assignee, targetSheet, pendingOnly, force, knownHashesJson) {
  const ssId = getFastSpreadsheetId();
  const scriptCache = CacheService.getScriptCache();
  const searchNameClean = cleanAssigneeName(assignee);
  const isSpecificAssignee = !!(searchNameClean && searchNameClean !== "all");

  let clientKnownHashes = {};
  if (knownHashesJson && typeof knownHashesJson === "string") {
    try {
      clientKnownHashes = JSON.parse(knownHashesJson) || {};
    } catch (e) {}
  }

  let rawTargetList = [];
  if (targetSheet && targetSheet !== "ALL") {
    rawTargetList = targetSheet.split(",").map(s => s.trim()).filter(Boolean);
  }

  const initialCacheKeys = ["INITIAL_METADATA_V6"];
  for (let i = 0; i < rawTargetList.length; i++) {
    const b64 = getSafeB64Key(rawTargetList[i], 35);
    initialCacheKeys.push("SHEET_VER_" + b64);
    if (!force) {
      initialCacheKeys.push("LAST_HASH_" + b64);
    }
  }
  const initialBatch = scriptCache.getAll(initialCacheKeys) || {};

  let allSheetNames = null;
  if (initialBatch["INITIAL_METADATA_V6"]) {
    try {
      const parsedMeta = JSON.parse(initialBatch["INITIAL_METADATA_V6"]);
      if (parsedMeta && Array.isArray(parsedMeta.sheetNames) && parsedMeta.sheetNames.length > 0) {
        allSheetNames = parsedMeta.sheetNames;
      }
    } catch (e) {}
  }

  let targetSheetNames = [];
  let verBatch = initialBatch;

  if (rawTargetList.length > 0 && allSheetNames) {
    const trimmedToActualMap = {};
    for (let i = 0; i < allSheetNames.length; i++) {
      trimmedToActualMap[allSheetNames[i].trim()] = allSheetNames[i];
    }
    for (let i = 0; i < rawTargetList.length; i++) {
      const reqName = rawTargetList[i];
      if (trimmedToActualMap[reqName]) {
        targetSheetNames.push(trimmedToActualMap[reqName]);
      }
    }
  }

  if (targetSheetNames.length === 0 || (rawTargetList.length > 0 && targetSheetNames.length < rawTargetList.length)) {
    allSheetNames = fetchSheetNamesViaApiFast(ssId);
    targetSheetNames = [];
    const trimmedToActualMap = {};
    for (let i = 0; i < allSheetNames.length; i++) {
      trimmedToActualMap[allSheetNames[i].trim()] = allSheetNames[i];
    }

    if (rawTargetList.length > 0) {
      for (let i = 0; i < rawTargetList.length; i++) {
        const reqName = rawTargetList[i];
        if (trimmedToActualMap[reqName]) {
          targetSheetNames.push(trimmedToActualMap[reqName]);
        }
      }
      if (targetSheetNames.length === 0) {
        return { success: false, error: `ไม่พบแผ่นงานชื่อ: ${targetSheet}` };
      }
    } else {
      const sortedSheets = sortSheetNamesDesc(allSheetNames);
      const limitSheets = Math.min(sortedSheets.length, 60);
      targetSheetNames = sortedSheets.slice(0, limitSheets);
      const extraKeys = [];
      for (let i = 0; i < targetSheetNames.length; i++) {
        const b64 = getSafeB64Key(targetSheetNames[i].trim(), 35);
        extraKeys.push("SHEET_VER_" + b64);
        if (!force) extraKeys.push("LAST_HASH_" + b64);
      }
      verBatch = scriptCache.getAll(extraKeys) || {};
    }
  }

  const sheetsTasksMap = {};
  let sheetsNeedingChecksum = [];

  // 0. Fast-Switch Cache Path: หากไม่ได้กดรีเฟรชบังคับ (!force) เช่น แค่เปลี่ยนชื่อจาก "ลูกหยี" เป็น "เป็ปซี่" ในวันเดิม
  // ให้ดึงข้อมูลทั้งชีตจาก Cache ล่าสุดมา Filter ชื่อใหม่ทันทีใน 0.01 วินาที โดยไม่ต้องยิง API กวาดชีตใหม่!
  if (!force) {
    const fastCacheKeys = [];
    const sheetToFastKey = {};
    for (let i = 0; i < targetSheetNames.length; i++) {
      const sName = targetSheetNames[i];
      const b64Name = getSafeB64Key(sName.trim(), 35);
      const lastHash = verBatch["LAST_HASH_" + b64Name];
      const ver = verBatch["SHEET_VER_" + b64Name] || "0";
      if (lastHash) {
        const fKey = "FAST_TASKS_V7_" + b64Name + "_" + lastHash + "_" + ver;
        sheetToFastKey[sName] = fKey;
        fastCacheKeys.push(fKey);
      }
    }

    const fastCachedData = fastCacheKeys.length > 0 ? (scriptCache.getAll(fastCacheKeys) || {}) : {};
    for (let i = 0; i < targetSheetNames.length; i++) {
      const sName = targetSheetNames[i];
      const fKey = sheetToFastKey[sName];
      if (fKey && fastCachedData[fKey]) {
        try {
          sheetsTasksMap[sName] = JSON.parse(fastCachedData[fKey]);
          continue;
        } catch (e) {}
      }
      sheetsNeedingChecksum.push(sName);
    }
  } else {
    sheetsNeedingChecksum = targetSheetNames.slice();
  }

  // 1. กวาดข้อความดิบ C4:L เฉพาะแผ่นงานที่ยังไม่อยู่ใน Fast Cache หรือเมื่อกดปุ่มค้นหารีเฟรช (force=true)
  let liveChecksums = null;
  let liveValuesMap = null;
  if (sheetsNeedingChecksum.length > 0) {
    const fastScan = fetchSheetsValuesAndChecksumFast(ssId, sheetsNeedingChecksum);
    liveChecksums = fastScan ? fastScan.checksumMap : null;
    liveValuesMap = fastScan ? fastScan.valuesMap : null;
  }

  const sheetsToFetchFromApi = [];
  const cacheKeyMap = {};
  const sheetCompositeHashMap = {};
  const cacheKeysToRequest = [];
  const hashPointerToPut = {};

  for (let i = 0; i < sheetsNeedingChecksum.length; i++) {
    const sName = sheetsNeedingChecksum[i];
    const b64Name = getSafeB64Key(sName.trim(), 35);
    const ver = verBatch["SHEET_VER_" + b64Name] || "0";
    const hashVal = (liveChecksums && liveChecksums[sName]) ? liveChecksums[sName] : "";
    const compositeHash = hashVal ? (hashVal + "_" + ver) : "";
    const hashSuffix = compositeHash ? ("_" + compositeHash) : "";
    const key = "FAST_TASKS_V7_" + b64Name + hashSuffix;
    cacheKeyMap[sName] = key;
    if (compositeHash) {
      sheetCompositeHashMap[sName] = compositeHash;
      sheetCompositeHashMap[sName.trim()] = compositeHash;
      cacheKeysToRequest.push(key);
      hashPointerToPut["LAST_HASH_" + b64Name] = hashVal;
    }
  }

  // เติม compositeHash สำหรับแผ่นงานที่ดึงมาจาก Fast-Switch Cache Path (ขั้นตอนที่ 0)
  for (let i = 0; i < targetSheetNames.length; i++) {
    const sName = targetSheetNames[i];
    if (!sheetCompositeHashMap[sName]) {
      const b64Name = getSafeB64Key(sName.trim(), 35);
      const lastHash = verBatch["LAST_HASH_" + b64Name];
      const ver = verBatch["SHEET_VER_" + b64Name] || "0";
      if (lastHash) {
        const comp = lastHash + "_" + ver;
        sheetCompositeHashMap[sName] = comp;
        sheetCompositeHashMap[sName.trim()] = comp;
      }
    }
  }

  // ตรวจสอบว่ามีแผ่นงานไหนที่ข้อมูลใน IndexedDB ของหน้าบ้านตรงกับชีตปัจจุบันเป๊ะๆ อยู่แล้วบ้าง (Delta Sync)
  const unchangedSheets = [];
  const unchangedSet = {};
  for (let i = 0; i < targetSheetNames.length; i++) {
    const sName = targetSheetNames[i];
    const currentCompHash = sheetCompositeHashMap[sName];
    const clientHash = clientKnownHashes[sName] || clientKnownHashes[sName.trim()];
    if (currentCompHash && clientHash && currentCompHash === clientHash) {
      unchangedSheets.push(sName);
      if (sName !== sName.trim()) {
        unchangedSheets.push(sName.trim());
      }
      unchangedSet[sName] = true;
      unchangedSet[sName.trim()] = true;
    }
  }

  // 2. ตรวจสอบจาก Cache ตาม Checksum และสร้างข้อมูลของทุกคนในชีตเก็บไว้ใน Cache เสมอ (เพื่อให้สลับชื่อคนอื่นได้ทันที)
  const cachedBatch = cacheKeysToRequest.length > 0 ? (scriptCache.getAll(cacheKeysToRequest) || {}) : {};
  const UPLOAD_IDX = CONFIG.COL_UPLOAD_LINK - 3; // Index 3 (คอลัมน์ F)
  const directCacheToPut = Object.assign({}, hashPointerToPut);

  for (let i = 0; i < sheetsNeedingChecksum.length; i++) {
    const sName = sheetsNeedingChecksum[i];
    // หากหน้าบ้านมีข้อมูลชุดล่าสุดของวันนี้อยู่ใน IndexedDB แล้ว ไม่ต้องเสียเวลาโหลดซ้ำ!
    if (unchangedSet[sName]) continue;

    const key = cacheKeyMap[sName];

    if (cachedBatch[key]) {
      try {
        sheetsTasksMap[sName] = JSON.parse(cachedBatch[key]);
        continue;
      } catch (e) {}
    }

    if (liveValuesMap && liveValuesMap[sName]) {
      const rows = liveValuesMap[sName];
      let hasAnyUploadTextInSheet = false;

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        const uploadVal = (row[UPLOAD_IDX] || "").toString().trim();
        if (uploadVal !== "") {
          hasAnyUploadTextInSheet = true;
          break;
        }
      }

      // หากทั้งแผ่นงานยังไม่มีลิงก์ในคอลัมน์ F เลย สร้างรายการงานของทุกคนเก็บลง Cache ทันทีใน 0ms!
      if (!hasAnyUploadTextInSheet) {
        const builtTasks = buildSheetTasksFromHybridData(sName, rows, []);
        sheetsTasksMap[sName] = builtTasks;
        if (key) {
          directCacheToPut[key] = JSON.stringify(builtTasks);
        }
        continue;
      }
    }

    sheetsToFetchFromApi.push(sName);
  }

  if (Object.keys(directCacheToPut).length > 0) {
    try {
      // เก็บ LAST_HASH_ และข้อมูลชีตไว้ให้สลับชื่อพนักงานได้ทันทีโดยไม่ต้องกวาดชีตใหม่
      scriptCache.putAll(directCacheToPut, 1800);
    } catch (e) {}
  }

  // 3. ดึงข้อมูล Links / Smart Chips เฉพาะคอลัมน์ F (F4:F{maxRow}) ของแผ่นงานที่มีข้อมูลในคอลัมน์ F เท่านั้น
  if (sheetsToFetchFromApi.length > 0) {
    const sheetRequests = sheetsToFetchFromApi.map(sName => {
      const rows = (liveValuesMap && liveValuesMap[sName]) ? liveValuesMap[sName] : null;
      const actualMaxRow = rows && rows.length > 0 ? (CONFIG.DATA_START_ROW + rows.length - 1) : CONFIG.DATA_START_ROW;
      return {
        name: sName,
        maxRow: Math.max(actualMaxRow, CONFIG.DATA_START_ROW)
      };
    });

    const apiData = fetchSheetsLinksGridDataFast(ssId, sheetRequests);
    const cacheToPut = {};

    if (apiData && apiData.sheets && apiData.sheets.length > 0) {
      const gridByTitle = {};
      for (let sIdx = 0; sIdx < apiData.sheets.length; sIdx++) {
        const sheetObj = apiData.sheets[sIdx];
        const title = sheetObj.properties?.title || sheetsToFetchFromApi[sIdx];
        gridByTitle[title] = sheetObj.data?.[0]?.rowData || [];
        gridByTitle[title.trim()] = gridByTitle[title];
      }

      for (let i = 0; i < sheetsToFetchFromApi.length; i++) {
        const sName = sheetsToFetchFromApi[i];
        const vRows = (liveValuesMap && liveValuesMap[sName]) ? liveValuesMap[sName] : [];
        const fRows = gridByTitle[sName] || gridByTitle[sName.trim()] || [];
        const parsedSheetTasks = buildSheetTasksFromHybridData(sName, vRows, fRows);
        sheetsTasksMap[sName] = parsedSheetTasks;
        const cKey = cacheKeyMap[sName];
        if (cKey) {
          cacheToPut[cKey] = JSON.stringify(parsedSheetTasks);
        }
      }

      try {
        if (Object.keys(cacheToPut).length > 0) {
          scriptCache.putAll(cacheToPut, 1800);
        }
      } catch (e) {}
    } else if (liveValuesMap) {
      for (let i = 0; i < sheetsToFetchFromApi.length; i++) {
        const sName = sheetsToFetchFromApi[i];
        const vRows = liveValuesMap[sName] || [];
        sheetsTasksMap[sName] = buildSheetTasksFromHybridData(sName, vRows, []);
      }
    }
  }

  // 4. กรองข้อมูลใน Memory ทันที (ข้ามแผ่นงานที่อยู่ใน unchangedSet เพราะหน้าบ้านมีใน IndexedDB แล้ว)
  const finalTasks = [];

  for (let i = 0; i < targetSheetNames.length; i++) {
    const sName = targetSheetNames[i];
    if (unchangedSet[sName]) continue;
    const sheetTasks = sheetsTasksMap[sName] || [];
    for (let t = 0; t < sheetTasks.length; t++) {
      const item = sheetTasks[t];
      if (isSpecificAssignee) {
        if (!item.assignee) continue;
        const rowNameClean = cleanAssigneeName(item.assignee);
        if (rowNameClean !== searchNameClean && !rowNameClean.includes(searchNameClean)) {
          continue;
        }
      }
      if (pendingOnly && item.isCompleted) {
        continue;
      }
      finalTasks.push(item);
    }
  }

  const sheetOrderMap = {};
  for (let i = 0; i < targetSheetNames.length; i++) {
    sheetOrderMap[targetSheetNames[i]] = i;
    sheetOrderMap[targetSheetNames[i].trim()] = i;
  }
  finalTasks.sort(function(a, b) {
    const orderA = sheetOrderMap[a.sheetName] ?? 999;
    const orderB = sheetOrderMap[b.sheetName] ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.row || 0) - (b.row || 0);
  });

  return {
    success: true,
    sheetName: targetSheet,
    sheets: allSheetNames,
    fetchedSheets: targetSheetNames,
    unchangedSheets: unchangedSheets,
    checksums: sheetCompositeHashMap,
    assignee: assignee,
    totalFound: finalTasks.length,
    tasks: finalTasks,
  };
}

/**
 * ฟังก์ชันช่วยเขียน Google Drive Smart Chip + Note ลิงก์ INTER + สถานะเสร็จสิ้น
 */
function writeSmartChipsBatchToSheet(spreadsheetId, sheet, updates) {
  if (!updates || updates.length === 0) return { success: false, error: "No updates" };
  const sheetId = sheet.getSheetId();

  const requests = [];
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    const rowIndex = u.row - 1;

    const cellValueObj = {
      userEnteredValue: { stringValue: "@" },
      chipRuns: [
        {
          startIndex: 0,
          chip: {
            richLinkProperties: {
              uri: u.thUrl
            }
          }
        }
      ]
    };
    let fieldsStr = "userEnteredValue,chipRuns";
    if (u.interUrl) {
      cellValueObj.note = `INTER: ${u.interUrl}`;
      fieldsStr += ",note";
    }

    requests.push({
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1,
          startColumnIndex: CONFIG.COL_UPLOAD_LINK - 1,
          endColumnIndex: CONFIG.COL_UPLOAD_LINK
        },
        rows: [{
          values: [cellValueObj]
        }],
        fields: fieldsStr
      }
    });

    requests.push({
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1,
          startColumnIndex: CONFIG.COL_STATUS - 1,
          endColumnIndex: CONFIG.COL_STATUS
        },
        rows: [{
          values: [{
            userEnteredValue: { stringValue: "เสร็จสิ้น ✅" }
          }]
        }],
        fields: "userEnteredValue"
      }
    });
  }

  let apiSuccess = false;
  let errorDetail = "";

  if (typeof Sheets !== "undefined" && Sheets && Sheets.Spreadsheets && typeof Sheets.Spreadsheets.batchUpdate === "function") {
    try {
      Sheets.Spreadsheets.batchUpdate({ requests: requests }, spreadsheetId);
      apiSuccess = true;
    } catch (eAdv) {
      errorDetail = "Sheets Advanced Service: " + eAdv.message;
    }
  }

  if (!apiSuccess) {
    try {
      const token = getFastOAuthToken();
      const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
      const res = UrlFetchApp.fetch(apiUrl, {
        method: "post",
        contentType: "application/json",
        headers: { "Authorization": "Bearer " + token },
        payload: JSON.stringify({ requests: requests }),
        muteHttpExceptions: true
      });

      if (res.getResponseCode() === 200) {
        apiSuccess = true;
      } else {
        errorDetail = `UrlFetchApp (${res.getResponseCode()}): ${res.getContentText()}`;
      }
    } catch (e) {
      errorDetail = e.message;
    }
  }

  if (!apiSuccess) {
    for (let i = 0; i < updates.length; i++) {
      const u = updates[i];
      try {
        const cellF = sheet.getRange(u.row, CONFIG.COL_UPLOAD_LINK);
        if (u.thUrl) {
          const richValue = SpreadsheetApp.newRichTextValue()
            .setText(u.taskName || `งานแถวที่ ${u.row}`)
            .setLinkUrl(u.thUrl)
            .build();
          cellF.setRichTextValue(richValue);
          cellF.setFontLine("none");
          cellF.setFontColor("#000000");
        } else if (u.taskName) {
          cellF.setValue(u.taskName);
        }
        if (u.interUrl) {
          cellF.setNote(`INTER: ${u.interUrl}`);
        }
        setSafeStatusCompleted(sheet, u.row);
      } catch (eRich) {}
    }
  }

  return {
    success: true,
    smartChip: apiSuccess,
    error: errorDetail
  };
}

function setSafeStatusCompleted(sheet, row) {
  const cellL = sheet.getRange(row, CONFIG.COL_STATUS);
  try {
    cellL.setValue("เสร็จสิ้น ✅");
    return;
  } catch (e1) {}
  try {
    cellL.setValue("เสร็จสิ้น");
    return;
  } catch (e2) {}
  try {
    cellL.clearDataValidations();
    cellL.setValue("เสร็จสิ้น ✅");
  } catch (e3) {}
}

function convertSheetLinksToSmartChips(sheetName, specificRows) {
  const ss = getFastActiveSpreadsheet();
  const ssId = ss.getId();
  const sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
  if (!sheet) return { success: false, error: "ไม่พบแผ่นงาน: " + sheetName };

  const lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) {
    return { success: true, message: "ไม่มีข้อมูลงานในแผ่นงานนี้", count: 0 };
  }

  const numRows = lastRow - CONFIG.DATA_START_ROW + 1;
  const colFRange = sheet.getRange(CONFIG.DATA_START_ROW, CONFIG.COL_UPLOAD_LINK, numRows, 1);
  const colFValues = colFRange.getValues();
  const colFNotes = colFRange.getNotes();
  const colFRichTexts = colFRange.getRichTextValues();
  const colFFormulas = colFRange.getFormulas();

  const updates = [];
  let rowsToCheck = [];
  if (specificRows && specificRows.length > 0) {
    rowsToCheck = specificRows;
  } else {
    for (let r = CONFIG.DATA_START_ROW; r <= lastRow; r++) {
      rowsToCheck.push(r);
    }
  }

  for (let i = 0; i < rowsToCheck.length; i++) {
    const r = rowsToCheck[i];
    if (r < CONFIG.DATA_START_ROW || r > lastRow) continue;

    const idx = r - CONFIG.DATA_START_ROW;
    const cellVal = (colFValues[idx][0] || "").toString().trim();
    const cellNote = colFNotes[idx][0] || "";
    const rich = colFRichTexts[idx][0];
    const formula = colFFormulas[idx][0];
    
    const extracted = extractCellLinkAndTitle(cellVal, rich, formula);
    const thUrl = extracted.link;

    if (thUrl && thUrl.includes("drive.google.com")) {
      let interUrl = "";
      const noteMatch = cellNote.match(/INTER:\s*(https:\/\/[^\s]+)/i);
      if (noteMatch && noteMatch[1]) {
        interUrl = noteMatch[1];
      }

      updates.push({
        row: r,
        taskName: cellVal || `งานแถวที่ ${r}`,
        thUrl: thUrl,
        interUrl: interUrl
      });
    }
  }

  let batchResult = null;
  if (updates.length > 0) {
    batchResult = writeSmartChipsBatchToSheet(ssId, sheet, updates);
    try {
      const scriptCache = CacheService.getScriptCache();
      const b64Name = getSafeB64Key(sheet.getName(), 35);
      scriptCache.put("SHEET_VER_" + b64Name, Date.now().toString(), 21600);
    } catch (e) {}
  }

  return {
    success: batchResult ? batchResult.success : true,
    method: batchResult ? batchResult.method : "",
    error: batchResult ? batchResult.error : "",
    message: batchResult && !batchResult.success
      ? `ไม่สามารถเขียน Smart Chip ได้: ${batchResult.error}`
      : `แปลงลิงก์เป็น Smart Chip การ์ดสวยงามสำเร็จ ${updates.length} รายการ`,
    count: updates.length,
    rows: updates.map(function(u) { return u.row; })
  };
}

function createFoldersAndSyncBatch(payload) {
  const ss = getFastActiveSpreadsheet();
  const ssId = ss.getId();
  const scriptCache = CacheService.getScriptCache();
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
  let lastBatchResult = null;
  const verToPut = {};
  const nowVerStr = Date.now().toString();

  for (const sName in grouped) {
    const sheet = ss.getSheetByName(sName);
    if (!sheet) continue;

    const { thFolder, interFolder } = getMonthlyRootFolders(sheet);
    const dateInfo = parseDateFormats(sName);

    if (interFolder) {
      autoHealMisplacedDateFolders(thFolder, interFolder, dateInfo);
    }

    const thDateAliases = [sName, `${dateInfo.dayNumber} พ.ย. 69`, `${dateInfo.padDay} พย 69`, `${dateInfo.dayNumber} พย 69`];
    const thDateFolder = getOrCreateFolderSmart(thFolder, dateInfo.thFolderName, thDateAliases, {
      isDate: true,
      dayNumber: dateInfo.dayNumber,
      monthKeywords: [dateInfo.thMonth, "พย", "พ.ย."]
    });

    let interDateFolder = null;
    if (interFolder) {
      const interAliases = [`NOV ${dateInfo.dayNumber},2026`, `${dateInfo.padDay} NOV 2026`, `${dateInfo.dayNumber} NOV 2026`];
      interDateFolder = getOrCreateFolderSmart(interFolder, dateInfo.interFolderName, interAliases, {
        isDate: true,
        dayNumber: dateInfo.dayNumber,
        monthKeywords: [dateInfo.interMonth, dateInfo.padMonth]
      });
    }

    const sheetTasks = grouped[sName];
    const sheetUpdates = [];
    const thCatFolderCache = {};
    const interCatFolderCache = {};

    const maxTaskRow = Math.max(...sheetTasks.map(t => t.row || CONFIG.DATA_START_ROW));
    let colFRange = null, colFValues = [], colFNotes = [], colFRichTexts = null;
    if (maxTaskRow >= CONFIG.DATA_START_ROW) {
      const numRows = maxTaskRow - CONFIG.DATA_START_ROW + 1;
      colFRange = sheet.getRange(CONFIG.DATA_START_ROW, CONFIG.COL_UPLOAD_LINK, numRows, 1);
      colFValues = colFRange.getValues();
      colFNotes = colFRange.getNotes();
    }

    for (let t = 0; t < sheetTasks.length; t++) {
      const task = sheetTasks[t];
      const rawCategory = task.category || "ทั่วไป";
      const catInfo = getCategoryInfoSmart(rawCategory);
      const row = task.row;
      const rowOffset = row - CONFIG.DATA_START_ROW;

      const requestedName = (task.taskName || "").trim();
      const isRename = task.isRename === true;
      const isCustomName = task.isCustomName === true;
      const defaultName = `${task.no || 1}_${catInfo.thTarget}`;
      const searchName = requestedName || defaultName;

      let thCatFolder = thCatFolderCache[catInfo.thTarget];
      if (!thCatFolder) {
        thCatFolder = getOrCreateFolderSmart(thDateFolder, catInfo.thTarget, [rawCategory, catInfo.interTarget], {
          isCategory: true,
          keywords: catInfo.keywords
        });
        thCatFolderCache[catInfo.thTarget] = thCatFolder;
      }

      let interCatFolder = null;
      if (interDateFolder) {
        interCatFolder = interCatFolderCache[catInfo.interTarget];
        if (!interCatFolder) {
          interCatFolder = getOrCreateFolderSmart(interDateFolder, catInfo.interTarget, [catInfo.thTarget, rawCategory], {
            isCategory: true,
            keywords: catInfo.keywords
          });
          interCatFolderCache[catInfo.interTarget] = interCatFolder;
        }
      }

      let thTaskFolder = null;
      let currentThFolderName = "";
      let existingThFolderId = null;

      if (task.existingUrl) {
        existingThFolderId = extractFolderId(task.existingUrl);
      }
      if (!existingThFolderId && rowOffset >= 0 && rowOffset < colFValues.length) {
        const cellVal = colFValues[rowOffset][0];
        if (typeof cellVal === "string" && cellVal.includes("drive.google.com")) {
          existingThFolderId = extractFolderId(cellVal);
        } else if (cellVal) {
          try {
            if (!colFRichTexts && colFRange) {
              colFRichTexts = colFRange.getRichTextValues();
            }
            const singleRich = colFRichTexts ? colFRichTexts[rowOffset][0] : null;
            const extracted = extractCellLinkAndTitle(cellVal, singleRich, "");
            if (extracted.link) {
              existingThFolderId = extractFolderId(extracted.link);
            }
          } catch (eR) {}
        }
      }

      if (existingThFolderId) {
        try {
          const existingF = DriveApp.getFolderById(existingThFolderId);
          if (existingF && !existingF.isTrashed()) {
            thTaskFolder = existingF;
            currentThFolderName = thTaskFolder.getName();
            if (isRename && requestedName && currentThFolderName !== requestedName) {
              thTaskFolder.setName(requestedName);
              currentThFolderName = requestedName;
            }
          }
        } catch (e) {}
      }

      if (!thTaskFolder) {
        const thAliases = [
          `${task.no || 1}`,
          `${task.no || 1}_${catInfo.thTarget}`,
          `${task.no || 1} ${catInfo.thTarget}`,
        ];
        thTaskFolder = getOrCreateFolderSmart(thCatFolder, searchName, thAliases, {
          taskNo: task.no
        });
        if (thTaskFolder) {
          currentThFolderName = thTaskFolder.getName();
          if (isRename && requestedName && currentThFolderName !== requestedName) {
            try {
              thTaskFolder.setName(requestedName);
              currentThFolderName = requestedName;
            } catch (e) {}
          }
        }
      }

      let finalTaskName = "";
      if (isRename && requestedName) {
        finalTaskName = requestedName;
      } else if (isCustomName && requestedName) {
        finalTaskName = requestedName;
      } else if (currentThFolderName) {
        finalTaskName = currentThFolderName;
      } else {
        finalTaskName = searchName;
      }

      const thUrl = thTaskFolder ? thTaskFolder.getUrl() : "";

      let interUrl = "";
      if (interCatFolder) {
        const interTaskName = `${task.no || 1} (${dateInfo.interDateSuffix})`.trim();
        const interAliases = [
          `${task.no || 1}`,
          `${task.no || 1} ${dateInfo.dayNumber}.${parseInt(dateInfo.padMonth, 10)}`,
          `${task.no || 1} ${dateInfo.interDateSuffix}`,
          `${task.no || 1} (${dateInfo.dayNumber}.${parseInt(dateInfo.padMonth, 10)})`,
          `${task.no || 1} (${parseInt(dateInfo.dayNumber, 10)}.${parseInt(dateInfo.padMonth, 10)})`,
        ];

        let interTaskFolder = null;
        const cellNote = (rowOffset >= 0 && rowOffset < colFNotes.length) ? (colFNotes[rowOffset][0] || "") : "";
        const noteMatch = cellNote.match(/INTER:\s*(https:\/\/[^\s]+)/i);
        if (noteMatch && noteMatch[1]) {
          const existingInterId = extractFolderId(noteMatch[1]);
          if (existingInterId) {
            try {
              const existingInterF = DriveApp.getFolderById(existingInterId);
              if (existingInterF && !existingInterF.isTrashed()) {
                interTaskFolder = existingInterF;
                if (interTaskFolder.getName() !== interTaskName) {
                  interTaskFolder.setName(interTaskName);
                }
              }
            } catch (e) {}
          }
        }

        if (!interTaskFolder) {
          interTaskFolder = getOrCreateFolderSmart(interCatFolder, interTaskName, interAliases, {
            taskNo: task.no
          });
          if (interTaskFolder && interTaskFolder.getName() !== interTaskName) {
            try { interTaskFolder.setName(interTaskName); } catch (e) {}
          }
        }
        interUrl = interTaskFolder ? interTaskFolder.getUrl() : "";
      }

      sheetUpdates.push({
        row: row,
        taskName: finalTaskName,
        thUrl: thUrl,
        interUrl: interUrl
      });

      results.push({
        sheetName: sName,
        row: row,
        taskName: finalTaskName,
        thFolderUrl: thUrl,
        interFolderUrl: interUrl,
        status: "เสร็จสิ้น",
      });
    }

    lastBatchResult = writeSmartChipsBatchToSheet(ssId, sheet, sheetUpdates);

    const b64Name = getSafeB64Key(sName, 35);
    verToPut["SHEET_VER_" + b64Name] = nowVerStr;
  }

  try {
    if (Object.keys(verToPut).length > 0) {
      scriptCache.putAll(verToPut, 21600);
    }
  } catch (e) {}

  return {
    success: true,
    smartChipResult: lastBatchResult,
    message: lastBatchResult && !lastBatchResult.success
      ? `สร้างโฟลเดอร์สำเร็จ แต่วางชิปไม่สำเร็จ: ${lastBatchResult.error}`
      : `สร้างโฟลเดอร์ TH & INTER และวาง Smart Chip สำเร็จ ${results.length} รายการ`,
    updatedTasks: results,
  };
}

function doGet(e) {
  try {
    const action = e.parameter.action || "getTasks";

    let data;
    if (action === "getMetadata") {
      const force = e.parameter.force === "true";
      data = getInitialMetadata(force);
    } else if (action === "getSheets") {
      const sheetNames = getSheetNamesFast(null);
      data = { success: true, sheets: sheetNames };
    } else if (action === "getMatchingSheets") {
      const assignee = e.parameter.assignee || "";
      const sheet = e.parameter.sheet || "";
      data = getMatchingSheetsForStaff(assignee, sheet);
    } else if (action === "getTasks") {
      const assignee = e.parameter.assignee || "";
      const sheet = e.parameter.sheet || "";
      const pendingOnly = e.parameter.pendingOnly === "true";
      const force = e.parameter.force === "true";
      const knownHashes = e.parameter.knownHashes || "";
      data = getStaffTasks(assignee, sheet, pendingOnly, force, knownHashes);
    } else if (action === "resolveBrief") {
      const title = e.parameter.title || "";
      const slideUrl = resolveBriefSlideUrl(title);
      data = { success: true, url: slideUrl };
    } else if (action === "fixSmartChips") {
      const sheetName = e.parameter.sheet || "";
      const rowsParam = e.parameter.rows || "";
      const rows = rowsParam ? rowsParam.split(",").map(Number).filter(Boolean) : [];
      data = convertSheetLinksToSmartChips(sheetName, rows);
    } else if (action === "repairLinks") {
      const sheetName = e.parameter.sheet || "";
      data = repairMissingThLinks(sheetName);
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

function repairMissingThLinks(sheetName) {
  const ss = getFastActiveSpreadsheet();
  const sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
  if (!sheet) return { success: false, error: "ไม่พบแผ่นงาน: " + sheetName };

  const lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) {
    return { success: true, count: 0, message: "ไม่มีข้อมูลงาน" };
  }

  const { thFolder } = getMonthlyRootFolders(sheet);
  const dateInfo = parseDateFormats(sheet.getName());
  const thDateAliases = [sheet.getName(), `${dateInfo.dayNumber} พ.ย. 69`, `${dateInfo.padDay} พย 69`];
  const thDateFolder = getOrCreateFolderSmart(thFolder, dateInfo.thFolderName, thDateAliases, {
    isDate: true,
    dayNumber: dateInfo.dayNumber,
    monthKeywords: [dateInfo.thMonth, "พย", "พ.ย."]
  });

  const numRows = lastRow - CONFIG.DATA_START_ROW + 1;
  const batchRange = sheet.getRange(CONFIG.DATA_START_ROW, 3, numRows, 4);
  const batchValues = batchRange.getValues();
  const batchNotes = batchRange.getNotes();
  const batchRichTexts = batchRange.getRichTextValues();
  const batchFormulas = batchRange.getFormulas();

  const updates = [];
  const thCatCache = {};

  let currentCategory = "";
  for (let r = CONFIG.DATA_START_ROW; r <= lastRow; r++) {
    const idx = r - CONFIG.DATA_START_ROW;
    const catVal = batchValues[idx][0];
    if (catVal && catVal.toString().trim() !== "") {
      currentCategory = catVal.toString().trim();
    }

    const noVal = batchValues[idx][2] || "";
    const text = (batchValues[idx][3] || "").toString().trim();
    const note = batchNotes[idx][3] || "";
    const rich = batchRichTexts[idx][3];
    const formula = batchFormulas[idx][3];
    const hasLink = (rich && rich.getLinkUrl()) || (formula && formula.includes("HYPERLINK"));

    if (text && (!hasLink || !rich?.getLinkUrl())) {
      const catInfo = getCategoryInfoSmart(currentCategory || "ทั่วไป");
      let thCat = thCatCache[catInfo.thTarget];
      if (!thCat) {
        thCat = getOrCreateFolderSmart(thDateFolder, catInfo.thTarget, [currentCategory], { isCategory: true, keywords: catInfo.keywords });
        thCatCache[catInfo.thTarget] = thCat;
      }

      if (thCat) {
        const existingTaskF = getOrCreateFolderSmart(thCat, text, [text, `${noVal}`, `${noVal}_${catInfo.thTarget}`], { taskNo: noVal });
        if (existingTaskF) {
          const noteMatch = note.match(/INTER:\s*(https:\/\/[^\s]+)/i);
          updates.push({
            row: r,
            taskName: existingTaskF.getName() || text,
            thUrl: existingTaskF.getUrl(),
            interUrl: noteMatch ? noteMatch[1].trim() : ""
          });
        }
      }
    }
  }

  if (updates.length > 0) {
    writeSmartChipsBatchToSheet(ss.getId(), sheet, updates);
    try {
      const scriptCache = CacheService.getScriptCache();
      const b64Name = getSafeB64Key(sheet.getName(), 35);
      scriptCache.put("SHEET_VER_" + b64Name, Date.now().toString(), 21600);
    } catch (e) {}
  }

  return {
    success: true,
    message: `ซ่อมแซมและกู้คืนลิงก์ TH สำเร็จ ${updates.length} รายการ`,
    count: updates.length,
    updates: updates
  };
}

function precreateFoldersBatch(payload) {
  const ss = getFastActiveSpreadsheet();
  const sName = payload.sheetName || "";
  const sheet = ss.getSheetByName(sName);
  if (!sheet) {
    throw new Error(`ไม่พบแผ่นงาน: ${sName}`);
  }

  const { thFolder, interFolder } = getMonthlyRootFolders(sheet);
  if (!thFolder) {
    throw new Error("ไม่พบโฟลเดอร์หลัก TH ในแถวที่ 3 (Col F)");
  }

  const baseDateInfo = parseDateFormats(sName);
  const monthStr = baseDateInfo.thMonth;
  const days = payload.days || [];
  if (!Array.isArray(days) || days.length === 0) {
    throw new Error("ไม่มีวันที่ที่ระบุ");
  }

  const DEFAULT_9_CATEGORIES = [
    "สล็อต",
    "คาสิโน",
    "บอล",
    "มวย",
    "ไก่ชน",
    "วัวชน",
    "กีฬาอื่นๆ",
    "หวย APB",
    "UFA NEWS",
  ];
  const targetCategories = (Array.isArray(payload.categories) && payload.categories.length > 0)
    ? payload.categories
    : DEFAULT_9_CATEGORIES;

  if (interFolder) {
    autoHealMisplacedDateFolders(thFolder, interFolder, null);
  }

  const createdSummary = [];

  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    const dayDateInfo = parseDateFormats(`${day} ${monthStr}`);

    const thDateAliases = [
      `${day} ${monthStr}`,
      `${dayDateInfo.dayNumber} ${dayDateInfo.thMonth} ${dayDateInfo.thYear}`,
      `${dayDateInfo.padDay} ${dayDateInfo.thMonth} ${dayDateInfo.thYear}`,
      `${dayDateInfo.dayNumber} ${monthStr} ${dayDateInfo.thYear}`,
      `${dayDateInfo.padDay} ${monthStr} ${dayDateInfo.thYear}`,
      `${dayDateInfo.dayNumber} พย 69`,
      `${dayDateInfo.padDay} พย 69`,
    ];
    const thDateFolder = getOrCreateFolderSmart(thFolder, dayDateInfo.thFolderName, thDateAliases, {
      isDate: true,
      dayNumber: dayDateInfo.dayNumber,
      monthKeywords: [dayDateInfo.thMonth, monthStr, dayDateInfo.padMonth]
    });

    let interDateFolder = null;
    if (interFolder) {
      const interAliases = [
        `${dayDateInfo.interMonth} ${dayDateInfo.dayNumber},${dayDateInfo.engYear}`,
        `${dayDateInfo.interMonth} ${dayDateInfo.padDay},${dayDateInfo.engYear}`,
        `${dayDateInfo.padDay} ${dayDateInfo.interMonth} ${dayDateInfo.engYear}`,
        `${dayDateInfo.dayNumber} ${dayDateInfo.interMonth} ${dayDateInfo.engYear}`
      ];
      interDateFolder = getOrCreateFolderSmart(interFolder, dayDateInfo.interFolderName, interAliases, {
        isDate: true,
        dayNumber: dayDateInfo.dayNumber,
        monthKeywords: [dayDateInfo.interMonth, dayDateInfo.padMonth]
      });
    }

    for (let c = 0; c < targetCategories.length; c++) {
      const catKey = targetCategories[c];
      const catInfo = getCategoryInfoSmart(catKey);

      if (thDateFolder) {
        getOrCreateFolderSmart(thDateFolder, catInfo.thTarget, [catKey, catInfo.interTarget], {
          isCategory: true,
          keywords: catInfo.keywords
        });
      }

      if (interDateFolder) {
        getOrCreateFolderSmart(interDateFolder, catInfo.interTarget, [catInfo.thTarget, catKey], {
          isCategory: true,
          keywords: catInfo.keywords
        });
      }
    }

    createdSummary.push({
      day: day,
      thFolder: dayDateInfo.thFolderName,
      interFolder: dayDateInfo.interFolderName,
      categoriesCount: targetCategories.length
    });
  }

  return {
    success: true,
    message: `สร้างโครงสร้างโฟลเดอร์วันที่ (${days.join(", ")}) พร้อม ${targetCategories.length} หมวดหมู่เรียบร้อยแล้ว`,
    processedDays: days,
    count: createdSummary.length,
    summary: createdSummary
  };
}

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action || "createFolders";

    let data;
    if (action === "createFolders") {
      data = createFoldersAndSyncBatch(postData);
    } else if (action === "precreateFoldersBatch") {
      data = precreateFoldersBatch(postData);
    } else if (action === "fixSmartChips") {
      data = convertSheetLinksToSmartChips(postData.sheetName, postData.rows);
    } else if (action === "repairLinks") {
      data = repairMissingThLinks(postData.sheetName);
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