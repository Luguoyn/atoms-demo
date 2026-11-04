"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Modal } from "@/components/ui";
import type { ServerMode } from "@/lib/store";
import { useBuilder } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  IconCheck,
  IconEye,
  IconEyeOff,
  IconInfo,
  IconKey,
  IconShieldCheck,
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

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { settings, saveSettings, serverMode, serverConfig } = useBuilder();
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const mode = MODE_META[serverMode];
  const detecting = serverConfig === null && serverMode === "mock";

  // Sync the form from persisted settings each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setBaseUrl(settings.baseUrl);
    setModel(settings.model);
    setApiKey(settings.apiKey);
    setShowKey(false);
    setSaving(false);
    setSaved(false);
    setSaveFailed(false);
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
      await saveSettings({ baseUrl, model, apiKey });
      setSaved(true);
      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = null;
        onClose();
      }, 900);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="模型设置"
      description="接入 OpenAI 兼容的模型服务（BYOK）。不填写也可以使用服务端模型或内置演示模式。"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
        className="space-y-4"
      >
        <div className={cn("flex items-start gap-3 rounded-xl px-3 py-3 ring-1", mode.card)}>
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
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              {detecting
                ? "正在获取服务端配置；若获取失败，会自动使用内置演示 Agent，功能仍可完整体验。"
                : mode.desc}
            </p>
          </div>
        </div>

        {serverConfig?.mockMode ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-warn/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-warn/90 ring-1 ring-warn/20">
            <IconInfo className="mt-0.5 h-3 w-3 shrink-0" />
            服务端当前启用了演示模式（MOCK_LLM），生成结果可能仍来自内置示例 Agent。
          </p>
        ) : null}

        {serverConfig?.defaultModel && serverMode !== "byok" ? (
          <p className="-mt-1 text-[10.5px] text-muted-2">
            服务端默认模型：
            <span className="font-mono text-muted">{serverConfig.defaultModel}</span>
          </p>
        ) : null}

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
          <p className="mt-1 text-[10.5px] text-muted-2">留空使用服务端默认模型。</p>
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
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noreferrer noopener"
              className="shrink-0 text-[10.5px] text-accent-soft transition-colors hover:text-accent"
            >
              获取密钥 ↗
            </a>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-white/5 pt-4 sm:flex-row sm:items-center sm:justify-between">
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
