"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Modal, useToast } from "@/components/ui";
import type { ReasoningEffort } from "@/types";
import type { ServerMode } from "@/lib/store";
import { useBuilder } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  IconCheck,
  IconEye,
  IconEyeOff,
  IconInfo,
  IconKey,
  IconRefresh,
  IconShieldCheck,
  IconZap,
} from "@/components/chat/icons";

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const MODE_LABEL: Record<ServerMode, string> = {
  "server-key": "服务端模型",
  byok: "自带密钥",
  mock: "演示模式",
};

const MODE_META: Record<
  ServerMode,
  {
    badge: "ok" | "accent" | "warn";
    title: string;
    desc: string;
    card: string;
    icon: string;
  }
> = {
  "server-key": {
    badge: "ok",
    title: "服务端模型已就绪",
    desc: "服务端已配置模型密钥，可直接开始生成。下方留空会使用服务端默认模型；填写 API Key 后将优先使用你自己的密钥。",
    card: "bg-ok/[0.06] ring-ok/25",
    icon: "bg-ok/10 text-ok ring-ok/25",
  },
  byok: {
    badge: "accent",
    title: "正在使用自带密钥",
    desc: "生成请求会使用下方填写的 Base URL / 模型 / API Key，它们只随 /api/chat 请求发送，不会写入服务端。",
    card: "bg-accent/[0.07] ring-accent/30",
    icon: "bg-accent/15 text-accent-soft ring-accent/30",
  },
  mock: {
    badge: "warn",
    title: "演示模式",
    desc: "未检测到模型密钥。生成流程仍可完整走通，但结果由内置示例 Agent 生成。填写 API Key 即可接入真实模型。",
    card: "bg-warn/[0.06] ring-warn/25",
    icon: "bg-warn/10 text-warn ring-warn/25",
  },
};

type PresetId = "deepseek" | "opencode" | "custom";

interface Preset {
  id: PresetId;
  label: string;
  desc: string;
  baseUrl: string;
  model: string;
}

