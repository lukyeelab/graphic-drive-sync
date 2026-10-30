# Graphic Drive Sync 🚀

ระบบจัดการ Google Sheets & Google Drive Automation สำหรับทีมกราฟิกและทีมงานผลิตสื่อ
ช่วยสร้างโฟลเดอร์ Google Drive (TH & INTER) อัตโนมัติ นำลิงก์ไปใส่ใน Google Sheets ในช่องที่กำหนด (รองรับ Merged Cells) และปรับสถานะเป็น "เสร็จสิ้น" ทันที

---

## 🛠 Tech Stack
- **Frontend & Backend**: Next.js (App Router, TypeScript)
- **Styling**: Tailwind CSS & Lucide Icons
- **Form & Validation**: Zod + React Hook Form
- **Database / Master Data**: Google Apps Script (GAS) เชื่อมต่อกับ Google Sheets & Google Drive API
- **Deployment**: Vercel

---

## 🌟 จุดเด่นของระบบ
1. **รองรับ Merged Cells 100%**: รองรับทั้งช่อง Col F-G ที่ merge กัน, และช่องหมวดหมู่งาน/ใบบรีฟที่ merge หลายแถว โดยไม่ทำให้รูปแบบชีตของบริษัทเสียหาย
2. **สร้างโฟลเดอร์คู่ขนาน TH & INTER**: สร้างโฟลเดอร์ตามโครงสร้าง `เดือน > วันที่ > หมวดหมู่งาน > ชื่องาน` ทั้งฝั่งไทยและต่างประเทศ
3. **ป้องกันโฟลเดอร์ซ้ำ**: ตรวจสอบก่อนว่าโฟลเดอร์วันที่หรือหมวดหมู่นั้นมีเพื่อนในทีมสร้างไว้แล้วหรือไม่ ถ้ามีแล้วจะใช้โฟลเดอร์เดิมทันที
4. **กรองตามผู้รับงาน**: เลือกเฉพาะงานของตนเอง (เช่น "ลูกหยี") และเลือกวัน/แท็บชีตได้สะดวก
5. **อัปเดตชีตอัตโนมัติ**: แปะ RichText Link ลงในช่อง Col F และเปลี่ยน Col L เป็น "เสร็จสิ้น"

---

## 🚀 วิธีติดตั้งและใช้งาน

### 1. ติดตั้ง Dependencies ในเครื่อง
```bash
npm install
npm run dev
```
เปิดบราวเซอร์ที่ `http://localhost:3000`

### 2. ติดตั้ง Google Apps Script ใน Google Sheets
1. เปิด Google Sheets งานของคุณ
2. ไปที่เมนู **ส่วนขยาย (Extensions)** > **Apps Script**
3. คัดลอกโค้ดทั้งหมดในไฟล์ `google-apps-script/Code.gs` ไปวางแทนที่
4. กด **บันทึก (Save)**
5. กดปุ่มสีน้ำเงินมุมขวาบน **นำไปใช้งาน (Deploy)** > **การนำไปใช้งานใหม่ (New deployment)**
   - ประเภท: **เว็บแอป (Web app)**
   - ดำเนินการในฐานะ: **ฉัน (Me)**
   - ผู้มีสิทธิ์เข้าถึง: **ทุกคน (Anyone)**
6. คัดลอก URL ของ Web App ที่ได้มาใส่ใน `.env.local`:
```env
GAS_API_URL=https://script.google.com/macros/s/AKfycb.../exec
```

### 3. Deploy ขึ้น Vercel
1. เชื่อมต่อ Git Repo `https://github.com/lukyeelab/graphic-drive-sync` เข้ากับ Vercel
2. เพิ่ม Environment Variable: `GAS_API_URL`
3. กด Deploy พร้อมใช้งานได้ทันที
