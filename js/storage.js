/**
 * 跳绳打卡数据存储层
 * - 已配置 GitHub Gist + Token：云端同步（多端共享）
 * - 未配置：localStorage 本地存储（仅当前浏览器）
 *
 * 单日记录：{ count, durationSec, note, at }
 */

const LOCAL_KEY = "jump-rope-checkin-data-v1";
const CONFIG_OVERRIDE_KEY = "jump-rope-sync-config-v1";

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

async function fetchGistFile(gistId, token) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`读取云端失败(${res.status}): ${text.slice(0, 120)}`);
  }
  const gist = await res.json();
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

async function writeGistFile(gistId, token, data) {
  const body = {
    files: {
      "checkins.json": {
        content: JSON.stringify(
          {
            dates: normalizeDates(data.dates),
            updatedAt: Number(data.updatedAt) || Date.now(),
          },
          null,
          2
        ),
      },
    },
  };
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`写入云端失败(${res.status}): ${text.slice(0, 120)}`);
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

    if (useCloud) {
      await writeGistFile(cfg.gistId, cfg.githubToken, data);
    }

    notify(useCloud ? "online" : "local");
    return data;
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

  async function pullRemote() {
    if (!useCloud) return data;
    const remote = await fetchGistFile(cfg.gistId, cfg.githubToken);
    const remoteUpdated = Number(remote.updatedAt) || 0;
    const localUpdated = Number(data.updatedAt) || 0;
    if (remoteUpdated >= localUpdated) {
      data = remote;
      saveLocal(data);
    } else if (Object.keys(data.dates).length > 0) {
      await writeGistFile(cfg.gistId, cfg.githubToken, data);
    }
    notify("online");
    return data;
  }

  async function init() {
    if (!useCloud) {
      notify("local");
      return { mode: "local", message: "未配置云端，使用本地存储" };
    }

    try {
      await pullRemote();
      // 轮询实现多端接近实时同步
      pollTimer = setInterval(() => {
        pullRemote().catch(() => notify("error"));
      }, 8000);
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