const PRESETS: Preset[] = [
  {
    id: "deepseek",
    label: "DeepSeek 直连",
    desc: "官方 API · deepseek-chat",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  {
    id: "opencode",
    label: "OpenCode Go",
    desc: "DeepSeek V4.1 Flash · 支持缓存",
    baseUrl: "https://opencode.ai/inference/go/openai/v1",
    model: "deepseek-v4.1-flash",
  },
  {
    id: "custom",
    label: "自定义",
    desc: "任意 OpenAI 兼容接口",
    baseUrl: "",
    model: "",
  },
];

const EFFORTS: { value: ReasoningEffort | ""; label: string; hint: string }[] = [
  { value: "", label: "默认", hint: "跟随服务端配置，不额外指定" },
  { value: "low", label: "低", hint: "更快，适合简单界面与快速迭代" },
  { value: "medium", label: "中", hint: "速度与质量平衡" },
  { value: "high", label: "高", hint: "更深思考，适合复杂交互，耗时更长" },
];

function detectPreset(baseUrl: string): PresetId {
  const normalized = baseUrl.trim().toLowerCase();
  if (!normalized) return "custom";
  if (normalized.includes("api.deepseek.com")) return "deepseek";
  if (normalized.includes("opencode.ai")) return "opencode";
  return "custom";
}

function formatResetTime(timestamp: number): string {
  const diff = timestamp - Date.now();
  if (!Number.isFinite(timestamp) || diff <= 0) return "即将重置";
  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `${minutes} 分钟后重置`;
  const date = new Date(timestamp);
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");
  return `${hour}:${minute} 重置`;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const {
    settings,
    saveSettings,
    serverMode,
    serverConfig,
    serverStatus,
    refreshStatus,
  } = useBuilder();
  const { toast } = useToast();

  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort | "">("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [testing, setTesting] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const mode = MODE_META[serverMode];
  const detecting = !serverStatus && !serverConfig;
  const presetId = detectPreset(baseUrl);
  const effortHint =
    EFFORTS.find((item) => item.value === reasoningEffort)?.hint ?? EFFORTS[0].hint;

  const quota = serverStatus?.quota ?? null;
  const quotaPercent = quota
    ? Math.max(
        0,
        Math.min(100, Math.round((quota.remaining / Math.max(1, quota.limitPerHour)) * 100)),
      )
    : 0;

  // Sync the form from persisted settings + refresh live server status on open.
  useEffect(() => {
    if (!open) return;
    setBaseUrl(settings.baseUrl);
    setModel(settings.model);
    setApiKey(settings.apiKey);
    setReasoningEffort(settings.reasoningEffort ?? "");
    setShowKey(false);
    setSaving(false);
    setSaved(false);
    setSaveFailed(false);
    setTesting(false);
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) return;
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSave = async () => {
    if (saving) return;
    setSaveFailed(false);
    setSaving(true);
    try {
      await saveSettings({ baseUrl, model, apiKey, reasoningEffort });
      setSaved(true);
      toast({ title: "设置已保存", description: "新的模型配置已生效", tone: "success" });
      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = null;
        onClose();
      }, 900);
    } catch {
      setSaveFailed(true);
      toast({ title: "保存失败", description: "请稍后重试", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const latest = await refreshStatus();
      if (latest) {
        const quotaText = latest.quota
          ? `剩余 ${latest.quota.remaining}/${latest.quota.limitPerHour} 次`
          : latest.mode === "byok"
            ? "自带密钥"
            : "演示模式";
        toast({
          title: "连接正常",
          description: `${MODE_LABEL[latest.mode]} · ${latest.model} · ${quotaText}`,
          tone: "success",
          durationMs: 3200,
        });
      } else {
        toast({
          title: "连接失败",
          description: "无法获取服务端状态，请检查网络后重试",
          tone: "error",
        });
      }
    } finally {
      setTesting(false);
    }
  };

  const applyPreset = (preset: Preset) => {
    if (preset.id === "custom") {
      // Switching to "custom" resets the fields so the user can type any endpoint.
      if (presetId !== "custom") {
        setBaseUrl("");
        setModel("");
      }
      return;
    }
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
    setSaveFailed(false);
  };

  const keyLink =
    presetId === "deepseek"
      ? { href: "https://platform.deepseek.com/api_keys", label: "获取 DeepSeek 密钥 ↗" }
      : presetId === "opencode"
        ? { href: "https://opencode.ai", label: "获取 OpenCode 密钥 ↗" }
        : null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="模型设置"
      description="选择模型服务与质量档位；不填写密钥也可以使用服务端模型或内置演示模式。"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
        className="flex max-h-[70dvh] flex-col sm:max-h-[calc(100dvh-12rem)]"
      >
        <div className="scroll-thin -mr-1 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {/* -------------------------- server status card ------------------------- */}
          <div className={cn("rounded-xl px-3 py-3 ring-1", mode.card)}>
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1",
                  mode.icon,
                )}
              >
                {serverMode === "mock" ? (
                  <IconInfo className="h-4 w-4" />
                ) : (
                  <IconKey className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12.5px] font-medium text-fg">
                    {detecting ? "正在检测模型配置…" : mode.title}
                  </span>
                  <Badge tone={mode.badge}>
                    {detecting ? "检测中" : MODE_LABEL[serverMode]}
                  </Badge>
                  {serverStatus?.mockForced ? (
                    <Badge tone="warn">服务端强制演示</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  {detecting
                    ? "正在获取服务端配置；若获取失败，会自动使用内置演示 Agent，功能仍可完整体验。"
                    : mode.desc}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleTestConnection();
                }}
                disabled={testing}
                title="重新获取服务端状态并测试连接"
                className="flex shrink-0 items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[10.5px] text-muted ring-1 ring-white/10 transition-colors hover:bg-white/[0.1] hover:text-fg disabled:opacity-60"
              >
                <IconRefresh
                  className={cn("h-3 w-3", testing && "animate-spin")}
                />
                {testing ? "测试中" : "测试连接"}
              </button>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-white/5 pt-2.5 text-[10.5px]">
              <div className="min-w-0">
                <span className="text-muted-2">当前模型</span>
                <p className="truncate font-mono text-muted" title={serverStatus?.model}>
                  {serverStatus?.model ||
                    settings.model ||
                    serverConfig?.defaultModel ||
                    "服务端默认"}
                </p>
              </div>
              <div className="min-w-0">
                <span className="text-muted-2">服务端密钥</span>
                <p
                  className={cn(
                    "truncate",
                    serverStatus?.hasServerKey ? "text-ok/80" : "text-warn/90",
                  )}
                >
                  {detecting
                    ? "检测中"
                    : serverStatus?.hasServerKey
                      ? "已配置"
                      : "未配置"}
                </p>
              </div>
              <div className="min-w-0">
                <span className="text-muted-2">限流</span>
                <p className="truncate tabular-nums text-muted">
                  {serverStatus
                    ? `${serverStatus.rateLimits.perHour} 次/小时 · 并发 ${serverStatus.rateLimits.concurrent}`
                    : "—"}
                </p>
              </div>
              <div className="min-w-0">
                <span className="text-muted-2">服务端版本</span>
                <p className="truncate font-mono text-muted">
                  {serverStatus?.version ? `v${serverStatus.version}` : "—"}
                </p>
              </div>
            </div>

            {quota ? (
              <div className="mt-2.5 border-t border-white/5 pt-2.5">
                <div className="flex items-center justify-between gap-2 text-[10.5px]">
                  <span className="text-muted-2">演示额度（服务端密钥）</span>
                  <span className="shrink-0 tabular-nums text-fg/80">
                    剩余 {quota.remaining} / {quota.limitPerHour} 次
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-300"
                    style={{ width: `${quotaPercent}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-2">
                  {formatResetTime(quota.resetAt)}
                </p>
              </div>
            ) : (
              <p className="mt-2.5 flex items-center gap-1.5 border-t border-white/5 pt-2.5 text-[10.5px] text-muted-2">
                <IconShieldCheck className="h-3.5 w-3.5 shrink-0 text-ok/70" />
                {serverMode === "byok"
                  ? "正在使用自带密钥，不占用服务端的演示额度"
                  : "演示模式不消耗服务端额度，可放心体验"}
              </p>
            )}
          </div>

          {serverStatus?.mockForced ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-warn/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-warn/90 ring-1 ring-warn/20">
              <IconInfo className="mt-0.5 h-3 w-3 shrink-0" />
              服务端当前启用了演示模式（MOCK_LLM），生成结果可能仍来自内置示例 Agent。
            </p>
          ) : null}

          {/* ----------------------------- model presets --------------------------- */}
          <div>
            <span className="label">模型预设</span>
            <div className="space-y-1.5">
              {PRESETS.map((preset) => {
                const active = preset.id === presetId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ring-1 transition-colors",
                      active
                        ? "bg-accent/[0.08] ring-accent/35"
                        : "bg-white/[0.02] ring-white/[0.07] hover:bg-white/[0.04] hover:ring-white/15",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1",
                        active
                          ? "bg-accent text-white ring-accent/50"
                          : "ring-white/15",
                      )}
                    >
                      {active ? <IconCheck className="h-2.5 w-2.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium text-fg">
                        {preset.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[10.5px] text-muted-2">
                        {preset.desc}
                      </span>
                    </span>
                    {preset.id === "custom" ? (
                      <span className="shrink-0 text-[10px] text-muted-2">
                        手动填写
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* --------------------------- quality / speed --------------------------- */}
          <div>
            <div className="flex items-center justify-between">
              <span className="label">质量与速度</span>
              <span className="mb-1.5 flex items-center gap-1 text-[10px] text-muted-2">
                <IconZap className="h-3 w-3" />
                reasoning effort
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {EFFORTS.map((effort) => {
                const active = effort.value === reasoningEffort;
                return (
                  <button
                    key={effort.value || "default"}
                    type="button"
                    onClick={() => setReasoningEffort(effort.value)}
                    className={cn(
                      "rounded-lg px-2 py-1.5 text-[11.5px] transition-colors ring-1",
                      active
                        ? "bg-accent/15 text-accent-soft ring-accent/35"
                        : "bg-white/[0.02] text-muted ring-white/[0.07] hover:bg-white/[0.05] hover:text-fg",
                    )}
                  >
                    {effort.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10.5px] text-muted-2">{effortHint}</p>
          </div>

          {/* ------------------------------ BYOK form ------------------------------ */}
          <div>
            <label htmlFor="settings-base-url" className="label">
              Base URL
            </label>
            <input
              id="settings-base-url"
              className="input"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.deepseek.com"
              autoComplete="off"
              spellCheck={false}
              inputMode="url"
            />
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-2">
              需为 OpenAI 兼容接口；留空使用服务端默认地址（DeepSeek）。
            </p>
          </div>

          <div>
            <label htmlFor="settings-model" className="label">
              模型名称
            </label>
            <input
              id="settings-model"
              className="input"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="deepseek-chat"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1 text-[10.5px] text-muted-2">
              留空使用服务端默认模型；OpenCode Go 推荐 deepseek-v4.1-flash。
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="settings-api-key" className="label">
                API Key
              </label>
              {settings.apiKey ? (
                <button
                  type="button"
                  onClick={() => {
                    setApiKey("");
                    setSaveFailed(false);
                  }}
                  className="mb-1.5 text-[10.5px] text-muted-2 transition-colors hover:text-err"
                >
                  清除已保存的密钥
                </button>
              ) : null}
            </div>
            <div className="relative">
              <input
                id="settings-api-key"
                type={showKey ? "text" : "password"}
                className="input"
                style={{ paddingRight: 42 }}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="留空则使用服务端密钥或演示模式"
                autoComplete="new-password"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                title={showKey ? "隐藏密钥" : "显示密钥"}
                className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-2 transition-colors hover:bg-white/10 hover:text-fg"
              >
                {showKey ? (
                  <IconEyeOff className="h-3.5 w-3.5" />
                ) : (
                  <IconEye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <div className="mt-1 flex items-start justify-between gap-2">
              <p className="text-[10.5px] leading-relaxed text-muted-2">
                仅保存在本机浏览器（IndexedDB），只会随 /api/chat 请求发送给服务端。
              </p>
              {keyLink ? (
                <a
                  href={keyLink.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 text-[10.5px] text-accent-soft transition-colors hover:text-accent"
                >
                  {keyLink.label}
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 flex shrink-0 flex-col-reverse gap-2 border-t border-white/5 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-[10.5px] text-muted-2">
            <IconShieldCheck className="h-3.5 w-3.5 shrink-0 text-ok/70" />
            密钥不会写入服务端日志或数据
          </p>
          <div className="flex items-center justify-end gap-2">
            {saveFailed ? (
              <span className="text-[11px] text-err">保存失败，请重试</span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={saving}
              disabled={saved}
            >
              {saved ? (
                <>
                  <IconCheck className="h-3.5 w-3.5" />
                  已保存
                </>
              ) : (
                "保存设置"
              )}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
