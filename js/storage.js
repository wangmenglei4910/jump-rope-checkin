/**
 * 跳绳打卡数据存储层
 * - 已配置 GitHub Gist + Token：云端同步（多端共享）
 * - 未配置：localStorage 本地存储（仅当前浏览器）
 *
 * 单日记录：{ count, durationSec, note, at }
 */

const LOCAL_KEY = "jump-rope-checkin-data-v1";
const CONFIG_OVERRIDE_KEY = "jump-rope-sync-config-v1";
const POLL_MS = 3000;

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

/** 按每天记录的 at 合并，避免整包时间戳互相覆盖 */
function mergeData(a, b) {
  const dates = {};
  const keys = new Set([
    ...Object.keys(a?.dates || {}),
    ...Object.keys(b?.dates || {}),
  ]);
  for (const key of keys) {
    const left = a?.dates?.[key];
    const right = b?.dates?.[key];
    if (left && right) {
      dates[key] = (Number(left.at) || 0) >= (Number(right.at) || 0) ? left : right;
    } else {
      dates[key] = left || right;
    }
  }
  return {
    dates: normalizeDates(dates),
    updatedAt: Math.max(Number(a?.updatedAt) || 0, Number(b?.updatedAt) || 0, Date.now()),
  };
}

function dataFingerprint(data) {
  const keys = Object.keys(data?.dates || {}).sort();
  return keys
    .map((k) => {
      const r = data.dates[k];
      return `${k}:${r.count}:${r.durationSec}:${r.at}:${r.note || ""}`;
    })
    .join("|");
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
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

export function clearConfigOverride() {
  localStorage.removeItem(CONFIG_OVERRIDE_KEY);
}

function resolveConfig(userConfig = {}) {
  const override = loadConfigOverride();
  return {
    gistId: String(override.gistId || userConfig.gistId || "").trim(),
    githubToken: String(override.githubToken || userConfig.githubToken || "").trim(),
    docId: userConfig.docId || "default",
  };
}

function isCloudConfigured(cfg) {
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
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
}

function parseGistPayload(gist) {
  const files = gist.files || {};
  const file =
    files["checkins.json"] ||
    files[Object.keys(files).find((k) => k.endsWith(".json"))] ||
    files[Object.keys(files)[0]];
  if (!file || !file.content) return emptyData();
  try {
    const parsed = JSON.parse(file.content);
    return {
      dates: normalizeDates(parsed.dates),
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return emptyData();
  }
}

async function fetchGistFile(gistId, token) {
  // 防浏览器 / 中间层缓存，附带时间戳
  const url = `https://api.github.com/gists/${gistId}?ts=${Date.now()}`;
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`读取云端失败(${res.status}): ${text.slice(0, 120)}`);
  }
  return parseGistPayload(await res.json());
}

async function writeGistFile(gistId, token, data) {
  const payload = {
    dates: normalizeDates(data.dates),
    updatedAt: Number(data.updatedAt) || Date.now(),
  };
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    cache: "no-store",
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
    throw new Error(`写入云端失败(${res.status}): ${text.slice(0, 120)}`);
  }
  // 用响应体作为权威结果，避免紧接着 GET 读到旧缓存
  try {
    return parseGistPayload(await res.json());
  } catch {
    return payload;
  }
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function createStorage(userConfig = {}) {
  const cfg = resolveConfig(userConfig);
  const useCloud = isCloudConfigured(cfg);

  let data = loadLocal();
  let pollTimer = null;
  let pulling = false;
  let writing = false;
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
    writing = true;
    try {
      data = {
        dates: normalizeDates(next.dates),
        updatedAt: Date.now(),
      };
      saveLocal(data);

      if (useCloud) {
        const confirmed = await writeGistFile(cfg.gistId, cfg.githubToken, data);
        data = {
          dates: normalizeDates(confirmed.dates),
          updatedAt: Number(confirmed.updatedAt) || data.updatedAt,
        };
        saveLocal(data);
      }

      notify(useCloud ? "online" : "local");
      return data;
    } finally {
      writing = false;
    }
  }

  async function upsert(dateKey, record) {
    if (dateKey > todayStr()) {
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
    if (dateKey > todayStr()) {
      throw new Error("不能修改未来日期");
    }
    const dates = { ...data.dates };
    delete dates[dateKey];
    return persist({ dates });
  }

  async function pullRemote({ force = false } = {}) {
    if (!useCloud) return data;
    if (pulling || writing) return data;
    pulling = true;
    try {
      let remote = await fetchGistFile(cfg.gistId, cfg.githubToken);

      // Gist 偶发延迟：若本地明显更新，短暂重试读取
      const localFp = dataFingerprint(data);
      const remoteFp = dataFingerprint(remote);
      if (force && localFp && remoteFp !== localFp && (data.updatedAt || 0) > (remote.updatedAt || 0)) {
        await new Promise((r) => setTimeout(r, 600));
        remote = await fetchGistFile(cfg.gistId, cfg.githubToken);
      }

      const merged = mergeData(data, remote);
      const mergedFp = dataFingerprint(merged);
      const remoteNowFp = dataFingerprint(remote);

      // 远程缺了本地更新过的天：补写云端
      if (mergedFp !== remoteNowFp) {
        const confirmed = await writeGistFile(cfg.gistId, cfg.githubToken, {
          ...merged,
          updatedAt: Date.now(),
        });
        data = {
          dates: normalizeDates(confirmed.dates),
          updatedAt: Number(confirmed.updatedAt) || Date.now(),
        };
      } else {
        data = {
          dates: normalizeDates(merged.dates),
          updatedAt: Math.max(Number(merged.updatedAt) || 0, Number(remote.updatedAt) || 0),
        };
      }

      saveLocal(data);
      notify("online");
      return data;
    } finally {
      pulling = false;
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (document.hidden) return;
      pullRemote().catch(() => notify("error"));
    }, POLL_MS);
  }

  async function init() {
    if (!useCloud) {
      notify("local");
      return { mode: "local", message: "未配置云端，使用本地存储" };
    }

    try {
      await pullRemote({ force: true });
      startPolling();

      const onWake = () => {
        pullRemote({ force: true }).catch(() => notify("error"));
      };
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) onWake();
      });
      window.addEventListener("focus", onWake);
      window.addEventListener("pageshow", onWake);

      return { mode: "online", message: "云端同步已开启" };
    } catch (err) {
      console.error(err);
      notify("error");
      return { mode: "error", message: err.message || "云端连接失败，已回退本地" };
    }
  }

  function destroy() {
    if (pollTimer) clearInterval(pollTimer);
  }

  return {
    init,
    destroy,
    onChange,
    getData,
    upsert,
    remove,
    pullRemote,
    isCloud: useCloud,
    config: cfg,
  };
}

export function isSyncReady(userConfig = {}) {
  return isCloudConfigured(resolveConfig(userConfig));
}
