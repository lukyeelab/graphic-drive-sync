/**
 * Graphic Drive Sync - Google Apps Script Backend (v4 - Exact Folder Naming)
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
 * ดึงหรือสร้างโฟลเดอร์แบบ Fuzzy & Smart ตรวจจับคำผิด ช่องว่างเกิน หรือกรณีคนตั้งแค่เลข 1, 2, 3
 */
function getOrCreateFolderSmart(parentFolder, targetName, aliases, matchOptions) {
  if (!parentFolder) return null;
  const targetClean = normalizeStringFuzzy(targetName);
  const targetNoDiacritics = stripThaiDiacritics(targetClean);

  const cleanAliases = (aliases || []).map(a => normalizeStringFuzzy(a)).filter(Boolean);
  const subFolders = parentFolder.getFolders();
  const folderList = [];

  while (subFolders.hasNext()) {
    const f = subFolders.next();
    const fName = f.getName();
    folderList.push({
      folder: f,
      name: fName,
      clean: normalizeStringFuzzy(fName),
      noDiacritics: stripThaiDiacritics(normalizeStringFuzzy(fName)),
    });
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
    for (let i = 0; i < folderList.length; i++) {
      const item = folderList[i];
      // 4.1 ชื่อโฟลเดอร์ตรงกับเลขเพียวๆ เช่น "1", "2", "3"
      if (item.clean === noStr) {
        return item.folder;
      }
      // 4.2 ขึ้นต้นด้วยเลขงาน เช่น "1 (07.11)", "1 07.11", "1_...", "1-...", "1. ..."
      const noRegex = new RegExp(`^0*${noStr}([\\s_\\(\\.\\-]|$)`, "i");
      if (noRegex.test(item.clean)) {
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

  // Tier 7: ถ้าไม่พบโฟลเดอร์เดิมเลยจริงๆ จึงสร้างโฟลเดอร์ใหม่ตาม targetName
  return parentFolder.createFolder(targetName.trim());
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
 * ค้นหา URL ของไฟล์ใบบรีฟใน Google Drive ตามชื่อ (เน้นบังคับคืนค่าเป็นลิงก์ Google Slides Presentation 100%)
 * รองรับทั้ง Google Slides และไฟล์ PowerPoint (.pptx) ที่อัปโหลดขึ้น Drive
 */
function findDriveFileOrFolderUrl(title) {
  if (!title || typeof title !== "string") return "";
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length < 2) return "";

  const singleSpaced = cleanTitle.replace(/\s+/g, " ");
  const titleWithoutExt = singleSpaced.replace(/\.(pptx?|pdf|docx?)$/i, "").trim();

  // 1. ค้นหาไฟล์ตรงตามชื่อ (ทั้งที่มีนามสกุล และไม่มีนามสกุล)
  try {
    const namesToCheck = [singleSpaced];
    if (titleWithoutExt && titleWithoutExt !== singleSpaced) {
      namesToCheck.push(titleWithoutExt);
      namesToCheck.push(titleWithoutExt + ".pptx");
      namesToCheck.push(titleWithoutExt + ".ppt");
    }

    for (let n = 0; n < namesToCheck.length; n++) {
      const files = DriveApp.getFilesByName(namesToCheck[n]);
      while (files.hasNext()) {
        const f = files.next();
        if (!f.isTrashed()) {
          const mType = f.getMimeType();
          // ถ้าเป็น Google Slides หรือ PPTX ให้คืนค่าเป็น presentation edit URL ทันที
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
    Logger.log("Exact file name search: " + e.message);
  }

  // 2. ค้นหาผ่าน searchFiles โดยรองรับทั้ง Google Slides และ PowerPoint (.pptx)
  try {
    const safeFull = (titleWithoutExt || singleSpaced).replace(/['"\\]/g, "");
    const qFull = `title contains '${safeFull.slice(0, 30)}' and (mimeType = 'application/vnd.google-apps.presentation' or mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation') and trashed = false`;
    const slidesFull = DriveApp.searchFiles(qFull);
    if (slidesFull.hasNext()) {
      const slide = slidesFull.next();
      return `https://docs.google.com/presentation/d/${slide.getId()}/edit`;
    }
  } catch (e) {
    Logger.log("Full title search error: " + e.message);
  }

  // 3. ค้นหาจากคีย์เวิร์ดสำคัญ (เช่น SLOT BRIEF, FOOTBALL BRIEF, BOXING BRIEF)
  try {
    const segments = (titleWithoutExt || singleSpaced).split(/[-–—]/);
    const mainKey = (segments[0] || singleSpaced).trim().replace(/['"\\]/g, "");

    if (mainKey.length >= 3) {
      const q = `title contains '${mainKey.slice(0, 30)}' and (mimeType = 'application/vnd.google-apps.presentation' or mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation') and trashed = false`;
      const slides = DriveApp.searchFiles(q);
      if (slides.hasNext()) {
        const slide = slides.next();
        return `https://docs.google.com/presentation/d/${slide.getId()}/edit`;
      }
    }
  } catch (e) {
    Logger.log("Slides search error: " + e.message);
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
 * เพิ่ม allowDriveSearch เพื่อป้องกันไม่ให้ค้นหา Drive นานเกินไปจนหน้าเว็บ Timeout
 */
function normalizeToPresentationUrl(rawUrl, briefTitle, scriptCache, memoryBriefCache, allowDriveSearch) {
  let url = (rawUrl || "").toString().trim();

  // 1. ถ้าเป็นลิงก์ Google Slides อยู่แล้ว คืนค่าเดิมทันที
  if (url.includes("docs.google.com/presentation/d/")) {
    return url;
  }

  // 2. ถ้าเป็นลิงก์ไฟล์ใน Google Drive (เช่น drive.google.com/file/d/ID หรือ drive.google.com/open?id=ID)
  // และไม่ใช่ลิงก์โฟลเดอร์ (/folders/) ให้ดึง ID มาแปลงเป็นลิงก์ Presentation ทันที (ไม่ต้องยิง API ค้นหา, ใช้เวลา 0ms)
  if (url && !url.includes("/folders/")) {
    const dMatch = url.match(/\/d\/([-\w]{25,})/i);
    const idMatch = url.match(/[?&]id=([-\w]{25,})/i);
    const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);
    if (fileId) {
      return `https://docs.google.com/presentation/d/${fileId}/edit`;
    }
  }

  // 3. ถ้าไม่มีลิงก์ หรือลิงก์ในช่องเผลอเป็นลิงก์โฟลเดอร์ (/folders/) ให้เช็คจาก Cache ก่อนเสมอ
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

    // ค้นหาใน Drive เฉพาะเมื่อยังมีเวลาเหลือ (Time-Guard: ไม่ทำให้หน้าบ้าน Timeout)
    if (allowDriveSearch) {
      const foundSlideUrl = findDriveFileOrFolderUrl(briefTitle);
      const finalUrl = foundSlideUrl || url;
      if (memoryBriefCache) memoryBriefCache[briefTitle] = finalUrl;
      try {
        // แคชผลลัพธ์ไว้ 6 ชั่วโมง (แม้หาไม่เจอก็แคชค่าว่างไว้ เพื่อไม่ให้ค้นหาซ้ำอีก)
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

  // บันทึกใส่ Cache 6 ชั่วโมงเพื่อให้รอบต่อไปเร็วทันใจ 0ms
  try {
    cache.put(cacheKey, JSON.stringify({
      thId: thFolder.getId(),
      interId: interFolder ? interFolder.getId() : ""
    }), 21600);
  } catch (e) {}

  return { thFolder: thFolder, interFolder: interFolder };

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
 * ฟังก์ชันช่วยดึงเฉพาะรายชื่อแผ่นงานแบบเร็วพิเศษ (ดึงจาก Cache ก่อนเสมอ ไม่ต้องรัน ss.getSheets() ซ้ำ)
 */
function getSheetNamesFast(ss) {
  const cache = CacheService.getScriptCache();
  const cachedMeta = cache.get("INITIAL_METADATA_V4");
  if (cachedMeta) {
    try {
      const parsed = JSON.parse(cachedMeta);
      if (parsed && Array.isArray(parsed.sheetNames) && parsed.sheetNames.length > 0) {
        return parsed.sheetNames;
      }
    } catch (e) {}
  }
  const allSheets = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheets();
  return allSheets.map(s => s.getName()).filter(n => n.trim() !== "TEM");
}

/**
 * ฟังก์ชันช่วยดึงข้อมูลชีตแบบ Ultra-Fast ผ่าน Google Sheets API v4 ในครั้งเดียว
 * ใช้ช่วง A1:L เพื่อตัด Header และคอลัมน์ที่ไม่ใช้ออก ลดขนาด JSON ลงให้โหลดไวระดับมิลลิวินาที
 */
function fetchSheetsGridDataFast(spreadsheetId, sheetNames) {
  try {
    const token = ScriptApp.getOAuthToken();
    const maxRow = sheetNames.length === 1 ? 220 : 120;
    const rangesParam = sheetNames
      .map(name => `ranges=${encodeURIComponent(`'${name}'!A1:L${maxRow}`)}`)
      .join("&");
    const fields = "sheets(properties(title),data(rowData(values(formattedValue,hyperlink,note,userEnteredValue(formulaValue),textFormatRuns(format(link(uri))),chipRuns(chip(richLinkProperties(uri),driveProperties(fileId)))))))";
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
function extractApiCellInfo(cellObj) {
  if (!cellObj) return { title: "", link: "", note: "" };
  const title = (cellObj.formattedValue || "").toString().trim();
  const note = (cellObj.note || "").toString().trim();
  let link = cellObj.hyperlink || "";

  // 1. ดึงจาก Formula เช่น =HYPERLINK("https://...", "...")
  if (!link && cellObj.userEnteredValue && cellObj.userEnteredValue.formulaValue) {
    const f = cellObj.userEnteredValue.formulaValue;
    if (typeof f === "string" && f.toUpperCase().includes("HYPERLINK")) {
      const m = f.match(/HYPERLINK\(\s*["']([^"']+)["']/i);
      if (m && m[1]) link = m[1].trim();
    }
  }

  // 2. ดึงลิงก์จาก Google Drive Smart Chip ทันที (ทั้ง richLinkProperties และ driveProperties)
  if (!link && cellObj.chipRuns && cellObj.chipRuns.length > 0) {
    for (let i = 0; i < cellObj.chipRuns.length; i++) {
      const chip = cellObj.chipRuns[i].chip;
      if (!chip) continue;
      if (chip.richLinkProperties?.uri) {
        link = chip.richLinkProperties.uri.trim();
        break;
      }
      if (chip.driveProperties?.fileId) {
        link = "https://drive.google.com/drive/folders/" + chip.driveProperties.fileId;
        break;
      }
    }
  }

  // 3. ดึงจาก textFormatRuns เผื่อมี hyperlink อยู่ใน run
  if (!link && cellObj.textFormatRuns && cellObj.textFormatRuns.length > 0) {
    for (let i = 0; i < cellObj.textFormatRuns.length; i++) {
      const uri = cellObj.textFormatRuns[i].format?.link?.uri;
      if (uri) {
        link = uri.trim();
        break;
      }
    }
  }

  // 4. กรณีวาง URL ตรงๆ ในช่อง
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
 * แปลงลิงก์ใบบรีฟแบบ Instant 0ms (ไม่เรียก DriveApp ระหว่างค้นหาเด็ดขาด เพื่อให้ผลลัพธ์เด้งทันที)
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
 * ดึงรายการงานตามชื่อพนักงาน (Zero-Wait Version: Batch Cache getAll/putAll + ตัด DriveApp Search 100% + รองรับ Realtime Force Refresh)
 */
function getStaffTasks(assignee, targetSheet, pendingOnly, force) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ssId = ss.getId();
  const scriptCache = CacheService.getScriptCache();
  const allSheetNames = getSheetNamesFast(ss);
  const isForce = force === true || force === "true";

  let targetSheetNames = [];
  if (targetSheet && targetSheet !== "ALL") {
    const rawList = targetSheet.split(",").map(s => s.trim()).filter(Boolean);
    targetSheetNames = rawList.filter(s => allSheetNames.includes(s));
    if (targetSheetNames.length === 0) {
      return { success: false, error: `ไม่พบแผ่นงานชื่อ: ${targetSheet}` };
    }
  } else {
    const sortedSheets = sortSheetNamesDesc(allSheetNames);
    const limitSheets = (assignee && assignee !== "ALL") ? 10 : 8;
    targetSheetNames = sortedSheets.slice(0, limitSheets);
  }

  const sheetsTasksMap = {};
  const sheetsToFetchFromApi = [];
  const cacheKeyMap = {};
  const cacheKeysToRequest = [];

  for (let i = 0; i < targetSheetNames.length; i++) {
    const sName = targetSheetNames[i];
    const key = "FAST_TASKS_V3_" + Utilities.base64EncodeWebSafe(sName).slice(0, 50);
    cacheKeyMap[sName] = key;
    cacheKeysToRequest.push(key);
  }

  // 1. ดึงข้อมูลจาก Cache เฉพาะเมื่อไม่ได้สั่ง force refresh
  const cachedBatch = !isForce ? scriptCache.getAll(cacheKeysToRequest) : {};
  for (let i = 0; i < targetSheetNames.length; i++) {
    const sName = targetSheetNames[i];
    const key = cacheKeyMap[sName];
    if (!isForce && cachedBatch && cachedBatch[key]) {
      try {
        sheetsTasksMap[sName] = JSON.parse(cachedBatch[key]);
        continue;
      } catch (e) {}
    }
    sheetsToFetchFromApi.push(sName);
  }

  // 2. แผ่นงานไหนยังไม่อยู่ใน Cache หรือถูก Force ให้ดึงด้วย Sheets API v4 ทันที
  if (sheetsToFetchFromApi.length > 0) {
    const apiData = fetchSheetsGridDataFast(ssId, sheetsToFetchFromApi);
    const cacheToPut = {};

    if (apiData && apiData.sheets && apiData.sheets.length > 0) {
      for (let sIdx = 0; sIdx < apiData.sheets.length; sIdx++) {
        const sheetObj = apiData.sheets[sIdx];
        const sheetName = sheetObj.properties?.title || sheetsToFetchFromApi[sIdx];
        const rowData = sheetObj.data?.[0]?.rowData || [];
        const parsedSheetTasks = [];

        let currentCategory = "";
        let currentBriefLink = "";
        let currentBriefTitle = "";

        for (let r = CONFIG.DATA_START_ROW; r <= rowData.length; r++) {
          const rowIdx = r - 1;
          const vals = rowData[rowIdx]?.values;
          if (!vals || vals.length === 0) continue;

          const categoryCell = vals[CONFIG.COL_CATEGORY_NAME - 1]?.formattedValue;
          if (categoryCell && categoryCell.toString().trim() !== "") {
            currentCategory = categoryCell.toString().trim();
            currentBriefLink = "";
            currentBriefTitle = "";
          }

          const briefInfo = extractApiCellInfo(vals[CONFIG.COL_BRIEF_LINK - 1]);
          if (briefInfo.link) currentBriefLink = briefInfo.link;
          if (briefInfo.title) currentBriefTitle = briefInfo.title;

          const rowAssignee = (vals[CONFIG.COL_ASSIGNEE - 1]?.formattedValue || "").toString().trim();
          const noVal = vals[CONFIG.COL_NO - 1]?.formattedValue || "";
          const uploadInfo = extractApiCellInfo(vals[CONFIG.COL_UPLOAD_LINK - 1]);
          const uploadCellText = uploadInfo.title;
          const status = (vals[CONFIG.COL_STATUS - 1]?.formattedValue || "").toString().trim();

          if (!rowAssignee && !noVal && !uploadCellText) continue;

          let uploadUrl = uploadInfo.link;
          const cellNote = uploadInfo.note;
          let interFolderUrl = "";
          const noteMatch = cellNote.match(/INTER:\s*(https:\/\/[^\s]+)/i);
          if (noteMatch && noteMatch[1]) {
            interFolderUrl = noteMatch[1].trim();
          }

          const isCompleted = status.includes("เสร็จสิ้น") || (uploadUrl !== "" && uploadCellText !== "");
          let taskBriefLink = fastFormatPresentationUrl(currentBriefLink);
          if (!taskBriefLink && currentBriefTitle) {
            try {
              const cachedSlide = scriptCache.get("RESOLVE_BRIEF_SLIDE_V3_" + Utilities.base64EncodeWebSafe(currentBriefTitle).slice(0, 60));
              if (cachedSlide) taskBriefLink = cachedSlide;
            } catch (e) {}
          }
          const team = (vals[CONFIG.COL_TEAM - 1]?.formattedValue || "").toString().trim();
          const assignDate = vals[CONFIG.COL_ASSIGN_DATE - 1]?.formattedValue || "";

          parsedSheetTasks.push({
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

        sheetsTasksMap[sheetName] = parsedSheetTasks;
        const cKey = cacheKeyMap[sheetName] || ("FAST_TASKS_V3_" + Utilities.base64EncodeWebSafe(sheetName).slice(0, 50));
        cacheToPut[cKey] = JSON.stringify(parsedSheetTasks);
      }

      try {
        if (Object.keys(cacheToPut).length > 0) {
          scriptCache.putAll(cacheToPut, 20); // แคชสั้น 20 วินาที เพื่อให้เร็วแต่รับประกันความ Realtime
        }
      } catch (e) {}
    } else {
      // Fallback: หาก Sheets API v4 ไม่พร้อมใช้งานหรือติดสิทธิ์ OAuth ให้ดึงผ่าน SpreadsheetApp ตรงๆ ทันที (ชัวร์ 100%)
      Logger.log("Falling back to SpreadsheetApp for: " + sheetsToFetchFromApi.join(", "));
      for (let sIdx = 0; sIdx < sheetsToFetchFromApi.length; sIdx++) {
        const sName = sheetsToFetchFromApi[sIdx];
        const sheet = ss.getSheetByName(sName);
        if (!sheet) continue;
        const maxFallbackRow = sheetsToFetchFromApi.length === 1 ? 220 : 120;
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

          const isCompleted = status.includes("เสร็จสิ้น") || (uploadUrl !== "" && uploadCellText !== "");
          let taskBriefLink = fastFormatPresentationUrl(currentBriefLink);
          if (!taskBriefLink && currentBriefTitle) {
            try {
              const cachedSlide = scriptCache.get("RESOLVE_BRIEF_SLIDE_V3_" + Utilities.base64EncodeWebSafe(currentBriefTitle).slice(0, 60));
              if (cachedSlide) taskBriefLink = cachedSlide;
            } catch (e) {}
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
        const cKey = cacheKeyMap[sName] || ("FAST_TASKS_V3_" + Utilities.base64EncodeWebSafe(sName).slice(0, 50));
        cacheToPut[cKey] = JSON.stringify(parsedSheetTasks);
      }

      try {
        if (Object.keys(cacheToPut).length > 0) {
          scriptCache.putAll(cacheToPut, 20); // แคชสั้น 20 วินาที
        }
      } catch (e) {}
    }
  }

  // 3. กรองข้อมูลใน Memory ทันที (ใช้เวลา < 1ms)
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
 * ฟังก์ชันช่วยเขียนลิงก์โฟลเดอร์ TH + Note ลิงก์ INTER + สถานะเสร็จสิ้น ลงใน Google Sheets อย่างแม่นยำและรวดเร็ว
 */
function writeSmartChipsBatchToSheet(spreadsheetId, sheet, updates) {
  if (!updates || updates.length === 0) return { success: false, error: "No updates" };

  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    try {
      const cellF = sheet.getRange(u.row, CONFIG.COL_UPLOAD_LINK);

      // สร้าง RichText Hyperlink ที่ชี้ไปยัง u.thUrl โดยคงชื่องานเดิมไว้ครบถ้วน
      if (u.thUrl) {
        const richValue = SpreadsheetApp.newRichTextValue()
          .setText(u.taskName || `งานแถวที่ ${u.row}`)
          .setLinkUrl(u.thUrl)
          .build();
        cellF.setRichTextValue(richValue);
      } else if (u.taskName) {
        cellF.setValue(u.taskName);
      }

      // บังคับรูปแบบตัวหนังสือ: ไม่ใส่เส้นใต้ และใช้สีดำเดิมตามเซลล์
      try {
        cellF.setFontLine("none");
        cellF.setFontColor("#000000");
      } catch (eFmt) {}

      // บันทึกลิงก์ของ INTER ลงใน Note ของเซลล์ Col F
      if (u.interUrl) {
        try {
          cellF.setNote(`INTER: ${u.interUrl}`);
        } catch (eNote) {
          Logger.log(`ตั้งค่า Note แถว ${u.row} ไม่สำเร็จ: ${eNote.message}`);
        }
      }

      // ปรับสถานะใน Col L เป็น "เสร็จสิ้น" (ไม่มีอีโมจิ)
      const cellL = sheet.getRange(u.row, CONFIG.COL_STATUS);
      try {
        cellL.setValue("เสร็จสิ้น");
      } catch (e1) {
        Logger.log(`ตั้งค่าสถานะแถว ${u.row} ไม่สำเร็จ: ${e1.message}`);
      }
    } catch (e) {
      Logger.log(`อัปเดตเซลล์แถว ${u.row} ไม่สำเร็จ: ${e.message}`);
    }
  }

  return {
    success: true,
    method: "RichText",
    error: ""
  };
}

/**
 * ฟังก์ชันแปลงลิงก์ที่มีอยู่แล้วในคอลัมน์ Col F ให้กลายเป็น Google Drive Smart Chip การ์ดสวยงาม
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

    const cellF = sheet.getRange(r, CONFIG.COL_UPLOAD_LINK);
    const cellVal = (cellF.getValue() || "").toString().trim();
    const cellNote = cellF.getNote() || "";
    
    // ดึง Link ของ TH จาก RichText หรือ Formula หรือ Value
    let thUrl = "";
    const rich = cellF.getRichTextValue();
    if (rich) {
      thUrl = rich.getLinkUrl() || "";
      if (!thUrl && rich.getRuns()) {
        const runs = rich.getRuns();
        for (let j = 0; j < runs.length; j++) {
          const runUrl = runs[j].getLinkUrl();
          if (runUrl) { thUrl = runUrl; break; }
        }
      }
    }
    if (!thUrl) {
      const formula = cellF.getFormula();
      if (formula && formula.includes("HYPERLINK")) {
        const match = formula.match(/HYPERLINK\(\s*["']([^"']+)["']/i);
        if (match && match[1]) thUrl = match[1];
      }
    }
    if (!thUrl && cellVal.startsWith("http")) {
      thUrl = cellVal;
    }

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
      const cKey = "FAST_TASKS_V3_" + Utilities.base64EncodeWebSafe(sheet.getName()).slice(0, 50);
      scriptCache.remove(cKey);
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

    // 2. คำนวณชื่อโฟลเดอร์วันที่ตามมาตรฐาน (เช่น "07 พ.ย. 69" และ "NOV 07,2026")
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

    for (let t = 0; t < sheetTasks.length; t++) {
      const task = sheetTasks[t];
      const rawCategory = task.category || "ทั่วไป";
      const catInfo = getCategoryInfoSmart(rawCategory);
      const taskName = task.taskName || `${task.no || 1}_${catInfo.thTarget}`;
      const row = task.row;

      // 3. หมวดหมู่ฝั่ง TH (แคชเพื่อความเร็วระดับมิลลิวินาที)
      let thCatFolder = thCatFolderCache[catInfo.thTarget];
      if (!thCatFolder) {
        thCatFolder = getOrCreateFolderSmart(thDateFolder, catInfo.thTarget, [rawCategory, catInfo.interTarget], {
          isCategory: true,
          keywords: catInfo.keywords
        });
        thCatFolderCache[catInfo.thTarget] = thCatFolder;
      }

      // 4. หมวดหมู่ฝั่ง INTER (แคชเพื่อความเร็วระดับมิลลิวินาที)
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

      // 5. โฟลเดอร์งานฝั่ง TH: ตรวจสอบว่ามีโฟลเดอร์เดิมอยู่แล้วหรือไม่ (เพื่อเปลี่ยนชื่อแทนการสร้างใหม่ซ้ำซ้อน)
      let thTaskFolder = null;
      let existingThFolderId = null;

      if (task.existingUrl) {
        existingThFolderId = extractFolderId(task.existingUrl);
      }
      if (!existingThFolderId) {
        const currentCell = sheet.getRange(row, CONFIG.COL_UPLOAD_LINK);
        existingThFolderId = extractDriveFolderFromCell(currentCell);
      }

      if (existingThFolderId) {
        try {
          const existingF = DriveApp.getFolderById(existingThFolderId);
          if (existingF && !existingF.isTrashed()) {
            thTaskFolder = existingF;
            if (thTaskFolder.getName() !== taskName.trim()) {
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
        if (thTaskFolder && thTaskFolder.getName() !== taskName.trim()) {
          try { thTaskFolder.setName(taskName.trim()); } catch (e) {}
        }
      }
      const thUrl = thTaskFolder ? thTaskFolder.getUrl() : "";

      // 6. โฟลเดอร์งานฝั่ง INTER: ตรวจสอบและเปลี่ยนชื่อโฟลเดอร์เดิมหากมีอยู่แล้ว
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
        const currentCell = sheet.getRange(row, CONFIG.COL_UPLOAD_LINK);
        const cellNote = currentCell.getNote() || "";
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
        taskName: taskName,
        thUrl: thUrl,
        interUrl: interUrl
      });

      results.push({
        sheetName: sName,
        row: row,
        taskName: taskName,
        thFolderUrl: thUrl,
        interFolderUrl: interUrl,
        status: "เสร็จสิ้น",
      });
    }

    // 7. เขียน Smart Chip + Note + เปลี่ยนสถานะลงชีตแบบ Batch รวดเดียว
    lastBatchResult = writeSmartChipsBatchToSheet(ssId, sheet, sheetUpdates);

    // 8. ล้าง Cache ของแผ่นงานนี้เพื่อให้ข้อมูลใหม่พร้อมใช้งาน
    try {
      const cKey = "FAST_TASKS_V3_" + Utilities.base64EncodeWebSafe(sName).slice(0, 50);
      scriptCache.remove(cKey);
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
      data = getInitialMetadata();
    } else if (action === "getSheets") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheetNames = ss.getSheets().map(s => s.getName()).filter(n => n.trim() !== "TEM");
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

  const updates = [];
  const thCatCache = {};

  let currentCategory = "";
  for (let r = CONFIG.DATA_START_ROW; r <= lastRow; r++) {
    const catVal = sheet.getRange(r, CONFIG.COL_CATEGORY_NAME).getValue();
    if (catVal && catVal.toString().trim() !== "") {
      currentCategory = catVal.toString().trim();
    }

    const cellF = sheet.getRange(r, CONFIG.COL_UPLOAD_LINK);
    const text = (cellF.getValue() || "").toString().trim();
    const note = cellF.getNote() || "";
    const rich = cellF.getRichTextValue();
    const hasLink = (rich && rich.getLinkUrl()) || (cellF.getFormula() && cellF.getFormula().includes("HYPERLINK"));

    // หากมีชื่องาน หรือมี Note INTER แต่ยังไม่มีลิงก์ TH ให้ค้นหาโฟลเดอร์ TH ที่มีอยู่แล้วมาซ่อมแซม
    if (text && (!hasLink || !rich?.getLinkUrl())) {
      const catInfo = getCategoryInfoSmart(currentCategory || "ทั่วไป");
      let thCat = thCatCache[catInfo.thTarget];
      if (!thCat) {
        thCat = getOrCreateFolderSmart(thDateFolder, catInfo.thTarget, [currentCategory], { isCategory: true, keywords: catInfo.keywords });
        thCatCache[catInfo.thTarget] = thCat;
      }

      if (thCat) {
        const noVal = sheet.getRange(r, CONFIG.COL_NO).getValue() || "";
        const existingTaskF = getOrCreateFolderSmart(thCat, text, [text, `${noVal}`, `${noVal}_${catInfo.thTarget}`], { taskNo: noVal });
        if (existingTaskF) {
          const noteMatch = note.match(/INTER:\s*(https:\/\/[^\s]+)/i);
          updates.push({
            row: r,
            taskName: text,
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
      const cKey = "FAST_TASKS_V3_" + Utilities.base64EncodeWebSafe(sheet.getName()).slice(0, 50);
      scriptCache.remove(cKey);
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
