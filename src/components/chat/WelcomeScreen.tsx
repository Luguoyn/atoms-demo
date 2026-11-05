"use client";

import { useMemo, useState, type ComponentType } from "react";
import { Logo } from "@/components/ui";
import { formatShortcut } from "@/lib/hotkeys";
import type { ServerMode } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  IconActivity,
  IconArrowUpRight,
  IconChart,
  IconCheck,
  IconClock,
  IconFile,
  IconFolder,
  IconGamepad,
  IconInfo,
  IconLayers,
  IconList,
  IconMonitor,
  IconPresentation,
  IconRefresh,
  IconShieldCheck,
  IconSparkles,
  IconTarget,
  IconWallet,
  IconZap,
  type IconProps,
} from "./icons";

export interface WelcomeScreenProps {
  mode: ServerMode;
  onSend: (prompt: string) => void;
  onOpenSettings: () => void;
  onEnhance: () => void;
  enhancing: boolean;
  hasDraft: boolean;
}

interface PromptIdea {
  id: string;
  title: string;
  desc: string;
  prompt: string;
  Icon: ComponentType<IconProps>;
  iconTone: string;
}

interface InspirationCategory {
  id: string;
  label: string;
  items: PromptIdea[];
}

const CATEGORIES: InspirationCategory[] = [
  {
    id: "productivity",
    label: "效率工具",
    items: [
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
        id: "habit",
        title: "习惯打卡",
        desc: "每日打卡 + 连续天数",
        prompt:
          "做一个习惯打卡应用：可添加多个习惯，每天点击打卡，展示连续打卡天数和本周完成率，支持删除习惯，数据保存在 localStorage。",
        Icon: IconTarget,
        iconTone: "bg-warn/10 text-warn ring-warn/25",
      },
      {
        id: "countdown",
        title: "倒计时工具",
        desc: "重要日期 + 进度提醒",
        prompt:
          "做一个倒计时工具应用：添加重要的日期事件，实时显示剩余天数、小时和分钟，支持编辑和删除事件，界面简洁有仪式感，数据保存在 localStorage。",
        Icon: IconZap,
        iconTone: "bg-accent/10 text-accent ring-accent/20",
      },
    ],
  },
  {
    id: "dashboard",
    label: "数据看板",
    items: [
      {
        id: "sales",
        title: "销售看板",
        desc: "业绩指标 + 趋势图",
        prompt:
          "做一个销售数据看板：展示本月销售额、订单数、客单价、转化率 4 个指标卡，配一条近 30 天趋势折线图和渠道占比图，数据用内置示例数据，支持切换时间范围。",
        Icon: IconChart,
        iconTone: "bg-warn/10 text-warn ring-warn/25",
      },
      {
        id: "health",
        title: "健康看板",
        desc: "体重/睡眠/运动追踪",
        prompt:
          "做一个个人健康看板：记录每日体重、睡眠时长和运动步数，展示本周趋势图和目标完成度，可以新增当天数据，数据保存在 localStorage。",
        Icon: IconActivity,
        iconTone: "bg-ok/10 text-ok ring-ok/25",
      },
      {
        id: "study",
        title: "学习进度",
        desc: "课程进度 + 番茄统计",
        prompt:
          "做一个学习进度追踪应用：维护学习计划列表，记录每门课程已学时长和完成进度条，展示本周学习时长柱状图，数据保存在 localStorage。",
        Icon: IconTarget,
        iconTone: "bg-accent/15 text-accent-soft ring-accent/25",
      },
      {
        id: "traffic",
        title: "流量看板",
        desc: "访问量 + 来源分布",
        prompt:
          "做一个网站流量看板：展示访问量、访客数、跳出率、平均停留时长 4 个指标，配趋势折线图和来源分类占比，数据为内置示例数据，风格现代简洁。",
        Icon: IconMonitor,
        iconTone: "bg-accent-2/10 text-accent-2 ring-accent-2/25",
      },
      {
        id: "project-progress",
        title: "项目进度",
        desc: "任务看板 + 完成率",
        prompt:
          "做一个项目进度看板：用看板列展示待办/进行中/已完成的任务卡片，支持拖动或按钮移动状态，顶部展示总体完成率和每个项目的进度条，数据保存在 localStorage。",
        Icon: IconLayers,
        iconTone: "bg-accent/10 text-accent ring-accent/20",
      },
    ],
  },
  {
    id: "games",
    label: "小游戏",
    items: [
      {
        id: "snake",
        title: "贪吃蛇",
        desc: "键盘操控 + 最高分",
        prompt:
          "做一个贪吃蛇小游戏：方向键或 WASD 控制，吃到食物加分变长，撞墙或撞到自己游戏结束，显示当前分数与历史最高分，最高分保存在 localStorage，支持重新开始。",
        Icon: IconGamepad,
        iconTone: "bg-accent/15 text-accent-soft ring-accent/25",
      },
      {
        id: "2048",
        title: "2048",
        desc: "数字合并 + 触屏支持",
        prompt:
          "做一个 2048 小游戏：方向键和移动端滑动都能操作，数字方块有颜色和动画，合并计分，显示最高分并保存在 localStorage，游戏结束可以重新开始。",
        Icon: IconSparkles,
        iconTone: "bg-accent-2/10 text-accent-2 ring-accent-2/25",
      },
      {
        id: "memory",
        title: "记忆翻牌",
        desc: "翻牌配对 + 计时",
        prompt:
          "做一个记忆翻牌小游戏：8 对卡片随机排列，点击翻开两张，配对成功保留，失败翻回，记录步数、用时和最佳成绩，最佳成绩保存在 localStorage。",
        Icon: IconList,
        iconTone: "bg-ok/10 text-ok ring-ok/25",
      },
      {
        id: "breakout",
        title: "打砖块",
        desc: "挡板控制 + 多关卡",
        prompt:
          "做一个打砖块小游戏：左右方向键或鼠标移动挡板反弹小球，击碎所有砖块过关，显示分数和生命值，小球和挡板用 canvas 绘制，支持重新开始。",
        Icon: IconGamepad,
        iconTone: "bg-warn/10 text-warn ring-warn/25",
      },
      {
        id: "guess",
        title: "猜数字",
        desc: "范围提示 + 次数记录",
        prompt:
          "做一个猜数字小游戏：系统随机生成 1-100 的数字，玩家输入猜测后提示偏大或偏小，记录尝试次数和最佳成绩，界面有趣味反馈动画，最佳成绩保存在 localStorage。",
        Icon: IconTarget,
        iconTone: "bg-accent/10 text-accent ring-accent/20",
      },
    ],
  },
  {
    id: "landing",
    label: "展示页",
    items: [
      {
        id: "portfolio",
        title: "个人作品集",
        desc: "项目展示 + 动效",
        prompt:
          "做一个个人作品集展示页：包含头像与简介、技能标签、3-6 个项目卡片（悬停有细腻动效）、联系方式，单页滚动布局，响应式，风格现代有设计感。",
        Icon: IconPresentation,
        iconTone: "bg-accent/15 text-accent-soft ring-accent/25",
      },
      {
        id: "product",
        title: "产品落地页",
        desc: "卖点 + 价格 + CTA",
        prompt:
          "做一个 SaaS 产品落地页：Hero 区、功能亮点、用户评价、价格方案（3 档）和底部 CTA，带平滑滚动与渐入动画，响应式，中文文案，视觉精致。",
        Icon: IconMonitor,
        iconTone: "bg-accent-2/10 text-accent-2 ring-accent-2/25",
      },
      {
        id: "event",
        title: "活动报名页",
        desc: "议程 + 报名表单",
        prompt:
          "做一个线下活动报名页：顶部分享活动信息与时间地点，中间是议程列表与嘉宾介绍，底部报名表单（姓名/邮箱/人数），提交后显示成功提示并保存在 localStorage。",
        Icon: IconArrowUpRight,
        iconTone: "bg-ok/10 text-ok ring-ok/25",
      },
      {
        id: "photo",
        title: "摄影作品集",
        desc: "瀑布流 + 大图预览",
        prompt:
          "做一个摄影作品集页面：瀑布流图片网格，点击图片弹出大图预览，支持切换上一张下一张，顶部有分类筛选，整体风格简洁留白，图片用内置渐变占位图。",
        Icon: IconFolder,
        iconTone: "bg-warn/10 text-warn ring-warn/25",
      },
      {
        id: "resume",
        title: "在线简历",
        desc: "经历 + 技能 + 下载",
        prompt:
          "做一个在线简历页面：包含个人信息、工作经历时间线、技能标签、项目亮点和联系方式，排版清晰专业，支持打印/导出 PDF 的样式，响应式适配手机。",
        Icon: IconFile,
        iconTone: "bg-accent/10 text-accent ring-accent/20",
      },
    ],
  },
];

