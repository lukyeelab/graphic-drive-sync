import { NextRequest, NextResponse } from "next/server";
import { getTasksQuerySchema } from "@/lib/validations/task";

interface CacheEntry {
  data: any;
  timestamp: number;
}

const serverTasksCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60000; // แคชฝั่งเซิร์ฟเวอร์ 60 วินาทีเพื่อความเร็วระดับ 0ms

// ฟังก์ชันจัดเรียงแท็บวันที่ (เช่น 15 พย -> 1 พย -> 31 ตค -> 1 ตค)
function sortThaiDateSheets(sheets: string[]): string[] {
  const monthWeights: Record<string, number> = {
    ธค: 12,
    "ธ.ค.": 12,
    พย: 11,
    "พ.ย.": 11,
    ตค: 10,
    "ต.ค.": 10,
    กย: 9,
    "ก.ย.": 9,
    สค: 8,
    "ส.ค.": 8,
    กค: 7,
    "ก.ค.": 7,
    มิย: 6,
    "มิ.ย.": 6,
    พค: 5,
    "พ.ค.": 5,
    เมย: 4,
    "เม.ย.": 4,
    มีค: 3,
    "มี.ค.": 3,
    กพ: 2,
    "ก.พ.": 2,
    มค: 1,
    "ม.ค.": 1,
  };

  return [...sheets].sort((a, b) => {
    const parse = (str: string) => {
      const match = str.trim().match(/^(\d+)\s*([^\d\s]+)?/);
      if (!match) return { day: 0, monthWeight: 0, raw: str };
      const day = parseInt(match[1], 10);
      const mStr = (match[2] || "").trim();
      const monthWeight = monthWeights[mStr] || 0;
      return { day, monthWeight, raw: str };
    };

    const pA = parse(a);
    const pB = parse(b);

    if (pA.monthWeight !== pB.monthWeight) {
      return pB.monthWeight - pA.monthWeight; // เดือนล่าสุดขึ้นก่อน (พย > ตค)
    }
    return pB.day - pA.day; // วันที่ล่าสุดขึ้นก่อน (15 > 1)
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "getTasks";
    const sheet = searchParams.get("sheet") || "ALL";
    const assignee = searchParams.get("assignee") || "";
    const pendingOnly = searchParams.get("pendingOnly") || "true";

    const validation = getTasksQuerySchema.safeParse({
      action,
      sheet,
      assignee,
      pendingOnly,
    });

    if (!validation.success) {
      return NextResponse.json(
        { success: false, errors: validation.error.flatten() },
        { status: 400 }
      );
    }

    const gasUrl = process.env.GAS_API_URL;
    if (!gasUrl || gasUrl.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          error: "ยังไม่ได้ระบุ GAS_API_URL ในไฟล์ .env.local",
        },
        { status: 500 }
      );
    }

    // กรณีขอ Metadata (รายชื่อแผ่นงาน + รายชื่อพนักงาน)
    if (action === "getMetadata") {
      // 1. ลองเรียก action=getMetadata จาก GAS
      let targetUrl = new URL(gasUrl);
      targetUrl.searchParams.set("action", "getMetadata");

      let res = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "follow",
        cache: "no-store",
      });

      let jsonText = await res.text();
      let metadataResult: any = null;
      try {
        metadataResult = JSON.parse(jsonText);
      } catch {
        // fallback
      }

      // ถ้า GAS รองรับ getMetadata สำเร็จ
      if (metadataResult && metadataResult.success && metadataResult.sheetNames) {
        metadataResult.sheetNames = sortThaiDateSheets(metadataResult.sheetNames);
        return NextResponse.json(metadataResult);
      }

      // 2. Fallback: ถ้า GAS ยังเป็นเวอร์ชันเดิมที่รองรับแค่ action=getSheets
      targetUrl = new URL(gasUrl);
      targetUrl.searchParams.set("action", "getSheets");

      res = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "follow",
        cache: "no-store",
      });

      jsonText = await res.text();
      let sheetsData: any = {};
      try {
        sheetsData = JSON.parse(jsonText);
      } catch (err) {
        return NextResponse.json(
          { success: false, error: "ไม่สามารถดึงข้อมูลแผ่นงานจาก Google Sheets ได้" },
          { status: 502 }
        );
      }

      const rawSheets: string[] = (sheetsData.sheets || []).filter((s: string) => s !== "TEM");
      const sortedSheets = sortThaiDateSheets(rawSheets);

      // ดึงรายชื่อพนักงานจากแผ่นงานล่าสุด
      const sampleSheet = sortedSheets[0] || "";
      let staffList: string[] = [
        "ลูกหยี", "บอย", "วิน", "ปั้ม", "แม็กซ์", "เจมมี่", "เบียร์",
        "อีฟ", "เอิร์น", "ปอ", "พรีม", "แบงค์", "ปอนด์", "จ๊อบ",
        "แพท", "กิ๊ก", "ภา", "เค้ก", "พี่นาย", "เม่น", "นิว", "มายด์", "เอ้"
      ];

      if (sampleSheet) {
        try {
          const taskUrl = new URL(gasUrl);
          taskUrl.searchParams.set("action", "getTasks");
          taskUrl.searchParams.set("sheet", sampleSheet);
          const taskRes = await fetch(taskUrl.toString(), { redirect: "follow", cache: "no-store" });
          const taskJson = await taskRes.json();
          if (taskJson.tasks && Array.isArray(taskJson.tasks)) {
            const foundAssignees = taskJson.tasks
              .map((t: any) => t.assignee?.trim())
              .filter((name: string) => name && name !== "-" && name !== "ผู้รับงาน");
            const merged = Array.from(new Set(["ลูกหยี", ...staffList, ...foundAssignees])).sort();
            staffList = merged;
          }
        } catch {
          // ใช้ default
        }
      }

      return NextResponse.json({
        success: true,
        sheetNames: sortedSheets,
        staffList: staffList,
      });
    }

    // กรณีดึงรายการงาน (action=getTasks)
    const isForce = searchParams.get("force") === "true";
    const sheetParam = sheet || "ALL";
    const requestedSheets = sheetParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const cacheKey = `tasks_${requestedSheets.sort().join(",")}_${assignee || "ALL"}_${pendingOnly}`;
    const cachedEntry = serverTasksCache.get(cacheKey);

    if (!isForce && cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cachedEntry.data);
    }

    let allRawTasks: any[] = [];
    let isSuccess = false;

    // 1. กรณีเลือก "ALL" หรือไม่ได้ระบุ
    if (requestedSheets.includes("ALL") || requestedSheets.length === 0) {
      const targetUrl = new URL(gasUrl);
      targetUrl.searchParams.set("action", action);
      targetUrl.searchParams.set("sheet", "ALL");
      targetUrl.searchParams.set("assignee", assignee);
      targetUrl.searchParams.set("pendingOnly", "false");

      const res = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "follow",
        cache: "no-store",
      });

      const responseText = await res.text();
      try {
        const data = JSON.parse(responseText);
        if (data && data.success && Array.isArray(data.tasks)) {
          allRawTasks = data.tasks;
          isSuccess = true;

          // Fallback อัจฉริยะ: ดึงแผ่นงาน พ.ย. อื่นๆ ที่อาจยังไม่อยู่ในแคชของ GAS
          const scannedSheets = new Set(data.tasks.map((t: any) => t.sheetName));
          const prioritySheets = ["11 พย", "8 พย", "7 พย", "6 พย", "3 พย", "2 พย", "1 พย"].filter(
            (s) => !scannedSheets.has(s)
          );

          if (prioritySheets.length > 0) {
            const extraBatches = await Promise.all(
              prioritySheets.map(async (sName) => {
                try {
                  const sUrl = new URL(gasUrl);
                  sUrl.searchParams.set("action", "getTasks");
                  sUrl.searchParams.set("sheet", sName);
                  sUrl.searchParams.set("assignee", assignee);
                  sUrl.searchParams.set("pendingOnly", "false");
                  const sRes = await fetch(sUrl.toString(), { redirect: "follow", cache: "no-store" });
                  const sJson = await sRes.json();
                  return sJson.tasks || [];
                } catch {
                  return [];
                }
              })
            );

            for (const batch of extraBatches) {
              if (Array.isArray(batch) && batch.length > 0) {
                allRawTasks.push(...batch);
              }
            }
          }
        }
      } catch {}
    } 
    // 2. กรณีเลือกแผ่นงานเดียว (Direct Fetch)
    else if (requestedSheets.length === 1) {
      const sName = requestedSheets[0];
      const singleCacheKey = `tasks_${sName}_${assignee || "ALL"}_${pendingOnly}`;
      const singleCached = serverTasksCache.get(singleCacheKey);
      if (!isForce && singleCached && Date.now() - singleCached.timestamp < CACHE_TTL_MS) {
        return NextResponse.json(singleCached.data);
      }

      const targetUrl = new URL(gasUrl);
      targetUrl.searchParams.set("action", action);
      targetUrl.searchParams.set("sheet", sName);
      targetUrl.searchParams.set("assignee", assignee);
      targetUrl.searchParams.set("pendingOnly", "false");

      const res = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "follow",
        cache: "no-store",
      });

      const responseText = await res.text();
      try {
        const data = JSON.parse(responseText);
        if (data && data.success && Array.isArray(data.tasks)) {
          allRawTasks = data.tasks;
          isSuccess = true;
        }
      } catch {}
    } 
    // 3. กรณีเลือกหลายแผ่นงานพร้อมกัน (Parallel Fetching ด้วย Promise.all)
    else {
      const batchResults = await Promise.all(
        requestedSheets.map(async (sName) => {
          try {
            const singleKey = `tasks_${sName}_${assignee || "ALL"}_${pendingOnly}`;
            const singleCached = serverTasksCache.get(singleKey);
            if (!isForce && singleCached && Date.now() - singleCached.timestamp < CACHE_TTL_MS) {
              return singleCached.data.tasks || [];
            }

            const sUrl = new URL(gasUrl);
            sUrl.searchParams.set("action", "getTasks");
            sUrl.searchParams.set("sheet", sName);
            sUrl.searchParams.set("assignee", assignee);
            sUrl.searchParams.set("pendingOnly", "false");

            const sRes = await fetch(sUrl.toString(), {
              method: "GET",
              headers: { Accept: "application/json" },
              redirect: "follow",
              cache: "no-store",
            });
            const sData = await sRes.json();
            if (sData.success && Array.isArray(sData.tasks)) {
              return sData.tasks;
            }
            return [];
          } catch {
            return [];
          }
        })
      );

      allRawTasks = batchResults.flat();
      isSuccess = true;
    }

    if (isSuccess) {
      // กรองความซ้ำซ้อนของงานตาม sheetName และ row
      const seenKeys = new Set<string>();
      let tasks = allRawTasks.filter((t: any) => {
        const key = `${t.sheetName}_${t.row}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      // จัดการลิงก์ใบบรีฟ ให้เปิดตรงเข้า Google Slides Presentation 100%
      tasks = tasks.map((t: any) => {
        let briefLink = (t.briefLink || "").trim();
        let briefTitle = (t.briefTitle || "").trim();

        // 1. ถ้ามี fileId ใน Google Drive อยู่แล้ว แปลงเป็น docs.google.com/presentation/d/.../edit ทันที
        const dMatch =
          briefLink.match(/\/d\/([-\w]{25,})/i) ||
          briefLink.match(/[?&]id=([-\w]{25,})/i);

        if (dMatch && dMatch[1]) {
          briefLink = `https://docs.google.com/presentation/d/${dMatch[1]}/edit`;
        } 
        // 2. ถ้าไม่มีลิงก์ตรงๆ แต่มีชื่อใบบรีฟ ให้วิ่งผ่าน /api/brief เพื่อค้นหาและ redirect เข้า Google Slides 100%
        else if (!briefLink.startsWith("http://") && !briefLink.startsWith("https://")) {
          if (briefTitle) {
            briefLink = `/api/brief?title=${encodeURIComponent(briefTitle)}&category=${encodeURIComponent(
              t.category || ""
            )}`;
          } else if (briefLink) {
            briefTitle = briefLink;
            briefLink = `/api/brief?title=${encodeURIComponent(briefTitle)}&category=${encodeURIComponent(
              t.category || ""
            )}`;
          }
        }

        return {
          ...t,
          briefLink,
          briefTitle: briefTitle || "เปิดใบบรีฟ (Google Slides)",
        };
      });

      // จัดเรียง: วันที่ล่าสุดขึ้นก่อน และงานที่ยังไม่เสร็จขึ้นก่อน
      tasks.sort((a: any, b: any) => {
        if (a.isCompleted !== b.isCompleted) {
          return a.isCompleted ? 1 : -1;
        }
        return (b.row || 0) - (a.row || 0);
      });

      const responsePayload = {
        success: true,
        tasks: tasks,
        totalFound: tasks.length,
      };

      // บันทึกเข้า Memory Cache
      serverTasksCache.set(cacheKey, {
        data: responsePayload,
        timestamp: Date.now(),
      });

      return NextResponse.json(responsePayload);
    }

    return NextResponse.json(
      {
        success: false,
        error: "ไม่สามารถดึงข้อมูลรายการงานจาก Google Sheets ได้ กรุณาลองใหม่อีกครั้ง",
      },
      { status: 502 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
