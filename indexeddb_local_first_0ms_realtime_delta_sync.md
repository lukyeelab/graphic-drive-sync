# สถาปัตยกรรม IndexedDB Local-First (`0ms` Instant Filter + Realtime Delta Sync)

เอกสารนี้ออกแบบตามแนวคิดของคุณ 100% พร้อมอุดช่องโหว่ทุกจุด เพื่อให้หน้าเว็บ `graphic-drive-sync.vercel.app` ทำงานได้เร็วระดับ **0 มิลลิวินาที (Instant)** เมื่อสลับชื่อพนักงาน เลือกวันที่ หรือกรองหมวดหมู่ และดึงเฉพาะข้อมูลที่มีการเปลี่ยนแปลงจริงเมื่อกดปุ่ม **"ค้นหางานของฉัน"**

---

## 🏗️ แผนผังการทำงาน (Workflow)

1. **โครงสร้างการจัดเก็บใน IndexedDB (`GraphicSyncDB` -> Store: `sheets_cache`):**
   * เก็บข้อมูลแยกตาม **ชื่อวัน (`sheetName` เป็น Primary Key)** เช่น `"7 พย"`, `"15 พย"`
   * ในแต่ละวัน เก็บรายการงานของ **พนักงานทุกคน (`assignee=ALL`)** พร้อมรหัส `checksum` ของวันนั้น:
     ```json
     {
       "sheetName": "7 พย",
       "tasks": [ /* งานของทุกคนในวันที่ 7 พย */ ],
       "checksum": "a1b2c3d4e5f6_0",
       "updatedAt": 1730448000000
     }
     ```
2. **เมื่อเปลี่ยนชื่อพนักงาน (เช่น `"ลูกหยี"` ➔ `"เป็ปซี่"`), เปลี่ยนหมวดหมู่, หรือกดปุ่ม `"แสดงเฉพาะงานที่ยังไม่เสร็จ"`:**
   * **ไม่ยิง API เลยแม้แต่ครั้งเดียว (`0 API Call`)!**
   * ใช้ฟังก์ชัน `.filter()` กรองจากข้อมูลใน Memory / IndexedDB แล้วแสดงผลขึ้นจอทันทีใน **`0ms`** พร้อมคำนวณตัวเลข 3 กล่องด้านบนใหม่ทันที
3. **เมื่อติ๊กเปลี่ยนวันที่ใน Dropdown (เช่น เคยเก็บไว้ 3 เดือน แล้วเลือกดู `"7 พย"`):**
   * ดึงข้อมูลของ `"7 พย"` จาก IndexedDB ขึ้นมาโชว์ทันทีใน **`0ms`**
   * *(Auto-Fill เฉพาะวันที่ยังไม่เคยมี)*: ถ้าบังเอิญผู้ใช้ติ๊กเลือกวันที่ใหม่ที่ยังไม่เคยมีใน IndexedDB เลย (เช่น เพิ่งเปิดเว็บครั้งแรก) ระบบจะยิงดึงเฉพาะวันที่ยังไม่มีใน IndexedDB มาเติมให้อัตโนมัติ
4. **เมื่อกดปุ่ม `"🔄 ค้นหางานของฉัน"` (ต้องการข้อมูลสดใหม่ Realtime เฉพาะวันที่เลือก):**
   * สมมติเลือกวันที่ `"7 พย"` อยู่ (หรือเลือกไว้หลายวัน) ระบบจะส่งรายชื่อวันที่เลือก พร้อม `knownHashes` (รหัส Checksum เดิมใน IndexedDB) ไปที่หลังบ้าน (`assignee=ALL&force=true`)
   * หลังบ้านเช็กกับ Google Sheets สดๆ:
     * ถ้าวันไหนมีการแก้ไขในชีต ➔ ส่งข้อมูลใหม่ของทุกคนในวันนั้นกลับมา ➔ หน้าบ้านนำมา **เขียนทับเฉพาะวันนั้นใน IndexedDB** ทันที
     * ถ้าวันไหนไม่มีใครแก้ชีตเลย ➔ หลังบ้านแจ้งว่า `unchangedSheets` หน้าบ้านไม่ต้องดาวน์โหลดซ้ำ!
