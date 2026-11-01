import { NextRequest, NextResponse } from "next/server";
import { getTasksQuerySchema } from "@/lib/validations/task";

interface CacheEntry {
  data: any;
  timestamp: number;
}

const serverTasksCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15000; // แคชฝั่งเซิร์ฟเวอร์ 15 วินาทีเพื่อป้องกันยิงซ้ำติดๆ กัน แต่รับประกันความสดใหม่ Realtime

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
      const force = searchParams.get("force") === "true";
      // 1. ลองเรียก action=getMetadata จาก GAS
      let targetUrl = new URL(gasUrl);
      targetUrl.searchParams.set("action", "getMetadata");
      if (force) {
        targetUrl.searchParams.set("force", "true");
      }

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

    // กรณีแปลงลิงก์ในชีตให้เป็น Smart Chip (action=fixSmartChips)
    if (action === "fixSmartChips") {
      const rowsParam = searchParams.get("rows") || "";
      const targetUrl = new URL(gasUrl);
      targetUrl.searchParams.set("action", "fixSmartChips");
      targetUrl.searchParams.set("sheet", sheet);
      if (rowsParam) targetUrl.searchParams.set("rows", rowsParam);

      const res = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "follow",
        cache: "no-store",
      });

      const responseText = await res.text();
      try {
        const data = JSON.parse(responseText);
        return NextResponse.json(data);
      } catch {
        return NextResponse.json(
          { success: false, error: "Google Apps Script ตอบกลับไม่ใช่ JSON: " + responseText.slice(0, 200) },
          { status: 502 }
        );
      }
    }

    // กรณีค้นหาแผ่นงานที่มีงานของพนักงานคนนั้น (action=getMatchingSheets)
    if (action === "getMatchingSheets") {
      const targetUrl = new URL(gasUrl);
      targetUrl.searchParams.set("action", "getMatchingSheets");
      targetUrl.searchParams.set("assignee", assignee);
      targetUrl.searchParams.set("sheet", sheet);

      const res = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "follow",
        cache: "no-store",
      });

      const responseText = await res.text();
      try {
        const data = JSON.parse(responseText);
        return NextResponse.json(data);
      } catch {
        return NextResponse.json(
          { success: false, error: "Google Apps Script ตอบกลับไม่ใช่ JSON: " + responseText.slice(0, 200) },
          { status: 502 }
        );
      }
    }

    // กรณีดึงรายการงาน (action=getTasks)
    const isForce = searchParams.get("force") === "true";
    const knownHashes = searchParams.get("knownHashes") || "";
    if (isForce) {
      serverTasksCache.clear();
    }

    const sheetParam = sheet || "ALL";
    const requestedSheets = sheetParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // หากมี knownHashes ให้ส่งไปตรวจสอบที่ GAS ตรงๆ โดยไม่ใช้ serverTasksCache เพื่อทำ Delta Sync ที่แม่นยำ
    const cacheKey = `tasks_${requestedSheets.sort().join(",")}_${assignee || "ALL"}_${pendingOnly}`;
    const cachedEntry = serverTasksCache.get(cacheKey);

    if (!isForce && !knownHashes && cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cachedEntry.data);
    }

    let allRawTasks: any[] = [];
    let responseUnchangedSheets: string[] = [];
    let responseChecksums: Record<string, string> = {};
    let isSuccess = false;

    // 1. กรณีเลือก "ALL" หรือไม่ได้ระบุ
    if (requestedSheets.includes("ALL") || requestedSheets.length === 0) {
      console.log(`[API /tasks] Calling GAS for sheet=ALL, assignee=${assignee}...`);
      const t0 = Date.now();
      const targetUrl = new URL(gasUrl);
      targetUrl.searchParams.set("action", action);
      targetUrl.searchParams.set("sheet", "ALL");
      targetUrl.searchParams.set("assignee", assignee);
      targetUrl.searchParams.set("pendingOnly", "false");
      if (isForce) targetUrl.searchParams.set("force", "true");
      if (knownHashes) targetUrl.searchParams.set("knownHashes", knownHashes);

      const res = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "follow",
        cache: "no-store",
      });

      console.log(`[API /tasks] GAS fetch finished in ${Date.now() - t0}ms, status=${res.status}`);
      const responseText = await res.text();
      try {
        const data = JSON.parse(responseText);
        if (data && data.success) {
          if (Array.isArray(data.tasks)) allRawTasks = data.tasks;
          if (Array.isArray(data.unchangedSheets)) responseUnchangedSheets = data.unchangedSheets;
          if (data.checksums && typeof data.checksums === "object") responseChecksums = data.checksums;
          isSuccess = true;
        }
      } catch (e: any) {
        console.error("[API /tasks] JSON parse error:", e);
      }
    } 
    // 2. กรณีเลือกแผ่นงานเดียว หรือส่งหลายแผ่นงานพร้อมกัน (รวมถึง Delta Sync)
    else {
      // หากมี knownHashes หรือ Force ให้ยิงรวมชุดเดียวไปที่ GAS เลยเพื่อทำ Delta Sync พร้อมกัน
      const targetUrl = new URL(gasUrl);
      targetUrl.searchParams.set("action", action);
      targetUrl.searchParams.set("sheet", requestedSheets.join(","));
      targetUrl.searchParams.set("assignee", assignee);
      targetUrl.searchParams.set("pendingOnly", "false");
      if (isForce) targetUrl.searchParams.set("force", "true");
      if (knownHashes) targetUrl.searchParams.set("knownHashes", knownHashes);

      const res = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "follow",
        cache: "no-store",
      });

      const responseText = await res.text();
      try {
        const data = JSON.parse(responseText);
        if (data && data.success) {
          if (Array.isArray(data.tasks)) allRawTasks = data.tasks;
          if (Array.isArray(data.unchangedSheets)) responseUnchangedSheets = data.unchangedSheets;
          if (data.checksums && typeof data.checksums === "object") responseChecksums = data.checksums;
          isSuccess = true;
        }
      } catch (e) {
        console.error("[API /tasks] JSON parse error:", e);
      }
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

      // จัดเรียงตามลำดับแถวบนชีตจริงจากบนลงล่างเสมอ (Row 2, 3, 4, 5...)
      // เพื่อให้เลขลำดับงาน (No.) และแถว เรียงถูกต้องเหมือนบนชีต ไม่กลับหัว
      tasks.sort((a: any, b: any) => {
        return (a.row || 0) - (b.row || 0);
      });

      const responsePayload = {
        success: true,
        tasks: tasks,
        totalFound: tasks.length,
        unchangedSheets: responseUnchangedSheets,
        checksums: responseChecksums,
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
