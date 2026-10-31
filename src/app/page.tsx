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
  HelpCircle,
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
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";

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
  สล็อต: { bg: "bg-rose-50/90", text: "text-rose-700", border: "border-rose-200/80", dot: "bg-rose-500" },
  คาสิโน: { bg: "bg-amber-50/90", text: "text-amber-800", border: "border-amber-200/80", dot: "bg-amber-500" },
  บอล: { bg: "bg-sky-50/90", text: "text-sky-700", border: "border-sky-200/80", dot: "bg-sky-500" },
  มวย: { bg: "bg-emerald-50/90", text: "text-emerald-700", border: "border-emerald-200/80", dot: "bg-emerald-500" },
  หวย: { bg: "bg-purple-50/90", text: "text-purple-700", border: "border-purple-200/80", dot: "bg-purple-500" },
  "หวย APB": { bg: "bg-violet-50/90", text: "text-violet-700", border: "border-violet-200/80", dot: "bg-violet-500" },
  เกมสล็อต: { bg: "bg-pink-50/90", text: "text-pink-700", border: "border-pink-200/80", dot: "bg-pink-500" },
  ไก่ชน: { bg: "bg-orange-50/90", text: "text-orange-700", border: "border-orange-200/80", dot: "bg-orange-500" },
  วัวชน: { bg: "bg-yellow-50/90", text: "text-yellow-800", border: "border-yellow-200/80", dot: "bg-yellow-500" },
  "UFA NEWS": { bg: "bg-blue-50/90", text: "text-blue-700", border: "border-blue-200/80", dot: "bg-blue-500" },
  แคมเปญ: { bg: "bg-teal-50/90", text: "text-teal-700", border: "border-teal-200/80", dot: "bg-teal-500" },
  กิจกรรมกลาง: { bg: "bg-indigo-50/90", text: "text-indigo-700", border: "border-indigo-200/80", dot: "bg-indigo-500" },
  Pretty: { bg: "bg-fuchsia-50/90", text: "text-fuchsia-700", border: "border-fuchsia-200/80", dot: "bg-fuchsia-500" },
};

