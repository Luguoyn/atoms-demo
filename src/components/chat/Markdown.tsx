"use client";

/**
 * Minimal, safe markdown renderer for assistant copy.
 * Parses a small subset (paragraphs, headings, lists, quotes, rules, fenced code,
 * bold / inline code / links) into React nodes — never injects raw HTML.
 */

import { useState, type ReactNode } from "react";
import { cn, copyText } from "@/lib/utils";

export interface MarkdownProps {
  text: string;
  className?: string;
}

type Block =
  | { kind: "code"; lang: string; code: string }
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "paragraph"; text: string };

const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const UNORDERED_RE = /^\s*[-*•]\s+(.+)$/;
const ORDERED_RE = /^\s*\d{1,3}[.)]\s+(.+)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const RULE_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const LINK_RE = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
const INLINE_RE =
  /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^\s)]+\))/g;

function isFence(line: string): boolean {
  return line.trim().startsWith("```");
}

function isBlockStart(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return (
    isFence(trimmed) ||
    HEADING_RE.test(line) ||
    RULE_RE.test(line) ||
    QUOTE_RE.test(line) ||
    UNORDERED_RE.test(line) ||
    ORDERED_RE.test(line)
  );
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (isFence(line)) {
      const lang = trimmed.slice(3).trim().split(/\s+/)[0] ?? "";
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !isFence(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1; // closing fence
      blocks.push({ kind: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = (heading[1].length >= 3 ? 3 : heading[1].length) as 1 | 2 | 3;
      blocks.push({ kind: "heading", level, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (RULE_RE.test(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const match = QUOTE_RE.exec(lines[index]);
        if (!match) break;
        quoteLines.push(match[1]);
        index += 1;
      }
      blocks.push({ kind: "quote", text: quoteLines.join("\n") });
      continue;
    }

    const unordered = UNORDERED_RE.exec(line);
    const ordered = ORDERED_RE.exec(line);
    if (unordered || ordered) {
      const isOrdered = !unordered;
      const items: string[] = [];
      while (index < lines.length) {
        const match = isOrdered
          ? ORDERED_RE.exec(lines[index])
          : UNORDERED_RE.exec(lines[index]);
        if (!match) break;
        items.push(match[1]);
        index += 1;
      }
      blocks.push({ kind: "list", ordered: isOrdered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !isBlockStart(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    if (paragraphLines.length === 0) {
      // Safety valve: never loop forever on an unexpected construct.
      index += 1;
      continue;
    }
    blocks.push({ kind: "paragraph", text: paragraphLines.join("\n") });
  }

  return blocks;
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let counter = 0;
  INLINE_RE.lastIndex = 0;

  let match = INLINE_RE.exec(text);
  while (match) {
    const token = match[0];
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const key = `${keyBase}-i${counter}`;
    counter += 1;

    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-fg">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else {
      const link = LINK_RE.exec(token);
      if (link) {
        nodes.push(
          <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }

    lastIndex = match.index + token.length;
    match = INLINE_RE.exec(text);
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderBlock(block: Block, index: number): ReactNode {
  const key = `block-${index}`;

  switch (block.kind) {
    case "code":
      return <CodeBlock key={key} code={block.code} />;
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3";
      return <Tag key={key}>{renderInline(block.text, key)}</Tag>;
    }
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag key={key}>
          {block.items.map((item, itemIndex) => {
            const itemKey = `${key}-${itemIndex}`;
            return <li key={itemKey}>{renderInline(item, itemKey)}</li>;
          })}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote key={key} className="whitespace-pre-line">
          {renderInline(block.text, key)}
        </blockquote>
      );
    case "rule":
      return <div key={key} className="divider my-3" />;
    case "paragraph":
      return (
        <p key={key} className="whitespace-pre-line">
          {renderInline(block.text, key)}
        </p>
      );
    default:
      return null;
  }
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyText(code);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          void handleCopy();
        }}
        className="absolute right-2 top-2 z-10 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-[10px] text-muted-2 ring-1 ring-white/10 backdrop-blur transition-colors hover:text-fg"
        aria-label="复制代码"
      >
        {copied ? "已复制" : "复制"}
      </button>
      <pre>
        <code>{code.replace(/\n$/, "")}</code>
      </pre>
    </div>
  );
}

export function Markdown({ text, className }: MarkdownProps) {
  if (!text) return null;
  const blocks = parseBlocks(text);
  return (
    <div className={cn("md-body", className)}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}
