import { z } from "zod";

export const getTasksQuerySchema = z.object({
  action: z.enum(["getTasks", "getMetadata"]).default("getTasks"),
  sheet: z.string().optional(),
  assignee: z.string().optional(),
  pendingOnly: z.enum(["true", "false"]).optional(),
});

export const batchTaskItemSchema = z.object({
  sheetName: z.string().min(1, "กรุณาระบุชื่อแผ่นงาน เช่น 7 พย"),
  row: z.number().int().positive("หมายเลขแถวต้องเป็นจำนวนเต็มบวก"),
  category: z.string().min(1, "หมวดหมู่งานต้องไม่ว่าง"),
  taskName: z.string().min(1, "ชื่องานต้องไม่ว่าง"),
  no: z.union([z.number(), z.string()]).optional(),
});

export const syncFolderBatchRequestSchema = z.object({
  tasks: z.array(batchTaskItemSchema).min(1, "กรุณาเลือกงานอย่างน้อย 1 รายการเพื่อสร้างโฟลเดอร์"),
});

export type GetTasksQuery = z.infer<typeof getTasksQuerySchema>;
export type BatchTaskItem = z.infer<typeof batchTaskItemSchema>;
export type SyncFolderBatchRequest = z.infer<typeof syncFolderBatchRequestSchema>;
