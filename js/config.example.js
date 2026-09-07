/**
 * 打卡配置
 * 1. 复制本文件为 config.js（已提供一份可直接改的 config.js）
 * 2. 去 Firebase 控制台创建项目，开启 Firestore
 * 3. 把网页应用的 firebaseConfig 填到下面
 * 4. docId 请改成你自己的私密字符串（相当于「房间号」），多端填同一个即可同步
 */
window.CHECKIN_CONFIG = {
  // 多端必须一致：建议改成随机长字符串，例如 checkin-xiao-ming-2026-ab12
  docId: "my-checkin-room",
  collection: "checkins",

  // 从 Firebase 控制台 → 项目设置 → 你的应用 复制
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
  },
};
