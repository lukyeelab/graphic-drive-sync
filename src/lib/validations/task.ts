import { z } from "zod";

export const getTasksQuerySchema = z.object({
  sheet: z.string().min(1, "กรุณาระบุชื่อแผ่นงาน/วันที่"),
  assignee: z.string().optional(),
});

export const taskItemSchema = z.object({
  row: z.number().int().positive("หมายเลขแถวต้องเป็นจำนวนเต็มบวก"),
  category: z.string().min(1, "หมวดหมู่งานต้องไม่ว่าง"),
  taskName: z.string().min(1, "ชื่องานต้องไม่ว่าง"),
  no: z.union([z.number(), z.string()]).optional(),
});

export const syncFolderRequestSchema = z.object({
  sheetName: z.string().min(1, "กรุณาระบุชื่อแผ่นงาน เช่น 7 พย"),
  dateFolderName: z.string().optional(),
  tasks: z.array(taskItemSchema).min(1, "กรุณาเลือกงานอย่างน้อย 1 รายการเพื่อสร้างโฟลเดอร์"),
});

export type GetTasksQuery = z.infer<typeof getTasksQuerySchema>;
export type TaskItem = z.infer<typeof taskItemSchema>;
export type SyncFolderRequest = z.infer<typeof syncFolderRequestSchema>;
