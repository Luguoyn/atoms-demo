import type { AppTemplate } from "./app-template";

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>番茄专注钟 · 专注当下</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body data-mode="focus">
  <div class="ambient" aria-hidden="true"></div>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">🍅</span>
        <div class="brand-text">
          <h1>番茄专注钟</h1>
          <p>专注当下，一次只做一件事</p>
        </div>
      </div>
      <button id="theme-toggle" class="icon-btn" type="button" aria-label="切换深浅色主题" title="切换深浅色主题">
        <span id="theme-icon" aria-hidden="true">🌙</span>
      </button>
    </header>

    <main class="layout">
      <section class="card timer-card">
        <div class="mode-tabs" role="tablist" aria-label="计时模式">
          <button class="mode-tab is-active" data-mode="focus" role="tab" aria-selected="true" type="button">专注 25</button>
          <button class="mode-tab" data-mode="short" role="tab" aria-selected="false" type="button">短休 5</button>
          <button class="mode-tab" data-mode="long" role="tab" aria-selected="false" type="button">长休 15</button>
        </div>

        <div class="timer-ring">
          <svg class="ring" viewBox="0 0 220 220" aria-hidden="true">
            <circle class="ring-track" cx="110" cy="110" r="96"></circle>
            <circle id="ring-progress" class="ring-progress" cx="110" cy="110" r="96"></circle>
          </svg>
          <div class="timer-content">
            <p id="timer-label" class="timer-label">专注中</p>
            <p id="timer-time" class="timer-time" aria-live="polite">25:00</p>
            <p id="timer-hint" class="timer-hint">按下空格开始</p>
          </div>
        </div>

        <div class="timer-actions">
          <button id="timer-toggle" class="btn btn-primary" type="button">开始专注</button>
          <button id="timer-reset" class="btn btn-ghost" type="button">重置</button>
        </div>
        <p class="cycle-note">今日完成 <strong id="today-count">0</strong> 个番茄 · 累计专注 <strong id="today-minutes">0</strong> 分钟</p>
      </section>

      <section class="card tasks-card">
        <div class="section-head">
          <h2 id="tasks-heading">今日任务</h2>
          <span id="task-progress" class="badge">0 / 0</span>
        </div>
        <form id="task-form" class="task-form" autocomplete="off">
          <input id="task-input" class="task-input" type="text" maxlength="60" placeholder="添加一个要专注完成的任务…" aria-label="新任务内容" />
          <button class="btn btn-primary" type="submit">添加</button>
        </form>
        <ul id="task-list" class="task-list" aria-labelledby="tasks-heading"></ul>
        <p id="task-empty" class="empty-state">还没有任务。先写下今天最重要的一件事吧。</p>
        <div class="task-footer">
          <span id="task-summary" class="muted">保持专注，逐个击破</span>
          <button id="clear-done" class="link-btn" type="button" disabled>清除已完成</button>
        </div>
      </section>
    </main>

    <footer class="app-footer">
      <span>数据仅保存在本机浏览器</span>
      <span class="dot" aria-hidden="true">·</span>
      <span id="storage-status">本地保存已开启</span>
    </footer>
  </div>
  <script src="app.js" defer></script>
</body>
</html>`;

const css = `:root {
  color-scheme: light;
  --bg: #f7f1e9;
  --bg-deep: #efe4d7;
  --bg-glow: rgba(255, 122, 92, 0.22);
  --surface: rgba(255, 255, 255, 0.78);
  --surface-solid: #fffdfa;
  --border: rgba(52, 39, 29, 0.08);
  --border-strong: rgba(52, 39, 29, 0.14);
  --text: #2a211a;
  --muted: #84776c;
  --accent: #ff6b57;
  --accent-strong: #e34e37;
  --accent-soft: rgba(255, 107, 87, 0.14);
  --break-accent: #2f9e6f;
  --ring-track: rgba(52, 39, 29, 0.08);
  --shadow: 0 24px 60px -30px rgba(84, 55, 38, 0.45);
  --radius-lg: 28px;
  --radius-md: 18px;
  --radius-sm: 12px;
  --font-sans: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif;
}

