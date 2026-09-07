/** 打卡类型定义 */

export const ACTIVITY_TYPES = {
  rope: {
    id: "rope",
    name: "跳绳",
    brand: "Jump Rope",
    metricLabel: "个数",
    metricUnit: "个",
    distanceLabel: null,
    distanceUnit: null,
    distanceStep: null,
    distancePlaceholder: null,
    chartLabel: "跳绳个数",
    bestLabel: "本月最佳",
    sumLabel: "本月总数",
    legend: "本月跳绳个数最多的一天",
    primaryField: "count",
  },
  run: {
    id: "run",
    name: "跑步",
    brand: "Running",
    metricLabel: null,
    metricUnit: null,
    distanceLabel: "距离（公里）",
    distanceUnit: "km",
    distanceStep: "0.01",
    distancePlaceholder: "例如 5.00",
    chartLabel: "跑步距离(km)",
    bestLabel: "本月最远",
    sumLabel: "本月里程",
    legend: "本月跑步距离最远的一天",
    primaryField: "distance",
  },
  swim: {
    id: "swim",
    name: "游泳",
    brand: "Swimming",
    metricLabel: null,
    metricUnit: null,
    distanceLabel: "距离（米）",
    distanceUnit: "m",
    distanceStep: "1",
    distancePlaceholder: "例如 1000",
    chartLabel: "游泳距离(m)",
    bestLabel: "本月最远",
    sumLabel: "本月总距",
    legend: "本月游泳距离最远的一天",
    primaryField: "distance",
  },
};

export const ACTIVITY_ORDER = ["rope", "run", "swim"];

export function getActivity(type) {
  return ACTIVITY_TYPES[type] || ACTIVITY_TYPES.rope;
}

export function primaryValue(rec, type) {
  if (!rec) return 0;
  const cfg = getActivity(type);
  if (cfg.primaryField === "count") return Number(rec.count) || 0;
  return Number(rec.distance) || 0;
}

export function formatPrimary(value, type) {
  const cfg = getActivity(type);
  const n = Number(value) || 0;
  if (cfg.id === "run") return n.toFixed(n % 1 === 0 ? 0 : 2);
  if (cfg.id === "swim") return String(Math.round(n));
  return String(Math.round(n));
}

export function formatRecordSummary(rec, type) {
  if (!rec) return "";
  const cfg = getActivity(type);
  const dur = formatDuration(rec.durationSec);
  if (cfg.id === "rope") return `${rec.count || 0}个 · ${dur}`;
  if (cfg.id === "run") return `${formatPrimary(rec.distance, type)}km · ${dur}`;
  return `${formatPrimary(rec.distance, type)}m · ${dur}`;
}

export function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (m <= 0) return `${r}秒`;
  if (r === 0) return `${m}分钟`;
  return `${m}分${pad(r)}秒`;
}

export function isValidRecord(rec, type) {
  if (!rec) return false;
  const dur = Number(rec.durationSec) || 0;
  if (type === "rope") return (Number(rec.count) || 0) > 0 && dur > 0;
  return (Number(rec.distance) || 0) > 0 && dur > 0;
}

export function normalizeActivityRecord(raw, type = "rope") {
  if (!raw || typeof raw !== "object") return null;
  const durationSec = Math.max(0, Math.round(Number(raw.durationSec) || 0));
  const note = typeof raw.note === "string" ? raw.note : "";
  const at = Number(raw.at) || Date.now();
  if (type === "rope") {
    const count = Math.max(0, Math.round(Number(raw.count) || 0));
    if (count <= 0) return null;
    return { count, durationSec, note, at };
  }
  const distance = Math.max(0, Number(raw.distance) || 0);
  if (distance <= 0) return null;
  return {
    distance: type === "swim" ? Math.round(distance) : Math.round(distance * 100) / 100,
    durationSec,
    note,
    at,
  };
}
