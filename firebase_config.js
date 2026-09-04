/* ============================================================
   Firebase config — ข้อมูลกลางสำหรับเว็บตารางคะแนน
   ------------------------------------------------------------
   วิธีตั้งค่า (ครั้งแรก):
   1) ไปที่ https://console.firebase.google.com/ → add project
   2) เมนู Build > Realtime Database > Create database
      (โหมด Test ได้เลย; เปิดภูมิภาค เช่น asia-southeast1)
   3) ที่หน้าโปรเจก ไปที่ ⚙️ Project settings > General > Your apps
      > Web (วงเล็บ </>) → Register app → copy object config
   4) วางค่าลงใน FIREBASE_CONFIG ด้านล่าง (แทนที่ placeholder)
   5) บันทึก แล้วเปิด/รีเฟรชเว็บ — หลังบ้านจะเขียนข้อมูลกลาง,
      หน้าบ้านจะอ่านแบบเรียลไทม์จาก node "standings"
   ============================================================ */

window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};