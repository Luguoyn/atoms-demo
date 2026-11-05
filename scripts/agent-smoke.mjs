#!/usr/bin/env node
/**
 * Atoms agent smoke test.
 *
 * Modes:
 *   node scripts/agent-smoke.mjs                 # offline engine (mock) + HTTP checks if dev server is reachable
 *   node scripts/agent-smoke.mjs --offline       # offline engine only (no dev server needed)
 *   node scripts/agent-smoke.mjs --offline --timing  # also verify mock staged streaming delays
 *   node scripts/agent-smoke.mjs --base http://localhost:3000
 *   node scripts/agent-smoke.mjs --real          # also send one tiny real provider ping (reads .env.local, prints no secrets)
 *
 * Offline coverage (v0.2): mock agent event order + `usage` event, validator/tool
 * units, ratelimit/status units, prompt-enhance mock, provider usage parsing and
 * `stream_options` 400 fallback. HTTP coverage when the dev server is up:
 * GET /api/config, GET /api/status, POST /api/prompt/enhance (mock mode) and the
 * full POST /api/chat SSE stream (mock mode).
 *
 * Exit codes: 0 = all checks passed; 1 = assertion/engine failure;
 *             2 = HTTP checks skipped because the dev server is not reachable (see --offline).
 *
 * The offline part compiles src/lib/agent/** with the locally installed TypeScript
 * compiler into a temp directory (CommonJS) and runs the mock agent in-process.
 * No dev server, no extra dependencies, no API key required.
 */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const getOption = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

let failures = 0;

function pass(message) {
  console.log(`  \u2713 ${message}`);
}

function fail(message) {
  failures += 1;
  console.error(`  \u2717 ${message}`);
}

function assert(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

function summarizeError(error) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}

/* ---------------------------------- build ---------------------------------- */

