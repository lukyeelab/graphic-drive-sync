"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  FolderPlus,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  FolderCheck,
  AlertCircle,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Search,
  ShieldAlert,
  Calendar,
  User,
  FolderSymlink,
  Edit3,
  Globe,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
} from "lucide-react";
import {
  getSheetsFromIndexedDB,
  getAllSheetsFromIndexedDB,
  saveSheetsToIndexedDB,
  patchCreatedFoldersInIndexedDB,
  SheetCacheRecord,
} from "@/lib/indexedDbCache";

interface Task {
  sheetName: string;
  row: number;
  category: string;
  briefLink: string;
  briefTitle?: string;
  no: number | string;
  taskName: string;
  uploadUrl: string;
  interFolderUrl?: string;
  hasUploadLink: boolean;
  team: string;
  assignee: string;
  assignDate: string;
  status: string;
  isCompleted: boolean;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  สล็อต: { bg: "bg-[#FF453A]/12", text: "text-[#E02E24]", border: "border-[#FF453A]/25", dot: "bg-[#FF453A]" }, // แดงอ่อน
  เกมสล็อต: { bg: "bg-[#FF453A]/12", text: "text-[#E02E24]", border: "border-[#FF453A]/25", dot: "bg-[#FF453A]" }, // แดงอ่อน
  คาสิโน: { bg: "bg-[#FF9500]/12", text: "text-[#C97700]", border: "border-[#FF9500]/25", dot: "bg-[#FF9500]" }, // ส้ม
  บอล: { bg: "bg-[#007AFF]/12", text: "text-[#007AFF]", border: "border-[#007AFF]/25", dot: "bg-[#007AFF]" }, // ฟ้า
  มวย: { bg: "bg-[#34C759]/15", text: "text-[#248A3D]", border: "border-[#34C759]/30", dot: "bg-[#34C759]" }, // เขียวอ่อน
  หวย: { bg: "bg-[#FF3B30]/12", text: "text-[#D70015]", border: "border-[#FF3B30]/30", dot: "bg-[#FF3B30]" }, // แดง
  "หวย APB": { bg: "bg-[#FF3B30]/12", text: "text-[#D70015]", border: "border-[#FF3B30]/30", dot: "bg-[#FF3B30]" }, // แดง
  ไก่ชน: { bg: "bg-[#AF52DE]/12", text: "text-[#8932B8]", border: "border-[#AF52DE]/30", dot: "bg-[#AF52DE]" }, // ม่วง
  วัวชน: { bg: "bg-[#FF2D55]/12", text: "text-[#D0093A]", border: "border-[#FF2D55]/30", dot: "bg-[#FF2D55]" }, // แดงออกชมพู
  "กีฬาอื่นๆ": { bg: "bg-[#767680]/12", text: "text-[#636366]", border: "border-[#767680]/20", dot: "bg-[#8E8E93]" }, // เทาเดิม
  "UFA NEWS": { bg: "bg-[#30B0C7]/12", text: "text-[#1C8294]", border: "border-[#30B0C7]/25", dot: "bg-[#30B0C7]" },
  แคมเปญ: { bg: "bg-[#00C7BE]/12", text: "text-[#008F88]", border: "border-[#00C7BE]/25", dot: "bg-[#00C7BE]" },
  กิจกรรมกลาง: { bg: "bg-[#FFCC00]/15", text: "text-[#9E7D00]", border: "border-[#FFCC00]/30", dot: "bg-[#FFCC00]" },
  Pretty: { bg: "bg-[#FF2D55]/10", text: "text-[#D0093A]", border: "border-[#FF2D55]/25", dot: "bg-[#FF2D55]" },
};

interface ThaiDayColor {
  name: string;
  short: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
}

const THAI_DAY_OF_WEEK_COLORS: Record<number, ThaiDayColor> = {
  0: { name: "วันอาทิตย์", short: "อา.", bg: "bg-[#FF3B30]/12", text: "text-[#D70015]", border: "border-[#FF3B30]/30", dot: "bg-[#FF3B30]" }, // อาทิตย์ - แดง
  1: { name: "วันจันทร์", short: "จ.", bg: "bg-[#FFD60A]/20", text: "text-[#856404]", border: "border-[#FFD60A]/40", dot: "bg-[#FFCC00]" }, // จันทร์ - เหลือง
  2: { name: "วันอังคาร", short: "อ.", bg: "bg-[#FF2D55]/12", text: "text-[#D0093A]", border: "border-[#FF2D55]/30", dot: "bg-[#FF2D55]" }, // อังคาร - ชมพู
  3: { name: "วันพุธ", short: "พ.", bg: "bg-[#34C759]/12", text: "text-[#248A3D]", border: "border-[#34C759]/30", dot: "bg-[#34C759]" }, // พุธ - เขียว
  4: { name: "วันพฤหัสบดี", short: "พฤ.", bg: "bg-[#FF9500]/12", text: "text-[#C97700]", border: "border-[#FF9500]/30", dot: "bg-[#FF9500]" }, // พฤหัส - ส้ม
  5: { name: "วันศุกร์", short: "ศ.", bg: "bg-[#007AFF]/12", text: "text-[#0066D6]", border: "border-[#007AFF]/30", dot: "bg-[#007AFF]" }, // ศุกร์ - ฟ้า
  6: { name: "วันเสาร์", short: "ส.", bg: "bg-[#AF52DE]/12", text: "text-[#8932B8]", border: "border-[#AF52DE]/30", dot: "bg-[#AF52DE]" }, // เสาร์ - ม่วง
};

function getThaiDayOfWeekInfo(dateStr: string): ThaiDayColor | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const str = dateStr.trim();
  if (!str || str === "-") return null;

  const slashMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10);
    let year = parseInt(slashMatch[3], 10);

    if (year < 100) {
      if (year >= 60 && year <= 99) {
        year = 2500 + year - 543;
      } else {
        year = 2000 + year;
      }
    } else if (year > 2500) {
      year = year - 543;
    }

    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) {
      const dayIndex = d.getDay();
      return THAI_DAY_OF_WEEK_COLORS[dayIndex] || null;
    }
  }

  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    let year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (year > 2500) year -= 543;
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) {
      const dayIndex = d.getDay();
      return THAI_DAY_OF_WEEK_COLORS[dayIndex] || null;
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const dayIndex = parsed.getDay();
    return THAI_DAY_OF_WEEK_COLORS[dayIndex] || null;
  }

  return null;
}

const THAI_MONTH_TO_NUM: Record<string, string> = {
  มค: "01", "ม.ค.": "01", มกรา: "01", มกราคม: "01",
  กพ: "02", "ก.พ.": "02", กุมภา: "02", กุมภาพันธ์: "02",
  มีค: "03", "มี.ค.": "03", มีนา: "03", มีนาคม: "03",
  เมย: "04", "เม.ย.": "04", เมษา: "04", เมษายน: "04",
  พค: "05", "พ.ค.": "05", พฤษภา: "05", พฤษภาคม: "05",
  มิย: "06", "มิ.ย.": "06", มิถุนา: "06", มิถุนายน: "06",
  กค: "07", "ก.ค.": "07", กรกฎา: "07", กรกฎาคม: "07",
  สค: "08", "ส.ค.": "08", สิงหา: "08", สิงหาคม: "08",
  กย: "09", "ก.ย.": "09", กันยา: "09", กันยายน: "09",
  ตค: "10", "ต.ค.": "10", ตุลา: "10", ตุลาคม: "10",
  พย: "11", "พ.ย.": "11", พฤศจิกา: "11", พฤศจิกายน: "11",
  ธค: "12", "ธ.ค.": "12", ธันวา: "12", ธันวาคม: "12",
};

function getCategoryEmoji(category: string): string {
  const cat = (category || "").trim().toLowerCase();
  if (cat.includes("บอล") || cat.includes("football")) return "⚽️";
  if (cat.includes("หวย") || cat.includes("apb")) return "🎱";
  if (cat.includes("slot") || cat.includes("สล็อต")) return "🎰";
  if (cat.includes("มวย") || cat.includes("box")) return "🥊";
  if (cat.includes("วัว") || cat.includes("cow")) return "🐮";
  if (cat.includes("ไก่") || cat.includes("cock")) return "🐔";
  if (cat.includes("casino") || cat.includes("คาสิโน")) return "🎲";
  if (cat.includes("กีฬา") || cat.includes("sport")) return "⚾️";
  if (cat.includes("news") || cat.includes("ufa")) return "🆕";
  if (cat.includes("แคมเปญ") || cat.includes("campaign")) return "🎯";
  if (cat.includes("กิจกรรม")) return "🎪";
  if (cat.includes("pretty")) return "✨";
  return "📁";
}

function parseAssignDateMonthAndYear(dateStr?: string): { month: number; yearBE: number } | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  if (!clean || clean === "-") return null;

  // 1. ISO format: 2026-12-05 หรือ 2569-12-05
  const isoMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    let yr = parseInt(isoMatch[1], 10);
    const mo = parseInt(isoMatch[2], 10);
    if (yr < 2500) yr += 543;
    return { month: mo, yearBE: yr };
  }

  // 2. Slash/dash format: 5/12/2569, 5/12/69, 05/12/26
  const slashMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/);
  if (slashMatch) {
    const mo = parseInt(slashMatch[2], 10);
    let yr = slashMatch[3] ? parseInt(slashMatch[3], 10) : new Date().getFullYear() + 543;
    if (yr < 100) {
      if (yr > 50) yr += 2500;
      else yr += 2000 + 543;
    } else if (yr < 2500) {
      yr += 543;
    }
    return { month: mo, yearBE: yr };
  }

  // 3. Thai text format: 5 ธ.ค. 69, 5 ธันวาคม 2569
  const thaiMatch = clean.match(/^(\d{1,2})\s*([^\d\s]+)?(?:\s*(\d{2,4}))?/);
  if (thaiMatch) {
    const rawMonth = (thaiMatch[2] || "").replace(/\./g, "").trim();
    const moStr = THAI_MONTH_TO_NUM[rawMonth];
    if (moStr) {
      const mo = parseInt(moStr, 10);
      let yrStr = thaiMatch[3];
      let yr = new Date().getFullYear() + 543;
      if (yrStr) {
        let yNum = parseInt(yrStr, 10);
        if (yNum < 100) {
          if (yNum > 50) yr = 2500 + yNum;
          else yr = 2000 + 543 + yNum;
        } else if (yNum < 2500) {
          yr = yNum + 543;
        } else {
          yr = yNum;
        }
      }
      return { month: mo, yearBE: yr };
    }
  }

  // 4. Standard Date parsing
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    let yr = d.getFullYear();
    if (yr < 2500) yr += 543;
    return { month: d.getMonth() + 1, yearBE: yr };
  }

  return null;
}

function resolveSmartYear(targetMonthNum: number, explicitYear?: string, sampleAssignDate?: string): string {
  // 1. ถ้ามีปีระบุไว้ในชื่อชีท ให้ยึดตามที่ระบุเป็นหลัก
  if (explicitYear) {
    if (explicitYear.length === 4) {
      let yNum = parseInt(explicitYear, 10);
      if (yNum > 2500) yNum -= 543;
      return (yNum + 543).toString().slice(-2);
    } else if (explicitYear.length > 2) {
      return explicitYear.slice(-2);
    }
    return explicitYear;
  }

  // 2. หาปีและเดือนอ้างอิงจากวันที่จ่ายงาน (ถ้ามี) หรือเวลาปัจจุบัน
  let baseYearBE = new Date().getFullYear() + 543;
  let baseMonth = new Date().getMonth() + 1;

  const parsedAssign = parseAssignDateMonthAndYear(sampleAssignDate);
  if (parsedAssign) {
    baseYearBE = parsedAssign.yearBE;
    baseMonth = parsedAssign.month;
  }

  // 3. ตรวจจับการข้ามปีอัจฉริยะ (Cross-Year Smart Detection)
  // 3.1 ทำงานล่วงหน้าข้ามปี: จ่ายงาน/ทำปลายปี (ต.ค.-ธ.ค. เดือน 10-12) แต่งานเป็นต้นปี (ม.ค.-มี.ค. เดือน 1-3) -> ปัดเป็นปีถัดไป (+1)
  if (baseMonth >= 10 && targetMonthNum <= 3) {
    return (baseYearBE + 1).toString().slice(-2);
  }
  // 3.2 ตรวจงานย้อนหลังข้ามปี: ปัจจุบันอยู่ต้นปี (ม.ค.-มี.ค. เดือน 1-3) แต่เปิดดูงานปลายปี (ต.ค.-ธ.ค. เดือน 10-12) -> ปัดเป็นปีก่อนหน้า (-1)
  if (baseMonth <= 3 && targetMonthNum >= 10) {
    return (baseYearBE - 1).toString().slice(-2);
  }

  return baseYearBE.toString().slice(-2);
}

function formatWorkReportDate(dateSheet: string, sampleAssignDate?: string): string {
  if (!dateSheet) return "";
  const clean = dateSheet.trim();

  // 1. กรณีเป็นรูปแบบตัวเลขคั่นขีด/สแลช เช่น 13/11/69, 13/11, 13-11-2569
  const slashMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/);
  if (slashMatch) {
    const d = slashMatch[1].padStart(2, "0");
    const mo = slashMatch[2].padStart(2, "0");
    const yr = resolveSmartYear(parseInt(mo, 10), slashMatch[3], sampleAssignDate);
    return `${d}/${mo}/${yr}`;
  }

  // 2. กรณีเป็นชื่อแท็บภาษาไทย เช่น "13 พย", "13 พ.ย.", "13 พ.ย. 69", "1 พย", "31 ตค", "13 มค"
  const thaiMatch = clean.match(/^(\d{1,2})\s*([^\d\s]+)?(?:\s*(\d{2,4}))?/);
  if (thaiMatch) {
    const d = thaiMatch[1].padStart(2, "0");
    const rawMonth = (thaiMatch[2] || "").trim();
    const cleanMonth = rawMonth.replace(/\./g, "").trim();
    const mo = THAI_MONTH_TO_NUM[cleanMonth] || THAI_MONTH_TO_NUM[rawMonth] || "11";
    const yr = resolveSmartYear(parseInt(mo, 10), thaiMatch[3], sampleAssignDate);
    return `${d}/${mo}/${yr}`;
  }

  return clean;
}