5. **เมื่อกดปุ่ม `"✨ สร้างโฟลเดอร์ TH & INTER"` สำเร็จ:**
   * ทันทีที่หลังบ้านตอบกลับ `updatedTasks` (มีลิงก์ `thFolderUrl`, `interFolderUrl` และสถานะเสร็จสิ้น)
   * หน้าบ้านจะเข้าไป **อัปเดตเฉพาะแถวงานนั้นใน IndexedDB ทันที (`patchTasksInIndexedDB`)** โดยไม่ต้องโหลดชีตใหม่!

---

## 💻 โค้ดพร้อมใช้งานสำหรับฝั่งหน้าบ้าน (Frontend)

คุณสามารถสร้างไฟล์ `lib/indexedDbCache.ts` (หรือวางไว้ในไฟล์เดียวกับหน้าบ้าน) ได้เลยครับ ไม่ต้องลง Library เพิ่มใดๆ ทั้งสิ้น:

### 1. โมดูลจัดการ IndexedDB (`indexedDbCache.ts`)

```typescript
export interface TaskItem {
  sheetName: string;
  row: number;
  category: string;
  briefLink: string;
  briefTitle: string;
  no: number | string;
  taskName: string;
  uploadUrl: string;
  interFolderUrl: string;
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
  updatedAt: number;      // เวลาที่อัปเดตล่าสุด
}

const DB_NAME = "GraphicDriveSyncDB";
const DB_VERSION = 1;
const STORE_NAME = "sheets_store";

/** เปิดการเชื่อมต่อ IndexedDB */
function openSyncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not supported"));
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

/** 1. ดึงข้อมูลหลายวันจาก IndexedDB พร้อมกัน (ใช้เวลา ~1-2ms) */
export async function getSheetsFromIndexedDB(
  sheetNames: string[]
): Promise<Record<string, SheetCacheRecord>> {
  try {
    const db = await openSyncDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const result: Record<string, SheetCacheRecord> = {};
      let remaining = sheetNames.length;

      if (remaining === 0) {
        resolve(result);
        return;
      }

      sheetNames.forEach((name) => {
        const cleanName = name.trim();
        const req = store.get(cleanName);
        req.onsuccess = () => {
          if (req.result) {
            result[cleanName] = req.result;
          }
          remaining--;
          if (remaining === 0) resolve(result);
        };
        req.onerror = () => {
          remaining--;
          if (remaining === 0) resolve(result);
        };
      });
    });
  } catch (e) {
    console.warn("IndexedDB read error:", e);
    return {};
  }
}

/** 2. บันทึกหรือเขียนทับข้อมูลรายวันลงใน IndexedDB แบบ Atomic */
export async function saveSheetsToIndexedDB(
  records: SheetCacheRecord[]
): Promise<void> {
  if (!records || records.length === 0) return;
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
          updatedAt: Date.now(),
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
 * ลงใน IndexedDB ทันทีโดยไม่ต้องโหลดชีตใหม่!
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
  if (!updatedTasks || updatedTasks.length === 0) return;

  // จัดกลุ่มตามชื่อวัน (sheetName)
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
        status: "เสร็จสิ้น ✅",
        isCompleted: true,
      };
    });

    recordsToSave.push({
      ...record,
      tasks: updatedTasksList,
      updatedAt: Date.now(),
    });
  }

  await saveSheetsToIndexedDB(recordsToSave);
}
```

---

### 2. วิธีเรียกใช้งานในหน้าเว็บ (React / Next.js)

แทนที่จะเก็บเฉพาะงานของคนเดียวใน State ให้เก็บ `allTasksInSelectedDays` (งานของทุกคนในวันที่เลือก) ไว้ใน State แล้วใช้ `useMemo` กรองชื่อพนักงานและหมวดหมู่ใน **`0ms`** ครับ:

