import type { AppTemplate } from "./app-template";

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>极简待办 · 把今天过明白</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="ambient" aria-hidden="true"></div>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">✓</span>
        <div class="brand-text">
          <p id="today-label" class="eyebrow">今天</p>
          <h1>极简待办</h1>
        </div>
      </div>
      <button id="theme-toggle" class="icon-btn" type="button" aria-label="切换深浅色主题" title="切换深浅色主题">
        <span id="theme-icon" aria-hidden="true">🌙</span>
      </button>
    </header>

    <main class="layout">
      <section class="card hero-card">
        <p class="hero-kicker">先把重要的事做完</p>
        <h2 id="greeting" class="hero-title">把今天，过明白。</h2>
        <p id="hero-sub" class="hero-sub">写下三件最重要的事，一件一件完成。</p>
        <form id="todo-form" class="todo-form" autocomplete="off">
          <input id="todo-input" class="todo-input" type="text" maxlength="80" placeholder="接下来要做什么？" aria-label="新待办内容" />
          <button class="btn btn-primary" type="submit">添加</button>
        </form>
        <div class="progress-wrap">
          <div class="progress-meta">
            <span>今日进度</span>
            <strong id="progress-text">0%</strong>
          </div>
          <div class="progress-bar"><span id="progress-fill"></span></div>
        </div>
        <div class="filter-tabs" role="tablist" aria-label="筛选待办">
          <button class="filter-tab is-active" data-filter="all" role="tab" aria-selected="true" type="button">全部 <span id="count-all" class="tab-count">0</span></button>
          <button class="filter-tab" data-filter="active" role="tab" aria-selected="false" type="button">进行中 <span id="count-active" class="tab-count">0</span></button>
          <button class="filter-tab" data-filter="done" role="tab" aria-selected="false" type="button">已完成 <span id="count-done" class="tab-count">0</span></button>
        </div>
      </section>

      <section class="card list-card">
        <div class="section-head">
          <h2>清单</h2>
          <span id="list-badge" class="badge">0 件</span>
        </div>
        <ul id="todo-list" class="todo-list" aria-live="polite"></ul>
        <div id="todo-empty" class="empty-state">
          <span class="empty-icon" aria-hidden="true">🌿</span>
          <p id="empty-title" class="empty-title">清单是空的</p>
          <p id="empty-hint" class="empty-hint">添加第一件小事，开始今天的节奏。</p>
        </div>
        <div class="list-footer">
          <span id="list-summary" class="muted">还没有待办</span>
          <button id="clear-done" class="link-btn" type="button" disabled>清除已完成</button>
        </div>
      </section>
    </main>

    <footer class="app-footer">
      <span>本地保存 · 无需登录</span>
      <span class="dot" aria-hidden="true">·</span>
      <span id="storage-status">数据只属于你</span>
    </footer>
  </div>
  <script src="app.js" defer></script>
</body>
</html>`;

const css = `:root {
  color-scheme: light;
  --bg: #f3f2fb;
  --bg-deep: #e8e6f7;
  --bg-glow: rgba(99, 102, 241, 0.2);
  --surface: rgba(255, 255, 255, 0.82);
  --surface-solid: #ffffff;
  --border: rgba(41, 38, 84, 0.08);
  --border-strong: rgba(41, 38, 84, 0.16);
  --text: #211f3b;
  --muted: #77738f;
  --accent: #6366f1;
  --accent-strong: #4f46e5;
  --accent-soft: rgba(99, 102, 241, 0.12);
  --success: #10b981;
  --shadow: 0 26px 64px -34px rgba(53, 48, 120, 0.5);
  --radius-lg: 28px;
  --radius-md: 18px;
  --radius-sm: 12px;
  --font-sans: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif;
}

html[data-theme="dark"] {
  color-scheme: dark;
  --bg: #131220;
  --bg-deep: #0d0c18;
  --bg-glow: rgba(99, 102, 241, 0.22);
  --surface: rgba(32, 30, 54, 0.74);
  --surface-solid: #201e36;
  --border: rgba(226, 224, 255, 0.08);
  --border-strong: rgba(226, 224, 255, 0.16);
  --text: #f1f0ff;
  --muted: #a3a0bf;
  --shadow: 0 30px 70px -36px rgba(0, 0, 0, 0.85);
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
    radial-gradient(980px 560px at 8% -12%, var(--bg-glow), transparent 62%),
    radial-gradient(760px 520px at 106% 6%, rgba(16, 185, 129, 0.12), transparent 58%),
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
  background: radial-gradient(520px 300px at 84% 92%, var(--accent-soft), transparent 72%);
}

