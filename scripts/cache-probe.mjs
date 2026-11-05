#!/usr/bin/env node
/**
 * Prompt-cache probe for session-aware OpenAI-compatible gateways (OpenCode Go / DeepSeek).
 *
 * Sends a long, stable prefix and then a longer follow-up in the SAME session
 * (`x-opencode-session`, stable), then repeats the follow-up in a DIFFERENT session,
 * printing prompt/cached tokens and latency for each call. This measures whether
 * prompt caching actually kicks in and how much it saves.
 *
 * Usage:
 *   node scripts/cache-probe.mjs                     # uses .env.local / process env
 *   node scripts/cache-probe.mjs --prefix-chars=8000 # tune prefix size (default 8000 chars)
 *   node scripts/cache-probe.mjs --repeat=2          # extra same-session repeats
 *
 * Never prints the API key. Exits 0 when the probe runs (even if caching is absent),
 * 1 on request failure, 2 when no key is configured.
 */
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
function getOption(name, fallback) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const PREFIX_CHARS = Math.min(40_000, Math.max(2_000, Number.parseInt(getOption("prefix-chars", "8000"), 10) || 8_000));
const EXTRA_REPEATS = Math.min(3, Math.max(0, Number.parseInt(getOption("repeat", "1"), 10) || 0));
// Unique per run (or fixed via --salt) so the probe always measures a fresh cache
// state instead of being warmed by an earlier identical run.
const SALT =
  getOption("salt", "") || `probe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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

/** Compile src/lib/agent/** to a temp CommonJS dir so we probe the exact app client. */
function compileAgent() {
  const ts = require("typescript");
  const tempDir = mkdtempSync(join(tmpdir(), "atoms-cache-probe-"));
  const configPath = join(ROOT, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, " "));
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    ROOT,
    {
      noEmit: false,
      outDir: tempDir,
      rootDir: join(ROOT, "src"),
      baseUrl: ROOT,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      incremental: false,
      declaration: false,
      sourceMap: false,
    },
    configPath,
  );
  const options = parsed.options;
  options.noEmit = false;
  options.outDir = tempDir;
  options.rootDir = join(ROOT, "src");
  options.baseUrl = ROOT;
  const rootNames = ts.sys.readDirectory(join(ROOT, "src", "lib", "agent"), [".ts"], undefined, undefined);
  rootNames.push(join(ROOT, "src", "types.ts"));
  const program = ts.createProgram({ rootNames, options });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => ROOT,
        getNewLine: () => "\n",
      }),
    );
  }
  program.emit();
  return { tempDir, requireModule: (relativePath) => require(join(tempDir, relativePath)) };
}

const CACHE_PREFIX_PARAGRAPH =
  "Atoms 是一个把自然语言需求变成可运行网页应用的构建器。它先由规划器拆解需求，再由编码 Agent 写出 index.html、styles.css 与 app.js，最后在浏览器沙箱中实时预览并支持版本回滚、分享与导出。这段文字用于构造一段稳定、足够长的提示词前缀，以便测量厂商侧的 prompt cache 命中情况。";

function buildPrefix(chars) {
  let text = `探针编号 ${SALT}：以下为稳定的提示词前缀，用于测量 prompt cache。\n\n`;
  while (text.length < chars) text += CACHE_PREFIX_PARAGRAPH;
  return text.slice(0, chars);
}

function formatInt(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : "-";
}

function formatUsage(usage) {
  if (!usage) return { prompt: "-", cached: "-", completion: "-", total: "-", hitRate: "-" };
  const prompt = usage.promptTokens || 0;
  const cached = usage.cachedTokens || 0;
  return {
    prompt: formatInt(prompt),
    cached: formatInt(cached),
    completion: formatInt(usage.completionTokens),
    total: formatInt(usage.totalTokens),
    hitRate: prompt > 0 ? `${Math.round((cached / prompt) * 100)}%` : "-",
  };
}

async function main() {
  const loadedNames = loadDotEnvLocal();
  const compiled = compileAgent();
  try {
    const config = compiled.requireModule("lib/agent/config.js");
    const providerModule = compiled.requireModule("lib/agent/provider.js");
    const provider = config.resolveProvider();
    if (!provider) {
      console.log("未配置 LLM_API_KEY（.env.local 或环境变量），跳过缓存实测。");
      process.exit(2);
    }

    let host = "";
    try {
      host = new URL(provider.baseUrl).hostname;
    } catch {
      host = provider.baseUrl;
    }
    const sessionSupported = /(^|\.)opencode\.ai$/i.test(host);
    console.log("== Atoms prompt-cache probe ==");
    console.log(`  provider host: ${host}`);
    console.log(`  model: ${provider.model}`);
    console.log(`  probe salt: ${SALT}`);
    console.log(`  prefix chars: ${PREFIX_CHARS}（约 ${Math.round(PREFIX_CHARS / 2)}-${Math.round(PREFIX_CHARS / 1.3)} tokens）`);
    console.log(`  x-opencode-session: ${sessionSupported ? "会发送（opencode.ai 网关）" : "该 host 不发送 session 头，session 对比仅供参考"}`);
    if (loadedNames.length > 0) console.log(`  已从 .env.local 读取：${loadedNames.join(", ")}`);

    const prefix = buildPrefix(PREFIX_CHARS);
    const baseMessages = [
      { role: "system", content: prefix },
      { role: "user", content: "第 1 轮：只回复两个汉字：可以" },
    ];

    const results = [];
    const sessionA = `atoms-cache-probe-a-${process.pid.toString(36)}`;
    const sessionB = `atoms-cache-probe-b-${process.pid.toString(36)}`;

    async function probe(label, messages, sessionId) {
      const startedAt = Date.now();
      let usage = null;
      let text = "";
      try {
        for await (const delta of providerModule.streamChatCompletion({
          provider,
          messages,
          sessionId,
          timeoutMs: 120_000,
          idleTimeoutMs: 60_000,
          temperature: 0,
          // Reasoning models may spend tokens on hidden reasoning before the visible
          // answer; keep enough headroom so the probe never fails on an empty answer.
          maxTokens: 512,
          reasoningEffort: "low",
        })) {
          if (delta.usage) usage = delta.usage;
          if (delta.content) text += delta.content;
        }
      } catch (error) {
        // Usage is reported before the stream ends; an empty visible answer is fine
        // for a cache probe (we only need token accounting).
        const emptyAnswer =
          error && error.kind === "upstream" && /没有返回任何内容/.test(String(error.message || ""));
        if (!emptyAnswer) throw error;
      }
      const result = { label, sessionId, latencyMs: Date.now() - startedAt, usage, text };
      results.push(result);
      const shown = formatUsage(usage);
      console.log(
        `  ${label}: latency=${result.latencyMs}ms prompt=${shown.prompt} cached=${shown.cached} (hit ${shown.hitRate}) completion=${shown.completion} total=${shown.total}`,
      );
      return result;
    }

    const call1 = await probe("call1 同 session 首轮", baseMessages, sessionA);
    const followUpMessages = [
      ...baseMessages,
      { role: "assistant", content: call1.text.trim() || "可以" },
      { role: "user", content: "第 2 轮：只回复两个字：收到" },
    ];
    const call2 = await probe("call2 同 session 前缀增长", followUpMessages, sessionA);
    const call3 = await probe("call3 不同 session 同请求", followUpMessages, sessionB);
    for (let index = 0; index < EXTRA_REPEATS; index += 1) {
      await probe(`call4+${index + 1} 同 session 重复请求`, followUpMessages, sessionA);
    }

    const call2Usage = call2.usage;
    const cached2 = call2Usage?.cachedTokens ?? 0;
    const prompt2 = call2Usage?.promptTokens ?? 0;
    const cached3 = call3.usage?.cachedTokens ?? 0;
    const reused = results.filter((item, index) => index >= 3 && item.sessionId === sessionA);

    console.log("\n== 结论 ==");
    if (!call2Usage) {
      console.log("  ⚠ 上游未返回 usage（可能未接受 stream_options 或该网关不报告缓存字段），无法测量 cachedTokens。");
    } else if (cached2 > 0) {
      const hitRate = prompt2 > 0 ? Math.round((cached2 / prompt2) * 100) : 0;
      console.log(
        `  ✓ 命中 prompt cache：同 session 第二轮 cachedTokens=${cached2} / promptTokens=${prompt2}（命中率 ${hitRate}%）。`,
      );
      console.log(`    时延对比：首轮 ${call1.latencyMs}ms → 第二轮 ${call2.latencyMs}ms。`);
      console.log(`    成本对比：第二轮约 ${Math.round((1 - cached2 / Math.max(1, prompt2)) * 100)}% 的 prompt 按缓存价计费。`);
    } else {
      console.log(
        `  × 未观测到缓存命中：同 session 第二轮 cachedTokens=0（prompt=${prompt2}）。`,
      );
      console.log(
        "    可能原因：前缀低于网关最小缓存单位（常见 1024 tokens）、网关未开启 prompt cache、或需要更长的稳定前缀。",
      );
    }
    if (sessionSupported) {
      console.log(
        `  不同 session 对比：同请求不同 session cachedTokens=${cached3}${cached3 < cached2 ? "（低于同 session，说明稳定 session 是命中的前提）" : ""}。`,
      );
    }
    if (reused.length > 0 && reused.some((item) => item.usage)) {
      const repeatCached = reused.map((item) => item.usage?.cachedTokens ?? 0);
      console.log(`  同 session 重复请求 cachedTokens：${repeatCached.join(" / ")}。`);
    }
    console.log("  说明：cachedTokens 为 0 时仍可能有网关侧隐式缓存，但成本/时延收益不可测量。");

    process.exit(0);
  } finally {
    rmSync(compiled.tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error && error.name === "ProviderError" ? error.message : String((error && error.message) || error);
  console.error(`缓存实测失败：${message}`);
  process.exit(1);
});
