"use client";

import type { ComponentType } from "react";
import { Logo } from "@/components/ui";
import type { ServerMode } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  IconArrowUpRight,
  IconChart,
  IconCheck,
  IconClock,
  IconInfo,
  IconLayers,
  IconList,
  IconMonitor,
  IconShieldCheck,
  IconSparkles,
  IconWallet,
  type IconProps,
} from "./icons";

export interface WelcomeScreenProps {
  mode: ServerMode;
  onSend: (prompt: string) => void;
  onOpenSettings: () => void;
}

interface PromptIdea {
  id: string;
  title: string;
  desc: string;
  prompt: string;
  Icon: ComponentType<IconProps>;
  iconTone: string;
}

const PROMPT_IDEAS: PromptIdea[] = [
  {
    id: "pomodoro",
    title: "番茄钟",
    desc: "专注计时 + 今日统计",
    prompt:
      "做一个专注番茄钟应用：25 分钟专注、5 分钟休息，可自定义时长，结束时提醒并播放提示音，展示今日专注次数与总时长，数据用 localStorage 保存。",
    Icon: IconClock,
    iconTone: "bg-accent/15 text-accent-soft ring-accent/25",
  },
  {
    id: "todo",
    title: "待办清单",
    desc: "任务管理 + 优先级",
    prompt:
      "做一个简洁的待办清单应用：可以添加、勾选完成、删除任务，支持优先级标签和筛选，底部展示完成进度，数据保存在 localStorage 里。",
    Icon: IconList,
    iconTone: "bg-accent-2/10 text-accent-2 ring-accent-2/25",
  },
  {
    id: "ledger",
    title: "记账本",
    desc: "收支记录 + 分类统计",
    prompt:
      "做一个个人记账本应用：记录收入与支出，可按分类筛选统计，显示本月收入、支出与结余，用简单图表展示最近 7 天趋势，数据保存在 localStorage。",
    Icon: IconWallet,
    iconTone: "bg-ok/10 text-ok ring-ok/25",
  },
  {
    id: "dashboard",
    title: "数据看板",
    desc: "指标卡 + 趋势图",
    prompt:
      "做一个数据小看板：展示 4 个关键指标卡片、一条趋势折线图和分类占比图，数据使用内置示例数据，支持切换时间范围，风格现代简洁。",
    Icon: IconChart,
    iconTone: "bg-warn/10 text-warn ring-warn/25",
  },
];

/** Short, ready-to-send refinement prompts used by chips in chat + resume states. */
export const REFINE_IDEAS = [
  "换个更清爽的配色",
  "加一个深色模式",
  "补充数据统计",
  "优化移动端体验",
];

export function WelcomeScreen({
  mode,
  onSend,
  onOpenSettings,
}: WelcomeScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col px-1 py-4 sm:py-6">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 scale-[2.2] rounded-full bg-accent/20 blur-2xl"
          />
          <Logo className="h-11 w-11" />
        </div>
        <h1 className="mt-3.5 text-[19px] font-semibold leading-snug tracking-tight text-fg sm:text-[21px]">
          把一句想法，<span className="gradient-text">变成可运行的应用</span>
        </h1>
        <p className="mt-2 max-w-[380px] text-[12.5px] leading-relaxed text-muted">
          描述你的需求，Agent 会先规划方案、再编写代码并自动校验，结果实时渲染在右侧预览里。
          选一个示例开始，或直接在下方输入。
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {PROMPT_IDEAS.map(({ id, title, desc, prompt, Icon, iconTone }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSend(prompt)}
            className="group relative flex flex-col items-start overflow-hidden rounded-xl bg-white/[0.025] p-3 text-left ring-1 ring-white/[0.07] transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.045] hover:ring-accent/40 hover:shadow-[0_14px_30px_-20px_rgba(139,92,246,0.7)]"
          >
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg ring-1",
                iconTone,
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="mt-2 flex w-full min-w-0 items-center gap-1">
              <span className="truncate text-[12.5px] font-medium text-fg">
                {title}
              </span>
              <IconArrowUpRight className="ml-auto h-3 w-3 shrink-0 -translate-x-0.5 text-accent-soft opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
            </span>
            <span className="mt-0.5 block w-full truncate text-[11px] text-muted-2">
              {desc}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10.5px] text-muted-2">
        <span className="inline-flex items-center gap-1">
          <IconSparkles className="h-3 w-3 text-accent-soft" />
          需求规划
        </span>
        <span aria-hidden className="h-2.5 w-px bg-white/10" />
        <span className="inline-flex items-center gap-1">
          <IconShieldCheck className="h-3 w-3 text-ok/80" />
          自动校验修复
        </span>
        <span aria-hidden className="h-2.5 w-px bg-white/10" />
        <span className="inline-flex items-center gap-1">
          <IconMonitor className="h-3 w-3 text-accent-2/80" />
          实时预览
        </span>
        <span aria-hidden className="h-2.5 w-px bg-white/10" />
        <span className="inline-flex items-center gap-1">
          <IconLayers className="h-3 w-3 text-muted" />
          版本回退
        </span>
      </div>

      {mode === "mock" ? (
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-4 flex w-full items-center gap-2 rounded-xl bg-warn/[0.07] px-3 py-2 text-left ring-1 ring-warn/25 transition hover:bg-warn/[0.12]"
        >
          <IconInfo className="h-3.5 w-3.5 shrink-0 text-warn" />
          <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-warn/90">
            当前为演示模式：将使用内置示例 Agent 生成。配置自己的 API Key 可接入真实模型。
          </span>
          <span className="shrink-0 text-[11px] font-medium text-warn">
            去配置 →
          </span>
        </button>
      ) : null}
    </div>
  );
}

export interface ResumeStateProps {
  name?: string;
  fileCount: number;
  versionCount: number;
  onSend: (prompt: string) => void;
}

export function ResumeState({
  name,
  fileCount,
  versionCount,
  onSend,
}: ResumeStateProps) {
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col items-center justify-center px-2 py-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ok/10 text-ok ring-1 ring-ok/25">
        <IconCheck className="h-5 w-5" />
      </div>
      <h2 className="mt-3 text-[16px] font-semibold tracking-tight text-fg">
        应用已生成，继续迭代吧
      </h2>
      <p className="mt-1.5 max-w-[330px] text-[12px] leading-relaxed text-muted">
        {name ? `「${name}」` : "当前应用"}包含 {fileCount} 个文件
        {versionCount > 0 ? `、${versionCount} 个版本` : ""}
        ，右侧可以实时预览。在下方描述修改，或试试：
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        {REFINE_IDEAS.slice(0, 3).map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => onSend(idea)}
            className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11.5px] text-muted ring-1 ring-white/10 transition hover:bg-accent/10 hover:text-accent-soft hover:ring-accent/40"
          >
            {idea}
          </button>
        ))}
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[10.5px] text-muted-2">
        <IconInfo className="h-3 w-3" />
        对话记录为空时也会保留当前应用与版本
      </p>
    </div>
  );
}
