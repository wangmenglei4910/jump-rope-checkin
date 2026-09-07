import {
  createStorage,
  saveConfigOverride,
  isSyncReady,
  isValidPhone,
  isValidPin,
} from "./storage.js?v=20260907e";
import { renderLineChart } from "./chart.js?v=20260907e";
import {
  ACTIVITY_ORDER,
  getActivity,
  primaryValue,
  formatPrimary,
  formatRecordSummary,
  formatDuration,
  isValidRecord,
} from "./activities.js?v=20260907e";

const WEEK_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const THUMB_SVG = `<svg class="day-thumb" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14.6 8.5V5.2A2.2 2.2 0 0 0 12.4 3h-.3c-.7 0-1.3.4-1.6 1l-3.2 6.2H4.5A1.5 1.5 0 0 0 3 11.7v6.8A1.5 1.5 0 0 0 4.5 20h9.8c1.4 0 2.6-1 2.9-2.3l1.5-6.2c.3-1.4-.7-2.7-2.1-2.7h-2z"/></svg>`;
const PREFS_KEY = "sport-checkin-prefs-v1";

function pad(n) {
  return String(n).padStart(2, "0");
}
function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function addDays(date, delta) {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}
function formatMonthTitle(year, monthIndex) {
  return `${year}年${monthIndex + 1}月`;
}
function formatDateLabel(key) {
  const d = parseKey(key);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${WEEK_LABELS[d.getDay()]}`;
}
function maskPhone(phone) {
  const p = String(phone || "");
  if (p.length < 7) return p;
  return `${p.slice(0, 3)}****${p.slice(-4)}`;
}
function todayKey() {
  return toKey(startOfDay(new Date()));
}
function isFutureKey(key) {
  return key > todayKey();
}
function isCurrentOrPastMonth(year, monthIndex) {
  const now = new Date();
  return year < now.getFullYear() || (year === now.getFullYear() && monthIndex <= now.getMonth());
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      activity: ACTIVITY_ORDER.includes(parsed.activity) ? parsed.activity : "rope",
      view: parsed.view === "table" ? "table" : "calendar",
    };
  } catch {
    return { activity: "rope", view: "calendar" };
  }
}

function savePrefs(partial) {
  const next = { ...loadPrefs(), ...partial };
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

function findMonthBestKey(dates, viewYear, viewMonth, type) {
  let bestKey = null;
  let bestVal = -1;
  let bestDur = Infinity;
  for (const [key, rec] of Object.entries(dates || {})) {
    const d = parseKey(key);
    if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue;
    const val = primaryValue(rec, type);
    if (!(val > 0)) continue;
    const dur = Number(rec.durationSec) || 0;
    if (val > bestVal || (val === bestVal && dur < bestDur)) {
      bestVal = val;
      bestDur = dur;
      bestKey = key;
    }
  }
  return bestKey;
}

function calcStats(dates, viewYear, viewMonth, type) {
  const keys = Object.keys(dates || {}).sort();
  const total = keys.length;
  let monthSum = 0;
  let monthBest = 0;
  for (const key of keys) {
    const d = parseKey(key);
    if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue;
    const val = primaryValue(dates[key], type);
    monthSum += val;
    monthBest = Math.max(monthBest, val);
  }
  const today = startOfDay(new Date());
  const tKey = toKey(today);
  let streak = 0;
  let cursor = dates?.[tKey] ? today : addDays(today, -1);
  while (dates?.[toKey(cursor)]) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return { total, streak, monthBest, monthSum };
}

const els = {
  syncSetup: document.getElementById("syncSetup"),
  tokenInput: document.getElementById("tokenInput"),
  saveSyncBtn: document.getElementById("saveSyncBtn"),
  syncShare: document.getElementById("syncShare"),
  copySyncLinkBtn: document.getElementById("copySyncLinkBtn"),
  loginPanel: document.getElementById("loginPanel"),
  phoneInput: document.getElementById("phoneInput"),
  pinInput: document.getElementById("pinInput"),
  loginBtn: document.getElementById("loginBtn"),
  mainApp: document.getElementById("mainApp"),
  brandMark: document.getElementById("brandMark"),
  brandTitle: document.getElementById("brandTitle"),
  userLine: document.getElementById("userLine"),
  logoutBtn: document.getElementById("logoutBtn"),
  activitySeg: document.getElementById("activitySeg"),
  viewSeg: document.getElementById("viewSeg"),
  syncStatus: document.getElementById("syncStatus"),
  syncText: document.getElementById("syncText"),
  calendarPanel: document.getElementById("calendarPanel"),
  tablePanel: document.getElementById("tablePanel"),
  monthTitle: document.getElementById("monthTitle"),
  monthTitleTable: document.getElementById("monthTitleTable"),
  calendarGrid: document.getElementById("calendarGrid"),
  tableBody: document.getElementById("tableBody"),
  tableEmpty: document.getElementById("tableEmpty"),
  tableMetricHead: document.getElementById("tableMetricHead"),
  prevMonth: document.getElementById("prevMonth"),
  nextMonth: document.getElementById("nextMonth"),
  todayBtn: document.getElementById("todayBtn"),
  prevMonthTable: document.getElementById("prevMonthTable"),
  nextMonthTable: document.getElementById("nextMonthTable"),
  todayBtnTable: document.getElementById("todayBtnTable"),
  legendText: document.getElementById("legendText"),
  statBestLabel: document.getElementById("statBestLabel"),
  statSumLabel: document.getElementById("statSumLabel"),
  recordTitle: document.getElementById("recordTitle"),
  countField: document.getElementById("countField"),
  countLabel: document.getElementById("countLabel"),
  countInput: document.getElementById("countInput"),
  distanceField: document.getElementById("distanceField"),
  distanceLabel: document.getElementById("distanceLabel"),
  distanceInput: document.getElementById("distanceInput"),
  minInput: document.getElementById("minInput"),
  secInput: document.getElementById("secInput"),
  noteInput: document.getElementById("noteInput"),
  saveBtn: document.getElementById("saveBtn"),
  saveBtnText: document.getElementById("saveBtnText"),
  deleteBtn: document.getElementById("deleteBtn"),
  actionHint: document.getElementById("actionHint"),
  toast: document.getElementById("toast"),
  statTotal: document.getElementById("statTotal"),
  statStreak: document.getElementById("statStreak"),
  statMonthBest: document.getElementById("statMonthBest"),
  statMonthSum: document.getElementById("statMonthSum"),
  chartPanel: document.getElementById("chartPanel"),
};

const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();
let selectedKey = toKey(today);
let toastTimer = null;
let formDirty = false;
const prefs = loadPrefs();
let activityType = prefs.activity;
let viewMode = prefs.view;

const userConfig = window.CHECKIN_CONFIG || {};

function bootstrapSyncFromUrl() {
  const hash = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  const query = new URLSearchParams(location.search);
  const token = (hash.get("sync") || query.get("sync") || "").trim();
  const gistId = (hash.get("gist") || query.get("gist") || userConfig.gistId || "").trim();
  if (token && token.startsWith("gh")) {
    saveConfigOverride({ githubToken: token, gistId: gistId || userConfig.gistId });
    history.replaceState({}, "", location.pathname);
    return true;
  }
  return false;
}

bootstrapSyncFromUrl();
let storage = createStorage(userConfig);

function currentDates(data = storage.getData()) {
  return data?.activities?.[activityType] || {};
}

function showToast(message) {
  els.toast.hidden = false;
  els.toast.textContent = message;
  requestAnimationFrame(() => els.toast.classList.add("is-show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("is-show");
    setTimeout(() => {
      els.toast.hidden = true;
    }, 250);
  }, 2400);
}

function setSyncUI(status, errorMsg = "") {
  els.syncStatus.classList.remove("is-online", "is-local", "is-error");
  if (status === "online") {
    els.syncStatus.classList.add("is-online");
    els.syncText.textContent = "云端已同步";
  } else if (status === "error") {
    els.syncStatus.classList.add("is-error");
    els.syncText.textContent = "同步异常";
    if (errorMsg) els.syncStatus.title = errorMsg;
  } else {
    els.syncStatus.classList.add("is-local");
    els.syncText.textContent = "未登录云端";
  }
}

function showScreen({ setup = false, login = false, main = false }) {
  els.syncSetup.hidden = !setup;
  els.loginPanel.hidden = !login;
  els.mainApp.hidden = !main;
}

function applyActivityChrome() {
  const cfg = getActivity(activityType);
  els.brandMark.textContent = cfg.brand;
  els.brandTitle.textContent = `${cfg.name}打卡`;
  els.statBestLabel.textContent = cfg.bestLabel;
  els.statSumLabel.textContent = cfg.sumLabel;
  els.legendText.textContent = cfg.legend;
  els.tableMetricHead.textContent = cfg.id === "rope" ? "个数" : `距离(${cfg.distanceUnit})`;

  for (const btn of els.activitySeg.querySelectorAll(".seg-btn")) {
    btn.classList.toggle("is-active", btn.dataset.activity === activityType);
  }
  for (const btn of els.viewSeg.querySelectorAll(".seg-btn")) {
    btn.classList.toggle("is-active", btn.dataset.view === viewMode);
  }

  const isRope = activityType === "rope";
  els.countField.hidden = !isRope;
  els.distanceField.hidden = isRope;
  if (!isRope) {
    els.distanceLabel.textContent = cfg.distanceLabel;
    els.distanceInput.step = cfg.distanceStep;
    els.distanceInput.placeholder = cfg.distancePlaceholder;
  } else {
    els.countLabel.textContent = "跳绳个数";
  }

  els.calendarPanel.hidden = viewMode !== "calendar";
  els.tablePanel.hidden = viewMode !== "table";
}

function readForm() {
  const minutes = Math.max(0, Math.round(Number(els.minInput.value) || 0));
  let seconds = Math.max(0, Math.round(Number(els.secInput.value) || 0));
  if (seconds > 59) seconds = 59;
  const durationSec = minutes * 60 + seconds;
  const note = els.noteInput.value.trim();
  if (activityType === "rope") {
    return { count: Math.round(Number(els.countInput.value)), durationSec, note };
  }
  return { distance: Number(els.distanceInput.value), durationSec, note };
}

function fillForm(rec) {
  formDirty = false;
  els.countInput.value = "";
  els.distanceInput.value = "";
  els.minInput.value = "";
  els.secInput.value = "";
  els.noteInput.value = "";
  if (!rec) return;
  const sec = Math.max(0, Math.round(rec.durationSec || 0));
  els.minInput.value = String(Math.floor(sec / 60));
  els.secInput.value = String(sec % 60);
  els.noteInput.value = rec.note || "";
  if (activityType === "rope") {
    els.countInput.value = rec.count ? String(rec.count) : "";
  } else {
    els.distanceInput.value = rec.distance != null ? String(rec.distance) : "";
  }
}

function renderStats(dates) {
  const s = calcStats(dates, viewYear, viewMonth, activityType);
  els.statTotal.textContent = String(s.total);
  els.statStreak.textContent = String(s.streak);
  els.statMonthBest.textContent = formatPrimary(s.monthBest, activityType);
  els.statMonthSum.textContent = formatPrimary(s.monthSum, activityType);
}

function updateMonthNav() {
  const canGoNext = isCurrentOrPastMonth(
    viewMonth === 11 ? viewYear + 1 : viewYear,
    viewMonth === 11 ? 0 : viewMonth + 1
  );
  els.nextMonth.disabled = !canGoNext;
  els.nextMonthTable.disabled = !canGoNext;
}

function renderCalendar(dates) {
  const title = formatMonthTitle(viewYear, viewMonth);
  els.monthTitle.textContent = title;
  els.monthTitleTable.textContent = title;
  els.calendarGrid.innerHTML = "";
  updateMonthNav();

  const first = new Date(viewYear, viewMonth, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -startOffset);
  const tKey = todayKey();
  const bestKey = findMonthBestKey(dates, viewYear, viewMonth, activityType);

  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    const key = toKey(date);
    const inMonth = date.getMonth() === viewMonth;
    const future = isFutureKey(key);
    const rec = dates[key];
    const checked = Boolean(rec) && !future;
    const isBest = key === bestKey && inMonth && !future;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day";
    if (!inMonth) btn.classList.add("is-other");
    if (future) btn.classList.add("is-future");
    if (key === tKey) btn.classList.add("is-today");
    if (key === selectedKey && !future) btn.classList.add("is-selected");
    if (checked) btn.classList.add("is-checked");
    if (isBest) btn.classList.add("is-best");
    btn.disabled = future;
    btn.innerHTML = `<span class="day-num">${date.getDate()}</span>${isBest ? THUMB_SVG : '<span class="day-mark"></span>'}`;
    if (!future) btn.addEventListener("click", () => onDaySelect(key));
    els.calendarGrid.appendChild(btn);
  }
}

function renderTable(dates) {
  els.tableBody.innerHTML = "";
  const rows = Object.keys(dates || {})
    .filter((key) => {
      const d = parseKey(key);
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
    })
    .sort((a, b) => (a < b ? 1 : -1));

  els.tableEmpty.hidden = rows.length > 0;
  const bestKey = findMonthBestKey(dates, viewYear, viewMonth, activityType);
  const cfg = getActivity(activityType);

  for (const key of rows) {
    const rec = dates[key];
    const tr = document.createElement("tr");
    if (key === selectedKey) tr.classList.add("is-selected");
    if (key === bestKey) tr.classList.add("is-best");
    const metric =
      cfg.id === "rope"
        ? `${formatPrimary(rec.count, activityType)}${cfg.metricUnit}`
        : `${formatPrimary(rec.distance, activityType)}${cfg.distanceUnit}`;
    tr.innerHTML = `
      <td>${parseKey(key).getMonth() + 1}/${parseKey(key).getDate()}</td>
      <td>${metric}</td>
      <td>${formatDuration(rec.durationSec)}</td>
      <td>${rec.note ? escapeHtml(rec.note) : "—"}</td>
    `;
    tr.addEventListener("click", () => onDaySelect(key));
    els.tableBody.appendChild(tr);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderRecord(dates) {
  if (isFutureKey(selectedKey)) {
    selectedKey = todayKey();
    formDirty = false;
  }
  const cfg = getActivity(activityType);
  const rec = dates[selectedKey];
  const isToday = selectedKey === todayKey();
  const isBest = selectedKey === findMonthBestKey(dates, viewYear, viewMonth, activityType);

  els.recordTitle.textContent = isToday
    ? `今日${cfg.name}${isBest ? " · 本月最佳" : ""}`
    : `${formatDateLabel(selectedKey)}${isBest ? " · 本月最佳" : ""}`;

  if (!formDirty) fillForm(rec || null);
  els.saveBtnText.textContent = rec ? "更新记录" : "保存打卡";
  els.saveBtn.classList.toggle("is-done", Boolean(rec));
  els.deleteBtn.hidden = !rec;
  els.actionHint.textContent = rec
    ? `${formatRecordSummary(rec, activityType)} · 可修改后更新`
    : `填写${cfg.name}数据后保存`;
}

function renderChart(dates) {
  renderLineChart(els.chartPanel, {
    dates,
    viewYear,
    viewMonth,
    selectedKey,
    bestKey: findMonthBestKey(dates, viewYear, viewMonth, activityType),
    onSelect: onDaySelect,
    type: activityType,
  });
}

function render(data = storage.getData()) {
  if (!storage.isLoggedIn()) return;
  applyActivityChrome();
  els.userLine.textContent = `账号 ${maskPhone(storage.getPhone())}`;
  const dates = data?.activities?.[activityType] || {};
  if (isFutureKey(selectedKey)) {
    selectedKey = todayKey();
    formDirty = false;
  }
  renderStats(dates);
  renderCalendar(dates);
  renderTable(dates);
  renderChart(dates);
  renderRecord(dates);
}

function onDaySelect(key) {
  if (isFutureKey(key)) {
    showToast("只能选择今天及之前的日期");
    return;
  }
  selectedKey = key;
  formDirty = false;
  const d = parseKey(key);
  viewYear = d.getFullYear();
  viewMonth = d.getMonth();
  render();
}

async function onSave() {
  const form = readForm();
  if (!isValidRecord(form, activityType)) {
    showToast(activityType === "rope" ? "请填写个数和耗时" : "请填写距离和耗时");
    return;
  }
  await storage.upsert(activityType, selectedKey, form);
  formDirty = false;
  showToast("打卡已保存并同步");
  render();
}

async function onDelete() {
  const ok = window.confirm(`确定删除 ${formatDateLabel(selectedKey)} 的${getActivity(activityType).name}记录？`);
  if (!ok) return;
  await storage.remove(activityType, selectedKey);
  formDirty = false;
  showToast("已删除并同步");
  render();
}

function shiftMonth(delta) {
  if (delta < 0) {
    viewMonth -= 1;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear -= 1;
    }
  } else {
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    if (!isCurrentOrPastMonth(nextYear, nextMonth)) {
      showToast("不能进入未来月份");
      return;
    }
    viewYear = nextYear;
    viewMonth = nextMonth;
  }
  render();
}

function goToday() {
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
  selectedKey = todayKey();
  formDirty = false;
  render();
}

function bindStorageEvents() {
  storage.onChange((data, status, errorMsg) => {
    setSyncUI(status, errorMsg || storage.getLastError?.() || "");
    if (storage.isLoggedIn()) render(data);
  });
}

function enterMain() {
  showScreen({ main: true });
  setSyncUI("online");
  render();
}
function enterLogin() {
  showScreen({ login: true });
  setSyncUI("local");
}
function enterSetup() {
  showScreen({ setup: true });
  setSyncUI("local");
}
function rebuildStorage() {
  storage.destroy?.();
  storage = createStorage(userConfig);
  bindStorageEvents();
}

els.activitySeg.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-activity]");
  if (!btn) return;
  activityType = btn.dataset.activity;
  savePrefs({ activity: activityType });
  formDirty = false;
  render();
});

els.viewSeg.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (!btn) return;
  viewMode = btn.dataset.view;
  savePrefs({ view: viewMode });
  render();
});

els.prevMonth.addEventListener("click", () => shiftMonth(-1));
els.nextMonth.addEventListener("click", () => shiftMonth(1));
els.todayBtn.addEventListener("click", goToday);
els.prevMonthTable.addEventListener("click", () => shiftMonth(-1));
els.nextMonthTable.addEventListener("click", () => shiftMonth(1));
els.todayBtnTable.addEventListener("click", goToday);

els.saveBtn.addEventListener("click", () => {
  onSave().catch((err) => showToast(err.message || "保存失败"));
});
els.deleteBtn.addEventListener("click", () => {
  onDelete().catch((err) => showToast(err.message || "删除失败"));
});
for (const input of [els.countInput, els.distanceInput, els.minInput, els.secInput, els.noteInput]) {
  input.addEventListener("input", () => {
    formDirty = true;
  });
}

els.saveSyncBtn.addEventListener("click", async () => {
  const token = els.tokenInput.value.trim();
  if (!token.startsWith("gh") || token.length < 20) {
    showToast("请粘贴有效的 GitHub Token");
    return;
  }
  saveConfigOverride({ githubToken: token, gistId: userConfig.gistId });
  rebuildStorage();
  els.syncShare.hidden = false;
  showToast("云端配置已保存，请登录手机号");
  enterLogin();
});

els.copySyncLinkBtn.addEventListener("click", async () => {
  const cfg = storage.config || {};
  const token = cfg.githubToken || els.tokenInput.value.trim();
  const gistId = cfg.gistId || userConfig.gistId || "";
  const link = `${location.origin}${location.pathname}#gist=${encodeURIComponent(gistId)}&sync=${encodeURIComponent(token)}`;
  try {
    await navigator.clipboard.writeText(link);
    showToast("链接已复制，请在手机打开");
  } catch {
    window.prompt("请复制此链接到手机：", link);
  }
});

