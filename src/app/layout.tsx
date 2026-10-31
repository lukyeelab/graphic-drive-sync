import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Graphic Drive Sync | ระบบจัดการไฟล์งานและ Google Sheets",
  description: "ระบบสร้างโฟลเดอร์ Google Drive อัตโนมัติและอัปเดต Google Sheets สำหรับทีมกราฟิก",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
