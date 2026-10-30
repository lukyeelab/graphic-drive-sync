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

    // ถ้ามีการตั้งค่า GAS_API_URL ให้ยิงไป Google Apps Script
    if (gasUrl && gasUrl.trim() !== "") {
      const targetUrl = new URL(gasUrl);
      targetUrl.searchParams.set("action", "getTasks");
      targetUrl.searchParams.set("sheet", sheet);
      if (assignee) {
        targetUrl.searchParams.set("assignee", assignee);
      }

      const res = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        return NextResponse.json(
          { success: false, error: `Google Apps Script returned ${res.status}` },
          { status: 502 }
        );
      }

      const data = await res.json();
      return NextResponse.json(data);
    }

    // กรณีที่ยังไม่ได้เชื่อมต่อ GAS_API_URL (โหมด Demo / Preview ข้อมูลจำลองตามรูปภาพ)
    const mockTasks = [
      {
        row: 4,
        category: "สล็อต",
        briefLink: "https://drive.google.com/drive/folders/slot-brief",
        no: 1,
        taskName: "1_ใหม่มาจองสวรรค์ 1000_0711",
        uploadUrl: "",
        team: "A TH",
        assignee: "ลูกหยี",
        assignDate: "24/10/26",
        status: "กำลังทำ",
        isCompleted: false,
      },
      {
        row: 5,
        category: "สล็อต",
        briefLink: "https://drive.google.com/drive/folders/slot-brief",
        no: 2,
        taskName: "2_ชนะคอมโบแตกสนั่น_0711",
        uploadUrl: "",
        team: "A TH",
        assignee: "ลูกหยี",
        assignDate: "24/10/26",
        status: "กำลังทำ",
        isCompleted: false,
      },
      {
        row: 14,
        category: "คาสิโน",
        briefLink: "https://drive.google.com/drive/folders/casino-brief",
        no: 2,
        taskName: "2_น้ำเต้าปูปลา แจกหนัก",
        uploadUrl: "",
        team: "A TH",
        assignee: "ลูกหยี",
        assignDate: "24/10/26",
        status: "กำลังทำ",
        isCompleted: false,
      },
      {
        row: 21,
        category: "บอล",
        briefLink: "https://drive.google.com/drive/folders/football-brief",
        no: 1,
        taskName: "1 UFABET ศูนย์รวมฟุตบอลออนไลน์ 0711",
        uploadUrl: "https://drive.google.com/drive/folders/demo-completed",
        team: "A TH",
        assignee: "ลูกหยี",
        assignDate: "24/10/26",
        status: "เสร็จสิ้น",
        isCompleted: true,
      },
    ];

    const filteredTasks = assignee && assignee !== "ALL"
      ? mockTasks.filter(t => t.assignee.toLowerCase() === assignee.toLowerCase())
      : mockTasks;

    return NextResponse.json({
      success: true,
      isMock: true,
      sheetName: sheet,
      sheets: ["1 พย", "2 พย", "3 พย", "4 พย", "5 พย", "6 พย", "7 พย", "8 พย", "9 พย", "10 พย"],
      tasks: filteredTasks,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