els.loginBtn.addEventListener("click", async () => {
  const phone = els.phoneInput.value.trim();
  const pin = els.pinInput.value.trim();
  if (!isValidPhone(phone)) {
    showToast("请输入11位手机号");
    return;
  }
  if (!isValidPin(pin)) {
    showToast("密码需为4-8位数字");
    return;
  }
  els.loginBtn.disabled = true;
  try {
    await storage.login(phone, pin);
    showToast("登录成功");
    enterMain();
  } catch (err) {
    showToast(err.message || "登录失败");
  } finally {
    els.loginBtn.disabled = false;
  }
});
els.pinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.loginBtn.click();
});
els.logoutBtn.addEventListener("click", () => {
  storage.logout();
  formDirty = false;
  showToast("已退出登录");
  enterLogin();
});

bindStorageEvents();

async function boot() {
  if (!isSyncReady(userConfig)) {
    enterSetup();
    showToast("请先配置云端 Token");
    return;
  }
  if (storage.isLoggedIn()) {
    showScreen({ main: true });
    setSyncUI("online");
    els.syncText.textContent = "同步中…";
    const result = await storage.init();
    if (result.mode === "online") {
      setSyncUI("online");
      enterMain();
      showToast("欢迎回来");
    } else {
      showToast(result.message || "请重新登录");
      enterLogin();
    }
    return;
  }
  enterLogin();
}

boot();
