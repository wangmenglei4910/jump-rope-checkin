/**
 * 多用户跳绳打卡存储
 * - 用手机号 + 密码区分用户
 * - GitHub Gist 云端同步（同一手机号多端共享）
 */

const CONFIG_OVERRIDE_KEY = "jump-rope-sync-config-v1";
const SESSION_KEY = "jump-rope-session-v2";
const POLL_MS = 5000;

function emptyUser() {
  return { pin: "", dates: {}, updatedAt: 0 };
}

function emptyStore() {
  return { version: 2, users: {} };
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

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function isValidPhone(phone) {
  return /^1\d{10}$/.test(normalizePhone(phone));
}

export function isValidPin(pin) {
  return /^\d{4,8}$/.test(String(pin || ""));
}

function userLocalKey(phone) {
  return `jump-rope-user-${normalizePhone(phone)}-v2`;
}

function loadUserLocal(phone) {
  try {
    const raw = localStorage.getItem(userLocalKey(phone));
    if (!raw) return emptyUser();
    const parsed = JSON.parse(raw);
    return {
      pin: String(parsed.pin || ""),
      dates: normalizeDates(parsed.dates),
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return emptyUser();
  }
}

function saveUserLocal(phone, user) {
  localStorage.setItem(
    userLocalKey(phone),
    JSON.stringify({
      pin: String(user.pin || ""),
      dates: normalizeDates(user.dates),
      updatedAt: Number(user.updatedAt) || 0,
    })
  );
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const phone = normalizePhone(parsed.phone);
    const pin = String(parsed.pin || "");
    if (!isValidPhone(phone) || !isValidPin(pin)) return null;
    return { phone, pin };
  } catch {
    return null;
  }
}

export function saveSession(phone, pin) {
  const p = normalizePhone(phone);
  localStorage.setItem(SESSION_KEY, JSON.stringify({ phone: p, pin: String(pin) }));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function loadConfigOverride() {
  try {
    const raw = localStorage.getItem(CONFIG_OVERRIDE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export function saveConfigOverride(partial) {
  const next = { ...loadConfigOverride(), ...partial };
  localStorage.setItem(CONFIG_OVERRIDE_KEY, JSON.stringify(next));
  return next;
}

function resolveConfig(userConfig = {}) {
  const override = loadConfigOverride();
  return {
    gistId: String(override.gistId || userConfig.gistId || "").trim(),
    githubToken: String(override.githubToken || userConfig.githubToken || "").trim(),
  };
}

export function isSyncReady(userConfig = {}) {
  const cfg = resolveConfig(userConfig);
  return Boolean(
    cfg.gistId &&
      cfg.gistId.length >= 10 &&
      cfg.githubToken &&
      cfg.githubToken.startsWith("gh") &&
      cfg.githubToken.length > 20
  );
}

function authHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** 兼容旧版单用户 { dates } 与新版 { users } */
function parseStore(raw) {
  if (!raw || typeof raw !== "object") return emptyStore();
  if (raw.users && typeof raw.users === "object") {
    const users = {};
    for (const [phone, u] of Object.entries(raw.users)) {
      const p = phone === "__legacy__" ? "__legacy__" : normalizePhone(phone);
      if (!p) continue;
      users[p] = {
        pin: String(u?.pin || ""),
        dates: normalizeDates(u?.dates),
        updatedAt: Number(u?.updatedAt) || 0,
      };
    }
    return { version: 2, users };
  }
  // 旧数据：暂存到 __legacy__，登录时迁移到当前手机号
  if (raw.dates && typeof raw.dates === "object") {
    return {
      version: 2,
      users: {
        __legacy__: {
          pin: "",
          dates: normalizeDates(raw.dates),
          updatedAt: Number(raw.updatedAt) || 0,
        },
      },
    };
  }
  return emptyStore();
}

function mergeDates(a, b) {
  const dates = {};
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) {
    const left = a?.[key];
    const right = b?.[key];
    if (left && right) {
      dates[key] = (Number(left.at) || 0) >= (Number(right.at) || 0) ? left : right;
    } else {
      dates[key] = left || right;
    }
  }
  return normalizeDates(dates);
}

function datesFingerprint(dates) {
  return Object.keys(dates || {})
    .sort()
    .map((k) => {
      const r = dates[k];
      return `${k}:${r.count}:${r.durationSec}:${r.at}:${r.note || ""}`;
    })
    .join("|");
}

async function fetchStore(gistId, token) {
  const url = `https://api.github.com/gists/${gistId}?ts=${Date.now()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error("Token 无效或权限不足，请重新配置（只需勾选 gist）");
    }
    if (res.status === 404) {
      throw new Error("云端数据仓库不存在，请检查 gistId");
    }
    throw new Error(`读取云端失败(${res.status}): ${text.slice(0, 80)}`);
  }
  const gist = await res.json();
  const files = gist.files || {};
  const file =
    files["checkins.json"] ||
    files[Object.keys(files).find((k) => k.endsWith(".json"))] ||
    files[Object.keys(files)[0]];
  if (!file?.content) return emptyStore();
  try {
    return parseStore(JSON.parse(file.content));
  } catch {
    return emptyStore();
  }
}

async function writeStore(gistId, token, store) {
  const payload = {
    version: 2,
    users: store.users || {},
  };
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: {
        "checkins.json": {
          content: JSON.stringify(payload, null, 2),
        },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error("Token 无效或权限不足，请重新配置");
    }
    if (res.status === 403 && /rate/i.test(text)) {
      throw new Error("同步太频繁，请稍后再试");
    }
    throw new Error(`写入云端失败(${res.status}): ${text.slice(0, 80)}`);
  }
  try {
    const gist = await res.json();
    const content = gist.files?.["checkins.json"]?.content;
    if (content) return parseStore(JSON.parse(content));
  } catch {
    /* ignore */
  }
  return payload;
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function createStorage(userConfig = {}) {
  const cfg = resolveConfig(userConfig);
  const useCloud = isSyncReady(userConfig);

  let session = loadSession();
  let phone = session?.phone || "";
  let data = phone ? loadUserLocal(phone) : emptyUser();
  let cloudStore = emptyStore();
  let pollTimer = null;
  let pulling = false;
  let writing = false;
  let dirty = false;
  let lastError = "";
  const listeners = new Set();

  function notify(status) {
    for (const fn of listeners) fn(getPublicData(), status, lastError);
  }

  function getPublicData() {
    return {
      dates: data.dates || {},
      updatedAt: data.updatedAt || 0,
      phone,
    };
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getData() {
    return getPublicData();
  }

  function getPhone() {
    return phone;
  }

  function isLoggedIn() {
    return Boolean(phone && isValidPhone(phone));
  }

  async function pushCurrentUser(latestStore) {
    const latest = latestStore || (await fetchStore(cfg.gistId, cfg.githubToken));
    const users = { ...(latest.users || {}) };
    users[phone] = {
      pin: data.pin || session?.pin || "",
      dates: normalizeDates(data.dates),
      updatedAt: Number(data.updatedAt) || Date.now(),
    };
    if (users.__legacy__) delete users.__legacy__;
    cloudStore = await writeStore(cfg.gistId, cfg.githubToken, { version: 2, users });
    const remoteUser = cloudStore.users?.[phone];
    if (remoteUser) {
      data = {
        pin: remoteUser.pin || data.pin,
        dates: normalizeDates(remoteUser.dates),
        updatedAt: Number(remoteUser.updatedAt) || data.updatedAt,
      };
      saveUserLocal(phone, data);
    }
    dirty = false;
  }

  async function persistUserDates(nextDates) {
    if (!phone) throw new Error("请先登录");
    writing = true;
    dirty = true;
    try {
      data = {
        pin: data.pin || session?.pin || "",
        dates: normalizeDates(nextDates),
        updatedAt: Date.now(),
      };
      saveUserLocal(phone, data);

      if (useCloud) {
        await pushCurrentUser();
        lastError = "";
        notify("online");
      } else {
        lastError = "";
        notify("local");
      }
      return getPublicData();
    } catch (err) {
      lastError = err.message || "同步失败";
      notify("error");
      throw err;
    } finally {
      writing = false;
    }
  }

  async function upsert(dateKey, record) {
    if (dateKey > todayStr()) throw new Error("不能给未来日期打卡");
    const next = normalizeRecord({ ...record, at: Date.now() });
    if (!next || next.count <= 0) throw new Error("请填写有效的跳绳个数");
    const dates = { ...data.dates, [dateKey]: next };
    return persistUserDates(dates);
  }

  async function remove(dateKey) {
    if (dateKey > todayStr()) throw new Error("不能修改未来日期");
    const dates = { ...data.dates };
    delete dates[dateKey];
    return persistUserDates(dates);
  }

  async function pullRemote() {
    if (!useCloud || !phone || pulling || writing) return getPublicData();
    pulling = true;
    try {
      const latest = await fetchStore(cfg.gistId, cfg.githubToken);
      cloudStore = latest;
      const remoteUser = latest.users?.[phone];

      if (!remoteUser) {
        if (Object.keys(data.dates || {}).length > 0) {
          writing = true;
          try {
            await pushCurrentUser(latest);
          } finally {
            writing = false;
          }
        }
        lastError = "";
        notify("online");
        return getPublicData();
      }

      if (remoteUser.pin && session?.pin && remoteUser.pin !== session.pin) {
        lastError = "密码与云端不一致，请重新登录";
        notify("error");
        return getPublicData();
      }

      const mergedDates = mergeDates(data.dates, remoteUser.dates);
      const remoteFp = datesFingerprint(remoteUser.dates);
      const mergedFp = datesFingerprint(mergedDates);

      data = {
        pin: remoteUser.pin || data.pin || session?.pin || "",
        dates: mergedDates,
        updatedAt: Math.max(Number(data.updatedAt) || 0, Number(remoteUser.updatedAt) || 0),
      };
      saveUserLocal(phone, data);

      // 合并后比云端多了内容 → 写回；否则只读更新本地
      if (mergedFp !== remoteFp) {
        writing = true;
        try {
          data.updatedAt = Date.now();
          await pushCurrentUser(latest);
        } finally {
          writing = false;
        }
      } else {
        dirty = false;
      }

      lastError = "";
      notify("online");
      return getPublicData();
    } catch (err) {
      lastError = err.message || "同步失败";
      notify("error");
      return getPublicData();
    } finally {
      pulling = false;
    }
  }

  /**
   * 登录 / 注册
   * - 新手机号：创建账户
   * - 已有手机号：校验密码
   */
  async function login(inputPhone, inputPin) {
    const p = normalizePhone(inputPhone);
    const pin = String(inputPin || "");
    if (!isValidPhone(p)) throw new Error("请输入正确的11位手机号");
    if (!isValidPin(pin)) throw new Error("密码需为4-8位数字");
    if (!useCloud) throw new Error("请先配置云端同步 Token");

    const latest = await fetchStore(cfg.gistId, cfg.githubToken);
    cloudStore = latest;
    const users = { ...(latest.users || {}) };
    let user = users[p];

    // 迁移旧版无主数据到当前账号（仅当该手机号首次注册）
    if (!user && users.__legacy__ && Object.keys(users.__legacy__.dates || {}).length > 0) {
      user = {
        pin,
        dates: normalizeDates(users.__legacy__.dates),
        updatedAt: Number(users.__legacy__.updatedAt) || Date.now(),
      };
      users[p] = user;
      delete users.__legacy__;
      cloudStore = await writeStore(cfg.gistId, cfg.githubToken, { version: 2, users });
      user = cloudStore.users?.[p] || user;
    } else if (!user) {
      user = { pin, dates: {}, updatedAt: Date.now() };
      users[p] = user;
      cloudStore = await writeStore(cfg.gistId, cfg.githubToken, { version: 2, users });
      user = cloudStore.users?.[p] || user;
    } else if (user.pin && user.pin !== pin) {
      throw new Error("密码错误");
    } else if (!user.pin) {
      // 补设密码
      user = { ...user, pin, updatedAt: Date.now() };
      users[p] = user;
      cloudStore = await writeStore(cfg.gistId, cfg.githubToken, { version: 2, users });
      user = cloudStore.users?.[p] || user;
    }

    phone = p;
    session = { phone: p, pin };
    saveSession(p, pin);
    data = {
      pin: user.pin || pin,
      dates: normalizeDates(user.dates),
      updatedAt: Number(user.updatedAt) || Date.now(),
    };
    // 合并本地缓存
    const local = loadUserLocal(p);
    data.dates = mergeDates(local.dates, data.dates);
    saveUserLocal(p, data);
    dirty = false;
    lastError = "";
    notify("online");
    startPolling();
    return getPublicData();
  }

  function logout() {
    clearSession();
    phone = "";
    session = null;
    data = emptyUser();
    destroy();
    notify("local");
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    if (!useCloud || !phone) return;
    pollTimer = setInterval(() => {
      if (document.hidden || writing || dirty) return;
      pullRemote().catch(() => {});
    }, POLL_MS);
  }

  async function init() {
    if (!useCloud) {
      notify("local");
      return { mode: "local", message: "未配置云端" };
    }
    if (!isLoggedIn()) {
      notify("local");
      return { mode: "need-login", message: "请登录" };
    }
    try {
      // 用会话重新走一遍云端校验
      await login(session.phone, session.pin);
      const onWake = () => {
        if (!document.hidden) pullRemote().catch(() => {});
      };
      document.addEventListener("visibilitychange", onWake);
      window.addEventListener("focus", onWake);
      window.addEventListener("pageshow", onWake);
      return { mode: "online", message: "已登录并同步" };
    } catch (err) {
      lastError = err.message || "登录失败";
      clearSession();
      phone = "";
      session = null;
      notify("error");
      return { mode: "error", message: lastError };
    }
  }

  function destroy() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  return {
    init,
    destroy,
    onChange,
    getData,
    getPhone,
    isLoggedIn,
    login,
    logout,
    upsert,
    remove,
    pullRemote,
    isCloud: useCloud,
    config: cfg,
    getLastError: () => lastError,
  };
}
