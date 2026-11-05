#!/usr/bin/env node
/**
 * Reproduce / inspect tool-call argument truncation with a real provider.
 *
 * Sends a realistic "build a 2048 game" coding turn (tools enabled, same system
 * prompt as the agent) and prints:
 *   - finish_reason
 *   - usage (completion / reasoning / cached tokens)
 *   - every tool call: name, arguments length, JSON valid?, head/tail when broken
 *
 * Usage:
 *   node scripts/truncation-probe.mjs
 *   node scripts/truncation-probe.mjs --message "帮我做个2048小游戏" --max-tokens 16000
 *   node scripts/truncation-probe.mjs --max-tokens 32000   # compare a larger budget
 *
 * Never prints the API key. Exit code 0 = probe ran, 1 = provider failure.
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

const MESSAGE = getOption("message", "帮我做个2048小游戏");
const MAX_TOKENS = Math.min(32_000, Math.max(1_000, Number.parseInt(getOption("max-tokens", "16000"), 10) || 16_000));
const REASONING = getOption("reasoning", "low");

function loadDotEnvLocal() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return [];
  const loaded = [];
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

function compileAgent() {
  const ts = require("typescript");
  const tempDir = mkdtempSync(join(tmpdir(), "atoms-truncation-probe-"));
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

function previewJson(raw) {
  const compact = raw.replace(/\s+/g, " ");
  return compact.length > 160 ? `${compact.slice(0, 160)}…` : compact;
}

const loaded = loadDotEnvLocal();
const compiled = compileAgent();
try {
  const config = compiled.requireModule("lib/agent/config.js");
  const prompts = compiled.requireModule("lib/agent/prompts.js");
  const providerModule = compiled.requireModule("lib/agent/provider.js");
  const tools = compiled.requireModule("lib/agent/tools.js");

  const provider = config.resolveProvider();
  if (!provider) {
    console.error("未配置 LLM_API_KEY，无法实测。");
    process.exit(2);
  }

  const request = {
    projectId: "truncation-probe",
    message: MESSAGE,
    files: {},
    history: [],
    mode: "generate",
  };
  const plan = prompts.synthesizePlan(request);
  const messages = prompts.buildCodingMessages(request, plan, {});

  console.log("== tool-call truncation probe ==");
  console.log(`  model: ${provider.model} | max_tokens: ${MAX_TOKENS} | reasoning_effort: ${REASONING}`);
  console.log(`  message: ${MESSAGE}`);
  if (loaded.length) console.log(`  env from .env.local: ${loaded.join(", ")}`);

  const startedAt = Date.now();
  const files = {};
  const MAX_TURNS = Math.max(1, Math.min(8, Number.parseInt(getOption("turns", "6"), 10) || 6));
  const totalUsage = { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cachedTokens: 0 };
  let sawInvalid = false;
  let sawLength = false;
  let turn = 0;

  while (turn < MAX_TURNS) {
    turn += 1;
    const turnStarted = Date.now();
    const accumulator = new providerModule.ToolCallAccumulator();
    let contentLength = 0;
    let finishReason = null;
    let usage = null;
    let truncatedFlag = false;
    const messagesBefore = messages.length;
    try {
      for await (const delta of providerModule.streamChatCompletion({
        provider,
        messages,
        tools: tools.TOOL_DEFINITIONS,
        timeoutMs: 180_000,
        idleTimeoutMs: 60_000,
        temperature: 0.35,
        maxTokens: MAX_TOKENS,
        reasoningEffort: /^(minimal|low|medium|high|max)$/.test(REASONING) ? REASONING : undefined,
        sessionId: "truncation-probe",
      })) {
        if (delta.content) contentLength += delta.content.length;
        if (delta.toolCalls) accumulator.push(delta.toolCalls);
        if (delta.finishReason !== undefined) finishReason = delta.finishReason;
        if (delta.usage) usage = delta.usage;
        if (delta.truncated) truncatedFlag = true;
      }
    } catch (error) {
      console.log(`\n  --- turn ${turn}: provider error: ${error && error.message}`);
      break;
    }
    const elapsed = Date.now() - turnStarted;
    if (usage) {
      totalUsage.promptTokens += usage.promptTokens;
      totalUsage.completionTokens += usage.completionTokens;
      totalUsage.reasoningTokens += usage.reasoningTokens;
      totalUsage.cachedTokens += usage.cachedTokens;
    }
    const calls = accumulator.snapshot();
    console.log(
      `\n  --- turn ${turn}: ${elapsed}ms | content=${contentLength} chars | finish_reason=${finishReason} | truncated=${truncatedFlag} | calls=${calls.length}`,
    );
    console.log(`      usage: ${JSON.stringify(usage)}`);
    if (finishReason === "length" || truncatedFlag) sawLength = true;
    if (calls.length === 0) break;

    messages.push({ role: "assistant", content: "", tool_calls: calls });
    let finished = false;
    for (const [index, call] of calls.entries()) {
      const rawArgs = call.function.arguments || "";
      let parsed = null;
      let valid = false;
      let parseError = "";
      try {
        parsed = JSON.parse(rawArgs);
        valid = true;
      } catch (error) {
        parseError = error && error.message ? error.message : String(error);
      }
      console.log(`    [call ${index + 1}] tool=${call.function.name} args=${rawArgs.length} chars jsonValid=${valid}`);
      if (!valid) {
        sawInvalid = true;
        console.log(`      parse error: ${parseError}`);
        console.log(`      head: ${previewJson(rawArgs.slice(0, 200))}`);
        console.log(`      tail: ${previewJson(rawArgs.slice(-200))}`);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, error: "arguments truncated / invalid JSON" }),
        });
        continue;
      }
      if (call.function.name === "write_file") {
        const path = typeof parsed.path === "string" ? parsed.path : "?";
        const content = typeof parsed.content === "string" ? parsed.content : "";
        if (parsed.mode === "append") files[path] = (files[path] || "") + content;
        else files[path] = content;
        console.log(`      write ${path} mode=${parsed.mode || "overwrite"} +${content.length} chars -> total ${files[path].length}`);
      } else if (call.function.name === "finish") {
        finished = true;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true }) });
    }
    if (messages.length === messagesBefore) break;
    if (finished) {
      console.log("    finish tool received");
      break;
    }
    if (sawInvalid && process.env.PROBE_STOP_ON_ERROR === "1") {
      console.log("    stop on first invalid call (PROBE_STOP_ON_ERROR=1)");
      break;
    }
  }

  const fileSizes = Object.fromEntries(Object.entries(files).map(([path, content]) => [path, content.length]));
  console.log(
    `\n  RESULT: turns=${turn} finish_length_seen=${sawLength} invalid_call_seen=${sawInvalid} files=${JSON.stringify(fileSizes)}`,
  );
  console.log(`  total usage: ${JSON.stringify(totalUsage)}`);
  console.log(`  total elapsed: ${Date.now() - startedAt}ms`);
  process.exitCode = 0;
} finally {
  rmSync(compiled.tempDir, { recursive: true, force: true });
}
