/**
 * 本月跳绳个数折线图（纯 SVG，无第三方依赖）
 */

function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function niceMax(value) {
  if (value <= 0) return 100;
  const padded = value * 1.15;
  const mag = 10 ** Math.floor(Math.log10(padded));
  const norm = padded / mag;
  let nice;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
}

export function buildMonthSeries(dates, viewYear, viewMonth) {
  const points = [];
  for (const [key, rec] of Object.entries(dates)) {
    const d = parseKey(key);
    if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue;
    if (!rec || !(rec.count > 0)) continue;
    points.push({
      key,
      day: d.getDate(),
      count: Number(rec.count) || 0,
      durationSec: Number(rec.durationSec) || 0,
    });
  }
  points.sort((a, b) => a.day - b.day);
  return points;
}

export function renderLineChart(container, options) {
  const {
    dates,
    viewYear,
    viewMonth,
    selectedKey,
    bestKey,
    onSelect,
  } = options;

  const series = buildMonthSeries(dates, viewYear, viewMonth);
  const width = 360;
  const height = 200;
  const padL = 40;
  const padR = 14;
  const padT = 18;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  container.innerHTML = "";

  const title = document.createElement("div");
  title.className = "chart-head";
  title.innerHTML = `
    <h3 class="chart-title">本月趋势</h3>
    <p class="chart-sub">${viewYear}年${viewMonth + 1}月 · 跳绳个数</p>
  `;
  container.appendChild(title);

  if (series.length === 0) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.textContent = "本月暂无打卡数据";
    container.appendChild(empty);
    return;
  }

  const maxCount = niceMax(Math.max(...series.map((p) => p.count)));
  const minDay = 1;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const maxDay = daysInMonth;

  const xOf = (day) => padL + ((day - minDay) / (maxDay - minDay || 1)) * plotW;
  const yOf = (count) => padT + plotH - (count / maxCount) * plotH;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "chart-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `${viewYear}年${viewMonth + 1}月跳绳个数折线图，共${series.length}次打卡`
  );

  // grid + y labels
  const ticks = 4;
  for (let i = 0; i <= ticks; i += 1) {
    const value = Math.round((maxCount / ticks) * i);
    const y = yOf(value);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(padL));
    line.setAttribute("x2", String(width - padR));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("class", "chart-grid");
    svg.appendChild(line);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(padL - 8));
    label.setAttribute("y", String(y + 3));
    label.setAttribute("text-anchor", "end");
    label.setAttribute("class", "chart-axis-label");
    label.textContent = String(value);
    svg.appendChild(label);
  }

  // x labels: first, mid, last day with data, or 1 / mid / end
  const xLabelDays = [1, Math.round(daysInMonth / 2), daysInMonth];
  for (const day of xLabelDays) {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(xOf(day)));
    label.setAttribute("y", String(height - 8));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "chart-axis-label");
    label.textContent = `${day}日`;
    svg.appendChild(label);
  }

  // area under line
  if (series.length >= 1) {
    const first = series[0];
    const last = series[series.length - 1];
    const areaPts = [
      `${xOf(first.day)},${yOf(0)}`,
      ...series.map((p) => `${xOf(p.day)},${yOf(p.count)}`),
      `${xOf(last.day)},${yOf(0)}`,
    ].join(" ");
    const area = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    area.setAttribute("points", areaPts);
    area.setAttribute("class", "chart-area");
    svg.appendChild(area);
  }

  // line path
  if (series.length >= 2) {
    const d = series
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.day)} ${yOf(p.count)}`)
      .join(" ");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "chart-line");
    path.setAttribute("fill", "none");
    svg.appendChild(path);
  } else if (series.length === 1) {
    const p = series[0];
    const stub = document.createElementNS("http://www.w3.org/2000/svg", "line");
    stub.setAttribute("x1", String(xOf(p.day) - 18));
    stub.setAttribute("x2", String(xOf(p.day) + 18));
    stub.setAttribute("y1", String(yOf(p.count)));
    stub.setAttribute("y2", String(yOf(p.count)));
    stub.setAttribute("class", "chart-line");
    svg.appendChild(stub);
  }

  // points
  for (const p of series) {
    const cx = xOf(p.day);
    const cy = yOf(p.count);
    const isBest = p.key === bestKey;
    const isSelected = p.key === selectedKey;

    const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hit.setAttribute("cx", String(cx));
    hit.setAttribute("cy", String(cy));
    hit.setAttribute("r", "14");
    hit.setAttribute("class", "chart-hit");
    hit.style.cursor = "pointer";
    hit.addEventListener("click", () => onSelect?.(p.key));
    svg.appendChild(hit);

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", String(cy));
    dot.setAttribute("r", isSelected || isBest ? "6" : "4.5");
    dot.setAttribute(
      "class",
      `chart-dot${isBest ? " is-best" : ""}${isSelected ? " is-selected" : ""}`
    );
    dot.style.pointerEvents = "none";
    svg.appendChild(dot);

    if (isSelected || series.length <= 8) {
      const val = document.createElementNS("http://www.w3.org/2000/svg", "text");
      val.setAttribute("x", String(cx));
      val.setAttribute("y", String(cy - 10));
      val.setAttribute("text-anchor", "middle");
      val.setAttribute("class", "chart-value");
      val.textContent = String(p.count);
      svg.appendChild(val);
    }
  }

  container.appendChild(svg);

  const tip = document.createElement("p");
  tip.className = "chart-tip";
  tip.textContent = "点击折线上的圆点可选中对应日期";
  container.appendChild(tip);
}