.app {
  position: relative;
  max-width: 1040px;
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
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  border-radius: 18px;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  box-shadow: var(--shadow);
}

.brand-text h1 {
  margin: 0;
  font-size: clamp(20px, 3vw, 26px);
}

.brand-text .eyebrow {
  margin: 0 0 2px;
  font-size: 12px;
  letter-spacing: 0.16em;
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
  transition: transform 160ms ease, border-color 160ms ease;
}

.icon-btn:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong);
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
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

.list-card {
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

.hero-kicker {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.18em;
  color: var(--accent-strong);
}

.hero-title {
  margin: 0;
  font-size: clamp(26px, 4.4vw, 36px);
  letter-spacing: 0.01em;
  line-height: 1.25;
}

.hero-sub {
  margin: 8px 0 22px;
  font-size: 14px;
  color: var(--muted);
}

.todo-form {
  display: flex;
  gap: 8px;
  margin-bottom: 22px;
}

.todo-input {
  flex: 1;
  min-width: 0;
  height: 48px;
  padding: 0 16px;
  font: inherit;
  font-size: 14px;
  color: var(--text);
  background: var(--surface-solid);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.todo-input::placeholder {
  color: var(--muted);
  opacity: 0.8;
}

.todo-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
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
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
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

.progress-wrap {
  margin-bottom: 20px;
}

.progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--muted);
}

.progress-meta strong {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.progress-bar {
  height: 10px;
  overflow: hidden;
  background: var(--accent-soft);
  border-radius: 999px;
}

.progress-bar span {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), var(--success));
  transition: width 280ms ease;
}

.filter-tabs {
  display: flex;
  gap: 6px;
  padding: 5px;
  background: rgba(41, 38, 84, 0.05);
  border-radius: 999px;
  width: fit-content;
}

html[data-theme="dark"] .filter-tabs {
  background: rgba(226, 224, 255, 0.06);
}

