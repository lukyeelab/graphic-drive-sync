import { NextRequest, NextResponse } from "next/server";

interface CacheEntry {
  url: string;
  timestamp: number;
}

// แคชหน่วยความจำระดับ Process (24 ชั่วโมง)
const briefCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const title = (searchParams.get("title") || "").trim();
    const category = (searchParams.get("category") || "").trim();
    const force = searchParams.get("force") === "true";

    if (force) {
      briefCache.clear();
    }

    if (!title || title === "-") {
      return NextResponse.redirect("https://docs.google.com/presentation/u/0/", 307);
    }

    // 0. ตรวจสอบว่าใน title หรือ url มี Google Drive/Slides File ID อยู่แล้วหรือไม่
    const directMatch =
      title.match(/\/d\/([-\w]{25,})/i) ||
      title.match(/[?&]id=([-\w]{25,})/i);

    if (directMatch && directMatch[1]) {
      const slideUrl = `https://docs.google.com/presentation/d/${directMatch[1]}/edit`;
      briefCache.set(title, { url: slideUrl, timestamp: Date.now() });
      return NextResponse.redirect(slideUrl, 307);
    }

    // 1. ตรวจสอบ In-Memory Cache ก่อนเสมอ (0ms Redirect) หากไม่ได้ระบุ force
    if (!force) {
      const cached = briefCache.get(title);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return NextResponse.redirect(cached.url, 307);
      }
    }

    // ทำความสะอาดชื่อคำค้นหา: ลบ extension, emoji, คำนำหน้า
    const cleanSearch = title
      .replace(/\.(pptx?|pdf|docx?)$/i, "")
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
      .replace(/^(ใบบรีฟ|บรีฟ)\s*[:\-–—]?\s*/i, "")
      .trim();

    // 2. เรียก Apps Script action=resolveBrief เพื่อค้นหาไฟล์สไลด์ใน Drive จริง
    const gasUrl = process.env.GAS_API_URL;
    if (gasUrl) {
      try {
        const targetUrl = new URL(gasUrl);
        targetUrl.searchParams.set("action", "resolveBrief");
        targetUrl.searchParams.set("title", cleanSearch || title);
        if (category) targetUrl.searchParams.set("category", category);
        if (force) targetUrl.searchParams.set("force", "true");

        const res = await fetch(targetUrl.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          redirect: "follow",
          cache: "no-store",
        });

        const data = await res.json();
        if (data && data.success && data.url) {
          let slideUrl = data.url.toString().trim();
          // ถ้ามี fileId ใน Google Drive ให้แปลงเป็น presentation edit URL 100%
          const dMatch =
            slideUrl.match(/\/d\/([-\w]{25,})/i) ||
            slideUrl.match(/[?&]id=([-\w]{25,})/i);

          if (dMatch && dMatch[1]) {
            slideUrl = `https://docs.google.com/presentation/d/${dMatch[1]}/edit`;
          }

          // บันทึกลง In-Memory Cache เพื่อให้คลิกครั้งถัดไปเด้งใน 0ms
          briefCache.set(title, { url: slideUrl, timestamp: Date.now() });
          return NextResponse.redirect(slideUrl, 307);
        }
      } catch (err) {
        console.error("Brief resolver GAS fetch error:", err);
      }
    }

    // 3. Fallback: ถ้าหาตรงไม่เจอ ให้เปิดการค้นหาใน Google Slides โดยตรง 100%
    const query = cleanSearch || title || category;
    const slidesSearchUrl = `https://docs.google.com/presentation/u/0/?q=${encodeURIComponent(query)}`;
    return NextResponse.redirect(slidesSearchUrl, 307);
  } catch (error: any) {
    if (error?.digest === "NEXT_PRERENDER_INTERRUPTED" || error?.digest?.startsWith("NEXT_")) {
      throw error;
    }
    console.error("Brief API route error:", error);
    return NextResponse.redirect("https://docs.google.com/presentation/u/0/", 307);
  }
}