```tsx
// 1. State เก็บงานของทุกคน (ALL) ในวันที่เลือกปัจจุบัน (ดึงมาจาก IndexedDB)
const [rawSheetTasksMap, setRawSheetTasksMap] = useState<Record<string, TaskItem[]>>({});
const [isSyncing, setIsSyncing] = useState(false);

// 2. เมื่อผู้ใช้ติ๊กเปลี่ยนวันที่ (selectedSheets) -> ดึงจาก IndexedDB ขึ้นจอทันทีใน 0ms!
useEffect(() => {
  let isMounted = true;

  async function loadFromCacheAndFetchMissing() {
    if (selectedSheets.length === 0) {
      setRawSheetTasksMap({});
      return;
    }

    // ก. ดึงจาก IndexedDB ทันที (เร็ว 1-2ms)
    const cachedMap = await getSheetsFromIndexedDB(selectedSheets);
    if (!isMounted) return;

    const nextMap: Record<string, TaskItem[]> = {};
    const missingSheets: string[] = [];

    for (const sName of selectedSheets) {
      const clean = sName.trim();
      if (cachedMap[clean]) {
        nextMap[clean] = cachedMap[clean].tasks;
      } else {
        missingSheets.push(clean);
      }
    }

    // แสดงวันที่มีใน IndexedDB ขึ้นจอทันที (ไม่ต้องรอ API!)
    setRawSheetTasksMap(nextMap);

    // ข. ถ้าระหว่างที่เลือกมีวันไหนยังไม่เคยโหลดเก็บใน IndexedDB เลย ค่อยดึงเฉพาะวันนั้นมาเติม
    if (missingSheets.length > 0) {
      await syncSheetsWithBackend(missingSheets, false);
    }
  }

  loadFromCacheAndFetchMissing();
  return () => { isMounted = false; };
}, [selectedSheets]);

// 3. ฟังก์ชันสำหรับปุ่ม "🔄 ค้นหางานของฉัน" (ดึงข้อมูลสดใหม่ Realtime เฉพาะวันที่เลือก!)
async function syncSheetsWithBackend(sheetsToSync: string[], isForceRefresh = true) {
  if (sheetsToSync.length === 0) return;
  setIsSyncing(true);

  try {
    // ดึง checksum เดิมที่มีใน IndexedDB เพื่อส่งไปทำ Delta Sync
    const cachedMap = await getSheetsFromIndexedDB(sheetsToSync);
    const knownHashes: Record<string, string> = {};
    for (const sName of sheetsToSync) {
      const clean = sName.trim();
      if (cachedMap[clean]?.checksum) {
        knownHashes[clean] = cachedMap[clean].checksum;
      }
    }

    // แบ่งดึงทีละ 5 วัน (หรือถ้าเลือกวันเดียวเช่น "7 พย" ก็ยิงแค่วันเดียวจบใน 0.2 วินาที!)
    const chunkSize = 5;
    for (let i = 0; i < sheetsToSync.length; i += chunkSize) {
      const chunk = sheetsToSync.slice(i, i + chunkSize);
      const params = new URLSearchParams({
        action: "getTasks",
        assignee: "ALL", // ดึงทุกคนมาเก็บลง IndexedDB ครั้งเดียว สลับชื่อได้ทั้งบริษัท!
        sheet: chunk.join(","),
        pendingOnly: "false",
        force: isForceRefresh ? "true" : "false",
        knownHashes: JSON.stringify(knownHashes),
      });

      const res = await fetch(`${GAS_WEB_APP_URL}?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        const unchangedSet = new Set<string>(
          (data.unchangedSheets || []).map((s: string) => s.trim())
        );

        // จัดกลุ่มงานที่ได้มาใหม่ตามชื่อวัน
        const groupedNewTasks: Record<string, TaskItem[]> = {};
        for (const sName of chunk) {
          if (!unchangedSet.has(sName.trim())) {
            groupedNewTasks[sName.trim()] = [];
          }
        }

        for (const task of data.tasks || []) {
          const sName = task.sheetName.trim();
          if (!groupedNewTasks[sName]) groupedNewTasks[sName] = [];
          groupedNewTasks[sName].push(task);
        }

        // บันทึกเฉพาะวันที่เปลี่ยนแปลงลงใน IndexedDB
        const recordsToSave: SheetCacheRecord[] = Object.keys(groupedNewTasks).map((sName) => ({
          sheetName: sName,
          tasks: groupedNewTasks[sName],
          checksum: data.checksums?.[sName] || "",
          updatedAt: Date.now(),
        }));

        if (recordsToSave.length > 0) {
          await saveSheetsToIndexedDB(recordsToSave);
          // อัปเดตหน้าจอทันที
          setRawSheetTasksMap((prev) => {
            const updated = { ...prev };
            for (const rec of recordsToSave) {
              updated[rec.sheetName] = rec.tasks;
            }
            return updated;
          });
        }
      }
    }
  } finally {
    setIsSyncing(false);
  }
}

