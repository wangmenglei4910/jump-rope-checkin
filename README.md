# 每日打卡日历

一个可部署到 **GitHub Pages** 的静态打卡网页：月历点选、连续天数统计、备注，支持 **多端实时同步**。

## 为什么不用「纯 JS 文件存数据」？

把打卡记录写进仓库里的 `.js` / `.json`，浏览器**无法直接改 GitHub 文件**（除非把带写权限的 Token 暴露到前端，不安全）。

因此本项目采用：

| 方案 | 作用 |
|------|------|
| **GitHub Pages** | 免费托管网页 |
| **Firebase Firestore（免费额度）** | 云端存打卡数据，多端打开都是最新 |
| **localStorage** | 未配置云端时本地可用；有云端时作缓存 |

同一套 `firebase` 配置 + 同一个 `docId`（房间号）→ 手机 / 电脑打开同一网址即可共享数据。

## 本地预览

用任意静态服务器打开项目根目录，例如：

```bash
npx serve .
```

或用 VS Code / Cursor 的 Live Server。直接用 `file://` 打开时，ES Module 可能受限，建议走本地服务器。

未配置 Firebase 时右上角显示「仅本地」，数据只存在当前浏览器。

## 开启多端同步（约 5 分钟）

### 1. 创建 Firebase 项目

1. 打开 [Firebase 控制台](https://console.firebase.google.com/)
2. 添加项目 → 创建
3. 进入项目后点「</>」添加 **Web 应用**，复制 `firebaseConfig`

### 2. 开启 Firestore

1. 左侧 **Build → Firestore Database → 创建数据库**
2. 选「以测试模式开始」（个人打卡够用；正式可再收紧规则）
3. 地区选近的即可（如 `asia-east1`）

测试模式规则示例（控制台可改）：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> 安全提示：请把 `js/config.js` 里的 `docId` 改成**足够长、别人猜不到**的字符串（相当于私密房间号）。知道网址 + 配置的人才能读写这份数据。

### 3. 填写配置

编辑 `js/config.js`：

```js
window.CHECKIN_CONFIG = {
  docId: "checkin-你的名字-随机串",  // 多端必须相同
  collection: "checkins",
  firebase: {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "...",
  },
};
```

保存后刷新，右上角应变为「云端已同步」。

## 部署到 GitHub Pages（免费）

```bash
cd 打卡小程序
git init
git add .
git commit -m "Add daily check-in calendar"
```

在 GitHub 新建公开仓库，然后：

```bash
git remote add origin https://github.com/你的用户名/仓库名.git
git branch -M main
git push -u origin main
```

仓库 **Settings → Pages**：

- Source：`Deploy from a branch`
- Branch：`main` / `/ (root)`
- Save

几分钟后访问：

`https://你的用户名.github.io/仓库名/`

手机和电脑都打开这个地址，即可共用同一份打卡记录。

## 功能一览

- 月历打卡 / 补打 / 取消
- 今日一键打卡
- 累计、当前连续、最长连续、本月次数
- 每日可选备注
- 云端实时同步 + 本地缓存（断网也能看本地副本）

## 目录结构

```
├── index.html
├── css/style.css
├── js/
│   ├── app.js              # 日历与交互
│   ├── storage.js          # Firestore / localStorage
│   ├── config.js           # 你的配置（部署时填写）
│   └── config.example.js   # 配置模板
└── README.md
```

## 常见问题

**Q: 换浏览器 / 清缓存会丢数据吗？**  
配置了 Firebase 后不会；数据在云端。仅本地模式会丢。

**Q: 两个人想各自打卡？**  
各自用不同的 `docId`，或各自一个 Firebase 项目。

**Q: Firestore 免费够用吗？**  
个人每日打卡量远低于免费额度，一般完全够用。