html[data-theme="dark"] {
  color-scheme: dark;
  --bg: #171310;
  --bg-deep: #100d0b;
  --bg-glow: rgba(255, 122, 92, 0.18);
  --surface: rgba(38, 31, 27, 0.72);
  --surface-solid: #241d19;
  --border: rgba(255, 236, 224, 0.08);
  --border-strong: rgba(255, 236, 224, 0.16);
  --text: #f6ede5;
  --muted: #a99c92;
  --ring-track: rgba(255, 236, 224, 0.1);
  --shadow: 0 28px 70px -34px rgba(0, 0, 0, 0.8);
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  min-height: 100vh;
  background:
    radial-gradient(1000px 560px at 12% -10%, var(--bg-glow), transparent 62%),
    radial-gradient(760px 520px at 108% 8%, rgba(47, 158, 111, 0.12), transparent 60%),
    linear-gradient(160deg, var(--bg) 0%, var(--bg-deep) 100%);
  color: var(--text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  line-height: 1.6;
}

.ambient {
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(560px 320px at 82% 88%, var(--accent-soft), transparent 70%);
}

.app {
  position: relative;
  max-width: 1060px;
  margin: 0 auto;
  padding: clamp(20px, 5vw, 56px) clamp(16px, 4vw, 40px) 40px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: clamp(20px, 3.5vw, 34px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  font-size: 26px;
  border-radius: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}

.brand-text h1 {
  margin: 0;
  font-size: clamp(20px, 3vw, 26px);
  letter-spacing: 0.01em;
}

.brand-text p {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  font-size: 18px;
  cursor: pointer;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.icon-btn:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong);
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.06fr) minmax(0, 0.94fr);
  gap: clamp(14px, 2.4vw, 22px);
  align-items: start;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  padding: clamp(20px, 3.2vw, 32px);
  animation: rise 420ms ease-out both;
}

.tasks-card {
  animation-delay: 70ms;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.mode-tabs {
  display: flex;
  gap: 6px;
  padding: 5px;
  background: rgba(52, 39, 29, 0.05);
  border-radius: 999px;
  width: fit-content;
  margin: 0 auto 6px;
}

html[data-theme="dark"] .mode-tabs {
  background: rgba(255, 236, 224, 0.06);
}

.mode-tab {
  padding: 8px 16px;
  font: inherit;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 999px;
  transition: color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.mode-tab:hover {
  color: var(--text);
}

.mode-tab.is-active {
  color: var(--text);
  background: var(--surface-solid);
  box-shadow: 0 10px 22px -14px rgba(84, 55, 38, 0.55);
}

.timer-ring {
  position: relative;
  width: min(300px, 74vw);
  aspect-ratio: 1 / 1;
  margin: 14px auto 18px;
}

.ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-track,
.ring-progress {
  fill: none;
  stroke-width: 9;
}

.ring-track {
  stroke: var(--ring-track);
}

.ring-progress {
  stroke: var(--accent);
  stroke-linecap: round;
  stroke-dasharray: 603.19;
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 300ms linear, stroke 300ms ease;
  filter: drop-shadow(0 0 12px var(--accent-soft));
}

body[data-mode="short"] .ring-progress,
body[data-mode="long"] .ring-progress {
  stroke: var(--break-accent);
}

.timer-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.timer-label {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.24em;
  text-indent: 0.24em;
  color: var(--muted);
}

.timer-time {
  margin: 0;
  font-size: clamp(46px, 9vw, 62px);
  font-weight: 650;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

.timer-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}

.timer-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 22px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  border-radius: 14px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease, color 160ms ease;
}

.btn:active {
  transform: translateY(1px) scale(0.995);
}

.btn-primary {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  box-shadow: 0 16px 30px -16px var(--accent-strong);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 20px 34px -16px var(--accent-strong);
}

.btn-ghost {
  color: var(--text);
  background: transparent;
  border-color: var(--border-strong);
}

.btn-ghost:hover {
  background: var(--accent-soft);
}

.cycle-note {
  margin: 18px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}

.cycle-note strong {
  color: var(--text);
  font-weight: 650;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-head h2 {
  margin: 0;
  font-size: 17px;
}

.badge {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}

.task-form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.task-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 14px;
  font: inherit;
  font-size: 14px;
  color: var(--text);
  background: var(--surface-solid);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.task-input::placeholder {
  color: var(--muted);
  opacity: 0.8;
}

.task-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 320px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: border-color 160ms ease, transform 160ms ease, opacity 160ms ease;
  animation: pop 240ms ease-out both;
}

@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.task-item:hover {
  border-color: var(--border-strong);
}

.task-item.is-done {
  opacity: 0.62;
}

.task-check {
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  cursor: pointer;
  background: transparent;
  border: 2px solid var(--border-strong);
  border-radius: 50%;
  color: transparent;
  font-size: 13px;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}

.task-check:hover {
  border-color: var(--accent);
}

.task-item.is-done .task-check {
  color: #fff;
  background: var(--break-accent);
  border-color: var(--break-accent);
}

.task-text {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  word-break: break-word;
}

.task-item.is-done .task-text {
  text-decoration: line-through;
  color: var(--muted);
}

.task-remove {
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 18px;
  line-height: 1;
  color: var(--muted);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 8px;
  opacity: 0;
  transition: opacity 140ms ease, color 140ms ease, background 140ms ease;
}

.task-item:hover .task-remove,
.task-remove:focus-visible {
  opacity: 1;
}

.task-remove:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}

