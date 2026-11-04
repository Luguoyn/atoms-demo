import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atoms Demo — 一句话生成可运行的应用",
  description:
    "Atoms Demo：由 AI Agent 驱动的应用生成器。描述你的想法，Agent 会分析需求、编写代码并实时生成可运行、可交互的网页应用。",
  applicationName: "Atoms Demo",
  keywords: ["AI", "App Builder", "Agent", "Vibe Coding", "Atoms"],
  authors: [{ name: "Atoms Demo" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07070c",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
