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

// In-Memory Cache สำหรับเก็บรายการโฟลเดอร์ย่อยระหว่างรัน เพื่อลดการเรียก DriveApp.getFolders() ซ้ำซ้อน
const FOLDER_CHILDREN_CACHE = {};

/**
 * ฟังก์ชันช่วยตรวจสอบและให้สิทธิ์การเข้าถึง (Authorization)
 * หาก Apps Script แจ้งเตือนเรื่องสิทธิ์ UrlFetchApp หรือ external_request
 * ให้เลือกฟังก์ชัน authorizePermissions นี้ แล้วกด "เรียกใช้ (Run)" 1 ครั้ง
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
 * แปลงชื่อแผ่นงาน (เช่น "7 พย", "15 ธค", "5 มค") เป็นชื่อโฟลเดอร์ TH, INTER, และรหัสวันที่ (รองรับครบ 12 เดือน)
 */
function parseDateFormats(sheetName) {
  const match = sheetName.trim().match(/^(\d+)\s*([^\d\s]+)?/);
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

  return {
    dayNumber: day,
    padDay: padDay,
    padMonth: numMonth,
    thMonth: thMonth,
    interMonth: interMonth,
    thYear: thYear,
    engYear: engYear,
    // ตัวอย่าง: "07 พ.ย. 69"
    thFolderName: `${padDay} ${thMonth} ${thYear}`,
    // ตัวอย่าง: "NOV 07,2026"
    interFolderName: `${interMonth} ${padDay},${engYear}`,
    // ตัวอย่าง: "07.11"
    interDateSuffix: `${padDay}.${numMonth}`,
  };
}

/**
 * ลบวรรณยุกต์และสระภาษาไทยที่มักพิมพ์ผิดหรือต่างกัน (่ ้ ๊ ๋ ์ ็ ิ ี ึ ื ุ ู)
 */
function stripThaiDiacritics(str) {
  if (!str || typeof str !== "string") return "";
  return str.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, "");
}

/**
 * ปรับแต่งข้อความให้เป็นมาตรฐาน: ตัวพิมพ์เล็ก, ยุบช่องว่างซ้ำซ้อน, ตัดช่องว่างหัวท้าย
 */
