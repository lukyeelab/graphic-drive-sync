import { NextRequest, NextResponse } from "next/server";
import { syncFolderRequestSchema } from "@/lib/validations/task";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Zod Validation
    const validation = syncFolderRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: "ข้อมูลไม่ถูกต้องตามรูปแบบ",
          errors: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const payload = validation.data;
    const gasUrl = process.env.GAS_API_URL;

    if (!gasUrl || gasUrl.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          message: "ยังไม่ได้ระบุ GAS_API_URL ในไฟล์ .env.local",
        },
        { status: 500 }
      );
    }

    const res = await fetch(gasUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "createFolders",
        sheetName: payload.sheetName,
        dateFolderName: payload.dateFolderName || payload.sheetName,
        tasks: payload.tasks,
      }),
      redirect: "follow",
    });

    const responseText = await res.text();

    try {
      const data = JSON.parse(responseText);
      return NextResponse.json(data);
    } catch {
      if (responseText.includes("ต้องมีสิทธิ์เข้าถึง") || responseText.includes("Sign in")) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Google Apps Script แจ้งเตือน: 'ต้องมีสิทธิ์เข้าถึง' (โปรดตั้งค่า Deploy: 'Who has access' ให้เป็น 'Anyone')",
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          message: `Google Apps Script ตอบกลับไม่ใช่ JSON: ${responseText.slice(0, 200)}`,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