// 4. การสลับชื่อพนักงาน / ค้นหาหมวดหมู่ / กรองเฉพาะงานที่ยังไม่เสร็จ (ทำงานใน 0ms ไม่ยิง API!)
const { displayedTasks, totalCount, pendingCount, completedCount } = useMemo(() => {
  const searchStaff = assignee.trim().toLowerCase();
  const searchCat = categoryFilter.trim().toLowerCase();

  let allForStaff: TaskItem[] = [];

  for (const sName of selectedSheets) {
    const dayTasks = rawSheetTasksMap[sName.trim()] || [];
    for (const t of dayTasks) {
      // กรองตามชื่อพนักงาน
      if (searchStaff && searchStaff !== "all") {
        const rowStaff = (t.assignee || "").trim().toLowerCase();
        if (!rowStaff || (!rowStaff.includes(searchStaff) && rowStaff !== searchStaff)) {
          continue;
        }
      }
      // กรองตามหมวดหมู่ (ถ้ามีการพิมพ์ค้นหาหมวดหมู่)
      if (searchCat && !(t.category || "").toLowerCase().includes(searchCat)) {
        continue;
      }
      allForStaff.push(t);
    }
  }

  const total = allForStaff.length;
  const completed = allForStaff.filter((t) => t.isCompleted).length;
  const pending = total - completed;

  // ถ้าเปิดปุ่ม "แสดงเฉพาะงานที่ยังไม่เสร็จ"
  const finalShown = showPendingOnly
    ? allForStaff.filter((t) => !t.isCompleted)
    : allForStaff;

  return {
    displayedTasks: finalShown,
    totalCount: total,
    pendingCount: pending,
    completedCount: completed,
  };
}, [rawSheetTasksMap, selectedSheets, assignee, categoryFilter, showPendingOnly]);
```

### 3. ตอนกดสร้างโฟลเดอร์เสร็จ (`handleCreateFolders`) อัปเดต IndexedDB ทันที:

```tsx
// หลังจากยิง POST action: "createFolders" สำเร็จและได้ data.updatedTasks กลับมา:
if (data.success && Array.isArray(data.updatedTasks)) {
  // 1. อัปเดตลง IndexedDB ทันที (ไม่ต้องโหลดชีตใหม่)
  await patchCreatedFoldersInIndexedDB(data.updatedTasks);

  // 2. อัปเดต State หน้าจอบนเว็บทันทีใน 0ms
  setRawSheetTasksMap((prev) => {
    const next = { ...prev };
    for (const u of data.updatedTasks) {
      const sName = u.sheetName.trim();
      if (!next[sName]) continue;
      next[sName] = next[sName].map((t) =>
        Number(t.row) === Number(u.row)
          ? {
              ...t,
              taskName: u.taskName || t.taskName,
              uploadUrl: u.thFolderUrl || t.uploadUrl,
              interFolderUrl: u.interFolderUrl || t.interFolderUrl,
              hasUploadLink: true,
              status: "เสร็จสิ้น ✅",
              isCompleted: true,
            }
          : t
      );
    }
    return next;
  });
}
```