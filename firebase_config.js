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
  apiKey: "AIzaSyD_FYKTMLN7AzHmqT_T-QuSs07msd0JbSo",
  authDomain: "aov-standings.firebaseapp.com",
  databaseURL: "https://aov-standings-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "aov-standings",
  storageBucket: "aov-standings.firebasestorage.app",
  messagingSenderId: "555643523156",
  appId: "1:555643523156:web:6011221e06eda8a7f79dc1",
};