function compileAgent() {
  const ts = require("typescript");
  const tempDir = mkdtempSync(join(tmpdir(), "atoms-agent-smoke-"));
  const configPath = join(ROOT, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, " "));

  const tempDirForOptions = tempDir;
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    ROOT,
    {
      noEmit: false,
      outDir: tempDirForOptions,
      rootDir: join(ROOT, "src"),
      baseUrl: ROOT,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      incremental: false,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
    },
    configPath,
  );
  const options = parsed.options;
  delete options.tsBuildInfoFile;
  delete options.composite;
  options.noEmit = false;
  options.outDir = tempDirForOptions;
  options.rootDir = join(ROOT, "src");
  options.baseUrl = ROOT;

  const agentDir = join(ROOT, "src", "lib", "agent");
  const rootNames = ts.sys.readDirectory(agentDir, [".ts"], undefined, undefined);
  rootNames.push(join(ROOT, "src", "types.ts"));

  const program = ts.createProgram({ rootNames, options });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => ROOT,
      getNewLine: () => "\n",
    });
    throw new Error(`agent 模块编译失败：\n${formatted}`);
  }
  const emitResult = program.emit();
  if (emitResult.emitSkipped) throw new Error("agent 模块编译未产出文件。");

  const entry = join(tempDir, "lib", "agent", "index.js");
  if (!existsSync(entry)) throw new Error(`未找到编译产物：${entry}`);

  return {
    tempDir,
    entry,
    requireModule: (relativePath) => require(join(tempDir, relativePath)),
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

/* ------------------------------- assertions -------------------------------- */

const CORE_FILES = ["index.html", "styles.css", "app.js"];

function finishRun(label, events, expectedMock, minPlanFiles = 1) {
  console.log(`\n[${label}] 事件数=${events.length}`);
  const errors = events.filter((event) => event.type === "error");
  assert(errors.length === 0, `${label}: 无 error 事件${errors.length ? `（${errors[0].message}）` : ""}${errors.length > 0 ? ` 实际=${errors.map((error) => error.message).join(" | ")}` : ""}`);
  const last = events[events.length - 1];
  assert(Boolean(last) && last.type === "done", `${label}: 最后一个事件是 done（实际 ${last && last.type}）`);
  if (!last || last.type !== "done") return null;

  const planIndex = events.findIndex((event) => event.type === "plan");
  const planningIndex = events.findIndex((event) => event.type === "phase" && event.phase === "planning");
  const codingIndex = events.findIndex((event) => event.type === "phase" && event.phase === "coding");
  const validatingIndex = events.findIndex((event) => event.type === "phase" && event.phase === "validating");
  const doneIndex = events.length - 1;
  assert(planningIndex >= 0, `${label}: 有 phase(planning)`);
  assert(planIndex > planningIndex, `${label}: plan 在 phase(planning) 之后`);
  assert(codingIndex > planIndex, `${label}: phase(coding) 在 plan 之后`);
  assert(validatingIndex > codingIndex, `${label}: phase(validating) 在 coding 之后`);
  assert(doneIndex > validatingIndex, `${label}: done 在 validating 之后`);

  const plan = events[planIndex] && events[planIndex].plan;
  assert(Boolean(plan && typeof plan.name === "string" && plan.name.length > 0), `${label}: plan.name 非空`);
  assert(Boolean(plan && typeof plan.summary === "string" && plan.summary.length > 0), `${label}: plan.summary 非空`);
  assert(Boolean(plan && Array.isArray(plan.features) && plan.features.length >= 3), `${label}: plan.features >= 3`);
  assert(Boolean(plan && Array.isArray(plan.files) && plan.files.length >= minPlanFiles), `${label}: plan.files >= ${minPlanFiles}`);

  const validations = events.filter((event) => event.type === "validation");
  assert(validations.length >= 1, `${label}: 至少一个 validation 事件`);
  const lastValidation = validations[validations.length - 1];
  assert(Boolean(lastValidation && lastValidation.ok === true), `${label}: validation.ok=true`);
  assert(
    Boolean(lastValidation && Array.isArray(lastValidation.issues) && lastValidation.issues.every((issue) => issue.severity === "warning")),
    `${label}: validation.issues 无 error 级问题`,
  );

  const usageIndex = events.findIndex((event) => event.type === "usage");
  assert(usageIndex >= 0 && usageIndex < doneIndex, `${label}: done 前有 usage 事件`);
  const usage = usageIndex >= 0 ? events[usageIndex].usage : null;
  assert(Boolean(usage && typeof usage.model === "string" && usage.model.length > 0), `${label}: usage.model 非空`);
  assert(Boolean(usage && Number.isInteger(usage.promptTokens) && usage.promptTokens > 0), `${label}: usage.promptTokens > 0`);
  assert(
    Boolean(usage && Number.isInteger(usage.completionTokens) && usage.completionTokens > 0),
    `${label}: usage.completionTokens > 0`,
  );
  assert(Boolean(usage && Number.isInteger(usage.cachedTokens) && usage.cachedTokens >= 0), `${label}: usage.cachedTokens >= 0`);
  assert(
    Boolean(usage && Number.isInteger(usage.totalTokens) && usage.totalTokens > 0),
    `${label}: usage.totalTokens > 0`,
  );
  if (expectedMock) {
    assert(Boolean(usage && usage.cachedTokens === 0), `${label}: mock usage.cachedTokens=0`);
    assert(Boolean(usage && usage.model === "mock-agent"), `${label}: mock usage.model=mock-agent`);
  }

  const done = last;
  const files = done.files || {};
  for (const path of CORE_FILES) {
    assert(typeof files[path] === "string" && files[path].length > 0, `${label}: done.files 包含 ${path}`);
  }
  assert(done.stats && done.stats.mock === expectedMock, `${label}: stats.mock=${expectedMock}`);
  assert(done.stats && Number.isInteger(done.stats.steps) && done.stats.steps > 0, `${label}: stats.steps>0`);
  assert(typeof done.summary === "string" && done.summary.length > 0, `${label}: done.summary 非空`);
  const externalUrl = CORE_FILES.find((path) => typeof files[path] === "string" && /https?:\/\//i.test(files[path]));
  assert(externalUrl === undefined, `${label}: 产物无外部链接（${externalUrl || "ok"}）`);
  if (typeof files["app.js"] === "string") {
    assert(/localStorage/.test(files["app.js"]), `${label}: app.js 使用 localStorage 持久化`);
    assert(!/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/.test(files["app.js"]), `${label}: app.js 无网络请求`);
  }

  // Validate the file event groups: tool_start(write_file) -> file_delta* -> file_done -> tool_result.
  const writeStarts = [];
  events.forEach((event, index) => {
    if (event.type === "tool_start" && event.tool === "write_file") writeStarts.push({ event, index });
  });
  assert(writeStarts.length >= 1, `${label}: 至少一次 write_file 工具调用`);
  for (const start of writeStarts) {
    let end = events.length;
    for (let index = start.index + 1; index < events.length; index += 1) {
      if (events[index].type === "tool_start") {
        end = index;
        break;
      }
    }
    const segment = events.slice(start.index, end);
    const deltas = segment.filter((event) => event.type === "file_delta");
    const fileDone = segment.find((event) => event.type === "file_done");
    const toolResult = segment.find((event) => event.type === "tool_result" && event.id === start.event.id);
    assert(deltas.length >= 3, `${label}: ${fileDone ? fileDone.path : "?"} 流式 file_delta 数量=${deltas.length}`);
    assert(Boolean(fileDone), `${label}: ${fileDone ? fileDone.path : "?"} 有 file_done`);
    assert(Boolean(toolResult && toolResult.ok === true), `${label}: ${fileDone ? fileDone.path : "?"} 有 ok 的 tool_result`);
    if (fileDone && deltas.length > 0) {
      assert(deltas.every((delta) => delta.path === fileDone.path), `${label}: ${fileDone.path} 的 delta 路径一致`);
      const joined = deltas.map((delta) => delta.delta).join("");
      assert(joined === fileDone.content, `${label}: ${fileDone.path} 的 file_delta 拼接等于 file_done.content`);
      assert(done.files[fileDone.path] === fileDone.content, `${label}: ${fileDone.path} 最终内容等于流式内容`);
    }
  }

  return { done, files, plan };
}

/* --------------------------------- offline --------------------------------- */

/**
 * Acceptance evidence for the two built-in mock templates: self-contained,
 * offline, Chinese UI, responsive and localStorage-backed.
 */
function assertMockAppQuality(label, files) {
  const html = files["index.html"] || "";
  const css = files["styles.css"] || "";
  const js = files["app.js"] || "";
  assert(/lang="zh-CN"/.test(html), `${label}: index.html 声明 lang=zh-CN`);
  assert(/<meta[^>]+name="viewport"/.test(html), `${label}: 含 viewport meta（移动端适配）`);
  assert(/<link[^>]+href="styles\.css"/.test(html), `${label}: index.html 引用 styles.css`);
  assert(/<script[^>]+src="app\.js"/.test(html), `${label}: index.html 引用 app.js`);
  assert(/[\u4e00-\u9fa5]/.test(html), `${label}: UI 文案为中文`);
  assert(/:root\s*\{/.test(css), `${label}: styles.css 使用 CSS 变量设计令牌`);
  assert(/@media[^{]*max-width/.test(css), `${label}: styles.css 含响应式 @media 断点`);
  assert(!/url\(\s*["']?(?:https?:)?\/\//i.test(css) && !/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i.test(css), `${label}: styles.css 无外部 url()/@import`);
  assert(/addEventListener\s*\(/.test(js), `${label}: app.js 含真实交互事件绑定`);
  assert(/localStorage/.test(js), `${label}: app.js 使用 localStorage 持久化`);
  assert(!/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/.test(js), `${label}: app.js 无网络请求`);
  const externalRef = /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(html);
  assert(!externalRef, `${label}: index.html 无外部 src/href 引用`);
}

/* ------------------- provider usage / stream_options units ------------------ */

/**
 * Fake OpenAI-compatible upstream checks:
 * 1) usage.cachedTokens parsed from `opencode.tokens.cache_read`;
 * 2) reasoning tokens parsed from `completion_tokens_details.reasoning_tokens`;
 * 3) `stream_options` rejected with HTTP 400 -> transparent retry without it,
 *    remembered for the rest of the process;
 * 4) `prompt_tokens_details.cached_tokens` parsed once the gateway accepts it.
 */
async function runProviderCompatibilityUnits(compiled) {
  console.log("\n-- provider usage / stream_options 降级 单元断言 --");
  const providerModule = compiled.requireModule("lib/agent/provider.js");
  const configModule = compiled.requireModule("lib/agent/config.js");

  let requestCount = 0;
  let rejectStreamOptions = true;
  let cachedSource = "opencode";
  const seenBodies = [];

  const sse = (payload) => `data: ${JSON.stringify(payload)}\n\n`;
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      requestCount += 1;
      let body = {};
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        body = {};
      }
      seenBodies.push(body);
      if (rejectStreamOptions && body.stream_options) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: { message: "Unknown parameter: stream_options" } }));
        return;
      }
      const usage =
        cachedSource === "opencode"
          ? {
              prompt_tokens: 500,
              completion_tokens: 8,
              total_tokens: 508,
              completion_tokens_details: { reasoning_tokens: 7 },
              opencode: { tokens: { cache_read: 123 } },
            }
          : {
              prompt_tokens: 520,
              completion_tokens: 9,
              total_tokens: 529,
              prompt_tokens_details: { cached_tokens: 64 },
              completion_tokens_details: { reasoning_tokens: 0 },
            };
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(sse({ choices: [{ index: 0, delta: { content: "你好" }, finish_reason: null }] }));
      response.write(sse({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }));
      response.write(sse({ choices: [], usage }));
      response.write("data: [DONE]\n\n");
      response.end();
    });
  });

  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const port = server.address().port;
  const envBackup = {
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_MODEL: process.env.LLM_MODEL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    MOCK_LLM: process.env.MOCK_LLM,
  };
  try {
    process.env.MOCK_LLM = "0";
    process.env.LLM_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.LLM_MODEL = "fake-model";
    process.env.LLM_API_KEY = "sk-fake-provider-unit";
    providerModule.resetStreamOptionsSupport();

    const provider = configModule.resolveProvider();
    assert(Boolean(provider), "provider: 可由 env 解析出 provider");

    const collect = async () => {
      let text = "";
      let usage = null;
      for await (const delta of providerModule.streamChatCompletion({
        provider,
        messages: [{ role: "user", content: "只回复两个字：你好" }],
        maxTokens: 64,
        timeoutMs: 20_000,
      })) {
        if (delta.content) text += delta.content;
        if (delta.usage) usage = delta.usage;
      }
      return { text, usage };
    };

    const first = await collect();
    assert(first.text === "你好", "provider: 流式文本解析正常");
    assert(requestCount === 2, `provider: 400 后自动降级重试一次（请求数=${requestCount}）`);
    assert(seenBodies[1] && seenBodies[1].stream_options === undefined, "provider: 降级请求不再携带 stream_options");
    assert(
      providerModule.getStreamOptionsSupport() === "unsupported",
      "provider: 记住 stream_options 不受支持（进程内）",
    );
    assert(
      Boolean(first.usage && first.usage.cachedTokens === 123 && first.usage.promptTokens === 500),
      `provider: 解析 opencode.tokens.cache_read（cached=${first.usage && first.usage.cachedTokens}）`,
    );
    assert(
      Boolean(first.usage && first.usage.reasoningTokens === 7 && first.usage.totalTokens === 508),
      "provider: 解析 completion_tokens_details.reasoning_tokens / total_tokens",
    );

    providerModule.resetStreamOptionsSupport();
    rejectStreamOptions = false;
    cachedSource = "prompt-details";
    requestCount = 0;
    seenBodies.length = 0;
    const second = await collect();
    assert(requestCount === 1, `provider: 支持 stream_options 时一次成功（请求数=${requestCount}）`);
    assert(seenBodies[0] && seenBodies[0].stream_options && seenBodies[0].stream_options.include_usage === true, "provider: 请求携带 stream_options.include_usage=true");
    assert(providerModule.getStreamOptionsSupport() === "supported", "provider: 记住 stream_options 受支持");
    assert(
      Boolean(second.usage && second.usage.cachedTokens === 64),
      `provider: 解析 prompt_tokens_details.cached_tokens（cached=${second.usage && second.usage.cachedTokens}）`,
    );
  } finally {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    providerModule.resetStreamOptionsSupport();
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

async function runOfflineEngineTests(compiled) {
  console.log("\n== 1. 离线引擎（mock agent，无 dev server / 无 API key）==");
  process.env.MOCK_LLM = "1";
  const agent = compiled.requireModule("lib/agent/index.js");
  assert(typeof agent.runAgent === "function", "runAgent 已导出");

  const validateModule = compiled.requireModule("lib/agent/validate.js");
  const toolsModule = compiled.requireModule("lib/agent/tools.js");
  console.log("\n-- 校验器 / 工具白名单单元断言 --");
  assert(validateModule.hasValidationErrors(validateModule.validateApp({})), "空文件集被判定为失败");
  const missingCore = validateModule.validateApp({ "styles.css": "body{color:red}", "app.js": "(function(){var a=1;})();" });
  assert(
    missingCore.some((issue) => issue.file === "index.html" && issue.severity === "error"),
    "缺少 index.html 被标记 error",
  );
  const brokenJs = validateModule.validateApp({
    "index.html": '<!DOCTYPE html><html lang="zh-CN"><body><script src="app.js"></script></body></html>',
    "styles.css": "body{color:red}",
    "app.js": "function broken( {",
  });
  assert(
    brokenJs.some((issue) => issue.file === "app.js" && /语法错误/.test(issue.message)),
    "JS 语法错误被 node:vm 编译捕获（不执行代码）",
  );
  const external = validateModule.validateApp({
    "index.html":
      '<!DOCTYPE html><html lang="zh-CN"><body><img src="https://example.com/a.png" /><script src="app.js"></script></body></html>',
    "styles.css": "body{color:red}",
    "app.js": "(function(){var a=1;})();",
  });
  assert(external.some((issue) => /外部/.test(issue.message)), "外部资源引用被标记 error");
  const legalSvg = validateModule.validateApp({
    "index.html":
      '<!DOCTYPE html><html lang="zh-CN"><body><svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1"></circle></svg><script src="app.js"></script></body></html>',
    "styles.css": "@namespace svg url(http://www.w3.org/2000/svg);\nbody{color:red}",
    "app.js":
      '// 参考文档 https://example.com/docs\nvar NS = "http://www.w3.org/2000/svg";\ndocument.createElementNS(NS, "svg");\nwindow.localStorage.getItem("k");\n',
  });
  assert(!validateModule.hasValidationErrors(legalSvg), "SVG xmlns / 注释 URL / @namespace 不被误判为外链");
  const externalScript = validateModule.validateApp({
    "index.html":
      '<!DOCTYPE html><html lang="zh-CN"><body><script src="https://cdn.example.com/lib.js"></script></body></html>',
    "styles.css": "body{color:red}",
    "app.js": "(function(){var a=1;})();",
  });
  assert(
    externalScript.some((issue) => /外部资源/.test(issue.message)),
    "真正会加载的外部 <script src> 被标记 error",
  );
  const fetchInComment = validateModule.validateApp({
    "index.html": '<!DOCTYPE html><html lang="zh-CN"><body><script src="app.js"></script></body></html>',
    "styles.css": "body{color:red}",
    "app.js": '// fetch("https://api.example.com") 仅注释\n(function(){window.localStorage.setItem("k","v");})();',
  });
  assert(!validateModule.hasValidationErrors(fetchInComment), "JS 注释中的 fetch/URL 不算网络请求");
  const fetchReal = validateModule.validateApp({
    "index.html": '<!DOCTYPE html><html lang="zh-CN"><body><script src="app.js"></script></body></html>',
    "styles.css": "body{color:red}",
    "app.js": '(function(){fetch("https://api.example.com/data");})();',
  });
  assert(
    fetchReal.some((issue) => issue.file === "app.js" && /fetch/.test(issue.message)),
    "真实 fetch() 调用被标记 error",
  );
  assert(toolsModule.sanitizeFilePath("index.html") === "index.html", "sanitizeFilePath 允许白名单文件");
  assert(
    ["../x.html", "/etc/passwd", "node_modules/x.js", "src/index.html", "index.exe"].every(
      (path) => toolsModule.sanitizeFilePath(path) === null,
    ),
    "sanitizeFilePath 拒绝越权 / 绝对路径 / 未知文件",
  );
  const sample = "line1\nline2\nline3\n";
  assert(toolsModule.splitForStreaming(sample, 5).join("") === sample, "splitForStreaming 分片拼接无损");

  console.log("\n-- 限流 / /api/status / prompt-enhance 单元断言 --");
  const ratelimitModule = compiled.requireModule("lib/agent/ratelimit.js");
  const statusModule = compiled.requireModule("lib/agent/status.js");
  const enhanceModule = compiled.requireModule("lib/agent/enhance.js");
  const envBackup = {
    MOCK_LLM: process.env.MOCK_LLM,
    LLM_API_KEY: process.env.LLM_API_KEY,
    RATE_LIMIT_PER_HOUR: process.env.RATE_LIMIT_PER_HOUR,
    RATE_LIMIT_CONCURRENT: process.env.RATE_LIMIT_CONCURRENT,
    PROMPT_ENHANCE_PER_HOUR: process.env.PROMPT_ENHANCE_PER_HOUR,
  };
  try {
    process.env.MOCK_LLM = "0";
    process.env.LLM_API_KEY = "test-server-key-not-real";
    process.env.RATE_LIMIT_PER_HOUR = "2";
    process.env.RATE_LIMIT_CONCURRENT = "1";
    process.env.PROMPT_ENHANCE_PER_HOUR = "2";
    ratelimitModule.resetRateLimitState();

    const statusKey = statusModule.getServerStatus({ ip: "203.0.113.7", version: "0.2.0" });
    assert(
      statusKey.mode === "server-key" && statusKey.hasServerKey === true && statusKey.serverKeyReason === "ok",
      `status: 服务端密钥模式（mode=${statusKey.mode}）`,
    );
    assert(
      statusKey.quota && statusKey.quota.limitPerHour === 2 && statusKey.quota.remaining === 2 && statusKey.quota.resetAt > Date.now(),
      "status: 初始 quota remaining=2",
    );
    assert(
      statusKey.rateLimits.perHour === 2 && statusKey.rateLimits.concurrent === 1,
      "status: rateLimits 与限流配置同源",
    );
    assert(
      statusKey.version === "0.2.0" && typeof statusKey.model === "string" && statusKey.model.length > 0,
      `status: version/model 字段（version=${statusKey.version}, model=${statusKey.model}）`,
    );

    const quota1 = ratelimitModule.consumeGenerationQuota("203.0.113.7");
    const quota2 = ratelimitModule.consumeGenerationQuota("203.0.113.7");
    const quota3 = ratelimitModule.consumeGenerationQuota("203.0.113.7");
    assert(quota1.allowed && quota1.snapshot.remaining === 1, "quota: 首次消费后 remaining=1");
    assert(quota2.allowed && quota2.snapshot.remaining === 0, "quota: 第二次消费后 remaining=0");
    assert(!quota3.allowed && quota3.retryAfterSec > 0, "quota: 超过每小时上限返回 429 语义（retryAfterSec>0）");
    const statusAfter = statusModule.getServerStatus({ ip: "203.0.113.7", version: "0.2.0" });
    assert(statusAfter.quota && statusAfter.quota.remaining === 0, "status: quota 与 /api/chat 共用同一份计数");

    const slot1 = ratelimitModule.acquireGenerationSlot();
    const slot2 = ratelimitModule.acquireGenerationSlot();
    assert(slot1.ok === true, "concurrency: 首个槽位获取成功");
    assert(slot2.ok === false && slot2.retryAfterSec > 0, "concurrency: 超并发返回 429 语义");
    if (slot1.ok) slot1.release();

    const enhanceLimit1 = ratelimitModule.consumePromptEnhanceQuota("203.0.113.7");
    const enhanceLimit2 = ratelimitModule.consumePromptEnhanceQuota("203.0.113.7");
    const enhanceLimit3 = ratelimitModule.consumePromptEnhanceQuota("203.0.113.7");
    assert(
      enhanceLimit1.allowed && enhanceLimit2.allowed && !enhanceLimit3.allowed,
      "prompt-enhance: 独立限流 2 次/小时生效",
    );

    process.env.MOCK_LLM = "1";
    const statusMock = statusModule.getServerStatus({ ip: "203.0.113.7", version: "0.2.0" });
    assert(
      statusMock.mode === "mock" && statusMock.mockForced === true && statusMock.serverKeyReason === "mock-forced" && statusMock.quota === null,
      "status: MOCK_LLM=1 强制 mock 且 quota=null",
    );
    const statusByok = statusModule.getServerStatus({
      ip: "203.0.113.7",
      version: "0.2.0",
      override: { apiKey: "sk-test" },
    });
    assert(statusByok.mode === "byok" && statusByok.quota === null, "status: BYOK 模式 quota=null");

    const enhanceMock = await enhanceModule.runPromptEnhancement({ message: "做一个记账本" });
    assert(enhanceMock.mock === true, "prompt-enhance: 无 key 时 mock 兜底（mock=true）");
    assert(enhanceMock.enhanced.includes("记账本") && enhanceMock.enhanced.length > 100, "prompt-enhance: mock 增强文案包含原需求");
    assert(
      Array.isArray(enhanceMock.tips) && enhanceMock.tips.length >= 2 && enhanceMock.tips.length <= 3,
      "prompt-enhance: tips 2-3 条",
    );
    const parsedEnhance = enhanceModule.parseEnhancementResponse(
      '{"enhanced":"请开发一个记账本应用，支持收入支出记录、分类筛选与月度统计，并使用 localStorage 持久化数据。","tips":["补充目标用户","明确数据字段","指定视觉风格"]}',
      "记账本",
    );
    assert(parsedEnhance.mock === false && parsedEnhance.enhanced.includes("记账本"), "prompt-enhance: 真实响应 JSON 可解析");
  } finally {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    ratelimitModule.resetRateLimitState();
    process.env.MOCK_LLM = "1";
  }

  await runProviderCompatibilityUnits(compiled);
  process.env.MOCK_LLM = "1";

  const generateRequest = {
    projectId: "smoke-generate",
    message: "帮我做一个番茄专注计时器，支持任务清单和本地保存",
    files: {},
    history: [],
    mode: "generate",
  };

  const startedAt = Date.now();
  const generateEvents = [];
  for await (const event of agent.runAgent(generateRequest, { mockDelayScale: 0 })) generateEvents.push(event);
  const elapsed = Date.now() - startedAt;
  const generated = finishRun("generate", generateEvents, true, 3);
  assert(elapsed < 15_000, `generate: 离线 mock 全链路耗时 ${elapsed}ms < 15s`);

  // Mock template B: keyword "待办" must deterministically select the todo template.
  const todoRequest = {
    projectId: "smoke-todo",
    message: "帮我做一个待办清单应用，支持筛选和本地保存",
    files: {},
    history: [],
    mode: "generate",
  };
  const todoEvents = [];
  for await (const event of agent.runAgent(todoRequest, { mockDelayScale: 0 })) todoEvents.push(event);
  const todoResult = finishRun("generate-todo", todoEvents, true, 3);
  if (todoResult) {
    assert(todoResult.plan.name === "极简待办", `todo: 关键词命中待办模板（plan.name=${todoResult.plan.name}）`);
    assertMockAppQuality("todo", todoResult.files);
  }

  if (!generated) return;

  const files = generated.files;
  assert(files["index.html"].length > 1_500, `generate: index.html 内容充实（${files["index.html"].length} 字符）`);
  assert(files["styles.css"].length > 3_000, `generate: styles.css 内容充实（${files["styles.css"].length} 字符）`);
  assert(files["app.js"].length > 3_000, `generate: app.js 内容充实（${files["app.js"].length} 字符）`);
  assertMockAppQuality("pomodoro", files);

  // Refine round: same project iterated by the mock agent.
  const refineRequest = {
    projectId: "smoke-generate",
    message: "把主色改成绿色，其他功能保持不动",
    files,
    history: [
      { role: "user", content: generateRequest.message },
      { role: "assistant", content: "已生成番茄专注钟。" },
    ],
    mode: "refine",
  };
  const refineEvents = [];
  for await (const event of agent.runAgent(refineRequest, { mockDelayScale: 0 })) refineEvents.push(event);
  const refined = finishRun("refine", refineEvents, true);
  if (!refined) return;

  assert(refined.files["index.html"] === files["index.html"], "refine: 未受影响的 index.html 保持不变");
  assert(refined.files["app.js"] === files["app.js"], "refine: 未受影响的 app.js 保持不变");
  assert(refined.files["styles.css"] !== files["styles.css"], "refine: styles.css 已更新");
  assert(/#22c55e/i.test(refined.files["styles.css"]), "refine: 主色已切换为绿色（#22c55e）");
  assert(refined.plan && refined.plan.files.some((file) => file.path === "styles.css"), "refine: plan 列出待修改文件");
}

/* ------------------------------ mock timing ------------------------------- */

/** `--timing`: verify the mock agent really streams with staged delays (UI typing effect). */
async function runMockStreamingTiming(compiled) {
  console.log("\n== 1b. mock 流式节奏（--timing，使用真实分段延迟）==");
  process.env.MOCK_LLM = "1";
  const agent = compiled.requireModule("lib/agent/index.js");
  const events = [];
  const startedAt = Date.now();
  for await (const event of agent.runAgent({
    projectId: "smoke-timing",
    message: "帮我做一个待办清单应用，支持筛选和本地保存",
    files: {},
    history: [],
    mode: "generate",
  })) {
    events.push(event);
  }
  const elapsed = Date.now() - startedAt;
  const result = finishRun("mock-timing", events, true, 3);
  const deltaCount = events.filter((event) => event.type === "file_delta").length;
  assert(deltaCount >= 40, `mock-timing: file_delta 分段数 ${deltaCount} >= 40`);
  assert(elapsed >= 3_000 && elapsed <= 30_000, `mock-timing: 全链路耗时 ${elapsed}ms 在 3s–30s 之间（分段延迟生效）`);
  if (result) {
    assertMockAppQuality("mock-timing", result.files);
  }
}

/* ---------------------------------- real ---------------------------------- */

function loadDotEnvLocal() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return [];
  const loaded = [];
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!value) continue;
    if (!process.env[match[1]]) process.env[match[1]] = value;
    loaded.push(match[1]);
  }
  return loaded;
}

