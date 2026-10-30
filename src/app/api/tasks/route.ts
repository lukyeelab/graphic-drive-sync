import { NextRequest, NextResponse } from "next/server";
import { getTasksQuerySchema } from "@/lib/validations/task";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sheet = searchParams.get("sheet") || "7 พย";
    const assignee = searchParams.get("assignee") || "";

    const validation = getTasksQuerySchema.safeParse({ sheet, assignee });
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

    const targetUrl = new URL(gasUrl);
    targetUrl.searchParams.set("action", "getTasks");
    targetUrl.searchParams.set("sheet", sheet);
    if (assignee) {
      targetUrl.searchParams.set("assignee", assignee);
    }

    const res = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      redirect: "follow",
      cache: "no-store",
    });

    const responseText = await res.text();

    // ตรวจสอบว่า Google Apps Script ส่งกลับมาเป็น JSON หรือติดหน้าขอสิทธิ์ (HTML)
    try {
      const data = JSON.parse(responseText);
      return NextResponse.json(data);
    } catch {
      if (responseText.includes("ต้องมีสิทธิ์เข้าถึง") || responseText.includes("Sign in")) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Google Apps Script แจ้งเตือน: 'ต้องมีสิทธิ์เข้าถึง' (เกิดจากการตั้งค่า Deploy: ช่อง 'Who has access (ผู้มีสิทธิ์เข้าถึง)' ยังไม่ได้เลือกเป็น 'Anyone (ทุกคน)')",
            raw: responseText.slice(0, 300),
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