.filter-tab {
  padding: 8px 14px;
  font: inherit;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 999px;
  transition: color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.filter-tab:hover {
  color: var(--text);
}

.filter-tab.is-active {
  color: var(--text);
  background: var(--surface-solid);
  box-shadow: 0 10px 22px -14px rgba(53, 48, 120, 0.5);
}

.tab-count {
  margin-left: 4px;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
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

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 360px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: border-color 160ms ease, opacity 160ms ease, transform 160ms ease;
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

.todo-item:hover {
  border-color: var(--border-strong);
}

.todo-item.is-done {
  opacity: 0.62;
}

.todo-check {
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 13px;
  color: transparent;
  cursor: pointer;
  background: transparent;
  border: 2px solid var(--border-strong);
  border-radius: 50%;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}

.todo-check:hover {
  border-color: var(--accent);
}

.todo-item.is-done .todo-check {
  color: #fff;
  background: var(--success);
  border-color: var(--success);
}

.todo-text {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  word-break: break-word;
  border-radius: 6px;
  cursor: text;
}

.todo-text:hover {
  background: var(--accent-soft);
  box-shadow: 0 0 0 4px var(--accent-soft);
}

.todo-item.is-done .todo-text {
  color: var(--muted);
  text-decoration: line-through;
}

.edit-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  font: inherit;
  font-size: 14px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 8px;
}

.edit-input:focus {
  outline: none;
  box-shadow: 0 0 0 4px var(--accent-soft);
}

.todo-remove {
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

.todo-item:hover .todo-remove,
.todo-remove:focus-visible {
  opacity: 1;
}

.todo-remove:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}

.empty-state {
  padding: 30px 16px;
  text-align: center;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
}

.empty-icon {
  display: block;
  margin-bottom: 8px;
  font-size: 28px;
}

.empty-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.empty-hint {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.list-footer {
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
}

@media (max-width: 520px) {
  .todo-remove {
    opacity: 1;
  }

  .todo-form {
    flex-direction: column;
  }

  .todo-form .btn {
    width: 100%;
  }

  .filter-tabs {
    width: 100%;
    justify-content: space-between;
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

  var STORAGE_KEY = "atoms-todo-v1";
  var WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  var elements = {
    todayLabel: document.getElementById("today-label"),
    greeting: document.getElementById("greeting"),
    heroSub: document.getElementById("hero-sub"),
    form: document.getElementById("todo-form"),
    input: document.getElementById("todo-input"),
    list: document.getElementById("todo-list"),
    empty: document.getElementById("todo-empty"),
    emptyTitle: document.getElementById("empty-title"),
    emptyHint: document.getElementById("empty-hint"),
    listBadge: document.getElementById("list-badge"),
    listSummary: document.getElementById("list-summary"),
    progressText: document.getElementById("progress-text"),
    progressFill: document.getElementById("progress-fill"),
    countAll: document.getElementById("count-all"),
    countActive: document.getElementById("count-active"),
    countDone: document.getElementById("count-done"),
    filters: Array.prototype.slice.call(document.querySelectorAll(".filter-tab")),
    clearDone: document.getElementById("clear-done"),
    themeToggle: document.getElementById("theme-toggle"),
    themeIcon: document.getElementById("theme-icon"),
    storageStatus: document.getElementById("storage-status")
  };

  var storageAvailable = detectStorage();
  var state = loadState();
  var sequence = 0;

  function detectStorage() {
    try {
      window.localStorage.setItem("atoms-storage-test", "1");
      window.localStorage.removeItem("atoms-storage-test");
      return true;
    } catch (error) {
      return false;
    }
  }

  function todayKey() {
    var now = new Date();
    return now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate();
  }

  function loadState() {
    var fallback = { items: [], filter: "all", theme: "light" };
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

    var items = [];
    var savedItems = Array.isArray(parsed.items) ? parsed.items : [];
    for (var index = 0; index < savedItems.length; index += 1) {
      var item = savedItems[index];
      if (item && typeof item.text === "string" && item.text.trim()) {
        items.push({
          id: typeof item.id === "string" ? item.id : "todo-" + index,
          text: item.text.slice(0, 80),
          done: Boolean(item.done),
          createdAt: Number(item.createdAt) || Date.now()
        });
      }
    }

    var filter = "all";
    if (parsed.filter === "active" || parsed.filter === "done") {
      filter = parsed.filter;
    }

    return { items: items, filter: filter, theme: parsed.theme === "dark" ? "dark" : "light" };
  }

  function saveState() {
    if (!storageAvailable) {
      return;
    }
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ items: state.items, filter: state.filter, theme: state.theme })
      );
    } catch (error) {
      elements.storageStatus.textContent = "本地保存失败";
    }
  }

  function formatToday() {
    var now = new Date();
    return now.getMonth() + 1 + " 月 " + now.getDate() + " 日 · " + WEEKDAYS[now.getDay()];
  }

  function greetingText() {
    var hour = new Date().getHours();
    if (hour < 6) {
      return "夜深了，也别太累。";
    }
    if (hour < 12) {
      return "早上好，今天也从容一点。";
    }
    if (hour < 18) {
      return "下午好，把重要的事做完。";
    }
    return "晚上好，收个漂亮的尾。";
  }

  function visibleItems() {
    if (state.filter === "active") {
      return state.items.filter(function (item) {
        return !item.done;
      });
    }
    if (state.filter === "done") {
      return state.items.filter(function (item) {
        return item.done;
      });
    }
    return state.items;
  }

  function buildItem(item) {
    var row = document.createElement("li");
    row.className = "todo-item" + (item.done ? " is-done" : "");
    row.setAttribute("data-id", item.id);

    var check = document.createElement("button");
    check.type = "button";
    check.className = "todo-check";
    check.textContent = "✓";
    check.setAttribute("aria-label", item.done ? "标记为未完成" : "标记为已完成");
    check.addEventListener("click", function () {
      toggleItem(item.id);
    });

    var text = document.createElement("span");
    text.className = "todo-text";
    text.textContent = item.text;
    text.title = "双击可编辑";
    text.addEventListener("dblclick", function () {
      startEditing(row, item);
    });

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "todo-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "删除待办：" + item.text);
    remove.addEventListener("click", function () {
      removeItem(item.id);
    });

    row.appendChild(check);
    row.appendChild(text);
    row.appendChild(remove);
    return row;
  }

  function startEditing(row, item) {
    var textNode = row.querySelector(".todo-text");
    if (!textNode) {
      return;
    }
    var input = document.createElement("input");
    input.type = "text";
    input.className = "edit-input";
    input.maxLength = 80;
    input.value = item.text;
    row.replaceChild(input, textNode);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    var finished = false;
    function commit(save) {
      if (finished) {
        return;
      }
      finished = true;
      if (save) {
        var nextText = input.value.trim();
        if (nextText) {
          item.text = nextText.slice(0, 80);
          saveState();
        }
      }
      render();
    }

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        commit(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        commit(false);
      }
    });
    input.addEventListener("blur", function () {
      commit(true);
    });
  }

  function render() {
    var all = state.items.length;
    var done = 0;
    for (var index = 0; index < state.items.length; index += 1) {
      if (state.items[index].done) {
        done += 1;
      }
    }
    var active = all - done;
    var percent = all === 0 ? 0 : Math.round((done / all) * 100);

    elements.todayLabel.textContent = formatToday();
    elements.greeting.textContent = greetingText();
    elements.countAll.textContent = String(all);
    elements.countActive.textContent = String(active);
    elements.countDone.textContent = String(done);
    elements.progressText.textContent = percent + "%";
    elements.progressFill.style.width = percent + "%";
    elements.listBadge.textContent = visibleItems().length + " 件";
    elements.clearDone.disabled = done === 0;

    if (all === 0) {
      elements.heroSub.textContent = "写下三件最重要的事，一件一件完成。";
      elements.listSummary.textContent = "还没有待办";
    } else if (done === all) {
      elements.heroSub.textContent = "全部完成，去休息一下吧。";
      elements.listSummary.textContent = "全部完成 🎉";
    } else {
      elements.heroSub.textContent = "已完成 " + done + " 件，还剩 " + active + " 件。";
      elements.listSummary.textContent = active + " 件进行中";
    }

    for (var filterIndex = 0; filterIndex < elements.filters.length; filterIndex += 1) {
      var tab = elements.filters[filterIndex];
      var tabFilter = tab.getAttribute("data-filter");
      var isActive = tabFilter === state.filter;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    }

    var visible = visibleItems();
    elements.list.textContent = "";
    for (var itemIndex = 0; itemIndex < visible.length; itemIndex += 1) {
      elements.list.appendChild(buildItem(visible[itemIndex]));
    }

    var empty = visible.length === 0;
    elements.empty.hidden = !empty;
    if (empty) {
      if (all === 0) {
        elements.emptyTitle.textContent = "清单是空的";
        elements.emptyHint.textContent = "添加第一件小事，开始今天的节奏。";
      } else if (state.filter === "active") {
        elements.emptyTitle.textContent = "没有进行中的任务";
        elements.emptyHint.textContent = "都完成了，给自己一点奖励吧。";
      } else if (state.filter === "done") {
        elements.emptyTitle.textContent = "还没有完成的任务";
        elements.emptyHint.textContent = "完成一件后，它会出现在这里。";
      }
    }
  }

  function addItem(text) {
    sequence += 1;
    state.items.push({
      id: "todo-" + Date.now() + "-" + sequence,
      text: text.slice(0, 80),
      done: false,
      createdAt: Date.now()
    });
    if (state.filter === "done") {
      state.filter = "active";
    }
    saveState();
    render();
  }

  function toggleItem(id) {
    for (var index = 0; index < state.items.length; index += 1) {
      if (state.items[index].id === id) {
        state.items[index].done = !state.items[index].done;
        break;
      }
    }
    saveState();
    render();
  }

  function removeItem(id) {
    state.items = state.items.filter(function (item) {
      return item.id !== id;
    });
    saveState();
    render();
  }

  function clearCompleted() {
    state.items = state.items.filter(function (item) {
      return !item.done;
    });
    saveState();
    render();
  }

  function setFilter(filter) {
    state.filter = filter;
    saveState();
    render();
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

  elements.form.addEventListener("submit", function (event) {
    event.preventDefault();
    var value = elements.input.value.trim();
    if (!value) {
      elements.input.focus();
      return;
    }
    addItem(value);
    elements.input.value = "";
    elements.input.focus();
  });

  elements.clearDone.addEventListener("click", clearCompleted);
  elements.themeToggle.addEventListener("click", toggleTheme);

  for (var filterIndex = 0; filterIndex < elements.filters.length; filterIndex += 1) {
    (function (tab) {
      tab.addEventListener("click", function () {
        setFilter(tab.getAttribute("data-filter"));
      });
    })(elements.filters[filterIndex]);
  }

  applyTheme();
  if (!storageAvailable) {
    elements.storageStatus.textContent = "本地保存不可用（浏览器隐私模式）";
  }
  render();
})();`;

export const TODO_TEMPLATE: AppTemplate = {
  name: "极简待办",
  summary: "清爽的待办清单，支持筛选、进度与本地持久化。",
  features: ["快速添加、完成与删除待办", "全部 / 进行中 / 已完成筛选", "双击内联编辑任务内容", "完成进度条与今日状态文案", "深浅主题与本地自动保存"],
  files: {
    "index.html": html,
    "styles.css": css,
    "app.js": js,
  },
};