async function runRealProviderPing(compiled) {
  console.log("\n== 2. 真实 provider 小请求（--real，仅验证连通性，不回显密钥）==");
  loadDotEnvLocal();
  delete process.env.MOCK_LLM;
  const config = compiled.requireModule("lib/agent/config.js");
  const providerModule = compiled.requireModule("lib/agent/provider.js");
  const provider = config.resolveProvider();
  if (!provider) {
    console.log("  - 未配置 LLM_API_KEY，跳过真实请求。");
    return;
  }
  let chunks = 0;
  let text = "";
  try {
    for await (const delta of providerModule.streamChatCompletion({
      provider,
      messages: [{ role: "user", content: "只回复两个字：可以" }],
      timeoutMs: 30_000,
      maxTokens: 16,
      temperature: 0,
    })) {
      if (typeof delta.content === "string" && delta.content) {
        chunks += 1;
        text += delta.content;
      }
    }
  } catch (error) {
    fail(`真实 provider 请求失败：${summarizeError(error)}`);
    return;
  }
  assert(chunks > 0, `真实 provider 流式响应正常（模型 ${provider.model}，来源 ${provider.source}，${chunks} 个增量，${text.length} 字符，内容不回显）`);
}

/* ---------------------------------- HTTP ---------------------------------- */

