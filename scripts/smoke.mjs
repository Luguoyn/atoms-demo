#!/usr/bin/env node
/**
 * Atoms Demo — HTTP 冒烟测试（零依赖，Node >= 20）
 *
 * 校验服务端契约（见 docs/CONTRACT.md §4）：
 *   1. GET  /api/config  → ServerConfig { hasServerKey, mockMode, defaultModel }
 *   2. POST /api/chat    → text/event-stream，事件顺序符合契约，done.files 完整且 validation ok
 *
 * 用法：
 *   node scripts/smoke.mjs                       # 默认测 http://localhost:3000
 *   node scripts/smoke.mjs --base http://localhost:3000
 *   node scripts/smoke.mjs --require-chat        # 没有 mock 也没有 key 时视为失败（退出码 3）
 *   node scripts/smoke.mjs --allow-real          # 服务端有真实 key 时也真的跑一次生成（会消耗 token）
 *   node scripts/smoke.mjs --dump ./tmp/out      # 把 done.files 落盘，便于排查产物问题
 *
 * 退出码：
 *   0  通过（若服务端没有可用 mock 且未加 --allow-real，chat 步骤会明确标记 SKIP）
 *   1  断言失败 / 服务端返回错误事件
 *   2  连不上服务（dev server 没起）或前置条件不满足
 *   3  加了 --require-chat 但 chat 被跳过
 *
 * 说明：本脚本只读地打接口，不会启动/停止 dev server，也不会打印任何 API key。
 */

import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const EXIT = { PASS: 0, FAIL: 1, UNREACHABLE: 2, SKIP_REQUIRED: 3 };

/**
 * 统一收尾：设置退出码后让事件循环自然结束。
 * 不用 process.exit()：实测本机 Node 24.15 / Windows 下，如果还有 fetch(undici) 连接在关闭，
 * 直接 process.exit() 会触发 libuv 断言崩溃（0xC0000409），破坏退出码语义；自然退出 <1s。
 */
function finish(code) {
  process.exitCode = code;
  const guard = setTimeout(() => process.exit(code), 10_000);
  guard.unref();
}

const DEFAULT_BASE = process.env.SMOKE_BASE || "http://localhost:3000";
const DEFAULT_MESSAGE = "做一个番茄钟专注计时器：开始/暂停/重置，支持任务清单和本地持久化";
/** 整体超时，需大于服务端 AGENT_BUDGET_MS（默认 300s），留出建立连接与收尾余量。 */
const DEFAULT_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 360_000);
const CONNECT_TIMEOUT_MS = Number(process.env.SMOKE_CONNECT_TIMEOUT_MS || 15_000);
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/* ------------------------------- 小工具 ------------------------------- */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  dim: (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
};

const state = {
  checks: 0,
  failures: [],
  warnings: [],
  skip: null,
  startedAt: Date.now(),
};

