/**
 * 跳绳打卡数据存储层
 * - 已配置 Firebase：云端实时同步（多端共享）
 * - 未配置：localStorage 本地存储（仅当前浏览器）
 *
 * 单日记录：{ count, durationSec, note, at }
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const LOCAL_KEY = "jump-rope-checkin-data-v1";

function emptyData() {
  return { dates: {}, updatedAt: 0 };
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const count = Math.max(0, Math.round(Number(raw.count) || 0));
  const durationSec = Math.max(0, Math.round(Number(raw.durationSec) || 0));
  return {
    count,
    durationSec,
    note: typeof raw.note === "string" ? raw.note : "",
    at: Number(raw.at) || Date.now(),
  };
}

function normalizeDates(dates) {
  const out = {};
  if (!dates || typeof dates !== "object") return out;
  for (const [key, value] of Object.entries(dates)) {
    const rec = normalizeRecord(value);
    if (rec && rec.count > 0) out[key] = rec;
  }
  return out;
}

function isFirebaseConfigured(cfg) {
  return Boolean(
    cfg &&
      cfg.apiKey &&
      cfg.apiKey !== "YOUR_API_KEY" &&
      cfg.projectId &&
      cfg.projectId !== "YOUR_PROJECT_ID" &&
      cfg.appId &&
      cfg.appId !== "YOUR_APP_ID"
  );
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    // 兼容旧版每日打卡 key
    const legacy = !raw ? localStorage.getItem("daily-checkin-data-v1") : null;
    const source = raw || legacy;
    if (!source) return emptyData();
    const parsed = JSON.parse(source);
    return {
      dates: normalizeDates(parsed.dates),
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return emptyData();
  }
}

function saveLocal(data) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

export function createStorage(userConfig = {}) {
  const firebaseConfig = userConfig.firebase || {};
  const collectionName = userConfig.collection || "checkins";
  const docId = userConfig.docId || "default";
  const useCloud = isFirebaseConfigured(firebaseConfig);

  let data = loadLocal();
  let unsubscribe = null;
  const listeners = new Set();

  function notify(status) {
    for (const fn of listeners) fn(data, status);
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getData() {
    return data;
  }

  async function persist(next) {
    data = {
      dates: normalizeDates(next.dates),
      updatedAt: Date.now(),
    };
    saveLocal(data);

    if (useCloud && db && docRef) {
      await setDoc(docRef, data, { merge: true });
    }

    notify(useCloud ? "online" : "local");
    return data;
  }

  async function upsert(dateKey, record) {
    const today = (() => {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    })();
    if (dateKey > today) {
      throw new Error("不能给未来日期打卡");
    }
    const next = normalizeRecord({ ...record, at: Date.now() });
    if (!next || next.count <= 0) {
      throw new Error("请填写有效的跳绳个数");
    }
    const dates = { ...data.dates, [dateKey]: next };
    return persist({ dates });
  }

  async function remove(dateKey) {
    const today = (() => {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    })();
    if (dateKey > today) {
      throw new Error("不能修改未来日期");
    }
    const dates = { ...data.dates };
    delete dates[dateKey];
    return persist({ dates });
  }

  let db = null;
  let docRef = null;

  async function init() {
    if (!useCloud) {
      notify("local");
      return { mode: "local", message: "未配置云端，使用本地存储" };
    }

    try {
      const app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      docRef = doc(db, collectionName, docId);

      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const remote = snap.data() || {};
        const remoteDates = normalizeDates(remote.dates);
        const remoteUpdated = Number(remote.updatedAt) || 0;
        const localUpdated = Number(data.updatedAt) || 0;

        if (remoteUpdated >= localUpdated) {
          data = { dates: remoteDates, updatedAt: remoteUpdated };
        } else {
          await setDoc(docRef, data, { merge: true });
        }
        saveLocal(data);
      } else if (Object.keys(data.dates).length > 0) {
        await setDoc(docRef, data);
      } else {
        await setDoc(docRef, emptyData());
        data = emptyData();
      }

      unsubscribe = onSnapshot(
        docRef,
        (live) => {
          if (!live.exists()) return;
          const remote = live.data() || {};
          data = {
            dates: normalizeDates(remote.dates),
            updatedAt: Number(remote.updatedAt) || Date.now(),
          };
          saveLocal(data);
          notify("online");
        },
        () => notify("error")
      );

      notify("online");
      return { mode: "online", message: "云端同步已开启" };
    } catch (err) {
      console.error(err);
      notify("error");
      return { mode: "error", message: err.message || "云端连接失败，已回退本地" };
    }
  }

  function destroy() {
    if (unsubscribe) unsubscribe();
  }

  return {
    init,
    destroy,
    onChange,
    getData,
    upsert,
    remove,
    isCloud: useCloud,
  };
}