/** Short, ready-to-send refinement prompts used by chips in chat + resume states. */
export const REFINE_IDEAS = [
  "换个更清爽的配色",
  "加一个深色模式",
  "补充数据统计",
  "优化移动端体验",
];

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic shuffle + subset so the initial render is stable, while 换一批 re-rolls. */
function pickBatch(items: PromptIdea[], seed: number): PromptIdea[] {
  const random = mulberry32(seed);
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }
  return pool.slice(0, Math.min(4, pool.length));
}

export function WelcomeScreen({
  mode,
  onSend,
  onOpenSettings,
  onEnhance,
  enhancing,
  hasDraft,
}: WelcomeScreenProps) {
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [seed, setSeed] = useState(20251107);

  const category =
    CATEGORIES.find((item) => item.id === categoryId) ?? CATEGORIES[0];
  const cards = useMemo(() => pickBatch(category.items, seed), [category, seed]);

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
        <p className="mt-2 max-w-[390px] text-[12.5px] leading-relaxed text-muted">
          描述你的需求，Agent 会先规划方案、再编写代码并自动校验，结果实时渲染在右侧预览里。
          选一个灵感开始，或直接在下方输入。
        </p>

        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onEnhance}
            disabled={enhancing}
            title="用 AI 把输入框里的想法扩写成更完整的需求"
            className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent-soft ring-1 ring-accent/25 transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enhancing ? (
              <span
                className="spinner"
                style={{ width: 11, height: 11, borderWidth: 1.5 }}
                aria-hidden
              />
            ) : (
              <IconSparkles className="h-3 w-3" />
            )}
            帮我扩写
          </button>
          <span className="text-[10.5px] text-muted-2">
            {hasDraft ? "把下方输入扩写成更完整的需求" : "先在下方输入一句想法"}
          </span>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="shrink-0 text-[11px] font-medium text-muted">
            灵感库
          </span>
          <div className="scroll-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategoryId(item.id)}
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] transition-colors",
                  item.id === category.id
                    ? "bg-accent/15 text-accent-soft ring-1 ring-accent/25"
                    : "text-muted-2 hover:bg-white/[0.05] hover:text-fg",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSeed(Math.floor(Math.random() * 1_000_000_000))}
            title="换一批灵感"
            className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] text-muted-2 transition hover:bg-white/[0.05] hover:text-fg"
          >
            <IconRefresh className="h-3 w-3" />
            换一批
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {cards.map(({ id, title, desc, prompt, Icon, iconTone }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSend(prompt)}
              className="group relative flex animate-fade-in flex-col items-start overflow-hidden rounded-xl bg-white/[0.025] p-3 text-left ring-1 ring-white/[0.07] transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.045] hover:ring-accent/40 hover:shadow-[0_14px_30px_-20px_rgba(139,92,246,0.7)]"
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

      <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10px] text-muted-2/80">
        <span className="inline-flex items-center gap-1">
          <kbd className="kbd">?</kbd>
          查看快捷键
        </span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">
          <kbd className="kbd">{formatShortcut("mod+k")}</kbd>
          聚焦输入框
        </span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">
          <kbd className="kbd">Enter</kbd>
          发送
        </span>
      </p>

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
