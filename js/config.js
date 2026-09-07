/**
 * 打卡配置（部署前请填写 Firebase 信息）
 * 未填写时会自动使用浏览器本地存储，仅当前设备有效。
 *
 * 多端同步：所有设备打开同一个网页，并使用相同的 firebase + docId。
 */
window.CHECKIN_CONFIG = {
  // 改成你的私密房间号（不要用太简单的词）
  docId: "my-checkin-room",
  collection: "checkins",

  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
  },
};
