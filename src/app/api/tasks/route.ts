import { NextRequest, NextResponse } from "next/server";
import { getTasksQuerySchema } from "@/lib/validations/task";

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

    const targetUrl = new URL(gasUrl);
    targetUrl.searchParams.set("action", action);
    if (action === "getTasks") {
      targetUrl.searchParams.set("sheet", sheet);
      targetUrl.searchParams.set("assignee", assignee);
      targetUrl.searchParams.set("pendingOnly", pendingOnly);
    }

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