function check(ok, label, detail = "") {
  state.checks += 1;
  if (ok) {
    console.log(`  ${c.green("✓")} ${label}${detail ? c.dim(`  ${detail}`) : ""}`);
  } else {
    state.failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ${c.red("✗")} ${label}${detail ? `  ${detail}` : ""}`);
  }
  return ok;
}

function warn(label, detail = "") {
  state.warnings.push(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`  ${c.yellow("!")} ${label}${detail ? c.dim(`  ${detail}`) : ""}`);
}

function fail(message) {
  state.failures.push(message);
  console.log(`  ${c.red("✗")} ${message}`);
}

function section(title) {
  console.log(`\n${c.bold(c.cyan(title))}`);
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return "?";
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function usage() {
  console.log(
    [
      "Atoms Demo smoke test",
      "",
      "用法: node scripts/smoke.mjs [options]",
      "",
      "  --base <url>       服务地址，默认 $SMOKE_BASE 或 http://localhost:3000",
      "  --message <text>   生成用的自然语言需求",
      "  --timeout <ms>     /api/chat 整体超时，默认 360000（需大于 AGENT_BUDGET_MS）",
      "  --allow-real       服务端有真实 key 时也跑一次生成（会消耗 token）",
      "  --require-chat     跳过 chat 步骤视为失败（退出码 3）",
      "  --events           打印完整事件时间线（调试用）",
      "  --dump <dir>       把 done.files 写到目录里（排查产物用）",
      "  -h, --help         显示本帮助",
      "",
      "退出码: 0 通过 / 1 断言失败 / 2 连不上服务 / 3 跳过但被要求必须跑",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = {
    base: DEFAULT_BASE,
    message: DEFAULT_MESSAGE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    allowReal: false,
    requireChat: false,
    printEvents: false,
    dumpDir: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v == null) throw new Error(`参数 ${a} 缺少取值`);
      i += 1;
      return v;
    };
    switch (a) {
      case "--base":
        args.base = next();
        break;
      case "--message":
        args.message = next();
        break;
      case "--timeout":
        args.timeoutMs = Number(next());
        break;
      case "--allow-real":
        args.allowReal = true;
        break;
      case "--require-chat":
        args.requireChat = true;
        break;
      case "--events":
        args.printEvents = true;
        break;
      case "--dump":
        args.dumpDir = next();
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (a.startsWith("--")) throw new Error(`未知参数: ${a}`);
    }
  }
  args.base = String(args.base).replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(args.base)) throw new Error(`--base 必须是 http(s) URL，收到: ${args.base}`);
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) throw new Error("--timeout 必须是正数毫秒");
  args.isLocal = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(args.base);
  return args;
}

/* ---------------------------- 网络请求封装 ---------------------------- */

class UnreachableError extends Error {}

/**
 * 带超时的 fetch。
 * 注意：这里手动 AbortController + clearTimeout，而不是 AbortSignal.timeout() ——
 * Node 24.15 / Windows 下若退出时仍有未清理的 AbortSignal.timeout 手柄，process.exit()
 * 会触发 libuv 断言崩溃（exit code 0xC0000409），会破坏冒烟脚本的退出码语义。
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`请求超时（>${timeoutMs}ms）`)), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs) {
  let res;
  try {
    res = await fetchWithTimeout(url, { headers: { accept: "application/json" } }, timeoutMs);
  } catch (err) {
    throw new UnreachableError(`${url} 请求失败: ${err?.cause?.code || err?.name || err?.message || err}`);
  }
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { res, text, body };
}

/** 解析 SSE 流，逐个回调事件；返回原始事件数组。 */
async function readSse(res, { onEvent }) {
  if (!res.body) throw new Error("响应没有 body（不是流式响应）");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];
  let receivedBytes = 0;
  let finished = false;
  let streamEnded = false;

  try {
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) {
        streamEnded = true;
        break;
      }
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_BODY_BYTES) {
        throw new Error(`SSE 响应超过 ${fmtBytes(MAX_BODY_BYTES)}，疑似异常`);
      }
      buffer += decoder.decode(value, { stream: true });
      // 兼容 \n\n 与 \r\n\r\n 分隔
      buffer = buffer.replace(/\r\n/g, "\n");
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (!block.trim()) continue;
        const dataLines = [];
        for (const line of block.split("\n")) {
          if (line.startsWith(":")) continue; // SSE 注释/心跳
          if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        if (dataLines.length === 0) continue;
        const raw = dataLines.join("\n");
        let event;
        try {
          event = JSON.parse(raw);
        } catch {
          throw new Error(`无法解析 SSE data（前 200 字符）: ${raw.slice(0, 200)}`);
        }
        events.push(event);
        const stop = onEvent(event);
        if (stop === "stop") {
          finished = true;
          break;
        }
      }
    }
    // 流结束时处理残留块（正常实现不会出现，但别丢数据）
    if (!finished && buffer.trim()) {
      for (const line of buffer.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).replace(/^ /, "").trim();
        if (!raw) continue;
        const event = JSON.parse(raw);
        events.push(event);
        onEvent(event);
      }
    }
  } finally {
    // 已正常读完的流不再 cancel，避免进程退出时和 libuv 关闭竞态。
    if (!streamEnded) {
      try {
        await reader.cancel();
      } catch {
        /* 忽略 */
      }
    }
  }
  return events;
}

function readHeader(res, name) {
  return res.headers.get(name) ?? "";
}

/* ------------------------------- 各步骤 ------------------------------- */

async function stepConfig(args) {
  section("1) GET /api/config");
  const { res, text, body } = await fetchJson(`${args.base}/api/config`, CONNECT_TIMEOUT_MS);
  check(res.status === 200, `HTTP 200`, `实际 ${res.status}`);
  check(
    readHeader(res, "content-type").includes("application/json"),
    "Content-Type: application/json",
    readHeader(res, "content-type") || "(缺失)",
  );
  if (!body || typeof body !== "object") {
    fail(`响应不是合法 JSON: ${text.slice(0, 200)}`);
    return null;
  }
  check(typeof body.hasServerKey === "boolean", "hasServerKey 是 boolean", String(body.hasServerKey));
  check(typeof body.mockMode === "boolean", "mockMode 是 boolean", String(body.mockMode));
  check(
    typeof body.defaultModel === "string" && body.defaultModel.length > 0,
    "defaultModel 是非空 string",
    String(body.defaultModel),
  );
  const unknown = Object.keys(body).filter((k) => !["hasServerKey", "mockMode", "defaultModel"].includes(k));
  if (unknown.length) warn("config 含契约外字段", unknown.join(", "));
  return body;
}

async function stepChat(args, config) {
  section("2) POST /api/chat（SSE）");

  if (!config.mockMode && !args.allowReal) {
    const reason = config.hasServerKey
      ? "服务端已配置真实 LLM key（mockMode=false），默认不消耗 token 跑真实生成"
      : "服务端既没有可用 key 也没有开启 mock（mockMode=false），/api/chat 预期会返回 error 事件";
    state.skip = `${reason}。让 dev server 以 MOCK_LLM=1 启动后重跑，或加 --allow-real 强制走真实 provider。`;
    warn("SKIP chat 步骤", reason);
    return null;
  }

  const requestBody = {
    projectId: `smoke-${Date.now()}`,
    message: args.message,
    files: {},
    history: [],
    mode: "generate",
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`/api/chat 超时（>${args.timeoutMs}ms）`)), args.timeoutMs);
  const startedAt = Date.now();
  let res;
  try {
    res = await fetch(`${args.base}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === "AbortError" || controller.signal.aborted) {
      fail(`请求超时或中止: ${controller.signal.reason?.message || err.message}`);
      return null;
    }
    throw new UnreachableError(`POST /api/chat 失败: ${err?.cause?.code || err?.message || err}`);
  }

  try {
    check(res.status === 200, "HTTP 200", `实际 ${res.status}`);
    check(
      readHeader(res, "content-type").startsWith("text/event-stream"),
      "Content-Type: text/event-stream",
      readHeader(res, "content-type") || "(缺失)",
    );
    // CDN / 反向代理会剥离或改写响应头（实测 Cloudflare quick tunnel 会去掉
    // X-Accel-Buffering）。本地直连必须存在，远程地址缺失时降级为警告，
    // 并用后面的「事件流式到达」断言兜底证明没有被缓冲。
    const cacheControl = readHeader(res, "cache-control");
    const accelBuffering = readHeader(res, "x-accel-buffering").toLowerCase();
    if (args.isLocal) {
      check(cacheControl.includes("no-cache"), "Cache-Control 含 no-cache", cacheControl || "(缺失)");
      check(accelBuffering === "no", "X-Accel-Buffering: no", accelBuffering || "(缺失)");
    } else {
      if (!cacheControl.includes("no-cache")) {
        warn("代理未保留 Cache-Control: no-cache", cacheControl || "(缺失)");
      }
      if (accelBuffering !== "no") {
        warn("代理未保留 X-Accel-Buffering: no", "经 CDN/隧道时常见，以事件是否流式到达为准");
      }
    }

    if (res.status !== 200) {
      const text = await res.text();
      fail(`/api/chat 返回 ${res.status}: ${text.slice(0, 300)}`);
      return null;
    }

    /** @type {any[]} */
    let events = [];
    let errorEvent = null;
    let doneEvent = null;
    let firstEventDelay = null;
    const t0 = Date.now();

    try {
      events = await readSse(res, {
        timeoutMs: args.timeoutMs,
        onEvent(ev) {
          if (firstEventDelay === null) firstEventDelay = Date.now() - t0;
          if (args.printEvents) {
            const brief = ev.type === "file_delta" ? `${ev.path} +${ev.delta?.length ?? 0}B` : "";
            console.log(c.dim(`    ${String(Date.now() - t0).padStart(6)}ms  ${ev.type} ${brief}`));
          }
          if (ev.type === "error") errorEvent = ev;
          if (ev.type === "done") doneEvent = ev;
          // done 之后契约上不应再有事件；继续读完以检测违规
        },
      });
    } catch (err) {
      if (controller.signal.aborted) {
        fail(`流读取超时（>${args.timeoutMs}ms）：${controller.signal.reason?.message || ""}`);
        return null;
      }
      fail(`流读取失败: ${err.message}`);
      return null;
    }

    const elapsed = Date.now() - startedAt;
    const counts = events.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {});
    console.log(
      `  ${c.dim("事件统计:")} ${Object.entries(counts)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")}  ${c.dim(`首事件 ${firstEventDelay ?? "?"}ms，总耗时 ${elapsed}ms`)}`,
    );

    check(events.length > 0, "收到至少一个 SSE 事件");
    if (events.length === 0) return null;

    check(firstEventDelay !== null && firstEventDelay < 30_000, "首个事件及时到达（<30s）", `${firstEventDelay}ms`);

    // 若整段响应被代理缓冲，所有事件会几乎同时到达末尾：首个事件耗时会接近总耗时。
    // 这条断言比响应头更可靠（持久化头可能被 CDN 剥离）。
    check(
      firstEventDelay !== null && firstEventDelay < Math.max(1500, elapsed * 0.7),
      "事件为流式到达（非缓冲后一次性下发）",
      `首事件 ${firstEventDelay ?? "?"}ms / 总 ${elapsed}ms`,
    );

    if (errorEvent) {
      fail(`服务端返回 error 事件: ${errorEvent.message}${errorEvent.retryable ? "（可重试）" : ""}`);
      // error 之后不应再有 done
      if (doneEvent) fail("error 事件之后仍收到了 done 事件");
      return null;
    }

    /* ---- 事件顺序断言（CONTRACT §4） ---- */
    const idxOf = (pred) => events.findIndex(pred);

    const planningIdx = idxOf((e) => e.type === "phase" && e.phase === "planning");
    const planIdx = idxOf((e) => e.type === "plan");
    const codingIdx = idxOf((e) => e.type === "phase" && e.phase === "coding");
    const validatingIdx = idxOf((e) => e.type === "phase" && e.phase === "validating");
    const validationIdx = idxOf((e) => e.type === "validation");
    const doneIdx = idxOf((e) => e.type === "done");

    check(events[0].type === "phase" && events[0].phase === "planning", "首个事件是 phase(planning)");
    check(planIdx !== -1, "包含 plan 事件（AppPlan）");
    if (planIdx !== -1) {
      const p = events[planIdx].plan || {};
      check(typeof p.name === "string" && p.name.length > 0, "plan.name 非空", p.name);
      check(typeof p.summary === "string" && p.summary.length > 0, "plan.summary 非空");
      check(Array.isArray(p.features) && p.features.length > 0, "plan.features 非空数组");
      check(Array.isArray(p.files) && p.files.length > 0, "plan.files 非空数组");
    }
    check(codingIdx !== -1, "包含 phase(coding)");
    check(planningIdx !== -1 && planIdx > planningIdx, "plan 出现在 phase(planning) 之后");
    check(planIdx !== -1 && codingIdx > planIdx, "phase(coding) 出现在 plan 之后");

    // 工具调用块：tool_start(write_file) → file_delta* → file_done → tool_result
    const writeBlocks = [];
    for (let i = 0; i < events.length; i += 1) {
      if (events[i].type !== "tool_start") continue;
      const start = i;
      const tool = events[i].tool;
      let j = i + 1;
      let fileDone = 0;
      let delta = 0;
      const donePaths = new Set();
      while (j < events.length && events[j].type !== "tool_result") {
        if (events[j].type === "file_done") {
          fileDone += 1;
          donePaths.add(events[j].path);
        }
        if (events[j].type === "file_delta") delta += 1;
        // 同一个 tool block 里出现新的 tool_start 说明没发 tool_result
        if (events[j].type === "tool_start") break;
        j += 1;
      }
      const hasResult = j < events.length && events[j].type === "tool_result";
      if (!hasResult) {
        fail(`tool_start(${tool}) 之后缺少 tool_result`);
        break;
      }
      writeBlocks.push({
        tool,
        ok: events[j].ok,
        fileDone,
        delta,
        donePaths: [...donePaths],
      });
      i = j;
    }
    const writeFileBlocks = writeBlocks.filter((b) => b.tool === "write_file");
    check(writeFileBlocks.length > 0, "至少发生一次 write_file 工具调用");
    if (writeFileBlocks.length > 0) {
      const badDelta = writeFileBlocks.filter((b) => b.delta === 0 && b.fileDone === 0);
      check(badDelta.length === 0, "每个 write_file 都有 file_delta/file_done", `${badDelta.length} 个空块`);
      const badResult = writeFileBlocks.filter((b) => b.ok !== true);
      check(badResult.length === 0, "所有 write_file 的 tool_result.ok=true", `${badResult.length} 个失败`);
      const badDone = writeFileBlocks.filter((b) => b.fileDone === 0);
      check(badDone.length === 0, "每个 write_file 都收到 file_done", `${badDone.length} 个缺失`);
    }
    const totalDeltas = counts.file_delta || 0;
    check(totalDeltas >= 2, "文件内容以 file_delta 流式下发（≥2 段）", `${totalDeltas} 段`);

    check(validationIdx !== -1, "包含 validation 事件");
    if (validationIdx !== -1) {
      check(validatingIdx !== -1 && validationIdx > validatingIdx, "validation 出现在 phase(validating) 之后");
      // 契约允许「校验失败 → 修复一轮 → 再校验」，验收看**最终**那一次校验结果。
      const lastValidationIdx = events.findLastIndex((e) => e.type === "validation");
      const validation = events[lastValidationIdx];
      const validationCount = counts.validation || 1;
      if (validationCount > 1) {
        warn(`发生了 ${validationCount - 1} 轮自动修复校验`, "首次校验有 issues，最终结果见下");
      }
      const issuesText = (validation.issues || []).map((x) => `${x.file}: ${x.message}`).join("; ");
      check(validation.ok === true, "最终 validation.ok === true", issuesText.slice(0, 400) || "(无 issues)");
      if (Array.isArray(validation.issues) && validation.issues.length) {
        warn("最终 validation 仍带 issues", issuesText.slice(0, 400));
      }
    }

    check(doneIdx !== -1, "收到 done 事件");
    check(doneIdx === -1 || doneIdx === events.length - 1, "done 是最后一个事件", `done 位于 ${doneIdx}，共 ${events.length}`);

    if (doneEvent) {
      const files = doneEvent.files;
      check(files && typeof files === "object" && Object.keys(files).length > 0, "done.files 非空");
      const fileNames = files && typeof files === "object" ? Object.keys(files) : [];
      check(fileNames.includes("index.html"), "done.files 含 index.html", fileNames.join(", "));
      const badFiles = fileNames.filter(
        (k) => typeof files[k] !== "string" || files[k].trim().length === 0,
      );
      check(badFiles.length === 0, "所有文件内容非空", badFiles.join(", "));
      if (fileNames.includes("index.html")) {
        check((files["index.html"] || "").length > 200, "index.html 内容有实质长度（>200B）", `${files["index.html"].length}B`);
      }
      if (!fileNames.includes("app.js")) warn("done.files 不含 app.js", "契约要求产出 index.html/styles.css/app.js");
      if (!fileNames.includes("styles.css")) warn("done.files 不含 styles.css", "契约要求产出 index.html/styles.css/app.js");
      if (/\b(?:src|href)=["']https?:\/\//i.test(files["index.html"] || "")) {
        warn("index.html 引用了外部网络资源", "契约要求产物自包含、无 CDN 外链");
      }
      check(typeof doneEvent.summary === "string", "done.summary 是 string");
      check(
        doneEvent.stats && typeof doneEvent.stats.steps === "number" && doneEvent.stats.steps > 0,
        "done.stats.steps 是正数",
        String(doneEvent.stats?.steps),
      );
      check(typeof doneEvent.stats?.mock === "boolean", "done.stats.mock 是 boolean", String(doneEvent.stats?.mock));
      if (config.mockMode) {
        check(doneEvent.stats?.mock === true, "服务端 mockMode=true 时 done.stats.mock 必须为 true");
      }
      console.log(
        `  ${c.dim("产物:")} ${fileNames
          .map((k) => `${k} (${fmtBytes((files[k] || "").length)})`)
          .join("  ")}`,
      );
      if (args.dumpDir) {
        try {
          const dir = isAbsolute(args.dumpDir) ? args.dumpDir : join(process.cwd(), args.dumpDir);
          await mkdir(dir, { recursive: true });
          for (const name of fileNames) {
            if (typeof files[name] !== "string") continue;
            const target = join(dir, name.replace(/[\\/]/g, "_"));
            await writeFile(target, files[name], "utf8");
          }
          console.log(`  ${c.dim("已落盘:")} ${dir}`);
        } catch (err) {
          warn("--dump 落盘失败", err?.message || String(err));
        }
      }
    }

    return { events, doneEvent, elapsed };
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------- main -------------------------------- */

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(c.red(`参数错误: ${err.message}`));
    usage();
    return finish(EXIT.FAIL);
  }
  if (args.help) {
    usage();
    return finish(EXIT.PASS);
  }

  console.log(c.bold("Atoms Demo — HTTP smoke test"));
  console.log(c.dim(`  base=${args.base}  node=${process.version}  time=${new Date().toISOString()}`));

  let config = null;
  try {
    config = await stepConfig(args);
  } catch (err) {
    if (err instanceof UnreachableError) {
      console.error(`\n${c.red("✗ 连不上服务")}: ${err.message}`);
      console.error(c.dim("  确认 dev server 已启动（npm run dev → http://localhost:3000），或用 --base 指定地址。"));
      return finish(EXIT.UNREACHABLE);
    }
    console.error(`\n${c.red("✗ /api/config 步骤异常")}: ${err?.stack || err}`);
    return finish(EXIT.FAIL);
  }

  let chatResult = null;
  if (config) {
    try {
      chatResult = await stepChat(args, config);
    } catch (err) {
      if (err instanceof UnreachableError) {
        console.error(`\n${c.red("✗ 连不上服务")}: ${err.message}`);
        return finish(EXIT.UNREACHABLE);
      }
      console.error(`\n${c.red("✗ /api/chat 步骤异常")}: ${err?.stack || err}`);
      return finish(EXIT.FAIL);
    }
  }

  /* ------------------------------ 汇总 ------------------------------ */
  const total = Date.now() - state.startedAt;
  section("结果");
  console.log(
    `  检查项 ${state.checks} 个 · 失败 ${state.failures.length} 个 · 警告 ${state.warnings.length} 个 · 耗时 ${(total / 1000).toFixed(1)}s`,
  );
  if (state.warnings.length) {
    console.log(c.yellow("  警告:"));
    for (const w of state.warnings) console.log(c.yellow(`    - ${w}`));
  }
  if (state.skip) {
    console.log(c.yellow(`  跳过: ${state.skip}`));
  }

  if (state.failures.length) {
    console.log(c.red(`\n✗ SMOKE FAILED（${state.failures.length} 个失败）`));
    for (const f of state.failures) console.log(c.red(`  - ${f}`));
    return finish(EXIT.FAIL);
  }
  if (state.skip && args.requireChat) {
    console.log(`\n${c.red("✗ SMOKE FAILED：--require-chat 要求必须跑通 chat，但被跳过")}`);
    return finish(EXIT.SKIP_REQUIRED);
  }
  if (state.skip) {
    console.log(`\n${c.yellow("✓ SMOKE PASSED（/api/config 通过；chat 已跳过，见上）")}`);
    return finish(EXIT.PASS);
  }
  console.log(
    c.green(
      `\n✓ SMOKE PASSED — ${chatResult ? `mock=${config?.mockMode} 生成 ${Object.keys(chatResult.doneEvent?.files || {}).length} 个文件，耗时 ${chatResult.elapsed}ms` : ""}`,
    ),
  );
  process.exit(EXIT.PASS);
}

main().catch((err) => {
  console.error(c.red(`\n未捕获异常: ${err?.stack || err}`));
  process.exit(EXIT.FAIL);
});
