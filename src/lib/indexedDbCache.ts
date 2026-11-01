export interface TaskItem {
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

export interface SheetCacheRecord {
  sheetName: string;      // Primary Key เช่น "7 พย"
  tasks: TaskItem[];      // งานของพนักงานทุกคน (ALL) ในวันนั้น
  checksum: string;       // รหัส MD5 + Version สำหรับทำ Delta Sync
  updatedAt: number;      // เวลาที่อัปเดตล่าสุด (Timestamp)
}

const DB_NAME = "GraphicDriveSyncDB";
const DB_VERSION = 1;
const STORE_NAME = "sheets_store";

/**
 * เปิดการเชื่อมต่อ IndexedDB (GraphicDriveSyncDB)
 */
export function openSyncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not supported in this environment"));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "sheetName" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 1. ดึงข้อมูลหลายวันจาก IndexedDB พร้อมกัน (ความเร็ว ~1-2ms ใน Memory)
 */
export async function getSheetsFromIndexedDB(
  sheetNames: string[]
): Promise<Record<string, SheetCacheRecord>> {
  if (typeof window === "undefined" || !sheetNames || sheetNames.length === 0) {
    return {};
  }
  try {
    const db = await openSyncDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const result: Record<string, SheetCacheRecord> = {};
      let remaining = sheetNames.length;

      sheetNames.forEach((name) => {
        const cleanName = name.trim();
        const req = store.get(cleanName);
        req.onsuccess = () => {
          if (req.result) {
            result[cleanName] = req.result;
          }
          remaining--;
          if (remaining <= 0) resolve(result);
        };
        req.onerror = () => {
          remaining--;
          if (remaining <= 0) resolve(result);
        };
      });
    });
  } catch (e) {
    console.warn("IndexedDB read error:", e);
    return {};
  }
}

/**
 * ดึงข้อมูลแผ่นงานทั้งหมดที่มีใน IndexedDB (สำหรับเริ่มต้นระบบแบบ 0ms)
 */
export async function getAllSheetsFromIndexedDB(): Promise<Record<string, SheetCacheRecord>> {
  if (typeof window === "undefined") return {};
  try {
    const db = await openSyncDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const result: Record<string, SheetCacheRecord> = {};
        const items = req.result as SheetCacheRecord[];
        if (Array.isArray(items)) {
          items.forEach((item) => {
            if (item && item.sheetName) {
              result[item.sheetName.trim()] = item;
            }
          });
        }
        resolve(result);
      };
      req.onerror = () => resolve({});
    });
  } catch (e) {
    console.warn("IndexedDB getAll error:", e);
    return {};
  }
}

/**
 * 2. บันทึกหรือเขียนทับข้อมูลรายวันลงใน IndexedDB แบบ Atomic
 */
export async function saveSheetsToIndexedDB(
  records: SheetCacheRecord[]
): Promise<void> {
  if (typeof window === "undefined" || !records || records.length === 0) return;
  try {
    const db = await openSyncDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      records.forEach((rec) => {
        store.put({
          sheetName: rec.sheetName.trim(),
          tasks: rec.tasks || [],
          checksum: rec.checksum || "",
          updatedAt: rec.updatedAt || Date.now(),
        });
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB write error:", e);
  }
}

/**
 * 3. อัปเดตเฉพาะแถวที่เพิ่งสร้างโฟลเดอร์เสร็จ (Smart Chip Link + สถานะเสร็จสิ้น)
 * ลงใน IndexedDB ทันทีโดยไม่ต้องดาวน์โหลดชีตใหม่!
 */
export async function patchCreatedFoldersInIndexedDB(
  updatedTasks: Array<{
    sheetName: string;
    row: number;
    taskName: string;
    thFolderUrl: string;
    interFolderUrl: string;
    status?: string;
  }>
): Promise<void> {
  if (typeof window === "undefined" || !updatedTasks || updatedTasks.length === 0) return;

  // จัดกลุ่มงานตามชื่อวัน (sheetName)
  const bySheet: Record<string, typeof updatedTasks> = {};
  for (const item of updatedTasks) {
    const sName = item.sheetName.trim();
    if (!bySheet[sName]) bySheet[sName] = [];
    bySheet[sName].push(item);
  }

  const sheetNames = Object.keys(bySheet);
  const existingMap = await getSheetsFromIndexedDB(sheetNames);
  const recordsToSave: SheetCacheRecord[] = [];

  for (const sName of sheetNames) {
    const record = existingMap[sName];
    if (!record || !Array.isArray(record.tasks)) continue;

    const updatesForSheet = bySheet[sName];
    const updatedTasksList = record.tasks.map((task) => {
      const match = updatesForSheet.find((u) => Number(u.row) === Number(task.row));
      if (!match) return task;
      return {
        ...task,
        taskName: match.taskName || task.taskName,
        uploadUrl: match.thFolderUrl || task.uploadUrl,
        interFolderUrl: match.interFolderUrl || task.interFolderUrl,
        hasUploadLink: !!(match.thFolderUrl || task.uploadUrl),
        status: match.status || "เสร็จสิ้น",
        isCompleted: true,
      };
    });

    recordsToSave.push({
      ...record,
      tasks: updatedTasksList,
      updatedAt: Date.now(),
    });
  }

  if (recordsToSave.length > 0) {
    await saveSheetsToIndexedDB(recordsToSave);
  }
}

/**
 * ล้างแคช IndexedDB ทั้งหมด (กรณีต้องการ Reset)
 */
export async function clearIndexedDBCache(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await openSyncDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("IndexedDB clear error:", e);
  }
}
