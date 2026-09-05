# 🏆 ตารางคะแนน AoV (Arena of Valor)

เว็บตารางคะแนนสำหรับการแข่งขัน AoV — มี **หน้าบ้าน** (แสดงตารางคะแนน อัปเดตเรียลไทม์) และ **หลังบ้าน** (เพิ่มทีม / บันทึกผลแมตช์ / ตั้งค่า)

## หน้าเว็บ

| URL | หน้า | คำอธิบาย |
|---|---|---|
| `/` | index.html | ตารางคะแนน (อ่านอย่างเดียว, อัปเดตอัตโนมัติ) |
| `/admin` | admin.html | หลังบ้านสำหรับจัดเก็บข้อมูล |

## ความสามารถหลัก

- 📊 ตารางคะแนนแบบกลุ่ม + ระบบ Tiebreaker (ผลต่างชนะ-แพ้ → คิล → ตาย → เฮดทูเฮด)
- ⚔️ บันทึกผลแมตช์แบบ BO1 / BO2 / BO3 / BO5 พร้อมคิลรายเกม
- 🖼️ โลโก้ทีม (URL รูปภาพ หรือ สี + ตัวย่อ)
- ☁️ **Firebase Realtime Database** — ข้อมูลกลาง อัปเดตพร้อมกันทุกเครื่อง
- 💾 สำรองใน localStorage เมื่อ Firebase ไม่พร้อมใช้งาน

## เทคโนโลยี

- เว็บไซต์แบบ static (HTML + Tailwind CSS CDN + JavaScript ตรง ๆ)
- Firebase Realtime Database (Web SDK v9 compat CDN)
- Deploy ผ่าน **Vercel**

## รันในเครื่อง

```bash
npm install
npm start        # เปิดผ่าน vercel dev (http://localhost:3000)
```

หรือเปิด `index.html` / `admin.html` ตรง ๆ ในเบราว์เซอร์ก็ได้ (ในโหมด localStorage)

## Deploy ขึ้น Vercel

1. Push repo นี้ขึ้น GitHub / GitLab / Bitbucket
2. นำเข้าโปรเจกต์ที่ [vercel.com/new](https://vercel.com/new) — Vercel ตรวจจับว่าเป็น static site ให้อัตโนมัติ
3. หลัง deploy สำเร็จ หน้าบ้านคือ URL หลัก หลังบ้านคือ `/admin`

> ทุกครั้งที่ push ไป branch หลัก Vercel จะ redeploy ให้เอง

## ตั้งค่า Firebase (ข้อมูลกลาง)

1. สร้างโปรเจกต์ที่ [Firebase Console](https://console.firebase.google.com)
2. **Build → Realtime Database → Create database** (โหมด Test ได้; เลือกภูมิภาค เช่น `asia-southeast1`)
3. เพิ่ม Web App แล้ว copy config ไปใส่ใน `firebase_config.js`
4. **สำคัญ (ความปลอดภัย):** แนะนำตั้ง Security Rules ใน Realtime Database ให้ **อ่านได้ทุกคน / เขียนได้เฉพาะ admin** เช่น:

```json
{
  "rules": {
    "standings": {
      ".read": true,
      ".write": false
    }
  }
}
```

> ⚠️ ไฟล์ `firebase_config.js` เป็น client-side config — key ไม่ใช่ความลับ (ปกป้องโดย Rules ไม่ใช่ key) แต่ไม่ควรนำไปใช้กับ backend