class ServerUnavailableError extends Error {}

async function fetchWithTimeout(url, init = {}, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new ServerUnavailableError(`请求超时：${url}`);
    }
    throw new ServerUnavailableError(`无法连接 ${url}：${summarizeError(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function readSseEvents(response, overallTimeoutMs) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  const timer = setTimeout(() => {
    response.body.cancel().catch(() => {});
  }, overallTimeoutMs);
  try {
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of block.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            events.push(JSON.parse(payload));
          } catch {
            // Ignore keep-alive/comment payloads.
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return events;
}

async function runHttpTests(baseUrl) {
  console.log(`\n== 3. HTTP API 冒烟（${baseUrl}）==`);
  const configResponse = await fetchWithTimeout(`${baseUrl}/api/config`, {}, 5_000);
  assert(configResponse.ok, `GET /api/config 返回 200（实际 ${configResponse.status}）`);
  const serverConfig = await configResponse.json();
  assert(typeof serverConfig.hasServerKey === "boolean", `config.hasServerKey 是布尔值（${serverConfig.hasServerKey}）`);
  assert(typeof serverConfig.mockMode === "boolean", `config.mockMode 是布尔值（${serverConfig.mockMode}）`);
  assert(typeof serverConfig.defaultModel === "string" && serverConfig.defaultModel.length > 0, `config.defaultModel=${serverConfig.defaultModel}`);
  assert(!("apiKey" in serverConfig) && !("key" in serverConfig), "GET /api/config 不泄露密钥字段");

  // v0.2: GET /api/status (ServerStatus)
  const statusResponse = await fetchWithTimeout(`${baseUrl}/api/status`, {}, 5_000);
  assert(statusResponse.ok, `GET /api/status 返回 200（实际 ${statusResponse.status}）`);
  const serverStatus = await statusResponse.json();
  assert(
    ["server-key", "byok", "mock"].includes(serverStatus.mode),
    `status.mode=${serverStatus.mode} 合法`,
  );
  assert(typeof serverStatus.model === "string" && serverStatus.model.length > 0, `status.model=${serverStatus.model}`);
  assert(
    typeof serverStatus.hasServerKey === "boolean" && typeof serverStatus.mockForced === "boolean",
    "status: hasServerKey/mockForced 是布尔值",
  );
  assert(
    ["ok", "no-key", "mock-forced"].includes(serverStatus.serverKeyReason),
    `status.serverKeyReason=${serverStatus.serverKeyReason} 合法`,
  );
  assert(
    Boolean(
      serverStatus.rateLimits &&
        Number.isInteger(serverStatus.rateLimits.perHour) &&
        serverStatus.rateLimits.perHour > 0 &&
        Number.isInteger(serverStatus.rateLimits.concurrent) &&
        serverStatus.rateLimits.concurrent > 0,
    ),
    `status.rateLimits=${JSON.stringify(serverStatus.rateLimits)}`,
  );
  const packageVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  assert(serverStatus.version === packageVersion, `status.version=${serverStatus.version}（package.json=${packageVersion}）`);
  if (serverStatus.mode === "server-key") {
    assert(
      Boolean(
        serverStatus.quota &&
          Number.isInteger(serverStatus.quota.limitPerHour) &&
          Number.isInteger(serverStatus.quota.remaining) &&
          Number.isInteger(serverStatus.quota.resetAt),
      ),
      `status: 服务端密钥模式返回 quota（${JSON.stringify(serverStatus.quota)}）`,
    );
    assert(serverStatus.quota.remaining <= serverStatus.quota.limitPerHour, "status: quota.remaining <= limitPerHour");
  } else {
    assert(serverStatus.quota === null, "status: 非服务端密钥模式 quota=null");
  }
  assert(!("apiKey" in serverStatus) && !("key" in serverStatus), "GET /api/status 不泄露密钥字段");

  if (!serverConfig.mockMode) {
    console.log("  - 服务端处于真实模式（有 LLM_API_KEY），跳过 POST /api/chat 与 /api/prompt/enhance 的真实调用以节省额度。");
    console.log("    如需 HTTP mock 全链路：以 MOCK_LLM=1 npm run dev 启动后重跑本脚本。");
    return;
  }

  // v0.2: POST /api/prompt/enhance (mock server -> deterministic enhancement)
  const enhanceResponse = await fetchWithTimeout(
    `${baseUrl}/api/prompt/enhance`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "做一个记账本" }),
    },
    10_000,
  );
  assert(enhanceResponse.ok, `POST /api/prompt/enhance 返回 200（实际 ${enhanceResponse.status}）`);
  const enhancement = await enhanceResponse.json();
  assert(enhancement.mock === true, "prompt/enhance: mock 服务端返回 mock=true");
  assert(typeof enhancement.enhanced === "string" && enhancement.enhanced.length > 100, "prompt/enhance: enhanced 内容充实");
  assert(Array.isArray(enhancement.tips) && enhancement.tips.length >= 2 && enhancement.tips.length <= 3, "prompt/enhance: tips 2-3 条");
  const badEnhance = await fetchWithTimeout(
    `${baseUrl}/api/prompt/enhance`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    },
    5_000,
  );
  assert(badEnhance.status === 400, `prompt/enhance: 空 message 返回 400（实际 ${badEnhance.status}）`);

  const request = {
    projectId: "smoke-http",
    message: "帮我做一个极简待办清单，支持本地保存",
    files: {},
    history: [],
    mode: "generate",
  };
  const response = await fetchWithTimeout(
    `${baseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    60_000,
  );
  assert(response.ok, `POST /api/chat 返回 200（实际 ${response.status}）`);
  const contentType = response.headers.get("content-type") || "";
  assert(/text\/event-stream/i.test(contentType), `Content-Type 是 text/event-stream（${contentType}）`);
  assert(response.headers.get("x-accel-buffering") === "no", "X-Accel-Buffering: no 已设置");
  const events = await readSseEvents(response, 120_000);
  const result = finishRun("http-mock", events, true);
  if (result) {
    assert(Object.keys(result.files).length >= 3, `HTTP done.files 至少 3 个文件（${Object.keys(result.files).join("、")}）`);
  }
}