export default function HomePage() {
  const [assignee, setAssignee] = useState<string>("ลูกหยี");
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const sheetName = selectedSheets.includes("ALL")
    ? "ทุกวันที่ (ALL)"
    : selectedSheets.length > 0
    ? selectedSheets.join(", ")
    : "";
  const [pendingOnly, setPendingOnly] = useState<boolean>(true);
  const [staffList, setStaffList] = useState<string[]>([
    "ลูกหยี", "บอย", "วิน", "ปั้ม", "แม็กซ์", "เจมมี่", "เบียร์",
    "อีฟ", "เอิร์น", "ปอ", "พรีม", "แบงค์", "ปอนด์", "จ๊อบ",
    "แพท", "กิ๊ก", "ภา", "เค้ก", "พี่นาย", "เม่น", "นิว", "มายด์", "เอ้"
  ]);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
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
  const dateDropdownRef = useRef<HTMLDivElement>(null);
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState<boolean>(false);

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
    if (!status) return "กำลังทำ";
    return status
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2300}-\u{23FF}]/gu, "")
      .trim();
  };

  const copyToClipboard = (url: string, label: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(label);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  // กรองและอัปเดตงานลง State ทันทีใน Memory (0 ms)
  const applyTasksToState = (allTasks: Task[], targetAssignee: string) => {
    const searchLower = (targetAssignee || "").toLowerCase().trim();
    const loadedTasks = searchLower && searchLower !== "all"
      ? allTasks.filter((t) => (t.assignee || "").toLowerCase().includes(searchLower))
      : allTasks;

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
    const filteredNew = searchLower && searchLower !== "all"
      ? newBatchTasks.filter((t) => (t.assignee || "").toLowerCase().includes(searchLower))
      : newBatchTasks;

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

  // โหลดรายชื่อพนักงานและแท็บวันที่ทั้งหมดจากชีตจริง (ไม่ใช้ mockup วันที่)
  const loadMetadata = async (initialAssignee: string) => {
    setIsMetadataLoading(true);
    try {
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
                initialSelected = parsed.filter(
                  (s: string) => data.sheetNames.includes(s) || s === "ALL"
                );
              }
            } catch {}
          }

          // ถ้ายังไม่มีค่าบันทึกไว้ ให้เลือก 3 วันล่าสุดเป็นค่าเริ่มต้น
          if (initialSelected.length === 0) {
            initialSelected = data.sheetNames.slice(0, 3);
          }

          setSelectedSheets(initialSelected);
          fetchTasks(initialAssignee, initialSelected);
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

  // โหลดรายการงานตามชื่อพนักงานและวันที่เลือก (Progressive Chunked Fetching: ดึงเสร็จชุดไหนโชว์ทันทีก่อน)
  const fetchTasks = async (
    targetAssignee = assignee,
    targetSheets: string[] | string = selectedSheets,
    forceLoading = false
  ) => {
    const sheetsArray = Array.isArray(targetSheets)
      ? targetSheets
      : (targetSheets || "").split(",").map((s) => s.trim()).filter(Boolean);

    if (sheetsArray.length === 0) return;

    if (forceLoading) {
      clientSheetCacheRef.current = {};
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setErrorMessage(null);
    setSyncResult(null);

    const isModeAll = sheetsArray.includes("ALL");
    const targetSheetsList = isModeAll
      ? (availableSheets.length > 0 ? availableSheets : ["ALL"])
      : sheetsArray;

    // 1. ตรวจสอบว่าใน Client Cache มีข้อมูลของชีตใดอยู่แล้วบ้าง ให้แสดงผลทันทีใน 0 ms
    const cachedSheets = !forceLoading && !isModeAll
      ? targetSheetsList.filter((s) => clientSheetCacheRef.current[s] && clientSheetCacheRef.current[s].length > 0)
      : (!forceLoading
          ? targetSheetsList.filter((s) => clientSheetCacheRef.current[s] && clientSheetCacheRef.current[s].length > 0)
          : []);

    const isAllCached = !forceLoading && cachedSheets.length === targetSheetsList.length && targetSheetsList.length > 0;

    if (cachedSheets.length > 0) {
      const stitchedCached = cachedSheets.flatMap((s) => clientSheetCacheRef.current[s] || []);
      applyTasksToState(stitchedCached, targetAssignee);
      if (isAllCached) {
        setIsLoading(false);
        setStreamingProgress(null);
        return;
      }
    }

    // แผ่นงานที่ยังไม่มีในแคช
    const uncachedSheets = forceLoading
      ? targetSheetsList
      : targetSheetsList.filter((s) => !clientSheetCacheRef.current[s]);

    // ถ้ายังไม่มีข้อมูลในแคชเลย ให้หมุนโหลดรอชุดแรก
    if (cachedSheets.length === 0) {
      setIsLoading(true);
      setTasks([]);
    } else {
      setIsLoading(false);
    }

    // กรณีเป็นแผ่นงานเดียว หรือโหมด ALL ที่ยังไม่รู้รายชื่อแผ่นงาน
    if (uncachedSheets.length === 1 || (isModeAll && availableSheets.length === 0)) {
      try {
        const queryAssignee = isModeAll ? targetAssignee : "ALL";
        const forceQuery = forceLoading ? "&force=true" : "";
        const res = await fetch(
          `/api/tasks?action=getTasks&sheet=${encodeURIComponent(uncachedSheets[0])}&assignee=${encodeURIComponent(
            queryAssignee
          )}&pendingOnly=false${forceQuery}&_t=${Date.now()}`,
          { signal: controller.signal }
        );

        if (abortControllerRef.current !== controller) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.tasks)) {
          const rawTasks: Task[] = data.tasks;
          const grouped: Record<string, Task[]> = {};
          rawTasks.forEach((t) => {
            if (!grouped[t.sheetName]) grouped[t.sheetName] = [];
            grouped[t.sheetName].push(t);
          });
          Object.entries(grouped).forEach(([sName, sTasks]) => {
            clientSheetCacheRef.current[sName] = sTasks;
          });
          applyTasksToState(rawTasks, targetAssignee);
        } else {
          if (cachedSheets.length === 0) {
            setErrorMessage(data.error || "เกิดข้อผิดพลาดในการดึงข้อมูลจาก Google Sheets");
            setTasks([]);
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError" && cachedSheets.length === 0) {
          setErrorMessage("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ Next.js ได้");
        }
      } finally {
        if (abortControllerRef.current === controller) {
          setIsLoading(false);
          setStreamingProgress(null);
        }
      }
      return;
    }

    // 2. โหมดดึงข้อมูลแบบ Progressive (อันไหนดึงเสร็จก่อน นำขึ้นมาแสดงผลก่อนทันที!)
    const batches: string[][] = [];
    if (uncachedSheets.length > 0) {
      // แบทช์แรก: แผ่นแรกสุด (วันล่าสุด) ดึงเดี่ยวๆ เพื่อให้โชว์บนจอทันทีใน ~300ms!
      batches.push([uncachedSheets[0]]);

      let cursor = 1;
      const stepSizes = [2, 3, 5, 8, 12, 16];
      let stepIdx = 0;
      while (cursor < uncachedSheets.length) {
        const size = stepSizes[stepIdx] || 15;
        batches.push(uncachedSheets.slice(cursor, cursor + size));
        cursor += size;
        stepIdx++;
      }
    }

    let loadedCount = cachedSheets.length;
    setStreamingProgress({
      current: loadedCount,
      total: targetSheetsList.length,
      activeSheet: uncachedSheets[0] || "",
    });

    try {
      for (const batch of batches) {
        if (controller.signal.aborted || abortControllerRef.current !== controller) break;

        const activeName = batch.length === 1 ? batch[0] : `${batch[0]} ถึง ${batch[batch.length - 1]}`;
        setStreamingProgress((prev) => ({
          current: loadedCount,
          total: targetSheetsList.length,
          activeSheet: activeName,
        }));

        const queryAssignee = isModeAll ? targetAssignee : "ALL";
        const forceQuery = forceLoading ? "&force=true" : "";
        const res = await fetch(
          `/api/tasks?action=getTasks&sheet=${encodeURIComponent(batch.join(","))}&assignee=${encodeURIComponent(
            queryAssignee
          )}&pendingOnly=false${forceQuery}&_t=${Date.now()}`,
          { signal: controller.signal }
        );

        if (controller.signal.aborted || abortControllerRef.current !== controller) break;

        const data = await res.json();
        if (data.success && Array.isArray(data.tasks)) {
          const rawTasks: Task[] = data.tasks;
          const grouped: Record<string, Task[]> = {};
          rawTasks.forEach((t) => {
            if (!grouped[t.sheetName]) grouped[t.sheetName] = [];
            grouped[t.sheetName].push(t);
          });
          Object.entries(grouped).forEach(([sName, sTasks]) => {
            clientSheetCacheRef.current[sName] = sTasks;
          });

          // ดึงข้อมูลชุดนี้เสร็จแล้ว แสดงผลขึ้นมาบนหน้าจอทันที!
          appendTasksToState(rawTasks, targetAssignee);
          setIsLoading(false); // ปิดตัวหมุนโหลดใหญ่ทันที
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
      const withoutAll = selectedSheets.filter((s) => s !== "ALL");
      if (withoutAll.includes(sheet)) {
        updated = withoutAll.filter((s) => s !== sheet);
        if (updated.length === 0 && availableSheets.length > 0) {
          updated = [availableSheets[0]];
        }
      } else {
        updated = [...withoutAll, sheet];
      }
    }
    setSelectedSheets(updated);
    localStorage.setItem("gds_selectedSheets", JSON.stringify(updated));
    fetchTasks(assignee, updated, true);
  };

  // เลือกทั้งกลุ่มเดือน (เช่น เดือน พ.ย. หรือ เดือน ต.ค.)
  const handleToggleMonthGroup = (sheetsInGroup: string[]) => {
    if (sheetsInGroup.length === 0) return;
    const isAllGroupSelected = sheetsInGroup.every((s) => selectedSheets.includes(s));
    let updated: string[];
    if (isAllGroupSelected) {
      updated = selectedSheets.filter((s) => !sheetsInGroup.includes(s) && s !== "ALL");
      if (updated.length === 0 && availableSheets.length > 0) {
        updated = [availableSheets[0]];
      }
    } else {
      const withoutAll = selectedSheets.filter((s) => s !== "ALL");
      updated = Array.from(new Set([...withoutAll, ...sheetsInGroup]));
    }
    setSelectedSheets(updated);
    localStorage.setItem("gds_selectedSheets", JSON.stringify(updated));
    fetchTasks(assignee, updated, true);
  };

  // Quick Presets: วันนี้, 3 วันล่าสุด, 7 วันล่าสุด, เดือน พ.ย., เดือน ต.ค., ทุกวันที่ (ALL)
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
      fetchTasks(assignee, target, true);
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
    if (selectedSheets.length > 0) {
      fetchTasks(newName, selectedSheets, true);
    }
  };

  const toggleSelectTask = (key: string) => {
    setSelectedTaskKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAllPending = () => {
    const pendingKeys = filteredTasks
      .filter((t) => !t.isCompleted)
      .map((t) => getTaskKey(t.sheetName, t.row));

    if (selectedTaskKeys.length === pendingKeys.length) {
      setSelectedTaskKeys([]);
    } else {
      setSelectedTaskKeys(pendingKeys);
    }
  };

  // สร้างโฟลเดอร์ TH & INTER และอัปเดตชีต
  const handleSyncFolders = async () => {
    if (selectedTaskKeys.length === 0) {
      alert("กรุณาเลือกงานอย่างน้อย 1 รายการเพื่อสร้างโฟลเดอร์");
      return;
    }

    // ตรวจสอบว่ากรอกชื่องานครบทุกงานที่เลือกหรือยัง
    const selectedTasks = tasks.filter((t) =>
      selectedTaskKeys.includes(getTaskKey(t.sheetName, t.row))
    );

    for (const t of selectedTasks) {
      const key = getTaskKey(t.sheetName, t.row);
      const name = (taskNamesMap[key] || "").trim();
      if (!name) {
        alert(
          `กรุณากรอก "ชื่องาน/ชื่อโฟลเดอร์" สำหรับงานแถว #${t.row} (หมวด ${t.category} งานที่ ${t.no}) ก่อนกดสร้างโฟลเดอร์ครับ`
        );
        return;
      }
    }

    const tasksToSync = selectedTasks.map((t) => {
      const key = getTaskKey(t.sheetName, t.row);
      return {
        sheetName: t.sheetName,
        row: t.row,
        category: t.category,
        no: t.no,
        taskName: taskNamesMap[key].trim(),
        existingUrl: t.uploadUrl || folderLinksMap[key]?.thUrl || "",
      };
    });

    const keysToSync = selectedTasks.map((t) => getTaskKey(t.sheetName, t.row));
    setSyncingTaskKeys(keysToSync);
    setIsSyncing(true);

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: tasksToSync,
        }),
      });

      const result = await res.json();
      if (result.success) {
        setSyncResult(result);

        if (result.updatedTasks && Array.isArray(result.updatedTasks)) {
          const newLinks: Record<string, { thUrl?: string; interUrl?: string }> = {};
          const nextCompleted = new Set(justCompletedKeys);

          result.updatedTasks.forEach((u: any) => {
            const key = getTaskKey(u.sheetName, u.row);
            newLinks[key] = {
              thUrl: u.thFolderUrl || "",
              interUrl: u.interFolderUrl || "",
            };
            nextCompleted.add(key);
          });

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

        // ล้าง Client Cache เพื่อให้รอบถัดไปดึงข้อมูลใหม่
        clientSheetCacheRef.current = {};
      } else {
        alert(result.error || result.message || "เกิดข้อผิดพลาดในการสร้างโฟลเดอร์");
      }
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setIsSyncing(false);
      setSyncingTaskKeys([]);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    const key = getTaskKey(t.sheetName, t.row);
    // หากงานเพิ่งเสร็จในรอบนี้ (justCompletedKeys) ให้แสดงไว้เสมอ ไม่ให้แถวหายไป แม้จะเปิด "เลือกเฉพาะงานที่ยังไม่เสร็จ"
    if (pendingOnly && t.isCompleted && !justCompletedKeys.has(key)) {
      return false;
    }
    const matchSearch =
      searchTerm === "" ||
      (t.taskName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.category || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.sheetName || "").toLowerCase().includes(searchTerm.toLowerCase());
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
    const isChecked = selectedSheets.includes(s) && !selectedSheets.includes("ALL");
    const isLatest = s === availableSheets[0];

    return (
      <label
        key={s}
        className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
          isChecked
            ? "bg-indigo-50 text-indigo-900 font-bold border border-indigo-200/70"
            : "hover:bg-slate-50 text-slate-700 border border-transparent"
        }`}
      >
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => handleToggleSheet(s)}
            className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500 cursor-pointer"
          />
          <span>{s}</span>
        </div>
        {isLatest && (
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
              isChecked
                ? "bg-indigo-600 text-white"
                : "bg-emerald-100 text-emerald-800"
            }`}
          >
            ล่าสุด
          </span>
        )}
      </label>
    );
  };

  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter((t) => !t.isCompleted).length;
  const completedTasks = totalTasks - pendingTasks;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans pb-32">
      {/* Header Bar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-30 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-linear-to-tr from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-sm shadow-indigo-100">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Graphic Drive Sync</span>
                </h1>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>
                    {availableSheets.length > 0
                      ? `${availableSheets.length} วัน / พนักงาน ${staffList.length} คน`
                      : "เชื่อมต่อชีตแล้ว"}
                  </span>
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                ระบบจัดการสร้างโฟลเดอร์ Google Drive (TH & INTER) และอัปเดตสถานะชีตอัตโนมัติ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGuide(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100/80 hover:bg-slate-200/80 rounded-xl transition-all cursor-pointer active:scale-95"
            >
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">วิธีตั้งค่าสิทธิ์</span>
              <span className="sm:hidden">วิธีใช้</span>
            </button>
            <a
              href="https://docs.google.com/spreadsheets/d/1WIm3CzQ708nHcdIFQBnQEDBHWjBGeOCQL_MEAO2rBD8/edit"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100/90 rounded-xl border border-emerald-200/70 transition-all cursor-pointer shadow-2xs active:scale-95"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>เปิดชีตหลัก</span>
              <ExternalLink className="w-3 h-3 text-emerald-500" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full flex flex-col gap-6">
        {/* Error Alert Box */}
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-rose-900">แจ้งเตือนการเชื่อมต่อ</h4>
              <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Filter Controls Card */}
        <section className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-xs relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
            {/* 1. Staff Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-600" />
                  <span>ชื่อพนักงาน / กราฟิก</span>
                </label>
                <span className="text-[10px] text-slate-400">เลือกหรือพิมพ์</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  list="staff-options"
                  value={assignee}
                  onChange={(e) => handleAssigneeChange(e.target.value)}
                  placeholder="พิมพ์หรือเลือกชื่อ..."
                  className="w-full px-3.5 py-2 text-sm bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-2xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all font-semibold text-indigo-950"
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
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span>เลือกวันที่ต้องการดูงาน</span>
                </label>
                <span className="text-[10px] text-indigo-600 font-extrabold bg-indigo-50 px-2 py-0.5 rounded-full">
                  {selectedSheets.includes("ALL")
                    ? "ทุกวัน (ALL)"
                    : `เลือกแล้ว ${selectedSheets.length} วัน`}
                </span>
              </div>

              {/* Dropdown Toggle Button */}
              <button
                type="button"
                onClick={() => setIsDateDropdownOpen((prev) => !prev)}
                disabled={isMetadataLoading}
                className="w-full flex items-center justify-between px-3.5 py-2 text-sm bg-slate-50/80 hover:bg-white border border-slate-200/80 rounded-2xl transition-all cursor-pointer font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-left shadow-2xs"
              >
                <span className="truncate pr-1">
                  {isMetadataLoading ? (
                    <span className="text-slate-400">กำลังดึงวันที่...</span>
                  ) : selectedSheets.includes("ALL") ? (
                    <span className="text-indigo-700 font-bold">ทุกวันที่ (ALL)</span>
                  ) : selectedSheets.length === 0 ? (
                    <span className="text-slate-400">เลือกวันที่...</span>
                  ) : selectedSheets.length <= 2 ? (
                    <span>{selectedSheets.join(", ")}</span>
                  ) : (
                    <span>
                      {selectedSheets.slice(0, 2).join(", ")}{" "}
                      <span className="text-xs text-indigo-600 font-bold">
                        (+{selectedSheets.length - 2})
                      </span>
                    </span>
                  )}
                </span>
                {isDateDropdownOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {/* Dropdown Popover with Checkboxes */}
              {isDateDropdownOpen && (
                <div className="absolute left-0 right-0 sm:w-80 sm:right-auto mt-2 bg-white border border-slate-200/80 rounded-3xl shadow-xl z-50 p-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                      <span>เลือกวันที่</span>
                    </span>
                    <span className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-extrabold">
                      {selectedSheets.includes("ALL")
                        ? "ทุกวันที่"
                        : `${selectedSheets.length} วัน`}
                    </span>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                    <button
                      type="button"
                      onClick={() => handleSelectPreset("today")}
                      className={`px-2 py-1.5 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                        selectedSheets.length === 1 && selectedSheets[0] === availableSheets[0]
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      วันนี้
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset("last3")}
                      className={`px-2 py-1.5 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                        selectedSheets.length === 3 && !selectedSheets.includes("ALL")
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      3 วันล่าสุด
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset("nov")}
                      className={`px-2 py-1.5 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                        !selectedSheets.includes("ALL") &&
                        monthGroups.nov.length > 0 &&
                        monthGroups.nov.every((s) => selectedSheets.includes(s)) &&
                        selectedSheets.length === monthGroups.nov.length
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      ทั้งเดือน พ.ย.
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset("oct")}
                      className={`px-2 py-1.5 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                        !selectedSheets.includes("ALL") &&
                        monthGroups.oct.length > 0 &&
                        monthGroups.oct.every((s) => selectedSheets.includes(s)) &&
                        selectedSheets.length === monthGroups.oct.length
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      ทั้งเดือน ต.ค.
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset("all")}
                    className={`w-full py-1.5 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer mb-2.5 ${
                      selectedSheets.includes("ALL")
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    ทุกวันที่ทุกเดือน (ALL - 52 วัน)
                  </button>

                  {/* Scrollable Date Checkbox List Grouped by Month */}
                  <div className="max-h-60 overflow-y-auto space-y-3 pr-1 border-t border-slate-100 pt-2">
                    {availableSheets.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-400 italic">
                        กำลังดึงวันที่...
                      </div>
                    ) : (
                      <>
                        {/* เดือน พ.ย. */}
                        {monthGroups.nov.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between px-2.5 py-1 bg-slate-100 rounded-xl mb-1 sticky top-0 z-10 shadow-2xs">
                              <span className="text-[11px] font-bold text-slate-700">
                                เดือน พ.ย. ({monthGroups.nov.length} วัน)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleMonthGroup(monthGroups.nov)}
                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
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
                            <div className="flex items-center justify-between px-2.5 py-1 bg-slate-100 rounded-xl mb-1 sticky top-0 z-10 shadow-2xs">
                              <span className="text-[11px] font-bold text-slate-700">
                                เดือน ต.ค. ({monthGroups.oct.length} วัน)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleMonthGroup(monthGroups.oct)}
                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
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
                            <div className="flex items-center justify-between px-2.5 py-1 bg-slate-100 rounded-xl mb-1 sticky top-0 z-10 shadow-2xs">
                              <span className="text-[11px] font-bold text-slate-700">
                                แผ่นงานอื่นๆ ({monthGroups.other.length} แผ่น)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleMonthGroup(monthGroups.other)}
                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
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
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
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
                      className="text-[11px] text-slate-400 hover:text-rose-600 font-medium cursor-pointer transition-colors"
                    >
                      ล้างการเลือกทั้งหมด
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsDateDropdownOpen(false)}
                      className="px-3.5 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl cursor-pointer transition-all"
                    >
                      ตกลง
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Search Category */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <span>ค้นหาหมวดหมู่งาน</span>
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="เช่น หวย APB, สล็อต, บอล..."
                className="w-full px-3.5 py-2 text-sm bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-2xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all font-medium text-slate-800"
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
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-linear-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98] rounded-2xl shadow-sm shadow-indigo-100 transition-all disabled:opacity-60 cursor-pointer"
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
          <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setPendingOnly((prev) => !prev)}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                  pendingOnly
                    ? "bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs"
                    : "bg-slate-100/90 text-slate-600 border border-slate-200/60 hover:bg-slate-200/60"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full transition-all ${
                    pendingOnly ? "bg-amber-500 ring-2 ring-amber-200 animate-pulse" : "bg-slate-400"
                  }`}
                />
                <span>แสดงเฉพาะงานที่ยังไม่เสร็จ</span>
              </button>

              {!selectedSheets.includes("ALL") && selectedSheets.length > 0 && (
                <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <span>กำลังดู:</span>
                  <span className="font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                    {selectedSheets.join(", ")}
                  </span>
                </span>
              )}
            </div>

            <span className="text-slate-500 text-xs">
              พบทั้งหมด <b className="text-indigo-600 font-extrabold">{filteredTasks.length}</b> รายการของ <b>{assignee}</b>
            </span>
          </div>
        </section>

        {/* Stats Summary Banner */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="bg-white/90 backdrop-blur-xs p-4 rounded-3xl border border-slate-200/60 shadow-xs flex items-center justify-between hover:shadow-sm transition-all group">
            <div>
              <p className="text-xs font-semibold text-slate-500">งานทั้งหมดของ &quot;{assignee}&quot;</p>
              <p className="text-2xl font-black text-slate-800 mt-0.5">{totalTasks}</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-xs p-4 rounded-3xl border border-amber-200/60 shadow-xs flex items-center justify-between hover:shadow-sm transition-all group">
            <div>
              <p className="text-xs font-semibold text-amber-700">รอสร้างโฟลเดอร์ (ยังไม่เสร็จ)</p>
              <p className="text-2xl font-black text-amber-600 mt-0.5">{pendingTasks}</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-xs p-4 rounded-3xl border border-emerald-200/60 shadow-xs flex items-center justify-between hover:shadow-sm transition-all group">
            <div>
              <p className="text-xs font-semibold text-emerald-700">สร้างโฟลเดอร์เสร็จแล้ว</p>
              <p className="text-2xl font-black text-emerald-600 mt-0.5">{completedTasks}</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </section>

        {/* Sync Result Banner (With Dual Links: TH & INTER) */}
        {syncResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-emerald-900">
                  {syncResult.message}
                </h3>
                <p className="text-xs text-emerald-700 mt-0.5">
                  ระบบได้สร้างโฟลเดอร์ให้ครบทั้งฝั่ง TH และ INTER พร้อมแปะลิงก์ของ TH ลงในช่อง Col F และเปลี่ยนสถานะเป็น &quot;เสร็จสิ้น&quot; แล้วครับ สามารถกดเปิดโฟลเดอร์เพื่ออัปโหลดไฟล์งานได้ทันที:
                </p>

                {syncResult.updatedTasks && syncResult.updatedTasks.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {syncResult.updatedTasks.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-3.5 rounded-xl border border-emerald-200 flex flex-col gap-2.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between font-semibold text-slate-800 text-xs">
                          <span className="truncate mr-2 font-mono text-indigo-900 font-bold">
                            {item.sheetName} | แถว #{item.row} | {item.taskName}
                          </span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full shrink-0">
                            เสร็จสิ้น
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                          {/* TH Link Button */}
                          <div className="flex items-center gap-1.5 bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">TH</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold text-emerald-900">โฟลเดอร์ TH</p>
                              <a
                                href={item.thFolderUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 font-bold hover:underline inline-flex items-center gap-1 truncate"
                              >
                                <span>เปิด Drive</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <button
                              onClick={() => copyToClipboard(item.thFolderUrl, `th_${idx}`)}
                              className="p-1 text-slate-400 hover:text-slate-600"
                              title="คัดลอกลิงก์ TH"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* INTER Link Button */}
                          <div className="flex items-center gap-1.5 bg-sky-50/60 p-2 rounded-lg border border-sky-100">
                            <span className="text-xs font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded shrink-0">INTER</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold text-sky-900">โฟลเดอร์ INTER</p>
                              {item.interFolderUrl ? (
                                <a
                                  href={item.interFolderUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-sky-700 font-bold hover:underline inline-flex items-center gap-1 truncate"
                                >
                                  <span>เปิด Drive</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">-</span>
                              )}
                            </div>
                            {item.interFolderUrl && (
                              <button
                                onClick={() => copyToClipboard(item.interFolderUrl, `inter_${idx}`)}
                                className="p-1 text-slate-400 hover:text-slate-600"
                                title="คัดลอกลิงก์ INTER"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {copiedLink && copiedLink.startsWith(`th_${idx}`) && (
                          <span className="text-[10px] text-emerald-600 font-medium">คัดลอกลิงก์ TH เรียบร้อย</span>
                        )}
                        {copiedLink && copiedLink.startsWith(`inter_${idx}`) && (
                          <span className="text-[10px] text-sky-600 font-medium">คัดลอกลิงก์ INTER เรียบร้อย</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Task List Grouped by Date */}
        {isMetadataLoading ? (
          <section className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <h4 className="text-base font-bold text-slate-800">กำลังเชื่อมต่อ Google Sheets...</h4>
            <p className="text-xs text-slate-400 mt-1">กำลังดึงแท็บวันที่และรายชื่อพนักงานจริงจากชีต กรุณารอสักครู่</p>
          </section>
        ) : isLoading ? (
          <section className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <h4 className="text-base font-bold text-slate-800">กำลังค้นหางานจาก Google Sheets...</h4>
            <p className="text-xs text-slate-400 mt-1">กรุณารอสักครู่ ระบบกำลังดึงข้อมูลล่าสุด</p>
          </section>
        ) : selectedSheets.length === 0 ? (
          <section className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-xs">
            <Calendar className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <h4 className="font-bold text-slate-700 text-base">
              ยังไม่ได้เลือกวันที่
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              กรุณาคลิกเลือกวันที่ต้องการดูงานจากเมนูด้านบน หรือกดเลือกดูงานวันล่าสุด
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  if (availableSheets.length > 0) {
                    const latest = [availableSheets[0]];
                    setSelectedSheets(latest);
                    localStorage.setItem("gds_selectedSheets", JSON.stringify(latest));
                    fetchTasks(assignee, latest, true);
                  }
                }}
                className="px-3.5 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-semibold rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>เลือกวันล่าสุด ({availableSheets[0] || "วันล่าสุด"})</span>
              </button>
              <button
                onClick={() => {
                  setSelectedSheets(["ALL"]);
                  localStorage.setItem("gds_selectedSheets", JSON.stringify(["ALL"]));
                  fetchTasks(assignee, ["ALL"], true);
                }}
                className="px-3.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 text-xs font-semibold rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>ดูทุกวันที่ (ALL)</span>
              </button>
            </div>
          </section>
        ) : Object.keys(groupedTasksByDate).length === 0 ? (
          pendingOnly && tasks.length > 0 && pendingTasks === 0 ? (
            <section className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-8 text-center shadow-xs">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-2xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-base font-extrabold text-emerald-900">
                ยอดเยี่ยมมาก! งานทั้งหมดของ &quot;{assignee}&quot; ในวันที่ {sheetName} เสร็จสิ้นครบแล้ว
              </h4>
              <p className="text-xs text-emerald-700 mt-1.5 max-w-md mx-auto leading-relaxed">
                คุณได้สร้างโฟลเดอร์และอัปงานครบแล้วทั้ง <b>{completedTasks}</b> รายการ ไม่มีงานที่ยังค้างอยู่
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPendingOnly(false)}
                  className="px-4 py-2 bg-white text-emerald-700 hover:text-emerald-800 border border-emerald-300 hover:bg-emerald-50 text-xs font-bold rounded-xl shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderCheck className="w-4 h-4 text-emerald-600" />
                  <span>คลิกดูรายการงานที่อัปเสร็จแล้ว ({completedTasks} งาน)</span>
                </button>
              </div>
            </section>
          ) : (
            <section className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-xs">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <h4 className="font-bold text-slate-700 text-base">
                ไม่พบงานที่มอบหมายให้ &quot;{assignee}&quot; ในแผ่นงาน {sheetName}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                ลองตรวจสอบชื่อผู้รับงาน หรือเลือก <b>&quot;ทุกวันที่ (ค้นหางานค้างข้ามแท็บ)&quot;</b> เพื่อค้นหา
              </p>
              <button
                onClick={() => {
                  setSelectedSheets(["ALL"]);
                  localStorage.setItem("gds_selectedSheets", JSON.stringify(["ALL"]));
                  fetchTasks(assignee, ["ALL"]);
                }}
                className="mt-4 px-3.5 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-semibold rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>ค้นหางานข้ามทุกวันที่ (ALL)</span>
              </button>
            </section>
          )
        ) : (
          <>
            {/* Streaming Progress Banner */}
            {streamingProgress && (
              <div className="bg-linear-to-r from-indigo-50/90 to-violet-50/90 border border-indigo-200 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
                  </span>
                  <div>
                    <p className="text-xs font-bold text-indigo-950 flex items-center gap-1.5 flex-wrap">
                      <span>กำลังทยอยดึงข้อมูลจาก Google Sheets...</span>
                      <span className="bg-indigo-100 text-indigo-800 text-[11px] font-extrabold px-2 py-0.5 rounded-full border border-indigo-200">
                        แสดงแล้ว {streamingProgress.current} จากทั้งหมด {streamingProgress.total} วัน
                      </span>
                    </p>
                    {streamingProgress.activeSheet && (
                      <p className="text-[11px] text-indigo-600/90 mt-0.5">
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
                  className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl transition-all shadow-2xs cursor-pointer shrink-0"
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
                className="bg-white rounded-3xl border border-slate-200/60 shadow-xs overflow-hidden mb-6"
              >
                {/* Date Group Header */}
                <div className="bg-linear-to-r from-slate-50/90 via-indigo-50/20 to-slate-50/90 px-5 py-3.5 border-b border-slate-200/60 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-100/70 text-indigo-700 flex items-center justify-center shadow-2xs">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-800">
                        งานประจำวันที่
                      </h3>
                      <span className="text-xs text-indigo-700 font-extrabold bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200/70">
                        {dateSheet}
                      </span>
                      <span className="text-xs bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
                        {dateTasks.length} รายการ
                      </span>
                    </div>
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    แถว #{dateTasks[0]?.row} - #{dateTasks[dateTasks.length - 1]?.row}
                  </span>
                </div>

                {/* Table for this date */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200/60 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4 w-12 text-center">เลือก</th>
                        <th className="py-3 px-3 w-16 text-center">แถว</th>
                        <th className="py-3 px-4 w-36">หมวดหมู่</th>
                        <th className="py-3 px-4 w-44">ใบบรีฟ</th>
                        <th className="py-3 px-3 w-16 text-center">No.</th>
                        <th className="py-3 px-4">ชื่องาน/ชื่อโฟลเดอร์ (สำหรับสร้างโฟลเดอร์ TH)</th>
                        <th className="py-3 px-3 text-center min-w-[110px] w-28 whitespace-nowrap">สถานะ</th>
                        <th className="py-3 px-3 text-center min-w-[210px] w-56">ลิงก์โฟลเดอร์ (TH & INTER)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {dateTasks.map((task) => {
                        const key = getTaskKey(task.sheetName, task.row);
                        const isSelected = selectedTaskKeys.includes(key);
                        const isSyncingThis = syncingTaskKeys.includes(key);
                        const isJustCompleted = justCompletedKeys.has(key);
                        const catStyle = CATEGORY_COLORS[task.category] || {
                          bg: "bg-slate-100",
                          text: "text-slate-700",
                          border: "border-slate-200",
                          dot: "bg-slate-400",
                        };

                        return (
                          <tr
                            key={key}
                            onClick={() => toggleSelectTask(key)}
                            className={`transition-colors ${
                              isSyncingThis
                                ? "bg-indigo-50/70 animate-pulse ring-1 ring-indigo-200"
                                : isJustCompleted
                                ? "bg-emerald-50/30 hover:bg-emerald-50/50"
                                : isSelected
                                ? "bg-indigo-50/40"
                                : "hover:bg-indigo-50/20 cursor-pointer"
                            }`}
                          >
                            <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                              {isSyncingThis ? (
                                <Loader2 className="w-5 h-5 text-indigo-600 animate-spin mx-auto" />
                              ) : (
                                <button
                                  onClick={() => toggleSelectTask(key)}
                                  className="text-indigo-600 focus:outline-hidden transition-transform active:scale-90"
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-5 h-5 text-indigo-600" />
                                  ) : (
                                    <Square className="w-5 h-5 text-slate-300 hover:text-indigo-400 transition-colors" />
                                  )}
                                </button>
                              )}
                            </td>
                            <td className="py-3.5 px-3 text-center text-xs font-mono text-slate-400">
                              #{task.row}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${catStyle.bg} ${catStyle.text} ${catStyle.border} shadow-2xs`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${catStyle.dot}`} />
                                <span>{task.category}</span>
                              </span>
                            </td>
                            <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
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
                                      className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50/70 hover:bg-indigo-100 border border-indigo-200/70 px-2.5 py-1 rounded-xl transition-all shadow-2xs max-w-[210px] group"
                                      title={`คลิกเปิดใบบรีฟ Google Slides: ${titleText}`}
                                    >
                                      <ExternalLink className="w-3 h-3 text-indigo-500 group-hover:text-indigo-700 shrink-0" />
                                      <span className="truncate">{titleText}</span>
                                    </a>
                                  );
                                }

                                return <span className="text-xs text-slate-400">-</span>;
                              })()}
                            </td>
                            <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-700">
                              {task.no || "-"}
                            </td>
                            <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
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
                                    className="w-full px-3 py-1.5 text-xs font-medium bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all pr-7 text-slate-800"
                                  />
                                  <Edit3 className="w-3.5 h-3.5 text-slate-300 absolute right-2.5 top-2 pointer-events-none" />
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-3 text-center whitespace-nowrap">
                              {isSyncingThis ? (
                                <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-indigo-600" />
                                  <span>กำลังสร้าง...</span>
                                </span>
                              ) : task.isCompleted ? (
                                <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                  <span>เสร็จสิ้น</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
                                  <Clock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                                  <span>{cleanStatus(task.status) || "กำลังทำ"}</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              {(() => {
                                const linkInfo = folderLinksMap[key];
                                // อ้างอิงลิงก์จริงจาก Google Sheets เป็นหลัก 100% ไม่สร้างลิงก์หลอก และไม่ดึงลิงก์โฟลเดอร์ที่ถูกลบไปแล้วกลับมา
                                const thUrl = (linkInfo?.thUrl || task.uploadUrl || "").trim();
                                const interUrl = (linkInfo?.interUrl || task.interFolderUrl || "").trim();

                                if (isSyncingThis) {
                                  return (
                                    <span className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-200 shadow-2xs">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                                      <span>กำลังสร้างโฟลเดอร์...</span>
                                    </span>
                                  );
                                }

                                if (!thUrl && !interUrl) {
                                  if (task.isCompleted) {
                                    return (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50/80 px-2.5 py-1 rounded-xl border border-emerald-200/70">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>เสร็จสิ้น (ยังไม่มีลิงก์)</span>
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="text-xs text-slate-400 italic">รอสร้างโฟลเดอร์</span>
                                  );
                                }

                                return (
                                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                    {thUrl ? (
                                      <a
                                        href={thUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2.5 py-1 rounded-xl transition-all shadow-2xs hover:scale-102 active:scale-98 group whitespace-nowrap"
                                        title="คลิกเพื่อเปิดโฟลเดอร์ Google Drive (TH)"
                                      >
                                        <span>เปิด TH</span>
                                        <ExternalLink className="w-3 h-3 text-emerald-500 group-hover:text-emerald-700 shrink-0" />
                                      </a>
                                    ) : null}

                                    {interUrl ? (
                                      <a
                                        href={interUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200/80 px-2.5 py-1 rounded-xl transition-all shadow-2xs hover:scale-102 active:scale-98 group whitespace-nowrap"
                                        title="คลิกเพื่อเปิดโฟลเดอร์ Google Drive (INTER)"
                                      >
                                        <span>เปิด INTER</span>
                                        <ExternalLink className="w-3 h-3 text-sky-500 group-hover:text-sky-700 shrink-0" />
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

      {/* Modern Floating Bottom Action Bar */}
      <aside className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-3xl bg-white/90 backdrop-blur-md border border-slate-200/80 py-2.5 px-4 rounded-2xl shadow-xl shadow-slate-900/10 transition-all">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleSelectAllPending}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100/90 hover:bg-slate-200/80 active:scale-95 rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5 text-slate-500" />
              <span>เลือกงานที่ยังไม่เสร็จ</span>
            </button>
            <span className="text-xs text-slate-600 font-medium">
              เลือกไว้ <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-black text-xs">{selectedTaskKeys.length}</span> งาน
            </span>
          </div>

          <button
            onClick={handleSyncFolders}
            disabled={isSyncing || selectedTaskKeys.length === 0}
            className="inline-flex items-center justify-center gap-2 px-5 py-2 text-xs sm:text-sm font-bold text-white bg-linear-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98] rounded-xl shadow-sm shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {isSyncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>กำลังสร้างโฟลเดอร์...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-indigo-200" />
                <span>สร้างโฟลเดอร์ TH & INTER ({selectedTaskKeys.length} งาน)</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Guide Modal */}
      {showGuide && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <span>วิธีอัปเดตสคริปต์ใน Google Sheets (เวอร์ชันล่าสุด)</span>
              </h3>
              <button
                onClick={() => setShowGuide(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1"
              >
                ปิด
              </button>
            </div>

            <div className="py-4 space-y-4 text-sm text-slate-600">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </span>
                <div>
                  <p className="font-semibold text-slate-800">คัดลอกโค้ดเวอร์ชันล่าสุด</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    คัดลอกโค้ดในไฟล์ <code className="bg-slate-100 text-indigo-600 px-1.5 py-0.5 rounded font-mono">google-apps-script/Code.gs</code> ไปวางในหน้า Apps Script ของ Google Sheets
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </span>
                <div>
                  <p className="font-semibold text-slate-800">กด Manage deployments และแก้ไข</p>
                  <p className="text-xs text-slate-500 mt-0.5">
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

            <div className="border-t border-slate-100 pt-4 flex justify-end">
              <button
                onClick={() => setShowGuide(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors"
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
