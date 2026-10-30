import { NextRequest, NextResponse } from "next/server";
import { syncFolderRequestSchema } from "@/lib/validations/task";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Zod Validation ตรวจสอบข้อมูลก่อนส่งต่อ
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

    // 2. ถ้ามี GAS_API_URL ให้ส่งต่อไปยัง Google Apps Script
    if (gasUrl && gasUrl.trim() !== "") {
      const res = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createFolders",
          sheetName: payload.sheetName,
          dateFolderName: payload.dateFolderName || payload.sheetName,
          tasks: payload.tasks,
        }),
      });

      if (!res.ok) {
        return NextResponse.json(
          { success: false, message: `Google Apps Script returned ${res.status}` },
          { status: 502 }
        );
      }

      const data = await res.json();
      return NextResponse.json(data);
    }

    // กรณีโหมด Mock / Demo
    await new Promise((resolve) => setTimeout(resolve, 1500)); // จำลองดีเลย์

    const mockResults = payload.tasks.map((task) => ({
      row: task.row,
      taskName: task.taskName,
      thFolderUrl: `https://drive.google.com/drive/folders/mock-th-${task.row}`,
      interFolderUrl: `https://drive.google.com/drive/folders/mock-inter-${task.row}`,
      status: "เสร็จสิ้น",
    }));

    return NextResponse.json({
      success: true,
      isMock: true,
      message: `[Demo] สร้างโฟลเดอร์สำเร็จ ${mockResults.length} รายการ และเปลี่ยนสถานะเป็น 'เสร็จสิ้น' แล้ว`,
      updatedTasks: mockResults,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