/* ---------------------------------- main ---------------------------------- */

async function main() {
  console.log("Atoms agent smoke test");
  console.log(`  工作目录：${ROOT}`);
  const offlineOnly = hasFlag("--offline");
  const baseUrl = getOption("--base", process.env.SMOKE_BASE_URL || "http://localhost:3000");

  let compiled;
  try {
    compiled = compileAgent();
  } catch (error) {
    console.error(`\n  \u2717 ${summarizeError(error)}`);
    process.exitCode = 1;
    return;
  }

  let serverUnavailable = false;
  try {
    await runOfflineEngineTests(compiled);
    if (hasFlag("--timing")) await runMockStreamingTiming(compiled);
    if (hasFlag("--real")) await runRealProviderPing(compiled);
    if (!offlineOnly) {
      try {
        await runHttpTests(baseUrl);
      } catch (error) {
        if (error instanceof ServerUnavailableError) {
          serverUnavailable = true;
          console.log(`\n  - [跳过 HTTP] ${error.message}`);
          console.log("    请先启动 dev server：npm run dev（HTTP mock 全链路请用 MOCK_LLM=1 npm run dev）。");
          console.log("    只跑离线引擎可加 --offline。");
        } else {
          fail(`HTTP 冒烟失败：${summarizeError(error)}`);
        }
      }
    }
  } finally {
    compiled.cleanup();
  }

  console.log("");
  if (failures > 0) {
    console.error(`FAILED：${failures} 项断言失败`);
    process.exitCode = 1;
    return;
  }
  if (serverUnavailable) {
    console.log("离线引擎检查全部通过；HTTP 检查因 dev server 未启动而跳过（按约定退出码 2）。");
    process.exitCode = 2;
    return;
  }
  console.log("PASS：全部冒烟检查通过。");
  process.exitCode = 0;
}

main().catch((error) => {
  console.error(`\n  \u2717 冒烟脚本异常：${summarizeError(error)}`);
  process.exitCode = 1;
});
