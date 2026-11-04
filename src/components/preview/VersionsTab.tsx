"use client";

/**
 * Versions tab: every completed generation is stored as a restorable version.
 * OWNER: ui-preview.
 */

import { useMemo, useState } from "react";
import type { FileMap, Version } from "@/types";
import { Button } from "@/components/ui";
import { byteSize, cn, formatBytes, formatRelative } from "@/lib/utils";
import { IconCheck, IconHistory, IconRotate } from "./Icons";

export interface VersionsTabProps {
  versions: Version[];
  currentFiles: FileMap;
  onRestore: (version: Version) => void;
}

function filesSignature(files: FileMap): string {
  return Object.keys(files)
    .sort()
    .map((path) => `${path}:${(files[path] ?? "").length}`)
    .join("|");
}

function totalBytes(files: FileMap): number {
  return Object.values(files).reduce(
    (total, content) => total + byteSize(content ?? ""),
    0,
  );
}

export function VersionsTab({
  versions,
  currentFiles,
  onRestore,
}: VersionsTabProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const currentSignature = useMemo(
    () => filesSignature(currentFiles),
    [currentFiles],
  );
  const ordered = useMemo(() => [...versions].reverse(), [versions]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <IconHistory size={13} className="text-muted-2" />
        <span className="text-[12px] font-medium text-fg">版本历史</span>
        <span className="text-[11px] text-muted-2">
          {versions.length > 0 ? `${versions.length} 个版本` : "暂无版本"}
        </span>
        <span className="ml-auto hidden text-[10.5px] text-muted-2 sm:inline">
          每次生成自动保存
        </span>
      </div>

      {ordered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-2">
            <IconHistory size={18} />
          </div>
          <p className="text-[12.5px] font-medium text-muted">还没有版本记录</p>
          <p className="max-w-[300px] text-[11.5px] leading-relaxed text-muted-2">
            第一次生成完成后会自动创建 v1。之后每次修改都会保存一个新版本，可以随时恢复。
          </p>
        </div>
      ) : (
        <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2.5">
          {ordered.map((version) => {
            const isCurrent =
              version.files === currentFiles ||
              filesSignature(version.files) === currentSignature;
            const fileCount = Object.keys(version.files).length;
            const size = totalBytes(version.files);
            const title = version.plan?.name?.trim() || "应用快照";
            const confirming = confirmId === version.id;
            return (
              <div
                key={version.id}
                className={cn(
                  "rounded-xl border p-2.5 transition-colors",
                  isCurrent
                    ? "border-accent/30 bg-accent/[0.06]"
                    : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12]",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "flex h-7 min-w-[34px] shrink-0 items-center justify-center rounded-lg border px-1.5 font-mono text-[11px] font-semibold",
                      isCurrent
                        ? "border-accent/40 bg-accent/15 text-accent-soft"
                        : "border-white/[0.08] bg-white/[0.04] text-muted",
                    )}
                  >
                    {version.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-fg">
                        {title}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 truncate text-[10.5px] text-muted-2"
                      title={new Date(version.createdAt).toLocaleString("zh-CN")}
                    >
                      {formatRelative(version.createdAt)} · {fileCount} 个文件 ·{" "}
                      {formatBytes(size)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {isCurrent ? (
                      <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-accent-soft">
                        <IconCheck size={11} />
                        当前使用
                      </span>
                    ) : confirming ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="primary"
                          className="h-[26px] px-2 text-[11px]"
                          onClick={() => {
                            onRestore(version);
                            setConfirmId(null);
                          }}
                        >
                          确认恢复
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-[26px] px-1.5 text-[11px]"
                          onClick={() => setConfirmId(null)}
                        >
                          取消
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-[26px] gap-1 px-2 text-[11px]"
                        onClick={() => setConfirmId(version.id)}
                        title={`恢复到 ${version.label}`}
                      >
                        <IconRotate size={11} />
                        恢复
                      </Button>
                    )}
                  </div>
                </div>
                {confirming ? (
                  <p className="mt-2 rounded-lg bg-warn/[0.08] px-2 py-1.5 text-[10.5px] leading-relaxed text-warn">
                    恢复会用 {version.label} 覆盖当前预览，对话记录与历史版本都会保留。
                  </p>
                ) : null}
              </div>
            );
          })}
          <p className="px-0.5 pb-1 pt-0.5 text-center text-[10.5px] text-muted-2">
            恢复后可以继续告诉 Agent 如何修改
          </p>
        </div>
      )}
    </div>
  );
}
