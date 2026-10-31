import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sheetName, days, categories } = body;

    if (!sheetName || !Array.isArray(days) || days.length === 0) {
      return NextResponse.json(
        { success: false, message: "กรุณาระบุชื่อแผ่นงานและวันที่ต้องการสร้าง" },
        { status: 400 }
      );
    }

    const gasUrl = process.env.GAS_API_URL;
    if (!gasUrl || gasUrl.trim() === "") {
      return NextResponse.json(
        { success: false, message: "ยังไม่ได้ระบุ GAS_API_URL ในไฟล์ .env.local" },
        { status: 500 }
      );
    }

    const res = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "precreateFoldersBatch",
        sheetName: sheetName,
        days: days,
        categories: categories || [
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
      redirect: "follow",
    });

    const responseText = await res.text();
    try {
      const data = JSON.parse(responseText);
      return NextResponse.json(data);
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: `Google Apps Script ตอบกลับไม่ใช่ JSON: ${responseText.slice(0, 200)}`,
        },
        { status: 502 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ" },
      { status: 500 }
    );
  }
}
