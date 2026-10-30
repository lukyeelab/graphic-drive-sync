"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";

interface Task {
  row: number;
  category: string;
  briefLink: string;
  no: number | string;
  taskName: string;
  uploadUrl: string;
  team: string;
  assignee: string;
  assignDate: string;
  status: string;
  isCompleted: boolean;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  สล็อต: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  คาสิโน: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  บอล: { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
  มวย: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  หวย: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  เกมสล็อต: { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200" },
};

export default function HomePage() {
  const [assignee, setAssignee] = useState<string>("ลูกหยี");
  const [sheetName, setSheetName] = useState<string>("7 พย");
  const [availableSheets, setAvailableSheets] = useState<string[]>([
    "1 พย", "2 พย", "3 พย", "4 พย", "5 พย", "6 พย", "7 พย", "8 พย", "9 พย", "10 พย"
  ]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isMock, setIsMock] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    updatedTasks?: Array<{
      row: number;
      taskName: string;
      thFolderUrl: string;
      interFolderUrl: string;
    }>;
  } | null>(null);

  // โหลดรายการงานจาก API
  const fetchTasks = async (targetSheet = sheetName, targetAssignee = assignee) => {
    setIsLoading(true);
    setSyncResult(null);
    try {
      const res = await fetch(
        `/api/tasks?sheet=${encodeURIComponent(targetSheet)}&assignee=${encodeURIComponent(targetAssignee)}`
      );
      const data = await res.json();
      if (data.success) {
        setTasks(data.tasks || []);
        setIsMock(!!data.isMock);
        if (data.sheets && data.sheets.length > 0) {
          setAvailableSheets(data.sheets);
        }
        // ตั้งค่าเริ่มต้นเลือกเฉพาะงานที่ยังไม่เสร็จ
        const pending = (data.tasks || [])
          .filter((t: Task) => !t.isCompleted)
          .map((t: Task) => t.row);
        setSelectedRows(pending);
      } else {
        alert(data.error || "เกิดข้อผิดพลาดในการดึงข้อมูล");
      }
    } catch (err) {
      console.error(err);
      alert("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // เลือกหรือยกเลิกการเลือกงาน
  const toggleSelectRow = (row: number) => {
    setSelectedRows((prev) =>
      prev.includes(row) ? prev.filter((r) => r !== row) : [...prev, row]
    );
  };

  const handleSelectAllPending = () => {
    const pendingRows = filteredTasks.filter((t) => !t.isCompleted).map((t) => t.row);
    if (selectedRows.length === pendingRows.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(pendingRows);
    }
  };

  // ยิงคำสั่งสร้างโฟลเดอร์และอัปเดต Google Sheets
  const handleSyncFolders = async () => {
    if (selectedRows.length === 0) {
      alert("กรุณาเลือกงานอย่างน้อย 1 รายการเพื่อสร้างโฟลเดอร์");
      return;
    }

    const selectedTasks = tasks
      .filter((t) => selectedRows.includes(t.row))
      .map((t) => ({
        row: t.row,
        category: t.category,
        taskName: t.taskName,
        no: t.no,
      }));

    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetName: sheetName,
          dateFolderName: sheetName,
          tasks: selectedTasks,
        }),
      });

      const result = await res.json();
      if (result.success) {
        setSyncResult(result);
        // รีเฟรชรายการงานใหม่
        fetchTasks(sheetName, assignee);
      } else {
        alert(result.message || "เกิดข้อผิดพลาดในการสร้างโฟลเดอร์");
      }
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setIsSyncing(false);
    }
  };

  // กรองรายการงาน
  const filteredTasks = tasks.filter((t) => {
    const matchCategory =
      filterCategory === "ALL" || t.category === filterCategory;
    const matchSearch =
      searchTerm === "" ||
      t.taskName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCategory && matchSearch;
  });

  const categories = Array.from(new Set(tasks.map((t) => t.category))).filter(Boolean);
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.isCompleted).length;
  const pendingTasks = totalTasks - completedTasks;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  Graphic Drive Sync
                </h1>
                {isMock && (
                  <span className="text-[11px] font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                    Preview Demo Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                ระบบจัดการ Google Sheets & Google Drive Automation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGuide(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <HelpCircle className="w-4 h-4 text-slate-500" />
              <span>วิธีเชื่อมต่อชีต</span>
            </button>
            <a
              href="https://docs.google.com/spreadsheets/d/1WIm3CzQ708nHcdIFQBnQEDBHWjBGeOCQL_MEAO2rBD8/edit"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>เปิด Google Sheet</span>
              <ExternalLink className="w-3 h-3 text-emerald-500" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full flex flex-col gap-6">
        {/* Controls Card */}
        <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                👤 ผู้รับงาน (ชื่อคุณ)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="เช่น ลูกหยี"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                📅 เลือกวันที่ / แผ่นงาน (Sheet Tab)
              </label>
              <select
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
              >
                {availableSheets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                🔍 ค้นหางาน
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ค้นหาชื่องาน หรือ หมวด..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => fetchTasks(sheetName, assignee)}
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] rounded-xl transition-all disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                <span>รีเฟรชข้อมูล</span>
              </button>
            </div>
          </div>
        </section>

        {/* Stats Summary Banner */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">งานทั้งหมดที่ได้รับ</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">{totalTasks}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">รอดำเนินการ / อัปงาน</p>
              <p className="text-2xl font-bold text-amber-600 mt-0.5">{pendingTasks}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">เสร็จสิ้นแล้ว</p>
              <p className="text-2xl font-bold text-emerald-600 mt-0.5">{completedTasks}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </section>

        {/* Sync Action & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFilterCategory("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filterCategory === "ALL"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              ทั้งหมด ({tasks.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  filterCategory === cat
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat} ({tasks.filter((t) => t.category === cat).length})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAllPending}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors inline-flex items-center gap-1.5"
            >
              <CheckSquare className="w-4 h-4 text-slate-500" />
              <span>เลือกเฉพาะงานที่ยังไม่เสร็จ</span>
            </button>

            <button
              onClick={handleSyncFolders}
              disabled={isSyncing || selectedRows.length === 0}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98] rounded-xl shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>กำลังสร้างโฟลเดอร์ & อัปเดตชีต...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>สร้างโฟลเดอร์ & อัปเดตชีต ({selectedRows.length} งาน)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Task List Table */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-12 text-center">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="py-3.5 px-3 w-16 text-center">แถว</th>
                  <th className="py-3.5 px-4">หมวดหมู่</th>
                  <th className="py-3.5 px-4">ใบบรีฟ</th>
                  <th className="py-3.5 px-4">No.</th>
                  <th className="py-3.5 px-4">ชื่องาน (Col F)</th>
                  <th className="py-3.5 px-4 text-center">สถานะ</th>
                  <th className="py-3.5 px-4 text-right">ลิงก์งาน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-medium text-slate-600">ไม่พบรายการงาน</p>
                      <p className="text-xs text-slate-400 mt-1">
                        ลองเปลี่ยนวันที่ หรือตรวจสอบชื่อผู้รับงาน
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => {
                    const isSelected = selectedRows.includes(task.row);
                    const catStyle = CATEGORY_COLORS[task.category] || {
                      bg: "bg-slate-100",
                      text: "text-slate-700",
                      border: "border-slate-200",
                    };

                    return (
                      <tr
                        key={task.row}
                        onClick={() => toggleSelectRow(task.row)}
                        className={`hover:bg-indigo-50/40 cursor-pointer transition-colors ${
                          isSelected ? "bg-indigo-50/60" : ""
                        }`}
                      >
                        <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => toggleSelectRow(task.row)}
                            className="text-indigo-600 focus:outline-hidden"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5 text-indigo-600" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-300 hover:text-slate-400" />
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-3 text-center text-xs font-mono text-slate-400">
                          #{task.row}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
                          >
                            {task.category}
                          </span>
                        </td>
                        <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                          {task.briefLink ? (
                            <a
                              href={task.briefLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors"
                            >
                              <span>เปิดบรีฟ</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                          {task.no || "-"}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-800">
                          {task.taskName}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {task.isCompleted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              เสร็จสิ้น
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                              <Clock className="w-3.5 h-3.5" />
                              {task.status || "กำลังทำ"}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          {task.uploadUrl ? (
                            <a
                              href={task.uploadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors"
                            >
                              <FolderCheck className="w-3.5 h-3.5" />
                              <span>โฟลเดอร์งาน</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400 italic">ยังไม่ได้สร้าง</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Sync Result Banner */}
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
                  ระบบได้สร้างโฟลเดอร์ใน Google Drive และนำลิงก์ไปใส่ใน Google Sheets พร้อมเปลี่ยนสถานะเป็น &quot;เสร็จสิ้น&quot; เรียบร้อยแล้ว
                </p>
                {syncResult.updatedTasks && syncResult.updatedTasks.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {syncResult.updatedTasks.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-2.5 rounded-xl border border-emerald-200/80 flex items-center justify-between text-xs"
                      >
                        <span className="font-medium text-slate-800 truncate mr-2">
                          {item.taskName}
                        </span>
                        <a
                          href={item.thFolderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-600 font-semibold hover:underline shrink-0"
                        >
                          <span>เปิด Drive</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Guide Modal */}
      {showGuide && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <span>วิธีเชื่อมต่อกับ Google Sheets จริง</span>
              </h3>
              <button
                onClick={() => setShowGuide(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1"
              >
                ✕ ปิด
              </button>
            </div>

            <div className="py-4 space-y-4 text-sm text-slate-600">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </span>
                <div>
                  <p className="font-semibold text-slate-800">เปิด Apps Script ในชีตของคุณ</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    เปิด Google Sheet แผ่นงานของคุณ แล้วไปที่เมนูบนสุด: <b>ส่วนขยาย (Extensions)</b> &gt; <b>Apps Script</b>
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </span>
                <div>
                  <p className="font-semibold text-slate-800">คัดลอกโค้ดไปวาง</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    คัดลอกโค้ดทั้งหมดจากไฟล์ <code className="bg-slate-100 text-indigo-600 px-1.5 py-0.5 rounded font-mono">google-apps-script/Code.gs</code> ในโปรเจกต์นี้ ไปวางแทนที่ในหน้าต่าง Apps Script แล้วกดไอคอน <b>บันทึก (Save)</b>
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </span>
                <div>
                  <p className="font-semibold text-slate-800">นำไปใช้งาน (Deploy as Web App)</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    กดปุ่มสีน้ำเงินมุมขวาบน <b>นำไปใช้งาน (Deploy)</b> &gt; <b>การนำไปใช้งานใหม่ (New deployment)</b>
                    <br />
                    - เลือกประเภท: <b>เว็บแอป (Web app)</b>
                    <br />
                    - ดำเนินการในฐานะ: <b>ฉัน (Me)</b>
                    <br />
                    - ผู้มีสิทธิ์เข้าถึง: <b>ทุกคน (Anyone)</b>
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0 text-xs">
                  4
                </span>
                <div>
                  <p className="font-semibold text-slate-800">นำ Web App URL มาใส่ในโปรเจกต์</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    คัดลอก URL ที่ได้ (เช่น <code className="bg-slate-100 px-1 py-0.5 rounded">https://script.google.com/macros/s/.../exec</code>) ไปใส่ในไฟล์ <code className="bg-slate-100 text-indigo-600 px-1.5 py-0.5 rounded font-mono">.env.local</code> ตรงช่อง <code className="bg-slate-100 px-1 py-0.5 rounded">GAS_API_URL=...</code> แล้วรีสตาร์ท Next.js
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