.empty-state {
  margin: 8px 0;
  padding: 22px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
}

.task-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  font-size: 13px;
}

.muted {
  color: var(--muted);
}

.link-btn {
  padding: 6px 8px;
  font: inherit;
  font-size: 13px;
  color: var(--accent-strong);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 8px;
  transition: background 160ms ease;
}

.link-btn:hover:not(:disabled) {
  background: var(--accent-soft);
}

.link-btn:disabled {
  color: var(--muted);
  opacity: 0.5;
  cursor: not-allowed;
}

.app-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: clamp(22px, 4vw, 38px);
  font-size: 12px;
  color: var(--muted);
}

.dot {
  opacity: 0.6;
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (max-width: 860px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .timer-card {
    order: 1;
  }

  .tasks-card {
    order: 2;
  }
}

@media (max-width: 520px) {
  .task-remove {
    opacity: 1;
  }

  .task-form {
    flex-direction: column;
  }

  .task-form .btn {
    width: 100%;
  }

  .timer-ring {
    width: min(260px, 76vw);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }

  .card {
    animation: none;
  }
}`;

const js = `(function () {
  "use strict";

  var STORAGE_KEY = "atoms-pomodoro-v1";
  var RING_LENGTH = 2 * Math.PI * 96;

  var MODES = {
    focus: { label: "专注中", minutes: 25, next: "short", startLabel: "开始专注" },
    short: { label: "短休息", minutes: 5, next: "focus", startLabel: "开始休息" },
    long: { label: "长休息", minutes: 15, next: "focus", startLabel: "开始长休息" }
  };

  var elements = {
    ring: document.getElementById("ring-progress"),
    time: document.getElementById("timer-time"),
    label: document.getElementById("timer-label"),
    hint: document.getElementById("timer-hint"),
    toggle: document.getElementById("timer-toggle"),
    reset: document.getElementById("timer-reset"),
    todayCount: document.getElementById("today-count"),
    todayMinutes: document.getElementById("today-minutes"),
    tabs: Array.prototype.slice.call(document.querySelectorAll(".mode-tab")),
    taskForm: document.getElementById("task-form"),
    taskInput: document.getElementById("task-input"),
    taskList: document.getElementById("task-list"),
    taskEmpty: document.getElementById("task-empty"),
    taskProgress: document.getElementById("task-progress"),
    taskSummary: document.getElementById("task-summary"),
    clearDone: document.getElementById("clear-done"),
    themeToggle: document.getElementById("theme-toggle"),
    themeIcon: document.getElementById("theme-icon"),
    storageStatus: document.getElementById("storage-status")
  };

  var storageAvailable = detectStorage();
  var state = loadState();
  var tickTimer = null;
  var taskSequence = 0;

  function detectStorage() {
    try {
      window.localStorage.setItem("atoms-storage-test", "1");
      window.localStorage.removeItem("atoms-storage-test");
      return true;
    } catch (error) {
      return false;
    }
  }

  function pad(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function todayKey() {
    var now = new Date();
    return now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate();
  }

  function freshStats() {
    return { date: todayKey(), count: 0, minutes: 0 };
  }

  function defaultState() {
    return {
      mode: "focus",
      remaining: MODES.focus.minutes * 60,
      running: false,
      endsAt: 0,
      tasks: [],
      stats: freshStats(),
      theme: "light"
    };
  }

  function loadState() {
    var fallback = defaultState();
    if (!storageAvailable) {
      return fallback;
    }
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return fallback;
    }
    if (!raw) {
      return fallback;
    }
    var parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }

    var mode = typeof parsed.mode === "string" && MODES[parsed.mode] ? parsed.mode : "focus";
    var total = MODES[mode].minutes * 60;
    var remaining = total;
    if (typeof parsed.remaining === "number" && parsed.remaining >= 0 && parsed.remaining <= total) {
      remaining = Math.round(parsed.remaining);
    }
    var running = Boolean(parsed.running) && typeof parsed.endsAt === "number" && parsed.endsAt > Date.now();
    if (running) {
      remaining = Math.max(0, Math.ceil((parsed.endsAt - Date.now()) / 1000));
      if (remaining <= 0) {
        remaining = total;
        running = false;
      }
    }

    var stats = freshStats();
    if (parsed.stats && typeof parsed.stats === "object" && parsed.stats.date === stats.date) {
      stats.count = Math.max(0, Math.round(Number(parsed.stats.count) || 0));
      stats.minutes = Math.max(0, Math.round(Number(parsed.stats.minutes) || 0));
    }

    var tasks = [];
    var savedTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    for (var index = 0; index < savedTasks.length; index += 1) {
      var item = savedTasks[index];
      if (item && typeof item.text === "string" && item.text.trim()) {
        tasks.push({
          id: typeof item.id === "string" ? item.id : "task-" + index,
          text: item.text.slice(0, 60),
          done: Boolean(item.done),
          createdAt: Number(item.createdAt) || Date.now()
        });
      }
    }

    return {
      mode: mode,
      remaining: remaining,
      running: running,
      endsAt: running ? Math.round(parsed.endsAt) : 0,
      tasks: tasks,
      stats: stats,
      theme: parsed.theme === "dark" ? "dark" : "light"
    };
  }

  function saveState() {
    if (!storageAvailable) {
      return;
    }
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode: state.mode,
          remaining: state.remaining,
          running: state.running,
          endsAt: state.endsAt,
          tasks: state.tasks,
          stats: state.stats,
          theme: state.theme
        })
      );
    } catch (error) {
      elements.storageStatus.textContent = "本地保存失败";
    }
  }

  function formatTime(seconds) {
    var safe = Math.max(0, Math.round(seconds));
    var minutes = Math.floor(safe / 60);
    var rest = safe % 60;
    return pad(minutes) + ":" + pad(rest);
  }

  function ensureTodayStats() {
    if (state.stats.date !== todayKey()) {
      state.stats = freshStats();
    }
  }

  function updateRing() {
    var total = MODES[state.mode].minutes * 60;
    var ratio = total > 0 ? Math.min(1, Math.max(0, state.remaining / total)) : 0;
    var offset = String(RING_LENGTH * (1 - ratio));
    elements.ring.style.strokeDasharray = String(RING_LENGTH);
    elements.ring.style.strokeDashoffset = offset;
  }

  function renderTimer() {
    var mode = MODES[state.mode];
    elements.time.textContent = formatTime(state.remaining);
    elements.label.textContent = mode.label;
    elements.hint.textContent = state.running ? "保持节奏，结束后自动切换" : "按下空格开始";
    elements.toggle.textContent = state.running ? "暂停" : state.remaining < mode.minutes * 60 ? "继续" : mode.startLabel;
    elements.todayCount.textContent = String(state.stats.count);
    elements.todayMinutes.textContent = String(state.stats.minutes);
    document.body.setAttribute("data-mode", state.mode);
    document.title = formatTime(state.remaining) + " · " + mode.label + " | 番茄专注钟";

    for (var index = 0; index < elements.tabs.length; index += 1) {
      var tab = elements.tabs[index];
      var active = tab.getAttribute("data-mode") === state.mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    }
    updateRing();
  }

  function renderTasks() {
    elements.taskList.textContent = "";
    var doneCount = 0;
    for (var index = 0; index < state.tasks.length; index += 1) {
      if (state.tasks[index].done) {
        doneCount += 1;
      }
    }
    for (var taskIndex = 0; taskIndex < state.tasks.length; taskIndex += 1) {
      elements.taskList.appendChild(buildTaskItem(state.tasks[taskIndex]));
    }
    var total = state.tasks.length;
    var allDone = total > 0 && doneCount === total;
    elements.taskEmpty.hidden = total > 0;
    elements.taskEmpty.textContent = total > 0 ? "" : "还没有任务。先写下今天最重要的一件事吧。";
    elements.taskProgress.textContent = doneCount + " / " + total;
    elements.clearDone.disabled = doneCount === 0;
    if (total === 0) {
      elements.taskSummary.textContent = "保持专注，逐个击破";
    } else if (allDone) {
      elements.taskSummary.textContent = "全部完成，去休息一下吧 🎉";
    } else {
      elements.taskSummary.textContent = "已完成 " + doneCount + " 项，继续保持";
    }
  }

  function buildTaskItem(task) {
    var item = document.createElement("li");
    item.className = "task-item" + (task.done ? " is-done" : "");
    item.setAttribute("data-id", task.id);

    var check = document.createElement("button");
    check.type = "button";
    check.className = "task-check";
    check.textContent = "✓";
    check.setAttribute("aria-label", task.done ? "标记为未完成" : "标记为已完成");
    check.addEventListener("click", function () {
      toggleTask(task.id);
    });

    var text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "task-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "删除任务：" + task.text);
    remove.addEventListener("click", function () {
      removeTask(task.id);
    });

    item.appendChild(check);
    item.appendChild(text);
    item.appendChild(remove);
    return item;
  }

  function renderAll() {
    renderTimer();
    renderTasks();
  }

  function stopTicker() {
    if (tickTimer !== null) {
      window.clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function startTicker() {
    stopTicker();
    tickTimer = window.setInterval(tick, 250);
  }

  function tick() {
    if (!state.running) {
      return;
    }
    var msLeft = state.endsAt - Date.now();
    var remaining = Math.max(0, Math.ceil(msLeft / 1000));
    if (remaining !== state.remaining) {
      state.remaining = remaining;
      renderTimer();
      saveState();
    }
    if (msLeft <= 0) {
      completeSession();
    }
  }

  function completeSession() {
    stopTicker();
    var finishedMode = state.mode;
    if (finishedMode === "focus") {
      ensureTodayStats();
      state.stats.count += 1;
      state.stats.minutes += MODES.focus.minutes;
    }
    var nextMode = MODES[finishedMode].next;
    state.mode = nextMode;
    state.remaining = MODES[nextMode].minutes * 60;
    state.running = false;
    state.endsAt = 0;
    playChime();
    saveState();
    renderAll();
  }

  function startTimer() {
    if (state.remaining <= 0) {
      state.remaining = MODES[state.mode].minutes * 60;
    }
    ensureTodayStats();
    state.running = true;
    state.endsAt = Date.now() + state.remaining * 1000;
    startTicker();
    saveState();
    renderAll();
  }

  function pauseTimer() {
    state.remaining = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
    state.running = false;
    state.endsAt = 0;
    stopTicker();
    saveState();
    renderAll();
  }

  function toggleTimer() {
    if (state.running) {
      pauseTimer();
    } else {
      startTimer();
    }
  }

  function resetTimer() {
    state.remaining = MODES[state.mode].minutes * 60;
    state.running = false;
    state.endsAt = 0;
    stopTicker();
    saveState();
    renderAll();
  }

  function switchMode(mode) {
    if (!MODES[mode]) {
      return;
    }
    state.mode = mode;
    state.remaining = MODES[mode].minutes * 60;
    state.running = false;
    state.endsAt = 0;
    stopTicker();
    saveState();
    renderAll();
  }

  function addTask(text) {
    taskSequence += 1;
    state.tasks.push({
      id: "task-" + Date.now() + "-" + taskSequence,
      text: text.slice(0, 60),
      done: false,
      createdAt: Date.now()
    });
    saveState();
    renderTasks();
  }

  function toggleTask(id) {
    for (var index = 0; index < state.tasks.length; index += 1) {
      if (state.tasks[index].id === id) {
        state.tasks[index].done = !state.tasks[index].done;
        break;
      }
    }
    saveState();
    renderTasks();
  }

  function removeTask(id) {
    state.tasks = state.tasks.filter(function (task) {
      return task.id !== id;
    });
    saveState();
    renderTasks();
  }

  function clearCompleted() {
    state.tasks = state.tasks.filter(function (task) {
      return !task.done;
    });
    saveState();
    renderTasks();
  }

  function playChime() {
    try {
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) {
        return;
      }
      var context = new AudioCtor();
      var oscillator = context.createOscillator();
      var gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      oscillator.connect(gain);
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.7);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.75);
      window.setTimeout(function () {
        if (typeof context.close === "function") {
          context.close();
        }
      }, 1000);
    } catch (error) {
      /* 静音环境不支持音频时静默降级 */
    }
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    elements.themeIcon.textContent = state.theme === "dark" ? "☀️" : "🌙";
    elements.themeToggle.setAttribute("aria-label", state.theme === "dark" ? "切换到浅色主题" : "切换到深色主题");
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    saveState();
  }

  elements.toggle.addEventListener("click", toggleTimer);
  elements.reset.addEventListener("click", resetTimer);
  elements.clearDone.addEventListener("click", clearCompleted);
  elements.themeToggle.addEventListener("click", toggleTheme);

  for (var tabIndex = 0; tabIndex < elements.tabs.length; tabIndex += 1) {
    (function (tab) {
      tab.addEventListener("click", function () {
        switchMode(tab.getAttribute("data-mode"));
      });
    })(elements.tabs[tabIndex]);
  }

  elements.taskForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var value = elements.taskInput.value.trim();
    if (!value) {
      elements.taskInput.focus();
      return;
    }
    addTask(value);
    elements.taskInput.value = "";
    elements.taskInput.focus();
  });

  document.addEventListener("keydown", function (event) {
    var target = event.target;
    var tagName = target && target.tagName ? target.tagName : "";
    if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || tagName === "BUTTON") {
      return;
    }
    if (target && target.isContentEditable) {
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      toggleTimer();
    }
    if (event.key === "r" || event.key === "R") {
      resetTimer();
    }
  });

  applyTheme();
  if (!storageAvailable) {
    elements.storageStatus.textContent = "本地保存不可用（浏览器隐私模式）";
  }
  ensureTodayStats();
  renderAll();
  if (state.running) {
    startTicker();
  }
})();`;

export const POMODORO_TEMPLATE: AppTemplate = {
  name: "番茄专注钟",
  summary: "集番茄计时、任务清单与专注统计于一体的效率小应用。",
  features: ["25/5/15 分钟番茄计时", "任务清单增删与完成状态", "每日专注时长与番茄数统计", "深浅主题一键切换", "数据自动保存在本地"],
  files: {
    "index.html": html,
    "styles.css": css,
    "app.js": js,
  },
};
