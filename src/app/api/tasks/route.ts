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
    const cacheKey = `tasks_${sheet}_${assignee || "ALL"}_${pendingOnly}`;
    const cachedEntry = serverTasksCache.get(cacheKey);

    if (!isForce && cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cachedEntry.data);
    }

    const targetUrl = new URL(gasUrl);
    targetUrl.searchParams.set("action", action);
    targetUrl.searchParams.set("sheet", sheet);
    targetUrl.searchParams.set("assignee", assignee);
    targetUrl.searchParams.set("pendingOnly", "false"); // ดึงทั้งเสร็จและไม่เสร็จเสมอ เพื่อให้สลับดูได้ใน 0ms

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
        // Fallback อัจฉริยะ: หากเลือก sheet=ALL แต่ GAS ยังส่งมาไม่ครบทุกแผ่นงาน
        // Next.js จะดึงแผ่นงาน พ.ย. อื่นๆ ที่มีงาน (เช่น 7 พย, 8 พย, 6 พย, 3 พย, 2 พย, 1 พย) มาผสานรวมให้ทันที
        if (sheet === "ALL") {
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
                data.tasks.push(...batch);
              }
            }
          }
        }

        // กรองความซ้ำซ้อนของงานตาม sheetName และ row
        const seenKeys = new Set<string>();
        data.tasks = data.tasks.filter((t: any) => {
          const key = `${t.sheetName}_${t.row}`;
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });

        data.tasks = data.tasks.map((t: any) => {
          let briefLink = (t.briefLink || "").trim();
          let briefTitle = (t.briefTitle || "").trim();

          const isUrl = briefLink.startsWith("http://") || briefLink.startsWith("https://");
          if (!isUrl && briefLink) {
            if (!briefTitle) briefTitle = briefLink;
            briefLink = `https://drive.google.com/drive/search?q=${encodeURIComponent(briefTitle)}`;
          } else if (!briefLink && briefTitle) {
            briefLink = `https://drive.google.com/drive/search?q=${encodeURIComponent(briefTitle)}`;
          }

          return {
            ...t,
            briefLink,
            briefTitle: briefTitle || "เปิดใบบรีฟ",
          };
        });

        // จัดเรียง: วันที่ล่าสุดขึ้นก่อน และงานที่ยังไม่เสร็จขึ้นก่อน
        data.tasks.sort((a: any, b: any) => {
          if (a.isCompleted !== b.isCompleted) {
            return a.isCompleted ? 1 : -1;
          }
          return (b.row || 0) - (a.row || 0);
        });

        data.totalFound = data.tasks.length;

        // บันทึกเข้า Memory Cache 60 วินาที
        serverTasksCache.set(cacheKey, {
          data,
          timestamp: Date.now(),
        });
      }
      return NextResponse.json(data);
    } catch {
      if (
        responseText.includes("ต้องมีสิทธิ์เข้าถึง") ||
        responseText.includes("Sign in")
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Google Apps Script แจ้งเตือน: 'ต้องมีสิทธิ์เข้าถึง' (โปรดตั้งค่า Deploy: 'Who has access' ให้เป็น 'Anyone')",
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: `Google Apps Script ตอบกลับไม่ใช่ JSON: ${responseText.slice(0, 200)}`,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
