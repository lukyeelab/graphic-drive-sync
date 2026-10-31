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

    if (!title) {
      return NextResponse.redirect("https://drive.google.com/drive/my-drive", 307);
    }

    // 1. ตรวจสอบ In-Memory Cache ก่อนเสมอ (0ms Redirect)
    const cached = briefCache.get(title);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.redirect(cached.url, 307);
    }

    // 2. เรียก Apps Script action=resolveBrief เพื่อค้นหาไฟล์สไลด์ใน Drive จริง
    const gasUrl = process.env.GAS_API_URL;
    if (gasUrl) {
      try {
        const targetUrl = new URL(gasUrl);
        targetUrl.searchParams.set("action", "resolveBrief");
        targetUrl.searchParams.set("title", title);
        if (category) targetUrl.searchParams.set("category", category);

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

    // 3. Fallback อัจฉริยะ: ค้นหาใน Drive โดยบังคับตัวกรองเฉพาะประเภท presentation
    const cleanSearch = title.replace(/\.(pptx?|pdf|docx?)$/i, "").trim();
    const presentationSearchUrl = `https://drive.google.com/drive/search?q=type:presentation%20${encodeURIComponent(
      cleanSearch
    )}`;
    return NextResponse.redirect(presentationSearchUrl, 307);
  } catch (error: any) {
    if (error?.digest === "NEXT_PRERENDER_INTERRUPTED" || error?.digest?.startsWith("NEXT_")) {
      throw error;
    }
    console.error("Brief API route error:", error);
    return NextResponse.redirect("https://drive.google.com/drive/my-drive", 307);
  }
}