function normalizeStringFuzzy(str) {
  if (!str || typeof str !== "string") return "";
  return str.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * ตรวจจับและแปลงชื่อหมวดหมู่ที่พิมพ์ผิด หรือย่อ ให้เป็นชื่อมาตรฐานของ TH และ INTER
 */
function getCategoryInfoSmart(rawCategory) {
  const cat = (rawCategory || "").toString().trim();
  const catLower = cat.toLowerCase();
  const catClean = stripThaiDiacritics(catLower).replace(/\s+/g, "");

  // สล็อต / เกมสล็อต / Slot
  if (catClean.includes("สลอต") || catLower.includes("slot")) {
    return {
      thTarget: "สล็อต SLOT",
      interTarget: "SLOT",
      keywords: ["สล็อต", "slot", "สลอต", "เกมสล็อต"]
    };
  }
  // คาสิโน / บาคาร่า / Casino
  if (catClean.includes("คาสโน") || catLower.includes("casino") || catClean.includes("บาคารา")) {
    return {
      thTarget: "คาสิโน CASINO",
      interTarget: "CASINO",
      keywords: ["คาสิโน", "casino", "คาสโน", "บาคาร่า"]
    };
  }
  // บอล / ฟุตบอล / Football
  if (catClean.includes("บอล") || catLower.includes("football") || catLower.includes("soccer")) {
    return {
      thTarget: "บอล FOOTBALL",
      interTarget: "FOOTBALL",
      keywords: ["บอล", "football", "ฟุตบอล", "soccer"]
    };
  }
  // มวย / มวยไทย / Boxing
  if (catClean.includes("มวย") || catLower.includes("boxing")) {
    return {
      thTarget: "มวย BOXING",
      interTarget: "BOXING",
      keywords: ["มวย", "boxing", "มวยไทย"]
    };
  }
  // ไก่ชน / Cock Fighting
  if (catClean.includes("ไกชน") || catClean.includes("ไก") || catLower.includes("cock")) {
    return {
      thTarget: "ไก่ชน COCK FIGHTING",
      interTarget: "COCK FIGHTING",
      keywords: ["ไก่ชน", "ไก่", "cock"]
    };
  }
  // วัวชน / Cow Fighting
  if (catClean.includes("ววชน") || catClean.includes("วว") || catLower.includes("cow")) {
    return {
      thTarget: "วัวชน COW FIGHTING",
      interTarget: "COW FIGHTING",
      keywords: ["วัวชน", "วัว", "cow"]
    };
  }
  // หวย APB / Asia PowerBall / Lotto
  if (catClean.includes("หวย") || catLower.includes("apb") || catLower.includes("lotto")) {
    return {
      thTarget: "หวย APB",
      interTarget: "APB",
      keywords: ["หวย APB", "หวย", "apb", "lotto"]
    };
  }
  // UFA NEWS
  if (catLower.includes("ufa") || catLower.includes("news")) {
    return {
      thTarget: "UFA NEWS",
      interTarget: "UFA NEWS",
      keywords: ["ufa news", "ufa", "news"]
    };
  }
  // แคมเปญ
  if (catClean.includes("แคมเปญ") || catLower.includes("campaign")) {
    return {
      thTarget: "แคมเปญ",
      interTarget: "CAMPAIGN",
      keywords: ["แคมเปญ", "campaign"]
    };
  }
  // กิจกรรมกลาง
  if (catClean.includes("กจกรรม") || catLower.includes("activity")) {
    return {
      thTarget: "กิจกรรมกลาง",
      interTarget: "MAIN ACTIVITY",
      keywords: ["กิจกรรมกลาง", "กิจกรรม", "activity"]
    };
  }
  // กีฬาอื่นๆ
  if (catClean.includes("กฬา") || catLower.includes("sport")) {
    return {
      thTarget: "กีฬาอื่นๆ Other Sports",
      interTarget: "OTHER SPORTS",
      keywords: ["กีฬาอื่นๆ", "กีฬา", "sport"]
    };
  }

  return {
    thTarget: CATEGORY_MAP_TH[cat] || cat || "ทั่วไป",
    interTarget: CATEGORY_MAP_INTER[cat] || cat || "GENERAL",
    keywords: [cat]
  };
}

/**
 * ดึงหรือสร้างโฟลเดอร์แบบ Fuzzy & Smart พร้อมระบบ In-Memory Cache ลดการเรียก DriveApp ซ้ำซ้อน
 */
function getOrCreateFolderSmart(parentFolder, targetName, aliases, matchOptions) {
  if (!parentFolder) return null;
  const targetClean = normalizeStringFuzzy(targetName);
  const targetNoDiacritics = stripThaiDiacritics(targetClean);
  const cleanAliases = (aliases || []).map(a => normalizeStringFuzzy(a)).filter(Boolean);

  const parentId = parentFolder.getId();
  let folderList = FOLDER_CHILDREN_CACHE[parentId];

  // ดึงรายการโฟลเดอร์ย่อยเฉพาะครั้งแรกที่ยังไม่อยู่ใน Memory Cache
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

  // Tier 1: ตรงเป๊ะ (ไม่สนตัวพิมพ์เล็ก-ใหญ่ และยุบช่องว่างเกิน)
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

  // Tier 3: ลบวรรณยุกต์ไทยออกแล้วตรงกัน (ตรวจจับคำพิมพ์ผิด เช่น สล๊อต vs สล็อต, คาสิโน่ vs คาสิโน)
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

  // Tier 6: ตรวจจับโฟลเดอร์วันที่ (Date Folder Fuzzy Match)
  if (matchOptions && matchOptions.isDate && matchOptions.dayNumber) {
    const dNum = matchOptions.dayNumber.toString();
    const padDNum = dNum.length === 1 ? "0" + dNum : dNum;
    for (let i = 0; i < folderList.length; i++) {
      const item = folderList[i];
      const hasDay = item.clean.includes(dNum) || item.clean.includes(padDNum);
      if (hasDay && matchOptions.monthKeywords) {
        if (matchOptions.monthKeywords.some(mk => item.clean.includes(normalizeStringFuzzy(mk)))) {
          return item.folder;
        }
      }
    }
  }

  // Tier 7: ถ้าไม่พบโฟลเดอร์เดิมเลยจริงๆ จึงสร้างโฟลเดอร์ใหม่ตาม targetName และบันทึกเข้า Memory Cache ทันที
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

// สำหรับ backward compatibility
function getOrCreateFolderFlexible(parentFolder, targetName, aliases) {
  return getOrCreateFolderSmart(parentFolder, targetName, aliases, {});
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
 * ค้นหา URL ของไฟล์ใบบรีฟใน Google Drive ตามชื่อ (Optimized: รวบ Query ค้นหาในครั้งเดียวแทนการวนลูป 12 รอบ)
 */
function findDriveFileOrFolderUrl(title) {
  if (!title || typeof title !== "string") return "";
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length < 2) return "";

  const singleSpaced = cleanTitle.replace(/\s+/g, " ");
  const titleWithoutExt = singleSpaced.replace(/\.(pptx?|pdf|docx?)$/i, "").trim();

  // 1. สร้างรายชื่อไฟล์ที่อาจเป็นไปได้ทั้งหมด
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

  // ค้นหาแบบ Batch Query ในครั้งเดียว (เร็วขึ้น 10 เท่าเทียบกับการวนลูป getFilesByName ทีละชื่อ)
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
    // Fallback กรณีอักขระพิเศษทำให้ searchFiles error
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

  // 2. ค้นหาแบบ Fuzzy ผ่าน searchFiles โดยสกัดคำสำคัญ เช่น "SLOT" และ "BRIEF"
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

/**
 * ค้นหาและแปลงชื่อใบบรีฟเป็นลิงก์เปิด Google Slides Presentation (สำหรับ Action resolveBrief)
 * แคชผลลัพธ์ไว้ 6 ชั่วโมง (21600 วินาที) เพื่อความเร็วระดับ 0ms ในการกดครั้งถัดไป
 */
function resolveBriefSlideUrl(title) {
  if (!title || typeof title !== "string") return "";
  const cleanTitle = title.trim();
  if (!cleanTitle) return "";

  const scriptCache = CacheService.getScriptCache();
  const cacheKey = "RESOLVE_BRIEF_SLIDE_V3_" + Utilities.base64EncodeWebSafe(cleanTitle).slice(0, 60);
  try {
    const cached = scriptCache.get(cacheKey);
    if (cached) return cached;
  } catch (e) {}

  const slideUrl = findDriveFileOrFolderUrl(cleanTitle);
  if (slideUrl) {
    try {
      scriptCache.put(cacheKey, slideUrl, 21600); // 6 ชั่วโมง
    } catch (e) {}
    return slideUrl;
  }
  return "";
}

/**
 * แปลงลิงก์จาก Google Drive ทั่วไป หรือ Smart Chip ให้เป็นลิงก์เปิดหน้า Google Slides Presentation โดยตรง
 */
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
    const cacheKey = "SLIDE_URL_V2_" + Utilities.base64EncodeWebSafe(briefTitle).slice(0, 60);
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

/**
 * ดึง ID ของโฟลเดอร์ Google Drive จากเซลล์ (รองรับ Formula =HYPERLINK, RichText, และ Text)
 */
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

/**
 * ค้นหาโฟลเดอร์ Google Drive ตามชื่อ (เช่น "TH M11" -> ค้นหา "M11" ก่อน)
 */
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
 * Optimized: ดึง F3:G3 ใน API Call เดียวแทนการแยกยิง 2 ครั้ง
 */
function getMonthlyRootFolders(sheet) {
  const ss = sheet.getParent();
  const ssId = ss.getId();
  const sheetName = sheet.getName();
  const cache = CacheService.getScriptCache();
  const cacheKey = "ROOT_FOLDERS_" + Utilities.base64EncodeWebSafe(sheetName).slice(0, 50);

  // ตรวจสอบจาก Cache ก่อนเพื่อความรวดเร็ว 0ms
  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const thF = parsed.thId ? DriveApp.getFolderById(parsed.thId) : null;
      const interF = parsed.interId ? DriveApp.getFolderById(parsed.interId) : null;
      if (thF && !thF.isTrashed()) {
        return { thFolder: thF, interFolder: interF };
      }
    } catch (e) {}
  }

  let thFolder = null;
  let interFolder = null;

  // 1. ดึง Smart Chips ของทั้ง F3 และ G3 ในการยิง API เพียงครั้งเดียว
  try {
    const token = ScriptApp.getOAuthToken();
    const encodedRange = encodeURIComponent(`'${sheetName}'!F3:G3`);
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${ssId}?ranges=${encodedRange}&fields=sheets(data(rowData(values(chipRuns))))`;
    const res = UrlFetchApp.fetch(apiUrl, {
      method: "get",
      headers: { "Authorization": "Bearer " + token },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      const vals = data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values || [];
      const f3Uri = vals[0]?.chipRuns?.[0]?.chip?.richLinkProperties?.uri;
      const g3Uri = vals[1]?.chipRuns?.[0]?.chip?.richLinkProperties?.uri;
      if (f3Uri) {
        const id = extractFolderId(f3Uri);
        if (id) { try { thFolder = DriveApp.getFolderById(id); } catch(e) {} }
      }
      if (g3Uri) {
        const id = extractFolderId(g3Uri);
        if (id) { try { interFolder = DriveApp.getFolderById(id); } catch(e) {} }
      }
    }
  } catch (e) {
    Logger.log("Chip F3:G3 batch fetch: " + e.message);
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

  // บันทึกใส่ Cache 6 ชั่วโมงเพื่อให้รอบต่อไปเร็วทันใจ 0ms
  try {
    cache.put(cacheKey, JSON.stringify({
      thId: thFolder.getId(),
      interId: interFolder ? interFolder.getId() : ""
    }), 21600);
  } catch (e) {}

  return { thFolder: thFolder, interFolder: interFolder };
}

/**
 * ดึงรายชื่อแท็บทั้งหมดผ่าน Sheets API v4 (เร็วกว่า ss.getSheets() 10 เท่าเมื่อมี 52+ แท็บ)
 */
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
    const token = ScriptApp.getOAuthToken();
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

  const allSheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  return allSheets.map(s => s.getName()).filter(n => n.trim() !== "TEM");
}

/**
 * ดึงรายชื่อพนักงานและแท็บวันที่ทั้งหมด (Optimized: ไม่เรียก ss.getSheets() ที่ช้าเมื่อมี 52 แท็บ + แคช 30 นาที)
 */
/**
 * ดึงข้อมูลเบื้องต้น: รายชื่อแท็บวันที่ทั้งหมด และรายชื่อพนักงานทุกคนที่มีในชีต
 * Optimized: สแกนครอบคลุมแท็บวันที่ทั้งหมด (35-40 แผ่นงาน) ด้วย Batch API รวดเดียว (~0.2 วินาที)
 */
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

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ssId = ss.getId();
  const sheetNames = fetchSheetNamesViaApiFast(ssId);
  const staffSet = { "ลูกหยี": true };

  // กรองเฉพาะแท็บวันที่จริง และเรียงจากล่าสุดไปอดีต
  const sortedForStaff = sortSheetNamesDesc(sheetNames);
  const dateSheets = sortedForStaff.filter(n => {
    const t = n.trim();
    return t !== "TEM" && /^\d+\s*[\u0E00-\u0E7F]/.test(t);
  });
  // สแกนครอบคลุมแท็บวันที่ทั้งหมด (สูงสุด 40 แผ่นงาน) เพื่อให้ได้รายชื่อพนักงานครบทุกคน 100%
  const sheetsToCheck = dateSheets.length > 0 ? dateSheets.slice(0, 40) : sortedForStaff.slice(0, 40);
  let apiFetched = false;

  // วิธีที่ 1: ดึงผ่าน Google Sheets Advanced Service (เร็วที่สุด ~0.1-0.2 วินาทีในคำสั่งเดียว ไม่ติดข้อจำกัด URL)
  if (typeof Sheets !== "undefined" && Sheets && Sheets.Spreadsheets && Sheets.Spreadsheets.Values && typeof Sheets.Spreadsheets.Values.batchGet === "function") {
    try {
      const ranges = sheetsToCheck.map(n => `'${n}'!J${CONFIG.DATA_START_ROW}:J150`);
      const res = Sheets.Spreadsheets.Values.batchGet(ssId, { ranges: ranges });
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

  // วิธีที่ 2: ดึงผ่าน UrlFetchApp โดยแบ่งเป็น Chunk ละ 25 แผ่นงาน (เพื่อความเร็วและไม่เกินขีดจำกัดความยาว URL)
  if (!apiFetched) {
    try {
      const token = ScriptApp.getOAuthToken();
      const chunkSize = 25;
      for (let c = 0; c < sheetsToCheck.length; c += chunkSize) {
        const chunk = sheetsToCheck.slice(c, c + chunkSize);
        const rangesParam = chunk
          .map(n => `ranges=${encodeURIComponent(`'${n}'!J${CONFIG.DATA_START_ROW}:J150`)}`)
          .join("&");
        const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values:batchGet?${rangesParam}`;
        const res = UrlFetchApp.fetch(apiUrl, {
          method: "get",
          headers: { "Authorization": "Bearer " + token },
          muteHttpExceptions: true
        });
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

  // วิธีที่ 3: Fallback หาก API ไม่พร้อมใช้งาน ให้สแกน 15 แผ่นงานล่าสุดผ่าน SpreadsheetApp
  if (!apiFetched) {
    const fallbackSheets = sheetsToCheck.slice(0, 15);
    for (let s = 0; s < fallbackSheets.length; s++) {
      const sheet = ss.getSheetByName(fallbackSheets[s]);
      if (!sheet) continue;
      const lastRow = sheet.getLastRow();
      if (lastRow >= CONFIG.DATA_START_ROW) {
        const assignees = sheet.getRange(CONFIG.DATA_START_ROW, CONFIG.COL_ASSIGNEE, Math.min(lastRow - CONFIG.DATA_START_ROW + 1, 150), 1).getValues();
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
    cache.put("INITIAL_METADATA_V6", JSON.stringify(result), 1800); // แคช 30 นาที
  } catch (e) {}

  return result;
}

/**
 * ฟังก์ชันช่วยดึงเฉพาะรายชื่อแผ่นงานแบบเร็วพิเศษ (ดึงจาก Cache ก่อนเสมอ ถ้าไม่มีใช้ REST API แทน ss.getSheets())
 */
function getSheetNamesFast(ss) {
  const cache = CacheService.getScriptCache();
  const cachedMeta = cache.get("INITIAL_METADATA_V5");
  if (cachedMeta) {
    try {
      const parsed = JSON.parse(cachedMeta);
      if (parsed && Array.isArray(parsed.sheetNames) && parsed.sheetNames.length > 0) {
        return parsed.sheetNames;
      }
    } catch (e) {}
  }
  const ssId = (ss || SpreadsheetApp.getActiveSpreadsheet()).getId();
  return fetchSheetNamesViaApiFast(ssId);
}

/**
 * ดึงเฉพาะข้อความดิบ (Lightweight Values) ของทุกชีตที่เลือกในครั้งเดียว (ใช้เวลา ~0.1 วินาที)
 * เพื่อสร้างรหัส Checksum (MD5) ตรวจสอบว่าชีตไหนมีการแก้ไขข้อมูลบ้างแบบ Realtime 100%
 */
function fetchSheetsChecksumMapFast(spreadsheetId, sheetNames) {
  const maxRow = sheetNames.length === 1 ? 200 : 150;
  const startRow = CONFIG.DATA_START_ROW;
  const checksumMap = {};

  try {
    let valueRanges = null;

    if (typeof Sheets !== "undefined" && Sheets && Sheets.Spreadsheets && Sheets.Spreadsheets.Values && typeof Sheets.Spreadsheets.Values.batchGet === "function") {
      try {
        const ranges = sheetNames.map(name => `'${name}'!C${startRow}:L${maxRow}`);
        const res = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, { ranges: ranges });
        if (res && res.valueRanges) valueRanges = res.valueRanges;
      } catch (eAdv) {}
    }

    if (!valueRanges) {
      const token = ScriptApp.getOAuthToken();
      const rangesParam = sheetNames
        .map(name => `ranges=${encodeURIComponent(`'${name}'!C${startRow}:L${maxRow}`)}`)
        .join("&");
      const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${rangesParam}`;
      const res = UrlFetchApp.fetch(apiUrl, {
        method: "get",
        headers: { "Authorization": "Bearer " + token },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        const data = JSON.parse(res.getContentText());
        valueRanges = data.valueRanges || [];
      }
    }

    if (valueRanges && valueRanges.length === sheetNames.length) {
      for (let i = 0; i < sheetNames.length; i++) {
        const sName = sheetNames[i];
        const rawVals = JSON.stringify(valueRanges[i].values || []);
        const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, rawVals, Utilities.Charset.UTF_8);
        checksumMap[sName] = Utilities.base64EncodeWebSafe(digest).slice(0, 16);
      }
      return checksumMap;
    }
  } catch (e) {
    Logger.log("fetchSheetsChecksumMapFast error: " + e.message);
  }
  return null;
}

/**
 * ฟังก์ชันช่วยดึงข้อมูลชีตแบบ Ultra-Fast ผ่าน Google Sheets API v4 ในครั้งเดียว
 * Optimized: ดึงเฉพาะช่วง C4:L (ตัดคอลัมน์ A,B และตัดแถว Header 1-3 ทิ้ง) ลดขนาด Payload กว่า 40%
 */
function fetchSheetsGridDataFast(spreadsheetId, sheetNames) {
  const maxRow = sheetNames.length === 1 ? 200 : 150;
  const startRow = CONFIG.DATA_START_ROW; // แถวที่ 4
  const fields = "sheets(properties(title),data(rowData(values(formattedValue,hyperlink,note,userEnteredValue(formulaValue),textFormatRuns(format(link(uri))),chipRuns))))";

  if (typeof Sheets !== "undefined" && Sheets && Sheets.Spreadsheets && typeof Sheets.Spreadsheets.get === "function") {
    try {
      const ranges = sheetNames.map(name => `'${name}'!C${startRow}:L${maxRow}`);
      const res = Sheets.Spreadsheets.get(spreadsheetId, { ranges: ranges, fields: fields });
      if (res && res.sheets) {
        return res;
      }
    } catch (eAdv) {
      Logger.log("fetchSheetsGridDataFast Sheets Advanced Service: " + eAdv.message);
    }
  }

  try {
    const token = ScriptApp.getOAuthToken();
    const rangesParam = sheetNames
      .map(name => `ranges=${encodeURIComponent(`'${name}'!C${startRow}:L${maxRow}`)}`)
      .join("&");
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${rangesParam}&fields=${encodeURI(fields)}`;

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
 * เรียงลำดับชื่อแผ่นงานวันที่จากล่าสุดไปหาเก่าสุด
 */
function sortSheetNamesDesc(sheets) {
  const monthWeights = {
    "ธค": 12, "ธ.ค.": 12, "พย": 11, "พ.ย.": 11, "ตค": 10, "ต.ค.": 10,
    "กย": 9, "ก.ย.": 9, "สค": 8, "ส.ค.": 8, "กค": 7, "ก.ค.": 7,
    "มิย": 6, "มิ.ย.": 6, "พค": 5, "พ.ค.": 5, "เมย": 4, "เม.ย.": 4,
    "มีค": 3, "มี.ค.": 3, "กพ": 2, "ก.พ.": 2, "มค": 1, "ม.ค.": 1
  };
  return [...sheets].sort((a, b) => {
    const parse = (str) => {
      const match = str.trim().match(/^(\d+)\s*([^\d\s]+)?/);
      if (!match) return { day: 0, mWeight: 0 };
      const day = parseInt(match[1], 10);
      const mStr = (match[2] || "").trim();
      const mWeight = monthWeights[mStr] || 0;
      return { day, mWeight };
    };
    const pA = parse(a);
    const pB = parse(b);
    if (pA.mWeight !== pB.mWeight) return pB.mWeight - pA.mWeight;
    return pB.day - pA.day;
  });
}

/**
 * ดึงลิงก์และข้อความจาก Cell Object ของ Sheets API v4 (รองรับทั้ง Smart Chip, Hyperlink และ Runs)
 */
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

/**
 * แยกข้อมูลข้อความ ลิงก์ และ Note จาก Cell Object ที่ส่งมาจาก Sheets API v4
 */
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

/**
 * แปลงลิงก์ใบบรีฟแบบ Instant 0ms
 */
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
 * ดึงรายการงานตามชื่อพนักงาน (Instant Checksum Version: เร็วระดับมิลลิวินาที + อัปเดตข้อมูลทันที 100% วินาทีต่อวินาที)
 * - ตรวจสอบรหัส Checksum (MD5) ของทั้ง 15 วันใน 0.1 วินาที
 * - วันไหนมีคนเพิ่งแก้ไขในชีต (แม้ผ่านไปแค่ 1 วินาที หรือเป็นวันเก่าลึกแค่ไหน) ระบบจะตรวจพบและดึงข้อมูลใหม่ทันที 100%
 * - วันไหนไม่มีการแก้ไข จะดึงจาก Cache ทันที (0ms) โดยไม่ต้องโหลด Smart Chips ใหม่
 */
function getStaffTasks(assignee, targetSheet, pendingOnly, force) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ssId = ss.getId();
  const scriptCache = CacheService.getScriptCache();
  const allSheetNames = getSheetNamesFast(ss);

  let targetSheetNames = [];
  if (targetSheet && targetSheet !== "ALL") {
    const rawList = targetSheet.split(",").map(s => s.trim()).filter(Boolean);
    const validSet = new Set(allSheetNames);
    targetSheetNames = rawList.filter(s => validSet.has(s));
    if (targetSheetNames.length === 0) {
      return { success: false, error: `ไม่พบแผ่นงานชื่อ: ${targetSheet}` };
    }
  } else {
    const sortedSheets = sortSheetNamesDesc(allSheetNames);
    const limitSheets = (assignee && assignee !== "ALL") ? 10 : 8;
    targetSheetNames = sortedSheets.slice(0, limitSheets);
  }

  // 1. คำนวณรหัส Checksum สดๆ จากชีตของทุกวันที่เลือก (ใช้เวลาเพียง ~0.1 วินาที)
  // หากใครแก้ข้อความ ชื่อคน สถานะ หรือเพิ่มแถวในวันไหน รหัส Checksum ของวันนั้นจะเปลี่ยนทันที!
  const liveChecksums = fetchSheetsChecksumMapFast(ssId, targetSheetNames);

  // ดึงเลขเวอร์ชันของการอัปเดต Smart Chip (กรณีเปลี่ยนเฉพาะลิงก์ Smart Chip หรือ Note INTER)
  const verKeys = targetSheetNames.map(s => "SHEET_VER_" + Utilities.base64EncodeWebSafe(s).slice(0, 35));
  const verBatch = scriptCache.getAll(verKeys) || {};

  const sheetsTasksMap = {};
  const sheetsToFetchFromApi = [];
  const cacheKeyMap = {};
  const cacheKeysToRequest = [];

  for (let i = 0; i < targetSheetNames.length; i++) {
    const sName = targetSheetNames[i];
    const b64Name = Utilities.base64EncodeWebSafe(sName).slice(0, 35);
    const ver = verBatch["SHEET_VER_" + b64Name] || "0";
    const hashSuffix = (liveChecksums && liveChecksums[sName]) ? ("_" + liveChecksums[sName] + "_" + ver) : "";
    const key = "FAST_TASKS_V5_" + b64Name + hashSuffix;
    cacheKeyMap[sName] = key;
    if (liveChecksums && liveChecksums[sName]) {
      cacheKeysToRequest.push(key);
    }
  }

  // 2. ดึงจาก Cache เฉพาะวันที่ข้อมูลในชีตตรงกับ Checksum ปัจจุบันเป๊ะๆ เท่านั้น
  const cachedBatch = cacheKeysToRequest.length > 0 ? (scriptCache.getAll(cacheKeysToRequest) || {}) : {};
  for (let i = 0; i < targetSheetNames.length; i++) {
    const sName = targetSheetNames[i];
    const key = cacheKeyMap[sName];

    if (cachedBatch[key]) {
      try {
        sheetsTasksMap[sName] = JSON.parse(cachedBatch[key]);
        continue;
      } catch (e) {}
    }
    // วันไหนมีการเปลี่ยนแปลงข้อมูลในชีต (Checksum เปลี่ยน) หรือยังไม่อยู่ใน Cache จะถูกดึงสดทันที
    sheetsToFetchFromApi.push(sName);
  }

  // Memory Cache สำหรับจำลิงก์ใบบรีฟในรอบรันนี้
  const briefSlideMemCache = {};

  // 3. ดึงข้อมูลเต็มรูปแบบ (พร้อม Smart Chips / Links / Notes) เฉพาะวันที่เพิ่งมีการเปลี่ยนแปลงเท่านั้น!
  if (sheetsToFetchFromApi.length > 0) {
    const apiData = fetchSheetsGridDataFast(ssId, sheetsToFetchFromApi);
    const cacheToPut = {};

    if (apiData && apiData.sheets && apiData.sheets.length > 0) {
      const COL_OFFSET = 3;

      for (let sIdx = 0; sIdx < apiData.sheets.length; sIdx++) {
        const sheetObj = apiData.sheets[sIdx];
        const sheetName = sheetObj.properties?.title || sheetsToFetchFromApi[sIdx];
        const rowData = sheetObj.data?.[0]?.rowData || [];
        const parsedSheetTasks = [];

        let currentCategory = "";
        let currentBriefLink = "";
        let currentBriefTitle = "";

        for (let rIdx = 0; rIdx < rowData.length; rIdx++) {
          const actualRowNumber = CONFIG.DATA_START_ROW + rIdx;
          const vals = rowData[rIdx]?.values;
          if (!vals || vals.length === 0) continue;

          const categoryCell = vals[CONFIG.COL_CATEGORY_NAME - COL_OFFSET]?.formattedValue;
          if (categoryCell && categoryCell.toString().trim() !== "") {
            const newCat = categoryCell.toString().trim();
            if (newCat !== currentCategory) {
              currentCategory = newCat;
              currentBriefLink = "";
              currentBriefTitle = "";
            }
          }

          const briefInfo = extractApiCellInfo(vals[CONFIG.COL_BRIEF_LINK - COL_OFFSET]);
          if (briefInfo.link) currentBriefLink = briefInfo.link;
          if (briefInfo.title) currentBriefTitle = briefInfo.title;

          const rowAssignee = (vals[CONFIG.COL_ASSIGNEE - COL_OFFSET]?.formattedValue || "").toString().trim();
          const noVal = vals[CONFIG.COL_NO - COL_OFFSET]?.formattedValue || "";
          const uploadInfo = extractApiCellInfo(vals[CONFIG.COL_UPLOAD_LINK - COL_OFFSET]);
          const uploadCellText = uploadInfo.title;
          const status = (vals[CONFIG.COL_STATUS - COL_OFFSET]?.formattedValue || "").toString().trim();

          if (!rowAssignee && !noVal && !uploadCellText) continue;

          let uploadUrl = uploadInfo.link;
          const cellNote = uploadInfo.note;
          let interFolderUrl = "";
          if (cellNote) {
            const noteMatch = cellNote.match(/INTER:\s*(https:\/\/[^\s]+)/i);
            if (noteMatch && noteMatch[1]) {
              interFolderUrl = noteMatch[1].trim();
            }
          }

          const hasNameOrLink = !!(uploadUrl || uploadCellText);
          const isCompleted = hasNameOrLink ? (status.includes("เสร็จสิ้น") || uploadUrl !== "") : false;
          let taskBriefLink = fastFormatPresentationUrl(currentBriefLink);
          if (!taskBriefLink && currentBriefTitle) {
            if (briefSlideMemCache[currentBriefTitle] !== undefined) {
              taskBriefLink = briefSlideMemCache[currentBriefTitle];
            } else {
              try {
                const bKey = "RESOLVE_BRIEF_SLIDE_V3_" + Utilities.base64EncodeWebSafe(currentBriefTitle).slice(0, 60);
                const cachedSlide = scriptCache.get(bKey) || "";
                briefSlideMemCache[currentBriefTitle] = cachedSlide;
                if (cachedSlide) taskBriefLink = cachedSlide;
              } catch (e) {
                briefSlideMemCache[currentBriefTitle] = "";
              }
            }
          }
          const team = (vals[CONFIG.COL_TEAM - COL_OFFSET]?.formattedValue || "").toString().trim();
          const assignDate = vals[CONFIG.COL_ASSIGN_DATE - COL_OFFSET]?.formattedValue || "";

          parsedSheetTasks.push({
            sheetName: sheetName,
            row: actualRowNumber,
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

        sheetsTasksMap[sheetName] = parsedSheetTasks;
        const cKey = cacheKeyMap[sheetName];
        if (cKey) {
          cacheToPut[cKey] = JSON.stringify(parsedSheetTasks);
        }
      }

      try {
        if (Object.keys(cacheToPut).length > 0) {
          // แคชผูกกับรหัส Checksum ได้นาน 30 นาที เพราะทันทีที่ข้อมูลในชีตเปลี่ยน รหัส Checksum จะเปลี่ยนและดึงใหม่ทันทีอัตโนมัติ!
          scriptCache.putAll(cacheToPut, 1800);
        }
      } catch (e) {}
    } else {
      // Fallback: หาก Sheets API v4 ไม่พร้อมใช้งาน
      Logger.log("Falling back to SpreadsheetApp for: " + sheetsToFetchFromApi.join(", "));
      for (let sIdx = 0; sIdx < sheetsToFetchFromApi.length; sIdx++) {
        const sName = sheetsToFetchFromApi[sIdx];
        const sheet = ss.getSheetByName(sName);
        if (!sheet) continue;
        const maxFallbackRow = sheetsToFetchFromApi.length === 1 ? 200 : 150;
        const lastRow = Math.min(sheet.getLastRow(), maxFallbackRow);
        if (lastRow < CONFIG.DATA_START_ROW) continue;

        const range = sheet.getRange(1, 1, lastRow, 12);
        const values = range.getValues();
        const formulas = range.getFormulas();
        const notes = range.getNotes();
        const richTexts = range.getRichTextValues();
        const parsedSheetTasks = [];

        let currentCategory = "";
        let currentBriefLink = "";
        let currentBriefTitle = "";

        for (let r = CONFIG.DATA_START_ROW; r <= lastRow; r++) {
          const rowIdx = r - 1;
          const categoryCell = values[rowIdx][CONFIG.COL_CATEGORY_NAME - 1];
          if (categoryCell && categoryCell.toString().trim() !== "") {
            const newCat = categoryCell.toString().trim();
            if (newCat !== currentCategory) {
              currentCategory = newCat;
              currentBriefLink = "";
              currentBriefTitle = "";
            }
          }

          const briefVal = values[rowIdx][CONFIG.COL_BRIEF_LINK - 1];
          const briefRich = richTexts[rowIdx][CONFIG.COL_BRIEF_LINK - 1];
          const briefFormula = formulas[rowIdx][CONFIG.COL_BRIEF_LINK - 1];
          const extractedBrief = extractCellLinkAndTitle(briefVal, briefRich, briefFormula);

          if (extractedBrief.link) currentBriefLink = extractedBrief.link;
          if (extractedBrief.title) currentBriefTitle = extractedBrief.title;

          const rowAssignee = (values[rowIdx][CONFIG.COL_ASSIGNEE - 1] || "").toString().trim();
          const noVal = values[rowIdx][CONFIG.COL_NO - 1] || "";
          const uploadCellText = (values[rowIdx][CONFIG.COL_UPLOAD_LINK - 1] || "").toString().trim();
          const status = (values[rowIdx][CONFIG.COL_STATUS - 1] || "").toString().trim();

          if (!rowAssignee && !noVal && !uploadCellText) continue;

          const uploadRich = richTexts[rowIdx][CONFIG.COL_UPLOAD_LINK - 1];
          const uploadFormula = formulas[rowIdx][CONFIG.COL_UPLOAD_LINK - 1];
          const extractedUpload = extractCellLinkAndTitle(uploadCellText, uploadRich, uploadFormula);
          let uploadUrl = extractedUpload.link;

          const cellNote = (notes[rowIdx] && notes[rowIdx][CONFIG.COL_UPLOAD_LINK - 1]) || "";
          let interFolderUrl = "";
          const noteMatch = cellNote.match(/INTER:\s*(https:\/\/[^\s]+)/i);
          if (noteMatch && noteMatch[1]) {
            interFolderUrl = noteMatch[1].trim();
          }

          const hasNameOrLink = !!(uploadUrl || uploadCellText);
          const isCompleted = hasNameOrLink ? (status.includes("เสร็จสิ้น") || uploadUrl !== "") : false;
          let taskBriefLink = fastFormatPresentationUrl(currentBriefLink);
          if (!taskBriefLink && currentBriefTitle) {
            if (briefSlideMemCache[currentBriefTitle] !== undefined) {
              taskBriefLink = briefSlideMemCache[currentBriefTitle];
            } else {
              try {
                const bKey = "RESOLVE_BRIEF_SLIDE_V3_" + Utilities.base64EncodeWebSafe(currentBriefTitle).slice(0, 60);
                const cachedSlide = scriptCache.get(bKey) || "";
                briefSlideMemCache[currentBriefTitle] = cachedSlide;
                if (cachedSlide) taskBriefLink = cachedSlide;
              } catch (e) {
                briefSlideMemCache[currentBriefTitle] = "";
              }
            }
          }
          const team = (values[rowIdx][CONFIG.COL_TEAM - 1] || "").toString().trim();
          const assignDate = values[rowIdx][CONFIG.COL_ASSIGN_DATE - 1] || "";

          parsedSheetTasks.push({
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
    }
  }

  // 4. กรองข้อมูลใน Memory ทันที (ใช้เวลา < 1ms)
  const searchName = (assignee || "").toLowerCase().trim();
  const finalTasks = [];

  for (let i = 0; i < targetSheetNames.length; i++) {
    const sName = targetSheetNames[i];
    const sheetTasks = sheetsTasksMap[sName] || [];
    for (let t = 0; t < sheetTasks.length; t++) {
      const item = sheetTasks[t];
      if (searchName && searchName !== "all") {
        if (!item.assignee) continue;
        const rowNameLower = item.assignee.toLowerCase();
        if (rowNameLower !== searchName && !rowNameLower.includes(searchName)) {
          continue;
        }
      }
      if (pendingOnly && item.isCompleted) {
        continue;
      }
      finalTasks.push(item);
    }
  }

  // เรียงลำดับตามแถวบนชีตจริงจากบนลงล่างเสมอ (Row 2, 3, 4...)
  finalTasks.sort(function(a, b) {
    return (a.row || 0) - (b.row || 0);
  });

  return {
    success: true,
    sheetName: targetSheet,
    sheets: allSheetNames,
    assignee: assignee,
    totalFound: finalTasks.length,
    tasks: finalTasks,
  };
}

/**
 * ฟังก์ชันช่วยเขียน Google Drive Smart Chip + Note ลิงก์ INTER + สถานะเสร็จสิ้น
 * Optimized: ยุบรวมการเขียน Note เข้าไปใน Sheets API v4 batchUpdate และตัด SpreadsheetApp.flush() ในลูปออก
 */
function writeSmartChipsBatchToSheet(spreadsheetId, sheet, updates) {
  if (!updates || updates.length === 0) return { success: false, error: "No updates" };
  const sheetId = sheet.getSheetId();

  // สร้าง Requests สำหรับเขียนทั้ง Google Drive Smart Chip และ Note (ลิงก์ INTER) ในคำสั่งเดียว
  const chipRequests = updates.map(function(u) {
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

    return {
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
    };
  });

  let apiSuccess = false;
  let errorDetail = "";

  // ขั้นตอนที่ 1: เรียกใช้ผ่าน Google Sheets Advanced Service หากผู้ใช้เปิดไว้
  if (typeof Sheets !== "undefined" && Sheets && Sheets.Spreadsheets && typeof Sheets.Spreadsheets.batchUpdate === "function") {
    try {
      Sheets.Spreadsheets.batchUpdate({ requests: chipRequests }, spreadsheetId);
      apiSuccess = true;
      Logger.log("สร้าง Google Drive Smart Chip สำเร็จผ่าน Sheets Advanced Service");
    } catch (eAdv) {
      errorDetail = "Sheets Advanced Service: " + eAdv.message;
      Logger.log(errorDetail);
    }
  }

  // ขั้นตอนที่ 2: หากไม่มี Advanced Service ให้เรียกผ่าน UrlFetchApp ด้วย Sheets API v4
  if (!apiSuccess) {
    try {
      const token = ScriptApp.getOAuthToken();
      const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
      const res = UrlFetchApp.fetch(apiUrl, {
        method: "post",
        contentType: "application/json",
        headers: { "Authorization": "Bearer " + token },
        payload: JSON.stringify({ requests: chipRequests }),
        muteHttpExceptions: true
      });

      if (res.getResponseCode() === 200) {
        apiSuccess = true;
        Logger.log("สร้าง Google Drive Smart Chip สำเร็จผ่าน Sheets API v4");
      } else {
        errorDetail = `UrlFetchApp (${res.getResponseCode()}): ${res.getContentText()}`;
        Logger.log("UrlFetchApp batchUpdate response: " + errorDetail);
      }
    } catch (e) {
      errorDetail = e.message;
      Logger.log("UrlFetchApp batchUpdate error: " + e.message);
    }
  }

  // ขั้นตอนที่ 3: หาก Sheets API ไม่สำเร็จ ให้ใช้ Fallback RichText Hyperlink + Note
  if (!apiSuccess) {
    Logger.log("ใช้ Fallback RichText Hyperlink: " + errorDetail);
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
      } catch (eRich) {
        Logger.log(`ตั้งค่า RichText แถว ${u.row} ไม่สำเร็จ: ${eRich.message}`);
      }
    }
  }

  // ขั้นตอนที่ 4: เปลี่ยนสถานะ Col L เป็น "เสร็จสิ้น" อย่างปลอดภัยโดยไม่ต้อง flush ทีละแถว
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    try {
      setSafeStatusCompleted(sheet, u.row);
    } catch (e2) {
      Logger.log(`ตั้งค่าสถานะแถว ${u.row} ไม่สำเร็จ: ${e2.message}`);
    }
  }

  // บันทึกสถานะทั้งหมดรวบยอดในครั้งเดียวอย่างปลอดภัย
  try {
    SpreadsheetApp.flush();
  } catch (eFlush) {
    Logger.log("Flush status batch error: " + eFlush.message);
  }

  return {
    success: true,
    smartChip: apiSuccess,
    error: errorDetail
  };
}

/**
 * ตั้งค่าสถานะ Col L อย่างปลอดภัย (Optimized: ตัด SpreadsheetApp.flush() ที่ทำให้ค้างแถวละ 0.5 วินาทีออก)
 */
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
  } catch (e3) {
    Logger.log(`Force set status แถว ${row} ไม่สำเร็จ: ${e3.message}`);
  }
}

/**
 * ฟังก์ชันแปลงลิงก์ที่มีอยู่แล้วในคอลัมน์ Col F ให้กลายเป็น Google Drive Smart Chip การ์ดสวยงาม
 * Optimized: อ่านข้อมูลทั้งคอลัมน์ F ในครั้งเดียว (Batch Read) แทนการเรียก getRange() ในลูปทีละแถว
 */
function convertSheetLinksToSmartChips(sheetName, specificRows) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ssId = ss.getId();
  const sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
  if (!sheet) return { success: false, error: "ไม่พบแผ่นงาน: " + sheetName };

  const lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) {
    return { success: true, message: "ไม่มีข้อมูลงานในแผ่นงานนี้", count: 0 };
  }

  // อ่านข้อมูล Col F รวดเดียว
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
      const b64Name = Utilities.base64EncodeWebSafe(sheet.getName()).slice(0, 35);
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

/**
 * สร้างโฟลเดอร์ Google Drive สำหรับ TH และ INTER และวางลิงก์เป็น Smart Chip
 * Optimized: ดึงข้อมูล Col F ทั้งคอลัมน์ล่วงหน้า (Batch Read) ไม่ต้องเรียก sheet.getRange() ในลูป
 */
function createFoldersAndSyncBatch(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ssId = ss.getId();
  const scriptCache = CacheService.getScriptCache();
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
  let lastBatchResult = null;

  for (const sName in grouped) {
    const sheet = ss.getSheetByName(sName);
    if (!sheet) continue;

    // 1. ดึง Root Folders จากแถว 3
    const { thFolder, interFolder } = getMonthlyRootFolders(sheet);

    // 2. คำนวณชื่อโฟลเดอร์วันที่ตามมาตรฐาน
    const dateInfo = parseDateFormats(sName);

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

    // อ่านข้อมูล Col F ของทั้งชีตรวดเดียว เพื่อไม่ต้องเรียก sheet.getRange() ซ้ำๆ ในลูป
    const maxTaskRow = Math.max(...sheetTasks.map(t => t.row || CONFIG.DATA_START_ROW), sheet.getLastRow());
    let colFValues = [], colFNotes = [], colFRichTexts = [], colFFormulas = [];
    if (maxTaskRow >= CONFIG.DATA_START_ROW) {
      const numRows = maxTaskRow - CONFIG.DATA_START_ROW + 1;
      const colFRange = sheet.getRange(CONFIG.DATA_START_ROW, CONFIG.COL_UPLOAD_LINK, numRows, 1);
      colFValues = colFRange.getValues();
      colFNotes = colFRange.getNotes();
      colFRichTexts = colFRange.getRichTextValues();
      colFFormulas = colFRange.getFormulas();
    }

    for (let t = 0; t < sheetTasks.length; t++) {
      const task = sheetTasks[t];
      const rawCategory = task.category || "ทั่วไป";
      const catInfo = getCategoryInfoSmart(rawCategory);
      const taskName = task.taskName || `${task.no || 1}_${catInfo.thTarget}`;
      const row = task.row;
      const rowOffset = row - CONFIG.DATA_START_ROW;

      // 3. หมวดหมู่ฝั่ง TH
      let thCatFolder = thCatFolderCache[catInfo.thTarget];
      if (!thCatFolder) {
        thCatFolder = getOrCreateFolderSmart(thDateFolder, catInfo.thTarget, [rawCategory, catInfo.interTarget], {
          isCategory: true,
          keywords: catInfo.keywords
        });
        thCatFolderCache[catInfo.thTarget] = thCatFolder;
      }

      // 4. หมวดหมู่ฝั่ง INTER
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

      // 5. โฟลเดอร์งานฝั่ง TH
      let thTaskFolder = null;
      let existingThFolderId = null;

      if (task.existingUrl) {
        existingThFolderId = extractFolderId(task.existingUrl);
      }
      if (!existingThFolderId && rowOffset >= 0 && rowOffset < colFValues.length) {
        const extracted = extractCellLinkAndTitle(colFValues[rowOffset][0], colFRichTexts[rowOffset][0], colFFormulas[rowOffset][0]);
        if (extracted.link) {
          existingThFolderId = extractFolderId(extracted.link);
        }
      }

      if (existingThFolderId) {
        try {
          const existingF = DriveApp.getFolderById(existingThFolderId);
          if (existingF && !existingF.isTrashed()) {
            thTaskFolder = existingF;
            if (task.isCustomName && thTaskFolder.getName() !== taskName.trim()) {
              thTaskFolder.setName(taskName.trim());
            }
          }
        } catch (e) {
          Logger.log("Error renaming existing TH folder: " + e.message);
        }
      }

      if (!thTaskFolder) {
        const thAliases = [
          `${task.no || 1}`,
          `${task.no || 1}_${catInfo.thTarget}`,
          `${task.no || 1} ${catInfo.thTarget}`,
        ];
        thTaskFolder = getOrCreateFolderSmart(thCatFolder, taskName, thAliases, {
          taskNo: task.no
        });
        if (task.isCustomName && thTaskFolder && thTaskFolder.getName() !== taskName.trim()) {
          try { thTaskFolder.setName(taskName.trim()); } catch (e) {}
        }
      }
      // ก๊อปปี้ชื่อโฟลเดอร์เดิมจริงจาก Google Drive มาใช้เสมอ เพื่อให้ได้ชื่อโฟลเดอร์เดิมที่ถูกต้อง 100%
      const finalTaskName = thTaskFolder ? thTaskFolder.getName() : taskName;
      const thUrl = thTaskFolder ? thTaskFolder.getUrl() : "";

      // 6. โฟลเดอร์งานฝั่ง INTER
      let interUrl = "";
      if (interCatFolder) {
        const interTaskName = `${task.no || 1} (${dateInfo.interDateSuffix})`;
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
                if (interTaskFolder.getName() !== interTaskName.trim()) {
                  interTaskFolder.setName(interTaskName.trim());
                }
              }
            } catch (e) {}
          }
        }

        if (!interTaskFolder) {
          interTaskFolder = getOrCreateFolderSmart(interCatFolder, interTaskName, interAliases, {
            taskNo: task.no
          });
          if (interTaskFolder && interTaskFolder.getName() !== interTaskName.trim()) {
            try { interTaskFolder.setName(interTaskName.trim()); } catch (e) {}
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

    // 7. เขียน Smart Chip + Note + เปลี่ยนสถานะลงชีตแบบ Batch รวดเดียว
    lastBatchResult = writeSmartChipsBatchToSheet(ssId, sheet, sheetUpdates);

    // 8. อัปเดตเวอร์ชัน Cache ของแผ่นงานนี้เพื่อให้ข้อมูล Smart Chip และ Note ใหม่พร้อมใช้งานทันที 100%
    try {
      const b64Name = Utilities.base64EncodeWebSafe(sName).slice(0, 35);
      scriptCache.put("SHEET_VER_" + b64Name, Date.now().toString(), 21600);
    } catch (e) {}
  }

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
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheetNames = getSheetNamesFast(ss);
      data = { success: true, sheets: sheetNames };
    } else if (action === "getTasks") {
      const assignee = e.parameter.assignee || "";
      const sheet = e.parameter.sheet || "";
      const pendingOnly = e.parameter.pendingOnly === "true";
      const force = e.parameter.force === "true";
      data = getStaffTasks(assignee, sheet, pendingOnly, force);
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

/**
 * ซ่อมแซมลิงก์ TH ที่หายไปในแถวที่มีชื่องานหรือมีลิงก์ INTER อยู่แล้ว
 * Optimized: ดึงข้อมูลคอลัมน์ C..F รวดเดียว (Batch Read) แทนการเรียก getRange() ในลูปทุกแถว
 */
function repairMissingThLinks(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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

  // ดึงข้อมูลตั้งแต่ Col C (3) ถึง Col F (6) ในครั้งเดียว
  const numRows = lastRow - CONFIG.DATA_START_ROW + 1;
  const batchRange = sheet.getRange(CONFIG.DATA_START_ROW, 3, numRows, 4); // C, D, E, F
  const batchValues = batchRange.getValues();
  const batchNotes = batchRange.getNotes();
  const batchRichTexts = batchRange.getRichTextValues();
  const batchFormulas = batchRange.getFormulas();

  const updates = [];
  const thCatCache = {};

  let currentCategory = "";
  for (let r = CONFIG.DATA_START_ROW; r <= lastRow; r++) {
    const idx = r - CONFIG.DATA_START_ROW;
    const catVal = batchValues[idx][0]; // Col C
    if (catVal && catVal.toString().trim() !== "") {
      currentCategory = catVal.toString().trim();
    }

    const noVal = batchValues[idx][2] || ""; // Col E
    const text = (batchValues[idx][3] || "").toString().trim(); // Col F
    const note = batchNotes[idx][3] || ""; // Col F
    const rich = batchRichTexts[idx][3]; // Col F
    const formula = batchFormulas[idx][3]; // Col F
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
      const b64Name = Utilities.base64EncodeWebSafe(sheet.getName()).slice(0, 35);
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

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action || "createFolders";

    let data;
    if (action === "createFolders") {
      data = createFoldersAndSyncBatch(postData);
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