function buildCategoryEmojiSummary(tasks: Task[]): string {
  const catMap = new Map<string, string[]>();

  tasks.forEach((t) => {
    const emoji = getCategoryEmoji(t.category);
    const noRaw = t.no !== undefined && t.no !== null ? String(t.no).trim() : "";
    if (!noRaw || noRaw === "-") return;

    if (!catMap.has(emoji)) {
      catMap.set(emoji, []);
    }
    const list = catMap.get(emoji)!;
    if (!list.includes(noRaw)) {
      list.push(noRaw);
    }
  });

  const parts: string[] = [];
  catMap.forEach((numbers, emoji) => {
    const sorted = [...numbers].sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
    parts.push(`${emoji}${sorted.join(".")}`);
  });

  return parts.join(" ");
}

export default function HomePage() {
  const [assignee, setAssignee] = useState<string>("ลูกหยี");
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [pendingOnly, setPendingOnly] = useState<boolean>(true);
  const [staffList, setStaffList] = useState<string[]>([
    "ลูกหยี", "บอย", "วิน", "ปั้ม", "แม็กซ์", "เจมมี่", "เบียร์",
    "อีฟ", "เอิร์น", "ปอ", "พรีม", "แบงค์", "ปอนด์", "จ๊อบ",
    "แพท", "กิ๊ก", "ภา", "เค้ก", "พี่นาย", "เม่น", "นิว", "มายด์", "เอ้"
  ]);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const isAllSelected =
    selectedSheets.includes("ALL") ||
    (availableSheets.length > 0 && selectedSheets.length === availableSheets.length);
  const sheetName = isAllSelected
    ? "ทุกวัน (All)"
    : selectedSheets.length > 0
    ? selectedSheets.join(", ")
    : "";
  const monthGroups = useMemo(() => {
    const nov: string[] = [];
    const oct: string[] = [];
    const other: string[] = [];

    availableSheets.forEach((s) => {
      if (s.includes("พย") || s.includes("พ.ย.")) {
        nov.push(s);
      } else if (s.includes("ตค") || s.includes("ต.ค.")) {
        oct.push(s);
      } else {
        other.push(s);
      }
    });

    return { nov, oct, other };
  }, [availableSheets]);
  const [isMetadataLoading, setIsMetadataLoading] = useState<boolean>(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskKeys, setSelectedTaskKeys] = useState<string[]>([]);
  const [syncingTaskKeys, setSyncingTaskKeys] = useState<string[]>([]);
  const [justCompletedKeys, setJustCompletedKeys] = useState<Set<string>>(new Set());
  const [taskNamesMap, setTaskNamesMap] = useState<Record<string, string>>({});
  const [folderLinksMap, setFolderLinksMap] = useState<
    Record<string, { thUrl?: string; interUrl?: string }>
  >({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [streamingProgress, setStreamingProgress] = useState<{
    current: number;
    total: number;
    activeSheet?: string;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [copiedDateSheet, setCopiedDateSheet] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    updatedTasks?: Array<{
      sheetName: string;
      row: number;
      taskName: string;
      thFolderUrl: string;
      interFolderUrl: string;
      status: string;
    }>;
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const clientSheetCacheRef = useRef<Record<string, Task[]>>({});
  const sheetChecksumsRef = useRef<Record<string, string>>({});
  const dateDropdownRef = useRef<HTMLDivElement>(null);
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState<boolean>(false);

  // การยกเลิกสร้างโฟลเดอร์
  const syncAbortControllerRef = useRef<AbortController | null>(null);

  // สร้างโฟลเดอร์ล่วงหน้า (Pre-create Date & 9 Categories)
  const [showPrecreateModal, setShowPrecreateModal] = useState<boolean>(false);
  const [precreateSheet, setPrecreateSheet] = useState<string>("");
  const [precreateStartDay, setPrecreateStartDay] = useState<number>(1);
  const [precreateEndDay, setPrecreateEndDay] = useState<number>(30);
  const [isPrecreating, setIsPrecreating] = useState<boolean>(false);
  const [precreateProgress, setPrecreateProgress] = useState<number>(0);
  const [precreateStatusText, setPrecreateStatusText] = useState<string>("");
  const [precreateError, setPrecreateError] = useState<string | null>(null);
  const [precreateSuccess, setPrecreateSuccess] = useState<boolean>(false);
  const precreateAbortControllerRef = useRef<AbortController | null>(null);

  // ดักจับปุ่ม Esc เพื่อกดยกเลิกขณะกำลังสร้างโฟลเดอร์ทันที
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSyncing) {
        handleCancelSync();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSyncing]);

  useEffect(() => {
    return () => {
      if (syncAbortControllerRef.current) {
        syncAbortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dateDropdownRef.current &&
        !dateDropdownRef.current.contains(event.target as Node)
      ) {
        setIsDateDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getTaskKey = (sheet: string, row: number) => `${sheet}_${row}`;

  const cleanStatus = (status?: string): string => {
    if (!status) return "";
    return status
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2300}-\u{23FF}]/gu, "")
      .trim();
  };

  const copyToClipboard = (url: string, label: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(label);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  // สร้างข้อความสรุปส่งงานเข้าแชท
  const generateWorkReportMessage = (targetDateSheet: string): string => {
    // ดึงงานทั้งหมดของวันที่นี้ (รวมงานที่เสร็จแล้วและยังไม่เสร็จ)
    const allSheetTasks =
      clientSheetCacheRef.current[targetDateSheet] ||
      tasks.filter((t) => t.sheetName === targetDateSheet) ||
      [];

    const currentAssignee = (assignee || "").trim();
    const isSpecificStaff = currentAssignee && currentAssignee !== "ALL";

    // หาวันที่จ่ายงานตัวอย่าง (sampleAssignDate) จากงานในชีทนั้นเพื่อใช้อ้างอิงปี
    const sampleTaskWithDate = allSheetTasks.find(
      (t) => t.assignDate && t.assignDate.trim() !== "" && t.assignDate !== "-"
    );
    const sampleAssignDate = sampleTaskWithDate ? sampleTaskWithDate.assignDate : undefined;

    // จัดรูปแบบวันที่ตามชื่อแผ่นงาน (วันที่ sort) พร้อมระบบตรวจจับข้ามปีอัจฉริยะ (เช่น 13 มค ขณะทำปลายปี 69 -> 13/01/70)
    const formattedDate = formatWorkReportDate(targetDateSheet, sampleAssignDate);

    const isTaskSelected = (t: Task) =>
      selectedTaskKeys.includes(getTaskKey(t.sheetName || targetDateSheet, t.row));

    const isTaskJustCompleted = (t: Task) =>
      justCompletedKeys.has(getTaskKey(t.sheetName || targetDateSheet, t.row));

    const getTasksToReport = (candidateTasks: Task[]): Task[] => {
      // 1. ถ้ามีการติ๊กเลือกงานไว้ ให้สรุปเฉพาะงานที่ถูกติ๊กเลือกเท่านั้น
      const selected = candidateTasks.filter(isTaskSelected);
      if (selected.length > 0) {
        return selected;
      }
      // 2. ถ้าเพิ่งกดสร้างโฟลเดอร์เสร็จในรอบนี้ ให้สรุปงานที่เพิ่งทำเสร็จ
      const justCompleted = candidateTasks.filter(isTaskJustCompleted);
      if (justCompleted.length > 0) {
        return justCompleted;
      }
      // 3. ถ้ามีงานค้างอยู่แต่ผู้ใช้ไม่ได้ติ๊กเลือกเลย (หรือเอาติ๊กออกหมด) ให้เป็นค่าว่าง (-)
      const hasPending = candidateTasks.some((t) => !t.isCompleted);
      if (hasPending) {
        return [];
      }
      // 4. กรณีทุกงานในชีตเสร็จสิ้นหมดแล้ว (เช่น อยู่หน้าเสร็จสิ้น หรือเปิดดูงานที่เสร็จแล้ว) ให้สรุปทั้งหมด
      return candidateTasks;
    };

    const staffSummaryLines: string[] = [];

    if (isSpecificStaff) {
      const staffTasks = allSheetTasks.filter((t) =>
        (t.assignee || "").toLowerCase().includes(currentAssignee.toLowerCase())
      );
      const tasksToSummarize = getTasksToReport(staffTasks);
      const catSummary = buildCategoryEmojiSummary(tasksToSummarize);
      staffSummaryLines.push(`${currentAssignee} : ${catSummary || "-"}`);
    } else {
      const staffMap = new Map<string, Task[]>();
      allSheetTasks.forEach((t) => {
        const name = (t.assignee || "").trim();
        if (!name || name === "-" || name === "ผู้รับงาน") return;
        if (!staffMap.has(name)) staffMap.set(name, []);
        staffMap.get(name)!.push(t);
      });

      if (staffMap.size === 0) {
        staffSummaryLines.push("ไม่พบงานที่มอบหมาย");
      } else {
        staffMap.forEach((sTasks, name) => {
          const tasksToSummarize = getTasksToReport(sTasks);
          const catSummary = buildCategoryEmojiSummary(tasksToSummarize);
          staffSummaryLines.push(`${name} : ${catSummary || "-"}`);
        });
      }
    }

    return [
      "✅อัปไฟล์ TH/INTER กรอกตารางเรียบร้อยครับ✅",
      `งานใบขาย ${formattedDate}`,
      ...staffSummaryLines,
    ].join("\n");
  };

  // คัดลอกข้อความสรุปส่งงานเข้า Clipboard
  const handleCopyReportMessage = async (targetDateSheet: string) => {
    try {
      const message = generateWorkReportMessage(targetDateSheet);
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = message;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedDateSheet(targetDateSheet);
      setTimeout(() => {
        setCopiedDateSheet((prev) => (prev === targetDateSheet ? null : prev));
      }, 2500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  // กรองและอัปเดตงานลง State ทันทีใน Memory (0 ms)
  const applyTasksToState = (allTasks: Task[], targetAssignee: string) => {
    const searchLower = (targetAssignee || "").toLowerCase().trim();
    const rawLoaded = searchLower && searchLower !== "all"
      ? allTasks.filter((t) => (t.assignee || "").toLowerCase().includes(searchLower))
      : allTasks;

    // ถ้างานไหนยังไม่มีทั้งลิ้งก์และชื่อโฟลเดอร์บนชีต ให้ตีว่ายังไม่เสร็จ (isCompleted: false) จนกว่าจะมีทั้งคู่
    const loadedTasks = rawLoaded.map((t) => {
      const hasName = !!(t.taskName && t.taskName.trim() !== "");
      const hasLink = !!(t.uploadUrl && t.uploadUrl.trim() !== "");
      const hasBothLinkAndName = hasName && hasLink;
      const reallyCompleted = hasBothLinkAndName ? t.isCompleted : false;

      return {
        ...t,
        isCompleted: reallyCompleted,
        status: t.status || "", // ใช้สถานะตามจริงจาก Col L บนชีตเสมอ
      };
    });

    setTasks(loadedTasks);

    const nameMap: Record<string, string> = {};
    const pendingKeys: string[] = [];
    const incomingLinks: Record<string, { thUrl?: string; interUrl?: string }> = {};

    loadedTasks.forEach((t) => {
      const key = getTaskKey(t.sheetName, t.row);
      const taskNameStr = (t.taskName || "").trim();
      // ดึงชื่องานจากชีตจริงเสมอ ถ้าในชีตไม่มีหรือผู้ใช้ลบออก ให้เป็นค่าว่าง ""
      nameMap[key] = taskNameStr;
      if (!t.isCompleted) {
        pendingKeys.push(key);
      }
      if (t.uploadUrl || t.interFolderUrl) {
        incomingLinks[key] = {
          thUrl: t.uploadUrl || "",
          interUrl: t.interFolderUrl || "",
        };
      }
    });

    // อัปเดต State ตรงตามข้อมูลสดจริงจาก Google Sheets ทันที (ไม่เก็บแคชลิงก์ที่ถูกลบไปแล้ว)
    setTaskNamesMap(nameMap);
    setSelectedTaskKeys(pendingKeys);
    setFolderLinksMap(incomingLinks);
  };

  // ทยอยเพิ่มงานลง State ทีละชุดที่ดึงเสร็จทันที (Progressive Rendering)
  const appendTasksToState = (newBatchTasks: Task[], targetAssignee: string) => {
    const searchLower = (targetAssignee || "").toLowerCase().trim();
    const rawFiltered = searchLower && searchLower !== "all"
      ? newBatchTasks.filter((t) => (t.assignee || "").toLowerCase().includes(searchLower))
      : newBatchTasks;

    // ถ้างานไหนยังไม่มีทั้งลิ้งก์และชื่อโฟลเดอร์บนชีต ให้ตีว่ายังไม่เสร็จ (isCompleted: false) จนกว่าจะมีทั้งคู่
    const filteredNew = rawFiltered.map((t) => {
      const hasName = !!(t.taskName && t.taskName.trim() !== "");
      const hasLink = !!(t.uploadUrl && t.uploadUrl.trim() !== "");
      const hasBothLinkAndName = hasName && hasLink;
      const reallyCompleted = hasBothLinkAndName ? t.isCompleted : false;

      return {
        ...t,
        isCompleted: reallyCompleted,
        status: t.status || "", // ใช้สถานะตามจริงจาก Col L บนชีตเสมอ
      };
    });

    setTasks((prevTasks) => {
      const newSheetNames = new Set(filteredNew.map((t) => t.sheetName));
      const remaining = prevTasks.filter((t) => !newSheetNames.has(t.sheetName));
      return [...remaining, ...filteredNew];
    });

    setTaskNamesMap((prev) => {
      const updated = { ...prev };
      filteredNew.forEach((t) => {
        const key = getTaskKey(t.sheetName, t.row);
        if (updated[key] === undefined) {
          updated[key] = (t.taskName || "").trim();
        }
      });
      return updated;
    });

    setSelectedTaskKeys((prev) => {
      const newPending = filteredNew
        .filter((t) => !t.isCompleted)
        .map((t) => getTaskKey(t.sheetName, t.row));
      return Array.from(new Set([...prev, ...newPending]));
    });

    setFolderLinksMap((prev) => {
      const updated = { ...prev };
      filteredNew.forEach((t) => {
        const key = getTaskKey(t.sheetName, t.row);
        if (t.uploadUrl || t.interFolderUrl) {
          updated[key] = {
            thUrl: t.uploadUrl || "",
            interUrl: t.interFolderUrl || "",
          };
        }
      });
      return updated;
    });
  };

  // ดึงงานของแผ่นงานมารอไว้ล่วงหน้าเงียบๆ (Prefetch)
  const prefetchSheetTasks = async (targetSheet: string) => {
    if (!targetSheet || targetSheet === "ALL" || clientSheetCacheRef.current[targetSheet]) return;
    try {
      const res = await fetch(
        `/api/tasks?action=getTasks&sheet=${encodeURIComponent(targetSheet)}&assignee=ALL&pendingOnly=false`
      );
      const data = await res.json();
      if (data.success && data.tasks) {
        clientSheetCacheRef.current[targetSheet] = data.tasks;
      }
    } catch (e) {}
  };

  // โหลดรายชื่อพนักงานและแท็บวันที่ทั้งหมดจากชีตจริง (ไม่ใช้ mockup วันที่) พร้อมดึงข้อมูลจาก IndexedDB ใน 0ms
  const loadMetadata = async (initialAssignee: string) => {
    setIsMetadataLoading(true);
    try {
      // 1. ดึงข้อมูลทั้งหมดที่มีใน IndexedDB ขึ้นมาไว้ใน Memory ทันทีใน 1ms
      const allDbRecords = await getAllSheetsFromIndexedDB();
      Object.entries(allDbRecords).forEach(([sName, record]) => {
        if (record && Array.isArray(record.tasks)) {
          clientSheetCacheRef.current[sName] = record.tasks as Task[];
          if (record.checksum) {
            sheetChecksumsRef.current[sName] = record.checksum;
          }
        }
      });

      const res = await fetch("/api/tasks?action=getMetadata");
      const data = await res.json();
      if (data.success) {
        if (data.sheetNames && data.sheetNames.length > 0) {
          setAvailableSheets(data.sheetNames);

          const savedSheetsJson = localStorage.getItem("gds_selectedSheets");
          let initialSelected: string[] = [];
          if (savedSheetsJson) {
            try {
              const parsed = JSON.parse(savedSheetsJson);
              if (Array.isArray(parsed) && parsed.length > 0) {
                if (parsed.includes("ALL") || parsed.length === data.sheetNames.length) {
                  initialSelected = ["ALL"];
                } else {
                  initialSelected = parsed.filter(
                    (s: string) => data.sheetNames.includes(s)
                  );
                }
              }
            } catch {}
          }

          // ถ้ายังไม่มีค่าบันทึกไว้ ให้เลือก "ALL" เป็นค่าเริ่มต้น
          if (initialSelected.length === 0) {
            initialSelected = ["ALL"];
          }

          setSelectedSheets(initialSelected);

          const targetSheetsList = initialSelected.includes("ALL")
            ? data.sheetNames
            : initialSelected;

          // แสดงผลชุดข้อมูลที่มีใน IndexedDB ขึ้นหน้าจอทันทีใน 0ms!
          const cachedInitial = targetSheetsList.flatMap(
            (s: string) => clientSheetCacheRef.current[s] || []
          );
          if (cachedInitial.length > 0) {
            applyTasksToState(cachedInitial, initialAssignee);
          }

          // ดึงเฉพาะวันที่ยังไม่เคยมีในแคช (ถ้ามี) มาเติมให้อัตโนมัติ (forceLoading = false)
          fetchTasks(initialAssignee, initialSelected, false);
        }
        if (data.staffList && data.staffList.length > 0) {
          setStaffList(data.staffList);
        }
      }
    } catch (e) {
      console.log("Could not load initial metadata", e);
    } finally {
      setIsMetadataLoading(false);
    }
  };

  // โหลดรายการงานตามชื่อพนักงานและวันที่เลือก (Local-First IndexedDB + Realtime Delta Sync)
  const fetchTasks = async (
    targetAssignee = assignee,
    targetSheets: string[] | string = selectedSheets,
    forceLoading = false
  ) => {
    const sheetsArray = Array.isArray(targetSheets)
      ? targetSheets
      : (targetSheets || "").split(",").map((s) => s.trim()).filter(Boolean);

    if (sheetsArray.length === 0) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setErrorMessage(null);
    setSyncResult(null);

    const isModeAll = sheetsArray.includes("ALL") || (availableSheets.length > 0 && sheetsArray.length === availableSheets.length);
    let targetSheetsList = sheetsArray.includes("ALL")
      ? (availableSheets.length > 0 ? [...availableSheets] : [])
      : [...sheetsArray];

    // ถ้าเลือก ALL แต่ availableSheets ยังว่าง ให้ดึง metadata ก่อนเพื่อรู้ชื่อแท็บวันทั้งหมด
    if (targetSheetsList.length === 0 && sheetsArray.includes("ALL")) {
      try {
        const metaRes = await fetch("/api/tasks?action=getMetadata");
        const metaData = await metaRes.json();
        if (metaData.success && metaData.sheetNames?.length > 0) {
          setAvailableSheets(metaData.sheetNames);
          targetSheetsList = [...metaData.sheetNames];
        }
      } catch (e) {}
    }

    if (targetSheetsList.length === 0) {
      targetSheetsList = [...sheetsArray];
    }

    // 1. อ่านข้อมูลจาก IndexedDB มาเติมลง clientSheetCacheRef เสมอ (ไม่ข้ามเมื่อเลือก ALL)
    const dbCachedMap = await getSheetsFromIndexedDB(targetSheetsList);
    Object.entries(dbCachedMap).forEach(([sName, record]) => {
      if (record && Array.isArray(record.tasks)) {
        if (!clientSheetCacheRef.current[sName] || clientSheetCacheRef.current[sName].length === 0) {
          clientSheetCacheRef.current[sName] = record.tasks as Task[];
        }
        if (record.checksum) {
          sheetChecksumsRef.current[sName] = record.checksum;
        }
      }
    });

    // 2. ถ้าไม่ได้บังคับรีเฟรช (!forceLoading) และมีข้อมูลในแคชแล้ว ให้แสดงผลทันทีใน 0ms!
    const cachedSheets = targetSheetsList.filter(
      (s) => clientSheetCacheRef.current[s] !== undefined
    );

    const isAllCached =
      !forceLoading &&
      targetSheetsList.length > 0 &&
      cachedSheets.length === targetSheetsList.length;

    if (cachedSheets.length > 0) {
      const stitchedCached = targetSheetsList.flatMap(
        (s) => clientSheetCacheRef.current[s] || []
      );
      applyTasksToState(stitchedCached, targetAssignee);
      if (isAllCached) {
        setIsLoading(false);
        setStreamingProgress(null);
        return;
      }
    }

    // แผ่นงานที่ต้องเชื่อมต่อไปยังหลังบ้าน (เฉพาะวันที่ยังไม่มีในแคช หรือเมื่อกดปุ่ม ค้นหางานของฉัน forceLoading=true)
    let sheetsToSync = forceLoading
      ? targetSheetsList
      : targetSheetsList.filter((s) => clientSheetCacheRef.current[s] === undefined);

    if (sheetsToSync.length === 0) {
      const allCurrentTasks = targetSheetsList.flatMap(
        (s) => clientSheetCacheRef.current[s] || []
      );
      applyTasksToState(allCurrentTasks, targetAssignee);
      setIsLoading(false);
      setStreamingProgress(null);
      return;
    }

    // ถ้าไม่มีข้อมูลในแคชเลย ให้หมุนโหลดรอชุดแรก
    if (cachedSheets.length === 0) {
      setIsLoading(true);
      setTasks([]);
    } else {
      setIsLoading(false);
    }

    // แบ่งดึงทีละ 5 วัน (หรือถ้าเลือกวันเดียวก็ยิงแค่วันเดียวจบใน 0.2 วินาที)
    const chunkSize = 5;
    const batches: string[][] = [];
    for (let i = 0; i < sheetsToSync.length; i += chunkSize) {
      batches.push(sheetsToSync.slice(i, i + chunkSize));
    }

    let loadedCount = cachedSheets.length;
    setStreamingProgress({
      current: loadedCount,
      total: targetSheetsList.length,
      activeSheet: sheetsToSync[0] || "",
    });

    try {
      for (const batch of batches) {
        if (controller.signal.aborted || abortControllerRef.current !== controller) break;

        const activeName = batch.length === 1 ? batch[0] : `${batch[0]} ถึง ${batch[batch.length - 1]}`;
        setStreamingProgress({
          current: loadedCount,
          total: targetSheetsList.length,
          activeSheet: activeName,
        });

        // ดึง Checksum เดิมที่มีใน IndexedDB / Memory สำหรับแบทช์นี้เพื่อส่งไปทำ Realtime Delta Sync
        const knownHashes: Record<string, string> = {};
        for (const sName of batch) {
          const clean = sName.trim();
          if (sheetChecksumsRef.current[clean]) {
            knownHashes[clean] = sheetChecksumsRef.current[clean];
          }
        }

        const params = new URLSearchParams({
          action: "getTasks",
          sheet: batch.join(","),
          assignee: "ALL", // ดึงทุกคนมาเก็บลง IndexedDB ครั้งเดียว สลับชื่อได้ทุกคนใน 0ms!
          pendingOnly: "false",
          force: forceLoading ? "true" : "false",
        });
        if (Object.keys(knownHashes).length > 0) {
          params.set("knownHashes", JSON.stringify(knownHashes));
        }

        const res = await fetch(`/api/tasks?${params.toString()}&_t=${Date.now()}`, {
          signal: controller.signal,
        });

        if (controller.signal.aborted || abortControllerRef.current !== controller) break;

        const data = await res.json();
        if (data.success) {
          const unchangedSet = new Set<string>(
            (data.unchangedSheets || []).map((s: string) => s.trim())
          );

          // อัปเดต Checksums
          if (data.checksums && typeof data.checksums === "object") {
            Object.assign(sheetChecksumsRef.current, data.checksums);
          }

          // จัดกลุ่มงานที่ได้มาใหม่ตามชื่อวัน (ไม่เขียนทับวันที่ unchanged)
          const groupedNewTasks: Record<string, Task[]> = {};
          for (const sName of batch) {
            const clean = sName.trim();
            if (!unchangedSet.has(clean)) {
              groupedNewTasks[clean] = [];
            }
          }

          for (const task of (data.tasks || []) as Task[]) {
            const sName = (task.sheetName || "").trim();
            if (!groupedNewTasks[sName]) groupedNewTasks[sName] = [];
            groupedNewTasks[sName].push(task);
          }

          // บันทึกเฉพาะวันที่เปลี่ยนแปลงลงใน IndexedDB
          const recordsToSave: SheetCacheRecord[] = Object.keys(groupedNewTasks).map((sName) => ({
            sheetName: sName,
            tasks: groupedNewTasks[sName],
            checksum: sheetChecksumsRef.current[sName] || data.checksums?.[sName] || "",
            updatedAt: Date.now(),
          }));

          if (recordsToSave.length > 0) {
            await saveSheetsToIndexedDB(recordsToSave);
            recordsToSave.forEach((rec) => {
              clientSheetCacheRef.current[rec.sheetName] = rec.tasks as Task[];
            });
          }

          // รวบรวมงานทั้งหมดของวันที่เลือกปัจจุบันมาแสดงผล
          const allCurrentTasks = targetSheetsList.flatMap(
            (s) => clientSheetCacheRef.current[s] || []
          );
          applyTasksToState(allCurrentTasks, targetAssignee);

          setIsLoading(false);
          loadedCount += batch.length;
          setStreamingProgress({
            current: Math.min(loadedCount, targetSheetsList.length),
            total: targetSheetsList.length,
            activeSheet: activeName,
          });
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error(err);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
        setStreamingProgress(null);
      }
    }
  };

  // Toggle เลือก/ยกเลิกวันที่
  const handleToggleSheet = (sheet: string) => {
    let updated: string[];
    if (sheet === "ALL") {
      updated = ["ALL"];
    } else {
      const isCurrentlyAll =
        selectedSheets.includes("ALL") ||
        (availableSheets.length > 0 && selectedSheets.length === availableSheets.length);

      // ถ้าเดิมอยู่โหมด ทุกวัน (All) แล้วคลิกเลือกวันที่ ให้เริ่มเลือกเฉพาะวันนั้นทันที
      if (isCurrentlyAll) {
        updated = [sheet];
      } else {
        if (selectedSheets.includes(sheet)) {
          updated = selectedSheets.filter((s) => s !== sheet);
          if (updated.length === 0) {
            updated = ["ALL"]; // ถ้ายกเลิกจนหมด ให้กลับสู่ ทุกวัน (All)
          }
        } else {
          updated = [...selectedSheets, sheet];
        }
      }
    }
    setSelectedSheets(updated);
    localStorage.setItem("gds_selectedSheets", JSON.stringify(updated));
    const targetSheetsList = updated.includes("ALL")
      ? (availableSheets.length > 0 ? availableSheets : [])
      : updated;
    const allCached = targetSheetsList.flatMap((s) => clientSheetCacheRef.current[s] || []);
    if (allCached.length > 0) {
      applyTasksToState(allCached, assignee);
    }
    fetchTasks(assignee, updated, false);
  };

  // เลือกทั้งกลุ่มเดือน (เช่น เดือน พ.ย. หรือ เดือน ต.ค.)
  const handleToggleMonthGroup = (sheetsInGroup: string[]) => {
    if (sheetsInGroup.length === 0) return;
    const isCurrentlyAll =
      selectedSheets.includes("ALL") ||
      (availableSheets.length > 0 && selectedSheets.length === availableSheets.length);
    const currentSelection = isCurrentlyAll ? [] : selectedSheets.filter((s) => s !== "ALL");
    const isAllGroupSelected = sheetsInGroup.every((s) => currentSelection.includes(s));
    let updated: string[];
    if (isAllGroupSelected) {
      updated = currentSelection.filter((s) => !sheetsInGroup.includes(s));
      if (updated.length === 0) {
        updated = ["ALL"];
      }
    } else {
      updated = Array.from(new Set([...currentSelection, ...sheetsInGroup]));
    }
    setSelectedSheets(updated);
    localStorage.setItem("gds_selectedSheets", JSON.stringify(updated));
    const targetSheetsList = updated.includes("ALL")
      ? (availableSheets.length > 0 ? availableSheets : [])
      : updated;
    const allCached = targetSheetsList.flatMap((s) => clientSheetCacheRef.current[s] || []);
    if (allCached.length > 0) {
      applyTasksToState(allCached, assignee);
    }
    fetchTasks(assignee, updated, false);
  };

  // Quick Presets: วันนี้, 3 วันล่าสุด, 7 วันล่าสุด, เดือน พ.ย., เดือน ต.ค., ทุกวัน (All)
  const handleSelectPreset = (preset: "today" | "last3" | "last7" | "nov" | "oct" | "all") => {
    let target: string[] = [];
    if (preset === "today") {
      target = availableSheets.slice(0, 1);
    } else if (preset === "last3") {
      target = availableSheets.slice(0, 3);
    } else if (preset === "last7") {
      target = availableSheets.slice(0, 7);
    } else if (preset === "nov") {
      target = monthGroups.nov.length > 0 ? monthGroups.nov : availableSheets.filter((s) => s.includes("พย") || s.includes("พ.ย."));
    } else if (preset === "oct") {
      target = monthGroups.oct.length > 0 ? monthGroups.oct : availableSheets.filter((s) => s.includes("ตค") || s.includes("ต.ค."));
    } else if (preset === "all") {
      target = ["ALL"];
    }

    if (target.length > 0) {
      setSelectedSheets(target);
      localStorage.setItem("gds_selectedSheets", JSON.stringify(target));
      const targetSheetsList = target.includes("ALL")
        ? (availableSheets.length > 0 ? availableSheets : [])
        : target;
      const allCached = targetSheetsList.flatMap((s) => clientSheetCacheRef.current[s] || []);
      if (allCached.length > 0) {
        applyTasksToState(allCached, assignee);
      }
      fetchTasks(assignee, target, false);
    }
  };

  useEffect(() => {
    // ล้างแคชลิงก์เก่าใน LocalStorage ทิ้งทั้งหมด เพื่อให้อ้างอิงลิงก์สดจาก Google Sheets เสมอ 100%
    try {
      localStorage.removeItem("gds_folder_links");
    } catch (e) {}

    const savedName = localStorage.getItem("gds_assignee");
    const initialName = savedName || "ลูกหยี";
    if (savedName) setAssignee(savedName);

    // ดึง metadata วันที่และพนักงานจริงก่อน แล้วค่อยเริ่มดึงงานของวันที่ล่าสุด
    loadMetadata(initialName);
  }, []);

  const handleAssigneeChange = (newName: string) => {
    setAssignee(newName);
    localStorage.setItem("gds_assignee", newName);
    // Instant 0ms Filter: กรองจากข้อมูลที่มีใน Memory / IndexedDB ทันทีโดยไม่ต้องยิง API!
    if (selectedSheets.length > 0) {
      const allCachedTasks = selectedSheets.flatMap(
        (s) => clientSheetCacheRef.current[s] || []
      );
      if (allCachedTasks.length > 0) {
        applyTasksToState(allCachedTasks, newName);
      }
      // ถ้ามีวันไหนยังไม่เคยโหลดเก็บใน IndexedDB ค่อยดึงมาเสริม
      const missing = selectedSheets.filter((s) => !clientSheetCacheRef.current[s]);
      if (missing.length > 0) {
        fetchTasks(newName, selectedSheets, false);
      }
    }
  };

  const toggleSelectTask = (key: string) => {
    setSelectedTaskKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAllPending = () => {
    const pendingKeys = filteredTasks
      .filter((t) => {
        const key = getTaskKey(t.sheetName, t.row);
        const thUrl = (folderLinksMap[key]?.thUrl || t.uploadUrl || "").trim();
        const taskNameCurrent = (taskNamesMap[key] || t.taskName || "").trim();
        const hasBothLinkAndName = !!thUrl && !!taskNameCurrent;
        const isReallyCompleted = hasBothLinkAndName ? t.isCompleted : false;
        return !isReallyCompleted;
      })
      .map((t) => getTaskKey(t.sheetName, t.row));

    if (selectedTaskKeys.length === pendingKeys.length) {
      setSelectedTaskKeys([]);
    } else {
      setSelectedTaskKeys(pendingKeys);
    }
  };

  // ยกเลิกการสร้างโฟลเดอร์ทันทีก่อนเสร็จสิ้น
  const handleCancelSync = () => {
    if (syncAbortControllerRef.current) {
      syncAbortControllerRef.current.abort();
      syncAbortControllerRef.current = null;
    }
    setIsSyncing(false);
    setSyncingTaskKeys([]);
  };

  const handleCancelPrecreate = () => {
    if (precreateAbortControllerRef.current) {
      precreateAbortControllerRef.current.abort();
      precreateAbortControllerRef.current = null;
    }
    setIsPrecreating(false);
    setPrecreateStatusText("ยกเลิกการสร้างโฟลเดอร์ล่วงหน้าแล้ว");
  };

  const handleStartPrecreate = async () => {
    const sheetToUse = precreateSheet || availableSheets[0] || selectedSheets[0];
    if (!sheetToUse) {
      alert("กรุณาเลือกเดือน/แผ่นงานที่ต้องการสร้าง");
      return;
    }

    const start = Math.max(1, Math.min(precreateStartDay, precreateEndDay));
    const end = Math.min(31, Math.max(precreateStartDay, precreateEndDay));
    const allDays: number[] = [];
    for (let d = start; d <= end; d++) {
      allDays.push(d);
    }

    if (allDays.length === 0) {
      alert("กรุณาระบุช่วงวันที่ให้ถูกต้อง");
      return;
    }

    // แบ่งเป็นชุดละ 5 วันเพื่อความรวดเร็วและป้องกัน Timeout
    const BATCH_SIZE = 5;
    const batches: number[][] = [];
    for (let i = 0; i < allDays.length; i += BATCH_SIZE) {
      batches.push(allDays.slice(i, i + BATCH_SIZE));
    }

    setIsPrecreating(true);
    setPrecreateProgress(0);
    setPrecreateError(null);
    setPrecreateSuccess(false);

    const controller = new AbortController();
    precreateAbortControllerRef.current = controller;

    try {
      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        const batch = batches[bIdx];
        const percent = Math.round((bIdx / batches.length) * 100);
        setPrecreateProgress(percent);
        setPrecreateStatusText(
          `กำลังสร้างวันที่ ${batch[0]} - ${batch[batch.length - 1]} (TH & INTER พร้อม 9 หมวดหมู่)... (ชุดที่ ${bIdx + 1}/${batches.length})`
        );

        const res = await fetch("/api/precreate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheetName: sheetToUse,
            days: batch,
            categories: [
              "สล็อต",
              "คาสิโน",
              "บอล",
              "มวย",
              "ไก่ชน",
              "วัวชน",
              "กีฬาอื่นๆ",
              "หวย APB",
              "UFA NEWS",
            ],
          }),
          signal: controller.signal,
        });

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.message || data.error || "เกิดข้อผิดพลาดในการสร้างโฟลเดอร์ล่วงหน้า");
        }
      }

      setPrecreateProgress(100);
      setPrecreateSuccess(true);
      setPrecreateStatusText(`สร้างโครงสร้างวันที่ ${start} - ${end} พร้อม 9 หมวดหมู่หลัก (TH & INTER) สำเร็จครบถ้วนแล้ว!`);
    } catch (err: any) {
      if (err.name === "AbortError") {
        setPrecreateStatusText("ยกเลิกการสร้างโฟลเดอร์ล่วงหน้าแล้ว");
        return;
      }
      setPrecreateError(err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setIsPrecreating(false);
      precreateAbortControllerRef.current = null;
    }
  };

  // ดำเนินการสร้างโฟลเดอร์ทันที (ไม่มีการนับถอยหลัง)
  const handleSyncFolders = async () => {
    if (selectedTaskKeys.length === 0) {
      alert("กรุณาเลือกงานอย่างน้อย 1 รายการเพื่อสร้างโฟลเดอร์");
      return;
    }

    const selectedTasks = tasks.filter((t) =>
      selectedTaskKeys.includes(getTaskKey(t.sheetName, t.row))
    );

    const tasksToSync = selectedTasks.map((t) => {
      const key = getTaskKey(t.sheetName, t.row);
      const inputName = (taskNamesMap[key] || "").trim();
      const originalName = (t.taskName || "").trim();
      const existingUrl = (t.uploadUrl || folderLinksMap[key]?.thUrl || "").trim();
      const hasExistingLink = !!existingUrl;

      const isRename = hasExistingLink && inputName !== "" && inputName !== originalName;
      const isCustomName = !hasExistingLink && inputName !== "";

      return {
        sheetName: t.sheetName,
        row: t.row,
        category: t.category,
        no: t.no,
        taskName: inputName,
        isRename: isRename,
        isCustomName: isCustomName,
        existingUrl: existingUrl,
      };
    });

    const keysToSync = selectedTasks.map((t) => getTaskKey(t.sheetName, t.row));
    setSyncingTaskKeys(keysToSync);
    setIsSyncing(true);

    const controller = new AbortController();
    syncAbortControllerRef.current = controller;

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: tasksToSync,
        }),
        signal: controller.signal,
      });

      const result = await res.json();
      if (result.success) {
        setSyncResult(result);

        if (result.updatedTasks && Array.isArray(result.updatedTasks)) {
          // 1. อัปเดตเฉพาะแถวที่เพิ่งสร้างโฟลเดอร์เสร็จลง IndexedDB ทันทีใน 0ms โดยไม่ต้องโหลดชีตใหม่!
          await patchCreatedFoldersInIndexedDB(result.updatedTasks);

          // 2. อัปเดตข้อมูลใน clientSheetCacheRef.current ทันที
          result.updatedTasks.forEach((u: any) => {
            const sName = (u.sheetName || "").trim();
            if (clientSheetCacheRef.current[sName]) {
              clientSheetCacheRef.current[sName] = clientSheetCacheRef.current[sName].map((t) =>
                Number(t.row) === Number(u.row)
                  ? {
                      ...t,
                      taskName: u.taskName || t.taskName,
                      uploadUrl: u.thFolderUrl || t.uploadUrl,
                      interFolderUrl: u.interFolderUrl || t.interFolderUrl,
                      hasUploadLink: !!(u.thFolderUrl || t.uploadUrl),
                      status: "เสร็จสิ้น",
                      isCompleted: true,
                    }
                  : t
              );
            }
          });

          const newLinks: Record<string, { thUrl?: string; interUrl?: string }> = {};
          const updatedRealNames: Record<string, string> = {};
          const nextCompleted = new Set(justCompletedKeys);

          result.updatedTasks.forEach((u: any) => {
            const key = getTaskKey(u.sheetName, u.row);
            newLinks[key] = {
              thUrl: u.thFolderUrl || "",
              interUrl: u.interFolderUrl || "",
            };
            if (u.taskName) {
              updatedRealNames[key] = u.taskName;
            }
            nextCompleted.add(key);
          });

          // อัปเดตชื่องานจริงที่ก๊อปปี้มาจาก Google Drive ทันที
          if (Object.keys(updatedRealNames).length > 0) {
            setTaskNamesMap((prev) => ({ ...prev, ...updatedRealNames }));
          }

          // บันทึกรายการงานที่เพิ่งทำเสร็จ เพื่อไม่ให้แถวหายไปจากตาราง
          setJustCompletedKeys(nextCompleted);
          setFolderLinksMap((prev) => ({ ...prev, ...newLinks }));

          // อัปเดตงานในตารางทันทีใน Memory เพื่อให้ขึ้นสถานะเสร็จสิ้นและแสดงปุ่มเปิดลิงก์ทันที 0ms
          setTasks((prevTasks) =>
            prevTasks.map((t) => {
              const u = result.updatedTasks.find(
                (item: any) => item.sheetName === t.sheetName && item.row === t.row
              );
              if (u) {
                return {
                  ...t,
                  taskName: u.taskName || t.taskName,
                  uploadUrl: u.thFolderUrl || t.uploadUrl,
                  interFolderUrl: u.interFolderUrl || t.interFolderUrl,
                  hasUploadLink: !!u.thFolderUrl,
                  status: "เสร็จสิ้น",
                  isCompleted: true,
                };
              }
              return t;
            })
          );

          // นำงานที่เสร็จแล้วออกจากรายการที่เลือก
          setSelectedTaskKeys((prev) => prev.filter((k) => !keysToSync.includes(k)));
        }
      } else {
        alert(result.error || result.message || "เกิดข้อผิดพลาดในการสร้างโฟลเดอร์");
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Sync aborted by user");
        return;
      }
      console.error(err);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setIsSyncing(false);
      setSyncingTaskKeys([]);
      syncAbortControllerRef.current = null;
    }
  };

  const filteredTasks = tasks.filter((t) => {
    const key = getTaskKey(t.sheetName, t.row);
    const thUrl = (folderLinksMap[key]?.thUrl || t.uploadUrl || "").trim();
    const taskNameCurrent = (taskNamesMap[key] || t.taskName || "").trim();
    // ถ้างานไหนยังไม่มีทั้งลิ้งก์และชื่อโฟลเดอร์บนชีต ให้ตีว่ายังไม่เสร็จ (isCompleted: false) จนกว่าจะมีทั้งคู่
    const hasBothLinkAndName = !!thUrl && !!taskNameCurrent;
    const isReallyCompleted = hasBothLinkAndName ? t.isCompleted : false;

    // หากงานเพิ่งเสร็จในรอบนี้ (justCompletedKeys) ให้แสดงไว้เสมอ ไม่ให้แถวหายไป แม้จะเปิด "เลือกเฉพาะงานที่ยังไม่เสร็จ"
    if (pendingOnly && isReallyCompleted && !justCompletedKeys.has(key)) {
      return false;
    }
    const matchSearch =
      searchTerm === "" ||
      (t.taskName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.category || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.sheetName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.assignDate || "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchSearch;
  });

  const groupedTasksByDate: Record<string, Task[]> = {};
  filteredTasks.forEach((t) => {
    if (!groupedTasksByDate[t.sheetName]) {
      groupedTasksByDate[t.sheetName] = [];
    }
    groupedTasksByDate[t.sheetName].push(t);
  });

  // เรียงลำดับงานตามแถว (Row) จากน้อยไปหามาก (Row 2, 3, 4...) เพื่อให้ตรงกับแถวบน Google Sheet 100%
  Object.keys(groupedTasksByDate).forEach((s) => {
    groupedTasksByDate[s].sort((a, b) => (a.row || 0) - (b.row || 0));
  });

  const renderDateCheckbox = (s: string) => {
    const isChecked = !isAllSelected && selectedSheets.includes(s);
    const isLatest = s === availableSheets[0];

    return (
      <label
        key={s}
        className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
          isChecked
            ? "bg-[#007AFF]/10 text-[#007AFF] font-semibold border border-[#007AFF]/25"
            : "hover:bg-black/[0.04] text-[#1C1C1E] border border-transparent"
        }`}
      >
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => handleToggleSheet(s)}
            className="w-4 h-4 text-[#007AFF] rounded-md focus:ring-[#007AFF] accent-[#007AFF] cursor-pointer"
          />
          <span>{s}</span>
        </div>
        {isLatest && (
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold uppercase ${
              isChecked
                ? "bg-[#007AFF] text-white"
                : "bg-[#34C759]/12 text-[#248A3D] border border-[#34C759]/25"
            }`}
          >
            ล่าสุด
          </span>
        )}
      </label>
    );
  };

  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter((t) => {
    const key = getTaskKey(t.sheetName, t.row);
    const thUrl = (folderLinksMap[key]?.thUrl || t.uploadUrl || "").trim();
    const taskNameCurrent = (taskNamesMap[key] || t.taskName || "").trim();
    // ถ้ายังไม่มีทั้งลิ้งก์และชื่อโฟลเดอร์ ให้ตีว่ายังไม่เสร็จ (เพิ่มไปที่การ์ดสรุป รอสร้างโฟลเดอร์)
    const hasBothLinkAndName = !!thUrl && !!taskNameCurrent;
    const isReallyCompleted = hasBothLinkAndName ? t.isCompleted : false;
    return !isReallyCompleted;
  }).length;
  const completedTasks = totalTasks - pendingTasks;

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col font-sans pb-32">
      {/* iOS 18 Frosted Glass Header */}
      <header className="bg-[#F2F2F7]/80 backdrop-blur-2xl border-b border-black/[0.06] sticky top-0 z-30 transition-all">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-gradient-to-b from-[#1C1C1E] to-[#000000] flex items-center justify-center text-white shadow-xs ring-1 ring-black/5">
              <FolderPlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-semibold text-[#1C1C1E] tracking-tight flex items-center gap-2">
                  <span>Graphic Drive Sync</span>
                </h1>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-[#34C759]/12 text-[#248A3D] px-2.5 py-0.5 rounded-full border border-[#34C759]/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse" />
                  <span>
                    {availableSheets.length > 0
                      ? `${availableSheets.length} วัน / พนักงาน ${staffList.length} คน`
                      : "เชื่อมต่อชีตแล้ว"}
                  </span>
                </span>
              </div>
              <p className="text-xs text-[#8E8E93] hidden sm:block">
                ระบบจัดการสร้างโฟลเดอร์ Google Drive (TH & INTER) และอัปเดตสถานะชีตอัตโนมัติ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowPrecreateModal(true);
                setPrecreateError(null);
                setPrecreateSuccess(false);
                setPrecreateStatusText("");
                setPrecreateProgress(0);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#007AFF] bg-white hover:bg-white/80 border border-black/[0.08] rounded-full transition-all cursor-pointer shadow-xs active:scale-95"
              title="สร้างโฟลเดอร์วันที่และ 9 หมวดหมู่หลักล่วงหน้าทั้งเดือน (TH & INTER)"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[#007AFF]" />
              <span>สร้างโฟลเดอร์ล่วงหน้า</span>
            </button>
            <a
              href="https://docs.google.com/spreadsheets/d/1QC8zcY-0Qs9FFjXxboWEKDV7h9lPI9xrtbb8tAMuEys/edit"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#1C1C1E] bg-[#E5E5EA] hover:bg-[#D1D1D6] rounded-full border border-black/[0.04] transition-all cursor-pointer shadow-xs active:scale-95"
              title="เปิดไฟล์หลัก Google Sheets"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#1C1C1E]" />
              <span>เปิดชีตหลัก</span>
              <ExternalLink className="w-3 h-3 text-[#8E8E93]" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full flex flex-col gap-6">
        {/* Error Alert Box */}
        {errorMessage && (
          <div className="bg-[#FF3B30]/10 border border-[#FF3B30]/20 rounded-2xl p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-[#D70015] shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-[#D70015]">แจ้งเตือนการเชื่อมต่อ</h4>
              <p className="text-xs text-[#D70015]/90 mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* iOS 18 Grouped Filter Card */}
        <section className="bg-white p-5 sm:p-6 rounded-[22px] border border-black/[0.06] shadow-[0_2px_16px_rgba(0,0,0,0.03)] relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
            {/* 1. Staff Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#007AFF]" />
                  <span>ชื่อพนักงาน / กราฟิก</span>
                </label>
                <span className="text-[10px] text-[#8E8E93]">เลือกหรือพิมพ์</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  list="staff-options"
                  value={assignee}
                  onChange={(e) => handleAssigneeChange(e.target.value)}
                  placeholder="พิมพ์หรือเลือกชื่อ..."
                  className="w-full px-3.5 py-2.5 text-sm bg-[#767680]/[0.08] hover:bg-[#767680]/[0.12] focus:bg-white border border-black/[0.06] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF] transition-all font-semibold text-[#1C1C1E] placeholder-[#8E8E93]"
                />
                <datalist id="staff-options">
                  {staffList.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* 2. Compact Date Dropdown with Checkboxes in front */}
            <div className="relative" ref={dateDropdownRef}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#007AFF]" />
                  <span>เลือกวันที่ต้องการดูงาน</span>
                </label>
                <span className="text-[10px] text-[#007AFF] font-semibold bg-[#007AFF]/10 border border-[#007AFF]/20 px-2 py-0.5 rounded-full">
                  {isAllSelected
                    ? "ทุกวัน (All)"
                    : `เลือกแล้ว ${selectedSheets.length} วัน`}
                </span>
              </div>

              {/* Dropdown Toggle Button */}
              <button
                type="button"
                onClick={() => setIsDateDropdownOpen((prev) => !prev)}
                disabled={isMetadataLoading}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm bg-[#767680]/[0.08] hover:bg-[#767680]/[0.12] border border-black/[0.06] rounded-xl transition-all cursor-pointer font-medium text-[#1C1C1E] focus:outline-hidden focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF] text-left"
              >
                <span className="truncate pr-1">
                  {isMetadataLoading ? (
                    <span className="text-[#8E8E93]">กำลังดึงวันที่...</span>
                  ) : isAllSelected ? (
                    <span className="text-[#007AFF] font-bold">
                      ทุกวัน (All)
                    </span>
                  ) : selectedSheets.length === 0 ? (
                    <span className="text-[#8E8E93]">เลือกวันที่...</span>
                  ) : selectedSheets.length <= 2 ? (
                    <span>{selectedSheets.join(", ")}</span>
                  ) : (
                    <span>
                      {selectedSheets.slice(0, 2).join(", ")}{" "}
                      <span className="text-xs text-[#007AFF] font-bold">
                        (+{selectedSheets.length - 2})
                      </span>
                    </span>
                  )}
                </span>
                {isDateDropdownOpen ? (
                  <ChevronUp className="w-4 h-4 text-[#8E8E93] shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#8E8E93] shrink-0" />
                )}
              </button>

              {/* Dropdown Popover with Checkboxes */}
              {isDateDropdownOpen && (
                <div className="absolute left-0 right-0 sm:w-80 sm:right-auto mt-2 bg-white/95 backdrop-blur-2xl border border-black/[0.08] rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.12)] z-50 p-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#E5E5EA]">
                    <span className="text-xs font-bold text-[#1C1C1E] flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#007AFF]" />
                      <span>เลือกวันที่</span>
                    </span>
                    <span className="text-[10px] text-[#007AFF] bg-[#007AFF]/10 border border-[#007AFF]/20 px-2 py-0.5 rounded-full font-semibold">
                      {isAllSelected
                        ? "ทุกวัน (All)"
                        : `${selectedSheets.length} วัน`}
                    </span>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                    <button
                      type="button"
                      onClick={() => handleSelectPreset("today")}
                      className={`px-2 py-1.5 text-xs font-semibold rounded-xl text-center transition-all cursor-pointer ${
                        !isAllSelected && selectedSheets.length === 1 && selectedSheets[0] === availableSheets[0]
                          ? "bg-[#007AFF] text-white shadow-xs"
                          : "bg-[#767680]/[0.08] text-[#1C1C1E] hover:bg-[#767680]/[0.14]"
                      }`}
                    >
                      วันนี้
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset("last3")}
                      className={`px-2 py-1.5 text-xs font-semibold rounded-xl text-center transition-all cursor-pointer ${
                        !isAllSelected && selectedSheets.length === 3
                          ? "bg-[#007AFF] text-white shadow-xs"
                          : "bg-[#767680]/[0.08] text-[#1C1C1E] hover:bg-[#767680]/[0.14]"
                      }`}
                    >
                      3 วันล่าสุด
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset("nov")}
                      className={`px-2 py-1.5 text-xs font-semibold rounded-xl text-center transition-all cursor-pointer ${
                        !isAllSelected &&
                        monthGroups.nov.length > 0 &&
                        monthGroups.nov.every((s) => selectedSheets.includes(s)) &&
                        selectedSheets.length === monthGroups.nov.length
                          ? "bg-[#007AFF] text-white shadow-xs"
                          : "bg-[#767680]/[0.08] text-[#1C1C1E] hover:bg-[#767680]/[0.14]"
                      }`}
                    >
                      ทั้งเดือน พ.ย.
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset("oct")}
                      className={`px-2 py-1.5 text-xs font-semibold rounded-xl text-center transition-all cursor-pointer ${
                        !isAllSelected &&
                        monthGroups.oct.length > 0 &&
                        monthGroups.oct.every((s) => selectedSheets.includes(s)) &&
                        selectedSheets.length === monthGroups.oct.length
                          ? "bg-[#007AFF] text-white shadow-xs"
                          : "bg-[#767680]/[0.08] text-[#1C1C1E] hover:bg-[#767680]/[0.14]"
                      }`}
                    >
                      ทั้งเดือน ต.ค.
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset("all")}
                    className={`w-full py-1.5 text-xs font-semibold rounded-xl text-center transition-all cursor-pointer mb-2.5 ${
                      isAllSelected
                        ? "bg-[#007AFF] text-white shadow-xs"
                        : "bg-[#767680]/[0.08] text-[#1C1C1E] hover:bg-[#767680]/[0.14]"
                    }`}
                  >
                    ทุกวัน (All)
                  </button>

                  {/* Scrollable Date Checkbox List Grouped by Month */}
                  <div className="max-h-60 overflow-y-auto space-y-3 pr-1 border-t border-[#E5E5EA] pt-2">
                    {availableSheets.length === 0 ? (
                      <div className="py-4 text-center text-xs text-[#8E8E93] italic">
                        กำลังดึงวันที่...
                      </div>
                    ) : (
                      <>
                        {/* เดือน พ.ย. */}
                        {monthGroups.nov.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between px-2.5 py-1 bg-[#F2F2F7] rounded-xl mb-1 sticky top-0 z-10">
                              <span className="text-[11px] font-semibold text-[#1C1C1E]">
                                เดือน พ.ย. ({monthGroups.nov.length} วัน)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleMonthGroup(monthGroups.nov)}
                                className="text-[10px] font-semibold text-[#007AFF] hover:underline cursor-pointer"
                              >
                                {monthGroups.nov.every((s) => selectedSheets.includes(s))
                                  ? "ยกเลิกทั้งเดือน"
                                  : "เลือกทั้งเดือน"}
                              </button>
                            </div>
                            <div className="space-y-0.5">
                              {monthGroups.nov.map((s) => renderDateCheckbox(s))}
                            </div>
                          </div>
                        )}

                        {/* เดือน ต.ค. */}
                        {monthGroups.oct.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between px-2.5 py-1 bg-[#F2F2F7] rounded-xl mb-1 sticky top-0 z-10">
                              <span className="text-[11px] font-semibold text-[#1C1C1E]">
                                เดือน ต.ค. ({monthGroups.oct.length} วัน)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleMonthGroup(monthGroups.oct)}
                                className="text-[10px] font-semibold text-[#007AFF] hover:underline cursor-pointer"
                              >
                                {monthGroups.oct.every((s) => selectedSheets.includes(s))
                                  ? "ยกเลิกทั้งเดือน"
                                  : "เลือกทั้งเดือน"}
                              </button>
                            </div>
                            <div className="space-y-0.5">
                              {monthGroups.oct.map((s) => renderDateCheckbox(s))}
                            </div>
                          </div>
                        )}

                        {/* แผ่นงานอื่นๆ */}
                        {monthGroups.other.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between px-2.5 py-1 bg-[#F2F2F7] rounded-xl mb-1 sticky top-0 z-10">
                              <span className="text-[11px] font-semibold text-[#1C1C1E]">
                                แผ่นงานอื่นๆ ({monthGroups.other.length} แผ่น)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleMonthGroup(monthGroups.other)}
                                className="text-[10px] font-semibold text-[#007AFF] hover:underline cursor-pointer"
                              >
                                {monthGroups.other.every((s) => selectedSheets.includes(s))
                                  ? "ยกเลิก"
                                  : "เลือกทั้งหมด"}
                              </button>
                            </div>
                            <div className="space-y-0.5">
                              {monthGroups.other.map((s) => renderDateCheckbox(s))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Dropdown Footer */}
                  <div className="mt-3 pt-2.5 border-t border-[#E5E5EA] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSheets([]);
                        localStorage.setItem("gds_selectedSheets", JSON.stringify([]));
                        setTasks([]);
                        setStreamingProgress(null);
                        if (abortControllerRef.current) {
                          abortControllerRef.current.abort();
                        }
                        setIsLoading(false);
                      }}
                      className="text-[11px] text-[#8E8E93] hover:text-[#FF3B30] font-medium cursor-pointer transition-colors"
                    >
                      ล้างการเลือกทั้งหมด
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsDateDropdownOpen(false)}
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-[#007AFF] hover:bg-[#0066D6] rounded-xl cursor-pointer transition-all shadow-xs"
                    >
                      ตกลง
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Search Category */}
            <div>
              <label className="block text-xs font-semibold text-[#8E8E93] mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-[#007AFF]" />
                <span>ค้นหาหมวดหมู่งาน</span>
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="เช่น หวย APB, สล็อต, บอล..."
                className="w-full px-3.5 py-2.5 text-sm bg-[#767680]/[0.08] hover:bg-[#767680]/[0.12] focus:bg-white border border-black/[0.06] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF] transition-all font-medium text-[#1C1C1E] placeholder-[#8E8E93]"
              />
            </div>

            {/* 4. Refresh Button */}
            <div>
              <button
                onClick={() => {
                  clientSheetCacheRef.current = {};
                  fetchTasks(assignee, selectedSheets, true);
                }}
                disabled={isLoading || isMetadataLoading || selectedSheets.length === 0}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#007AFF] hover:bg-[#0066D6] active:scale-[0.98] rounded-xl shadow-[0_4px_14px_rgba(0,122,255,0.3)] transition-all disabled:opacity-40 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                <span>
                  {isMetadataLoading
                    ? "กำลังดึงวันที่..."
                    : isLoading
                    ? "กำลังค้นหา..."
                    : "ค้นหางานของฉัน"}
                </span>
              </button>
            </div>
          </div>

          {/* Sub-bar: Status Filter & Selection Summary */}
          <div className="mt-4 pt-3.5 border-t border-[#E5E5EA] flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setPendingOnly((prev) => !prev)}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                  pendingOnly
                    ? "bg-[#34C759]/12 text-[#248A3D] border border-[#34C759]/25 shadow-2xs"
                    : "bg-[#767680]/[0.08] text-[#8E8E93] border border-black/[0.04] hover:bg-[#767680]/[0.14]"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full transition-all ${
                    pendingOnly ? "bg-[#34C759] ring-2 ring-[#34C759]/30 animate-pulse" : "bg-[#8E8E93]"
                  }`}
                />
                <span>แสดงเฉพาะงานที่ยังไม่เสร็จ</span>
              </button>

              {!isAllSelected && selectedSheets.length > 0 && !selectedSheets.includes("ALL") && (
                <div className="flex items-center flex-wrap gap-1.5 text-xs text-[#8E8E93]">
                  <span className="font-semibold text-[#1C1C1E] shrink-0">กำลังดู:</span>
                  <div className="flex items-center flex-wrap gap-1.5">
                    {selectedSheets.map((sheetName) => (
                      <span
                        key={sheetName}
                        className="inline-flex items-center gap-1 font-semibold text-[#007AFF] bg-[#007AFF]/10 border border-[#007AFF]/20 px-2.5 py-0.5 rounded-full transition-all text-xs"
                      >
                        <span>{sheetName}</span>
                        {selectedSheets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleToggleSheet(sheetName)}
                            className="text-[#007AFF]/70 hover:text-[#FF3B30] transition-colors cursor-pointer ml-0.5 p-0.5"
                            title={`ปิดดูวันที่ ${sheetName}`}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <span className="text-[#8E8E93] text-xs">
              พบทั้งหมด <b className="text-[#1C1C1E] font-bold">{filteredTasks.length}</b> รายการของ <b>{assignee}</b>
            </span>
          </div>
        </section>

        {/* iOS 18 Stats Summary Banner */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="bg-white p-4.5 rounded-[20px] border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center justify-between hover:shadow-xs transition-all group">
            <div>
              <p className="text-xs font-semibold text-[#8E8E93]">งานทั้งหมดของ &quot;{assignee}&quot;</p>
              <p className="text-2xl font-bold text-[#1C1C1E] mt-0.5">{totalTasks}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4.5 rounded-[20px] border border-[#FF9500]/20 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center justify-between hover:shadow-xs transition-all group">
            <div>
              <p className="text-xs font-semibold text-[#C97700]">รอสร้างโฟลเดอร์ (ยังไม่เสร็จ)</p>
              <p className="text-2xl font-bold text-[#FF9500] mt-0.5">{pendingTasks}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#FF9500]/12 text-[#FF9500] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4.5 rounded-[20px] border border-[#34C759]/20 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center justify-between hover:shadow-xs transition-all group">
            <div>
              <p className="text-xs font-semibold text-[#248A3D]">สร้างโฟลเดอร์เสร็จแล้ว</p>
              <p className="text-2xl font-bold text-[#248A3D] mt-0.5">{completedTasks}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#34C759]/12 text-[#34C759] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </section>

        {/* Task List Grouped by Date */}
        {isMetadataLoading ? (
          <section className="bg-white rounded-[22px] border border-black/[0.06] p-12 text-center shadow-[0_2px_16px_rgba(0,0,0,0.03)]">
            <div className="w-12 h-12 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center mx-auto mb-3 shadow-2xs">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <h4 className="text-base font-semibold text-[#1C1C1E]">กำลังเชื่อมต่อ Google Sheets...</h4>
            <p className="text-xs text-[#78716C] mt-1">กำลังดึงแท็บวันที่และรายชื่อพนักงานจริงจากชีต กรุณารอสักครู่</p>
          </section>
        ) : (isLoading || (streamingProgress && Object.keys(groupedTasksByDate).length === 0)) ? (
          <section className="bg-white rounded-[22px] border border-black/[0.06] p-12 text-center shadow-[0_2px_16px_rgba(0,0,0,0.03)]">
            <div className="w-12 h-12 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center mx-auto mb-3 shadow-2xs">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <h4 className="text-base font-semibold text-[#1C1C1E]">กำลังค้นหางานจาก Google Sheets...</h4>
            <p className="text-xs text-[#8E8E93] mt-1">
              {streamingProgress
                ? `กำลังตรวจสอบ ${streamingProgress.activeSheet ? `"${streamingProgress.activeSheet}"` : ""} (ข้อมูล ${streamingProgress.current}/${streamingProgress.total} วัน)`
                : "กรุณารอสักครู่ ระบบกำลังดึงข้อมูลล่าสุด"}
            </p>
          </section>
        ) : selectedSheets.length === 0 ? (
          <section className="bg-white rounded-[22px] border border-black/[0.06] p-12 text-center text-[#8E8E93] shadow-[0_2px_16px_rgba(0,0,0,0.03)]">
            <Calendar className="w-10 h-10 mx-auto mb-2 text-[#8E8E93]" />
            <h4 className="font-semibold text-[#1C1C1E] text-base">
              ยังไม่ได้เลือกวันที่
            </h4>
            <p className="text-xs text-[#8E8E93] mt-1">
              กรุณาคลิกเลือกวันที่ต้องการดูงานจากเมนูด้านบน หรือกดเลือกดูงานวันล่าสุด
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  if (availableSheets.length > 0) {
                    const latest = [availableSheets[0]];
                    setSelectedSheets(latest);
                    localStorage.setItem("gds_selectedSheets", JSON.stringify(latest));
                    const allCached = latest.flatMap((s) => clientSheetCacheRef.current[s] || []);
                    if (allCached.length > 0) {
                      applyTasksToState(allCached, assignee);
                    }
                    fetchTasks(assignee, latest, false);
                  }
                }}
                className="px-4 py-2 bg-[#007AFF] text-white hover:bg-[#0066D6] active:scale-95 text-xs font-semibold rounded-full shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5 text-white" />
                <span>เลือกวันล่าสุด ({availableSheets[0] || "วันล่าสุด"})</span>
              </button>
              <button
                onClick={() => handleSelectPreset("all")}
                className="px-4 py-2 bg-[#E5E5EA] text-[#1C1C1E] hover:bg-[#D1D1D6] active:scale-95 text-xs font-semibold rounded-full transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-[#1C1C1E]" />
                <span>ดูทุกวัน (All)</span>
              </button>
            </div>
          </section>
        ) : Object.keys(groupedTasksByDate).length === 0 ? (
          pendingOnly && tasks.length > 0 && pendingTasks === 0 ? (
            <section className="bg-[#34C759]/10 border border-[#34C759]/20 rounded-[22px] p-8 text-center shadow-xs">
              <div className="w-12 h-12 bg-[#34C759] text-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-[#248A3D]">
                ยอดเยี่ยมมาก! งานทั้งหมดของ &quot;{assignee}&quot; ในวันที่ {sheetName} เสร็จสิ้นครบแล้ว
              </h4>
              <p className="text-xs text-[#248A3D]/90 mt-1.5 max-w-md mx-auto leading-relaxed">
                คุณได้สร้างโฟลเดอร์และอัปงานครบแล้วทั้ง <b>{completedTasks}</b> รายการ ไม่มีงานที่ยังค้างอยู่
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const targetDate =
                      selectedSheets.length === 1 && selectedSheets[0] !== "ALL"
                        ? selectedSheets[0]
                        : tasks[0]?.sheetName || availableSheets[0] || "";
                    handleCopyReportMessage(targetDate);
                  }}
                  className={`px-4 py-2 text-xs font-semibold rounded-full shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                    copiedDateSheet
                      ? "bg-[#248A3D] text-white shadow-sm"
                      : "bg-[#007AFF] text-white hover:bg-[#0066D6]"
                  }`}
                  title="คัดลอกข้อความสรุปส่งงานเข้าแชท"
                >
                  {copiedDateSheet ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>คัดลอกข้อความส่งงานเรียบร้อยแล้ว!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>คัดลอกข้อความส่งงาน</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setPendingOnly(false)}
                  className="px-4 py-2 bg-white text-[#248A3D] hover:bg-[#34C759]/10 border border-[#34C759]/25 text-xs font-semibold rounded-full shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderCheck className="w-4 h-4 text-[#248A3D]" />
                  <span>คลิกดูรายการงานที่อัปเสร็จแล้ว ({completedTasks} งาน)</span>
                </button>
              </div>
            </section>
          ) : (
            <section className="bg-white rounded-[22px] border border-black/[0.06] p-12 text-center text-[#8E8E93] shadow-[0_2px_16px_rgba(0,0,0,0.03)]">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 text-[#8E8E93]" />
              <h4 className="font-semibold text-[#1C1C1E] text-base">
                ไม่พบงานที่มอบหมายให้ &quot;{assignee}&quot; ในแผ่นงาน {sheetName}
              </h4>
              <p className="text-xs text-[#8E8E93] mt-1">
                ลองตรวจสอบชื่อผู้รับงาน หรือเลือก <b>&quot;ทุกวัน (All)&quot;</b> เพื่อค้นหา
              </p>
              <button
                onClick={() => handleSelectPreset("all")}
                className="mt-4 px-4 py-2 bg-[#007AFF] text-white hover:bg-[#0066D6] active:scale-95 text-xs font-semibold rounded-full shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>ค้นหางานทุกวัน (All)</span>
              </button>
            </section>
          )
        ) : (
          <>
            {/* Streaming Progress Banner */}
            {streamingProgress && (
              <div className="bg-[#007AFF]/10 border border-[#007AFF]/20 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#007AFF] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#007AFF]"></span>
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-[#1C1C1E] flex items-center gap-1.5 flex-wrap">
                      <span>กำลังทยอยดึงข้อมูลจาก Google Sheets...</span>
                      <span className="bg-[#007AFF]/15 text-[#007AFF] text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-[#007AFF]/20">
                        ข้อมูล {streamingProgress.current}/{streamingProgress.total} วัน
                      </span>
                    </p>
                    {streamingProgress.activeSheet && (
                      <p className="text-[11px] text-[#8E8E93] mt-0.5">
                        แผ่นงานที่ดึงเสร็จแล้วจะนำขึ้นมาแสดงทันที (กำลังดึง: {streamingProgress.activeSheet})
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (abortControllerRef.current) abortControllerRef.current.abort();
                    setStreamingProgress(null);
                    setIsLoading(false);
                  }}
                  className="text-xs font-semibold text-[#8E8E93] hover:text-[#1C1C1E] bg-white hover:bg-[#F2F2F7] border border-black/[0.08] px-3 py-1.5 rounded-full transition-all shadow-xs cursor-pointer shrink-0"
                >
                  หยุดโหลดต่อ
                </button>
              </div>
            )}

            {Object.keys(groupedTasksByDate)
              .sort((a, b) => {
                const idxA = availableSheets.indexOf(a);
                const idxB = availableSheets.indexOf(b);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                return 0;
              })
              .map((dateSheet) => {
            const dateTasks = groupedTasksByDate[dateSheet];

            return (
              <section
                key={dateSheet}
                className="bg-white rounded-[22px] border border-black/[0.08] shadow-[0_2px_16px_rgba(0,0,0,0.03)] overflow-hidden mb-6"
              >
                {/* Date Group Header */}
                <div className="bg-[#F2F2F7]/80 px-5 py-3.5 border-b border-black/[0.06] flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center shadow-2xs">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-[#1C1C1E]">
                        งานประจำวันที่
                      </h3>
                      <span className="text-xs text-[#007AFF] font-bold bg-[#007AFF]/10 px-2.5 py-0.5 rounded-full border border-[#007AFF]/20">
                        {dateSheet}
                      </span>
                      <span className="text-xs bg-black/5 text-[#8E8E93] font-semibold px-2 py-0.5 rounded-full">
                        {dateTasks.length} รายการ
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleCopyReportMessage(dateSheet)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer shadow-2xs active:scale-95 ${
                        copiedDateSheet === dateSheet
                          ? "bg-[#34C759] text-white border border-[#34C759] shadow-xs"
                          : "bg-white hover:bg-[#007AFF]/10 text-[#007AFF] border border-[#007AFF]/25 hover:border-[#007AFF]/40"
                      }`}
                      title={generateWorkReportMessage(dateSheet)}
                    >
                      {copiedDateSheet === dateSheet ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>คัดลอกข้อความส่งงานแล้ว!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>คัดลอกข้อความส่งงาน</span>
                        </>
                      )}
                    </button>

                    <span className="text-[11px] text-[#8E8E93] font-mono hidden sm:inline">
                      แถว #{dateTasks[0]?.row} - #{dateTasks[dateTasks.length - 1]?.row}
                    </span>
                  </div>
                </div>

                {/* Table for this date */}
                <div className="overflow-x-auto rounded-b-[22px]">
                  <table className="w-full text-left border-separate border-spacing-0">
                    <thead>
                      <tr className="bg-[#F2F2F7] text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider">
                        <th className="py-3.5 px-3 w-12 text-center text-[#8E8E93] border-b border-[#E5E5EA]">เลือก</th>
                        <th className="py-3.5 px-2 w-14 text-center text-[#8E8E93] border-b border-[#E5E5EA]">แถว</th>
                        <th className="py-3.5 px-3 whitespace-nowrap text-center text-[#8E8E93] border-b border-[#E5E5EA]">หมวดหมู่</th>
                        <th className="py-3.5 px-2.5 w-32 max-w-[150px] whitespace-nowrap text-center text-[#8E8E93] border-b border-[#E5E5EA]">ใบบรีฟ</th>
                        <th className="py-3.5 px-2 w-12 text-center text-[#8E8E93] border-b border-[#E5E5EA]">No.</th>
                        <th className="py-3.5 px-4 min-w-[270px] text-[#8E8E93] border-b border-[#E5E5EA]">ชื่องาน/ชื่อโฟลเดอร์ (TH)</th>
                        <th className="py-3.5 px-3 whitespace-nowrap text-center text-[#8E8E93] border-b border-[#E5E5EA]">ผู้รับงาน</th>
                        <th className="py-3.5 px-3 whitespace-nowrap text-center text-[#8E8E93] border-b border-[#E5E5EA]">วันที่จ่ายงาน</th>
                        <th className="py-3.5 px-3 w-28 whitespace-nowrap text-center text-[#8E8E93] border-b border-[#E5E5EA]">สถานะ</th>
                        <th className="py-3.5 px-3 w-40 whitespace-nowrap text-center text-[#8E8E93] border-b border-[#E5E5EA]">ลิงก์โฟลเดอร์ (TH & INTER)</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm bg-white">
                      {dateTasks.map((task, idx) => {
                        const key = getTaskKey(task.sheetName, task.row);
                        const isSelected = selectedTaskKeys.includes(key);
                        const isSyncingThis = syncingTaskKeys.includes(key);
                        const isJustCompleted = justCompletedKeys.has(key);
                        const isLastRow = idx === dateTasks.length - 1;
                        const cellBorder = isLastRow ? "" : "border-b border-[#E5E5EA]/70";
                        const cornerBl = isLastRow ? "rounded-bl-[22px]" : "";
                        const cornerBr = isLastRow ? "rounded-br-[22px]" : "";
                        const catStyle = CATEGORY_COLORS[task.category] || {
                          bg: "bg-[#767680]/10",
                          text: "text-[#636366]",
                          border: "border-[#767680]/20",
                          dot: "bg-[#8E8E93]",
                        };

                        return (
                          <tr
                            key={key}
                            onClick={() => toggleSelectTask(key)}
                            className={`transition-all duration-150 cursor-pointer ${
                              isSyncingThis
                                ? "bg-[#FF9500]/10 animate-pulse"
                                : isJustCompleted
                                ? "bg-[#34C759]/[0.08] hover:bg-[#34C759]/[0.12]"
                                : isSelected
                                ? "bg-[#007AFF]/[0.08] hover:bg-[#007AFF]/[0.12]"
                                : "hover:bg-[#F2F2F7]/50"
                            }`}
                          >
                            <td className={`py-3.5 px-3 text-center ${cellBorder} ${cornerBl}`} onClick={(e) => e.stopPropagation()}>
                              {isSyncingThis ? (
                                <Loader2 className="w-5 h-5 text-[#007AFF] animate-spin mx-auto" />
                              ) : (
                                <button
                                  onClick={() => toggleSelectTask(key)}
                                  className="text-[#007AFF] focus:outline-hidden transition-transform active:scale-90"
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-5 h-5 text-[#007AFF]" />
                                  ) : (
                                    <Square className="w-5 h-5 text-[#D1D1D6] hover:text-[#007AFF] transition-colors" />
                                  )}
                                </button>
                              )}
                            </td>
                            <td className={`py-3.5 px-2 text-center text-xs font-mono font-semibold text-[#8E8E93] ${cellBorder}`}>
                              #{task.row}
                            </td>
                            <td className={`py-3.5 px-3 text-center whitespace-nowrap ${cellBorder}`}>
                              <span
                                className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border ${catStyle.bg} ${catStyle.text} ${catStyle.border} shadow-2xs`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${catStyle.dot}`} />
                                <span>{task.category}</span>
                              </span>
                            </td>
                            <td className={`py-3.5 px-2.5 w-32 max-w-[150px] text-center ${cellBorder}`} onClick={(e) => e.stopPropagation()}>
                              {(() => {
                                const rawLink = (task.briefLink || "").trim();
                                const titleText = (task.briefTitle || "").trim() || "ใบบรีฟ";
                                let targetUrl: string | null = null;

                                if (rawLink) {
                                  targetUrl = rawLink;
                                } else if (titleText && titleText !== "-") {
                                  targetUrl = `/api/brief?title=${encodeURIComponent(titleText)}&category=${encodeURIComponent(task.category || "")}`;
                                }

                                if (targetUrl) {
                                  return (
                                    <a
                                      href={targetUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-[#007AFF] hover:text-[#0066D6] bg-[#007AFF]/10 hover:bg-[#007AFF]/15 border border-[#007AFF]/20 px-2.5 py-1 rounded-xl transition-all shadow-2xs max-w-[140px] mx-auto group"
                                      title={`คลิกเปิดใบบรีฟ Google Slides: ${titleText}`}
                                    >
                                      <ExternalLink className="w-3 h-3 text-[#007AFF] group-hover:text-[#0066D6] shrink-0" />
                                      <span className="truncate">{titleText}</span>
                                    </a>
                                  );
                                }

                                return <span className="text-xs text-[#8E8E93]">-</span>;
                              })()}
                            </td>
                            <td className={`py-3.5 px-2 text-center font-mono font-bold text-[#1C1C1E] ${cellBorder}`}>
                              {task.no || "-"}
                            </td>
                            <td className={`py-3.5 px-4 min-w-[270px] ${cellBorder}`} onClick={(e) => e.stopPropagation()}>
                              {(() => {
                                const currentInput = (taskNamesMap[key] ?? "").trim();
                                const originalName = (task.taskName || "").trim();
                                const thUrl = (folderLinksMap[key]?.thUrl || task.uploadUrl || "").trim();
                                const isDirtyRename = !!thUrl && !!currentInput && currentInput !== originalName;

                                return (
                                  <div className="flex flex-col gap-1.5">
                                    <div className="relative">
                                      <input
                                        type="text"
                                        value={taskNamesMap[key] ?? ""}
                                        onChange={(e) => {
                                          setTaskNamesMap((prev) => ({
                                            ...prev,
                                            [key]: e.target.value,
                                          }));
                                        }}
                                        placeholder="พิมพ์ชื่องาน/ชื่อโฟลเดอร์..."
                                        className="w-full px-3 py-1.5 text-xs font-medium bg-[#767680]/[0.06] hover:bg-[#767680]/[0.1] focus:bg-white border border-black/[0.06] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all pr-7 text-[#1C1C1E] placeholder-[#8E8E93] shadow-2xs"
                                      />
                                      <Edit3 className="w-3.5 h-3.5 text-[#8E8E93] absolute right-2.5 top-2 pointer-events-none" />
                                    </div>
                                    {isDirtyRename && (
                                      <div className="flex items-center gap-1 text-[10px] text-[#FF9500] font-medium">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF9500] animate-pulse" />
                                        <span>พร้อมเปลี่ยนชื่อโฟลเดอร์ใน Drive</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className={`py-3.5 px-3 text-center whitespace-nowrap ${cellBorder}`}>
                              {task.assignee ? (
                                <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-[#1C1C1E] bg-[#767680]/[0.08] border border-black/[0.06] shadow-2xs">
                                  <User className="w-3 h-3 text-[#007AFF] shrink-0" />
                                  <span>{task.assignee}</span>
                                </span>
                              ) : (
                                <span className="text-xs text-[#8E8E93]">-</span>
                              )}
                            </td>
                            <td className={`py-3.5 px-3 text-center whitespace-nowrap ${cellBorder}`}>
                              {(() => {
                                const rawDate = task.assignDate ? String(task.assignDate).trim() : "";
                                if (!rawDate || rawDate === "-") {
                                  return <span className="text-xs text-[#8E8E93]">-</span>;
                                }
                                const dayInfo = getThaiDayOfWeekInfo(rawDate);
                                if (dayInfo) {
                                  return (
                                    <span
                                      className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${dayInfo.bg} ${dayInfo.text} ${dayInfo.border} shadow-2xs`}
                                      title={`วันที่จ่ายงาน (Col K): ${dayInfo.name} ที่ ${rawDate}`}
                                    >
                                      <span className="font-bold">{dayInfo.short}</span>
                                      <span className="font-semibold tabular-nums">{rawDate}</span>
                                    </span>
                                  );
                                }
                                return (
                                  <span
                                    className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-[#1C1C1E] bg-[#F2F2F7] border border-black/[0.06] shadow-2xs"
                                    title={`วันที่จ่ายงาน (Col K): ${rawDate}`}
                                  >
                                    <Calendar className="w-3 h-3 text-[#007AFF] shrink-0" />
                                    <span className="tabular-nums">{rawDate}</span>
                                  </span>
                                );
                              })()}
                            </td>
                            <td className={`py-3.5 px-3 text-center whitespace-nowrap ${cellBorder}`}>
                              {(() => {
                                if (isSyncingThis) {
                                  return (
                                    <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-[#FF9500]/10 text-[#C97700] border border-[#FF9500]/20 shadow-2xs">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-[#FF9500]" />
                                      <span>กำลังสร้าง...</span>
                                    </span>
                                  );
                                }

                                const rawStatus = cleanStatus(task.status);
                                const displayStatus = rawStatus || "-";
                                const isStatusDone = displayStatus.includes("เสร็จ");
                                const isStatusReview = displayStatus.includes("ตรวจ") || displayStatus.includes("แก้");

                                if (isStatusDone) {
                                  return (
                                    <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-[#34C759]/12 text-[#248A3D] border border-[#34C759]/25 shadow-2xs">
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#248A3D]" />
                                      <span>{displayStatus}</span>
                                    </span>
                                  );
                                }

                                if (isStatusReview) {
                                  return (
                                    <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-[#FF9500]/12 text-[#C97700] border border-[#FF9500]/25 shadow-2xs">
                                      <Clock className="w-3.5 h-3.5 shrink-0 text-[#C97700]" />
                                      <span>{displayStatus}</span>
                                    </span>
                                  );
                                }

                                return (
                                  <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-[#767680]/12 text-[#636366] border border-[#767680]/20 shadow-2xs">
                                    <Clock className="w-3.5 h-3.5 shrink-0 text-[#8E8E93]" />
                                    <span>{displayStatus}</span>
                                  </span>
                                );
                              })()}
                            </td>
                            <td className={`py-3.5 px-3 text-center ${cellBorder} ${cornerBr}`} onClick={(e) => e.stopPropagation()}>
                              {(() => {
                                const linkInfo = folderLinksMap[key];
                                const thUrl = (linkInfo?.thUrl || task.uploadUrl || "").trim();
                                const interUrl = (linkInfo?.interUrl || task.interFolderUrl || "").trim();

                                if (isSyncingThis) {
                                  return (
                                    <span className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-[#FF9500] bg-[#FF9500]/10 px-2.5 py-1 rounded-full border border-[#FF9500]/20 shadow-2xs">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF9500] shrink-0" />
                                      <span>กำลังสร้างโฟลเดอร์...</span>
                                    </span>
                                  );
                                }

                                if (!thUrl && !interUrl) {
                                  return (
                                    <span className="text-xs text-[#8E8E93] italic">รอสร้างโฟลเดอร์</span>
                                  );
                                }

                                return (
                                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                    {thUrl ? (
                                      <a
                                        href={thUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#34C759] hover:bg-[#2DB34E] active:scale-95 border border-[#2DB34E] px-3 py-1 rounded-full transition-all shadow-xs hover:scale-102 group whitespace-nowrap"
                                        title="คลิกเพื่อเปิดโฟลเดอร์ Google Drive (TH)"
                                      >
                                        <span>TH</span>
                                        <ExternalLink className="w-3 h-3 text-white/80 group-hover:text-white shrink-0" />
                                      </a>
                                    ) : (
                                      <span
                                        className="text-[10px] text-[#C97700] bg-[#FF9500]/10 px-2 py-0.5 rounded-full border border-[#FF9500]/20 font-medium"
                                        title="ติ๊กเลือกแถวนี้แล้วกดปุ่มสร้างโฟลเดอร์ด้านล่างเพื่อดึงลิงก์ TH"
                                      >
                                        รอเชื่อม TH
                                      </span>
                                    )}

                                    {interUrl ? (
                                      <a
                                        href={interUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#007AFF] hover:bg-[#0066D6] active:scale-95 border border-[#0066D6] px-3 py-1 rounded-full transition-all shadow-xs hover:scale-102 group whitespace-nowrap"
                                        title="คลิกเพื่อเปิดโฟลเดอร์ Google Drive (INTER)"
                                      >
                                        <span>INTER</span>
                                        <ExternalLink className="w-3 h-3 text-white/80 group-hover:text-white shrink-0" />
                                      </a>
                                    ) : null}
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          </>
        )}
      </main>

      {/* iOS 18 Dynamic Island Floating Dock */}
      <aside className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-2xl bg-[#000000]/90 backdrop-blur-2xl border border-white/15 py-2.5 px-4 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.4)] text-white transition-all ring-1 ring-white/10">
        {isSyncing ? (
          // สถานะกำลังส่งคำขอสร้างโฟลเดอร์ (มีปุ่มยกเลิกการส่งคำขอ)
          <div className="flex items-center justify-between flex-wrap gap-2 w-full">
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-[#007AFF]" />
              <span className="text-xs sm:text-sm font-semibold text-white">
                กำลังสร้างโฟลเดอร์และอัปเดตชีต... ({selectedTaskKeys.length} งาน)
              </span>
            </div>

            <button
              onClick={handleCancelSync}
              className="px-4 py-1.5 text-xs sm:text-sm font-semibold text-[#FF3B30] bg-[#FF3B30]/20 hover:bg-[#FF3B30]/30 active:scale-95 border border-[#FF3B30]/30 rounded-full transition-all cursor-pointer inline-flex items-center gap-1.5"
              title="ยกเลิกการสร้างโฟลเดอร์ หรือกดปุ่ม Esc"
            >
              <X className="w-4 h-4 text-[#FF3B30]" />
              <span>ยกเลิก (Esc)</span>
            </button>
          </div>
        ) : (
          // สถานะปกติพร้อมกดสร้างโฟลเดอร์
          <div className="flex items-center justify-between flex-wrap gap-2 w-full">
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleSelectAllPending}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 active:scale-95 rounded-full border border-white/10 transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5 text-[#007AFF]" />
                <span>เลือกงานที่ยังไม่เสร็จ</span>
              </button>
              <span className="text-xs text-white/70 font-medium">
                เลือกไว้ <span className="bg-white/20 text-white px-2 py-0.5 rounded-full font-mono font-bold text-xs">{selectedTaskKeys.length}</span> งาน
              </span>
            </div>

            <button
              onClick={handleSyncFolders}
              disabled={selectedTaskKeys.length === 0}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#007AFF] hover:bg-[#0066D6] active:scale-[0.98] rounded-full shadow-[0_4px_16px_rgba(0,122,255,0.4)] disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>สร้างโฟลเดอร์ TH & INTER ({selectedTaskKeys.length} งาน)</span>
            </button>
          </div>
        )}
      </aside>

      {/* Modal: สร้างโฟลเดอร์ล่วงหน้า (iOS 18 Sheet Modal) */}
      {showPrecreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[28px] max-w-xl w-full p-6 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.25)] border border-black/[0.08] max-h-[90vh] overflow-y-auto">
            {/* Grab Indicator Pill */}
            <div className="w-10 h-1 bg-[#D1D1D6] rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between border-b border-[#E5E5EA] pb-4">
              <h3 className="text-base sm:text-lg font-semibold text-[#1C1C1E] flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-[#007AFF]" />
                <span>สร้างโฟลเดอร์ล่วงหน้า (TH & INTER)</span>
              </h3>
              <button
                onClick={() => {
                  if (isPrecreating) handleCancelPrecreate();
                  setShowPrecreateModal(false);
                }}
                className="w-7 h-7 rounded-full bg-[#E5E5EA] hover:bg-[#D1D1D6] flex items-center justify-center text-[#8E8E93] hover:text-[#1C1C1E] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs sm:text-sm text-[#3A3A3C]">
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                ระบบจะสร้างโฟลเดอร์วันที่ตามมาตรฐาน พร้อมสร้างโฟลเดอร์ 9 หมวดหมู่หลักไว้ข้างในล่วงหน้า (หากวันไหนมีโฟลเดอร์เดิมอยู่แล้ว ระบบจะไม่สร้างซ้ำ แต่จะช่วยเติมหมวดหมู่ที่ยังขาดให้ครบ)
              </p>

              {/* เลือกแผ่นงาน/เดือนอ้างอิง */}
              <div>
                <label className="block text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-1.5">
                  เลือกเดือน / แผ่นงานอ้างอิง (เพื่อดึงโฟลเดอร์หลัก TH & INTER จากแถว 3):
                </label>
                <select
                  value={precreateSheet || availableSheets[0] || ""}
                  onChange={(e) => setPrecreateSheet(e.target.value)}
                  disabled={isPrecreating}
                  className="w-full px-3.5 py-2 text-xs font-semibold bg-[#767680]/[0.08] hover:bg-[#767680]/[0.12] focus:bg-white border border-black/[0.06] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF] text-[#1C1C1E] transition-all"
                >
                  {availableSheets.map((s) => (
                    <option key={s} value={s}>
                      แผ่นงาน: {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* เลือกช่วงวันที่ */}
              <div>
                <label className="block text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-1.5">
                  เลือกช่วงวันที่ต้องการสร้าง:
                </label>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => { setPrecreateStartDay(1); setPrecreateEndDay(30); }}
                    disabled={isPrecreating}
                    className="px-3 py-1.5 text-xs font-semibold rounded-full bg-[#767680]/[0.08] hover:bg-[#767680]/[0.14] text-[#1C1C1E] active:scale-95 transition-all cursor-pointer"
                  >
                    วันที่ 1 - 30 (ทั้งเดือน)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPrecreateStartDay(1); setPrecreateEndDay(15); }}
                    disabled={isPrecreating}
                    className="px-3 py-1.5 text-xs font-semibold rounded-full bg-[#767680]/[0.08] hover:bg-[#767680]/[0.14] text-[#1C1C1E] active:scale-95 transition-all cursor-pointer"
                  >
                    วันที่ 1 - 15 (ครึ่งแรก)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPrecreateStartDay(16); setPrecreateEndDay(30); }}
                    disabled={isPrecreating}
                    className="px-3 py-1.5 text-xs font-semibold rounded-full bg-[#767680]/[0.08] hover:bg-[#767680]/[0.14] text-[#1C1C1E] active:scale-95 transition-all cursor-pointer"
                  >
                    วันที่ 16 - 30 (ครึ่งหลัง)
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <span className="text-[11px] text-[#8E8E93] font-medium">ตั้งแต่วันที่:</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={precreateStartDay}
                      onChange={(e) => setPrecreateStartDay(parseInt(e.target.value, 10) || 1)}
                      disabled={isPrecreating}
                      className="w-full px-3.5 py-2 text-xs font-semibold bg-[#767680]/[0.08] focus:bg-white border border-black/[0.06] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF] text-[#1C1C1E] transition-all"
                    />
                  </div>
                  <span className="text-xs font-semibold text-[#8E8E93] mt-4">ถึง</span>
                  <div className="flex-1">
                    <span className="text-[11px] text-[#8E8E93] font-medium">ถึงวันที่:</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={precreateEndDay}
                      onChange={(e) => setPrecreateEndDay(parseInt(e.target.value, 10) || 30)}
                      disabled={isPrecreating}
                      className="w-full px-3.5 py-2 text-xs font-semibold bg-[#767680]/[0.08] focus:bg-white border border-black/[0.06] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF] text-[#1C1C1E] transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* แสดง 9 หมวดหมู่หลักที่จะถูกสร้าง */}
              <div>
                <label className="block text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-1.5">
                  9 หมวดหมู่หลักที่จะสร้างไว้ล่วงหน้า:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "สล็อต SLOT",
                    "คาสิโน CASINO",
                    "บอล FOOTBALL",
                    "มวย BOXING",
                    "ไก่ชน COCK FIGHTING",
                    "วัวชน COW FIGHTING",
                    "กีฬาอื่นๆ Other Sports",
                    "หวย APB",
                    "UFA NEWS",
                  ].map((cat) => (
                    <span
                      key={cat}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#007AFF]/10 text-[#007AFF] border border-[#007AFF]/20"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-[#8E8E93] mt-1.5 italic">
                  * จะไม่สร้างหมวดหมู่ &quot;แคมเปญ&quot; และ &quot;กิจกรรมกลาง&quot; ล่วงหน้าตามที่กำหนดไว้
                </p>
              </div>

              {/* แถบแสดงความคืบหน้า (Progress Bar) */}
              {(isPrecreating || precreateSuccess || precreateError) && (
                <div className="p-4 bg-[#F2F2F7] border border-black/[0.06] rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className={precreateError ? "text-[#FF3B30]" : precreateSuccess ? "text-[#34C759]" : "text-[#007AFF]"}>
                      {precreateStatusText || (isPrecreating ? "กำลังดำเนินการ..." : "")}
                    </span>
                    <span className="font-mono text-[#8E8E93]">{precreateProgress}%</span>
                  </div>
                  <div className="w-full bg-[#E5E5EA] h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        precreateError
                          ? "bg-[#FF3B30]"
                          : precreateSuccess
                          ? "bg-[#34C759]"
                          : "bg-[#007AFF]"
                      }`}
                      style={{ width: `${precreateProgress}%` }}
                    />
                  </div>
                  {precreateError && (
                    <p className="text-xs text-[#FF3B30] font-medium">{precreateError}</p>
                  )}
                </div>
              )}
            </div>

            {/* ปุ่มกดล่าง Modal */}
            <div className="border-t border-[#E5E5EA] pt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isPrecreating) handleCancelPrecreate();
                  setShowPrecreateModal(false);
                }}
                disabled={isPrecreating}
                className="px-4 py-2 text-xs font-semibold text-[#8E8E93] hover:text-[#1C1C1E] bg-[#E5E5EA] hover:bg-[#D1D1D6] rounded-full transition-all cursor-pointer disabled:opacity-50"
              >
                ปิดหน้าต่าง
              </button>

              {isPrecreating ? (
                <button
                  type="button"
                  onClick={handleCancelPrecreate}
                  className="px-4 py-2 text-xs font-semibold text-[#FF3B30] bg-[#FF3B30]/15 hover:bg-[#FF3B30]/25 rounded-full border border-[#FF3B30]/25 transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                >
                  <X className="w-4 h-4 text-[#FF3B30]" />
                  <span>ยกเลิกการสร้าง</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartPrecreate}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#007AFF] hover:bg-[#0066D6] active:scale-95 rounded-full transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Sparkles className="w-4 h-4 text-white" />
                  <span>เริ่มสร้างโฟลเดอร์ล่วงหน้า</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal (iOS 18 Sheet) */}
      {showGuide && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[28px] max-w-2xl w-full p-6 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.25)] border border-black/[0.08] max-h-[90vh] overflow-y-auto">
            <div className="w-10 h-1 bg-[#D1D1D6] rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between border-b border-[#E5E5EA] pb-4">
              <h3 className="text-lg font-semibold text-[#1C1C1E] flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#34C759]" />
                <span>วิธีอัปเดตสคริปต์ใน Google Sheets (เวอร์ชันล่าสุด)</span>
              </h3>
              <button
                onClick={() => setShowGuide(false)}
                className="w-7 h-7 rounded-full bg-[#E5E5EA] hover:bg-[#D1D1D6] flex items-center justify-center text-[#8E8E93] hover:text-[#1C1C1E] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-sm text-[#3A3A3C]">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[#007AFF]/10 text-[#007AFF] font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </span>
                <div>
                  <p className="font-semibold text-[#1C1C1E]">คัดลอกโค้ดเวอร์ชันล่าสุด</p>
                  <p className="text-xs text-[#8E8E93] mt-0.5">
                    คัดลอกโค้ดในไฟล์ <code className="bg-[#F2F2F7] text-[#1C1C1E] px-1.5 py-0.5 rounded font-mono border border-black/[0.06]">google-apps-script/Code.gs</code> ไปวางในหน้า Apps Script ของ Google Sheets
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[#007AFF]/10 text-[#007AFF] font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </span>
                <div>
                  <p className="font-semibold text-[#1C1C1E]">กด Manage deployments และแก้ไข</p>
                  <p className="text-xs text-[#8E8E93] mt-0.5">
                    กด <b>Deploy (นำไปใช้งาน)</b> &gt; <b>Manage deployments (จัดการการนำไปใช้งาน)</b> &gt; กดไอคอน <b>ดินสอ (Edit)</b>
                    <br />
                    - Version: เลือก <b>New version (เวอร์ชันใหม่)</b>
                    <br />
                    - Who has access: เลือก <b>Anyone (ทุกคน)</b>
                    <br />
                    กด <b>Deploy (นำไปใช้งาน)</b>
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-[#E5E5EA] pt-4 flex justify-end">
              <button
                onClick={() => setShowGuide(false)}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#007AFF] hover:bg-[#0066D6] rounded-full transition-all cursor-pointer shadow-xs"
              >
                เข้าใจแล้ว
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
