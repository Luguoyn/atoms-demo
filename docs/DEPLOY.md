# Atoms Demo — 部署与公网访问指南

> 目标：把 Atoms Demo 部署成**可公开访问的 HTTPS 链接**交给评测者。服务端无状态（数据都在浏览器 IndexedDB），因此 Vercel / Netlify / Render / Docker 都能直接跑。
> 部署前请先读 [README.md](../README.md) 的「本地运行」一节，确认 `npm run build` 本地可过。

## 0. 方案一览

| 方案 | 免费 | 适用场景 | 生成耗时上限 | 备注 |
|---|---|---|---|---|
| **Vercel（首选）** | ✅ Hobby | 正式在线演示链接 | Fluid Compute 默认 **300s** | Next.js 一等支持、自动 HTTPS、SSE 流式可用 |
| Netlify | ✅ | 备选在线演示 | 受 Functions 时长限制（免费档较紧） | 依赖 Netlify Next Runtime |
| Render | ✅（休眠） | 需要长连接/更宽松超时 | 可配置更长 | 免费实例空闲休眠，首次访问冷启动 |
| Docker / 自托管 | 自有 VPS | 内网/私有部署 | 自行配置 | 需要自己配 HTTPS 反向代理（SSE 要关 buffering） |
| cloudflared 快速隧道 | ✅ 无需账号 | 评审期临时链接、本地演示 | 取决于本机 | 每次启动 URL 变化，见第 6 节 |

**建议**：正式提交用 **Vercel**；评审期间如果来不及建仓库，用第 6 节的隧道脚本先给一个临时链接。

## 1. 部署前准备

1. **代码推到 GitHub 仓库**（公开或私有均可；`.env*`、`node_modules`、`.next` 已在 `.gitignore` 中）。
2. **确认 Node 版本**：`package.json` 要求 `node >= 20.9`，推荐 **Node 24**（与本地一致）。各平台可用 `NODE_VERSION=24` 固定。
3. **决定模型配置**：
   - 有模型 key：准备 `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY`（任意 OpenAI 兼容服务；已验证默认 **OpenCode Go + DeepSeek V4.1 Flash**，见下）。
   - 没有 key：**什么都不用配**，部署后自动进入 mock 演示模式（完整事件流 + 内置示例应用），评测者依然能走通全流程。
4. 平台构建命令统一为 **`npm run build`**，启动命令 **`npm run start`**（`next start -p 3000`）。

**已验证的模型配置（二选一）**

```bash
# A. OpenCode Go 网关（默认验证配置：reasoning + function calling + prompt cache 会话头）
LLM_BASE_URL=https://opencode.ai/inference/go/openai/v1
LLM_MODEL=deepseek-v4.1-flash
LLM_API_KEY=oc_sk_...
LLM_REASONING_EFFORT=low
LLM_CODING_MAX_TOKENS=24000
LLM_CODING_MAX_TOKENS_CAP=32000
LLM_TRUNCATION_RETRIES=2
LLM_PLAN_MAX_TOKENS=4000

# B. DeepSeek 直连（只改 3 个变量即可切换）
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
LLM_API_KEY=sk-...
```

### 环境变量清单

| 变量 | 必填 | 示例 | 说明 |
|---|---|---|---|
| `LLM_BASE_URL` | 否 | `https://api.deepseek.com` | OpenAI 兼容 API 根地址（不带 `/v1` 或带 `/v1` 取决于服务商；默认值见 `.env.example`） |
| `LLM_MODEL` | 否 | `deepseek-v4.1-flash` | 模型名 |
| `LLM_API_KEY` | 否 | `sk-...` / `oc_sk_...` | 服务端密钥；**留空 = mock 演示模式** |
| `MOCK_LLM` | 否 | `1` | 强制 mock（服务端不花 key；用户 BYOK 仍可用，适合公开演示） |
| `LLM_REASONING_EFFORT` | 否 | `low` | reasoning 模型基础预算：`low/medium/high/max`（客户端可用「质量档」覆盖；`minimal` 会被映射为 `low`，避免 reasoning 吃满预算零输出） |
| `LLM_CODING_MAX_TOKENS` | 否 | `24000` | 写代码单轮输出上限（1000–32000 clamp；reasoning 占一部分） |
| `LLM_CODING_MAX_TOKENS_CAP` | 否 | `32000` | 截断后自动重试时的输出预算上限（8000–32000 clamp） |
| `LLM_TRUNCATION_RETRIES` | 否 | `2` | 单次生成内「升预算重试」次数上限（0–4 clamp；0 = 关闭自动重试） |
| `LLM_PLAN_MAX_TOKENS` | 否 | `3000` | 规划单轮输出上限（500–16000 clamp） |
| `LLM_MAX_TOKENS` | 否 | `8000` | 无显式预算时的兜底输出上限（256–32000 clamp） |
| `LLM_USER_AGENT` / `LLM_EXTRA_HEADERS` | 否 | — | 自定义 UA / 额外请求头（网关识别、组织鉴权）；对 `opencode.ai` 端点自动附加 `x-opencode-session` |
| `AGENT_BUDGET_MS` | 否 | `300000` | 单次生成总预算（ms，clamp 30s–900s）。**平台函数上限只有 60s 时必须调低**（如 `55000`） |
| `LLM_REQUEST_TIMEOUT_MS` | 否 | `180000` | 单次模型请求超时（ms，clamp 15s–600s） |
| `LLM_IDLE_TIMEOUT_MS` | 否 | `60000` | 流式空闲超时（ms，clamp 10s–300s） |
| `RATE_LIMIT_PER_HOUR` | 否 | `12` | 服务端密钥模式：每 IP 每小时演示生成次数（公开演示保护） |
| `RATE_LIMIT_CONCURRENT` | 否 | `2` | 服务端密钥模式：并发生成上限，超过返回 429 + `Retry-After` |
| `PROMPT_ENHANCE_PER_HOUR` | 否 | `30` | 每 IP 每小时「帮我扩写」次数上限（独立配额） |
| `PROMPT_ENHANCE_MAX_TOKENS` | 否 | `2400` | 「帮我扩写」单次输出预算（800–4000 clamp） |

> 🔐 不要提交 `.env.local`、不要把 key 写进 README/截图；泄露后立刻轮换。BYOK（用户在设置里填的 key）只存在浏览器本地，不落盘。
> 💡 公开演示建议保留 `RATE_LIMIT_PER_HOUR` / `RATE_LIMIT_CONCURRENT` 默认值；界面会在设置弹窗展示剩余额度（`GET /api/status`），额度用尽提示用户 BYOK。

## 2. Vercel（推荐）

### 2.1 Dashboard 导入 GitHub（推荐给评审者）

1. 登录 <https://vercel.com>（Hobby 免费计划即可），**Add New → Project**。
2. **Import Git Repository**：选择 Atoms 的 GitHub 仓库；首次使用需授权 Vercel 访问 GitHub。
3. Configure Project：
   - **Framework Preset**：`Next.js`（自动识别，无需改动）
   - **Root Directory**：`./`（仓库根）
   - **Build Command**：默认 `next build`（等价 `npm run build`）
   - **Output Directory**：保持默认（**不要**填 `out`，本项目不是静态导出）
   - **Install Command**：默认 `npm install`（仓库有 `package-lock.json` 时 `npm ci` 也可以）
4. **Environment Variables**：逐条添加下表变量（Environment 选 Production + Preview，按需）：
   - `LLM_BASE_URL` = `https://opencode.ai/inference/go/openai/v1`（或用 DeepSeek 直连 `https://api.deepseek.com`）
   - `LLM_MODEL` = `deepseek-v4.1-flash`（或 `deepseek-chat`）
   - `LLM_API_KEY` = 你的 key（可不配，见 mock 模式）
   - （可选）`LLM_REASONING_EFFORT` = `low`、`RATE_LIMIT_PER_HOUR` = `12`、`RATE_LIMIT_CONCURRENT` = `2`
   - （可选）`MOCK_LLM` = `1` 强制演示模式
5. **Deploy**，等待构建完成，得到 `https://<project>.vercel.app`。

### 2.2 命令行方式（可选）

本仓库未内置 Vercel CLI，可用 npx 临时调用（需要浏览器登录一次）：

```bash
npx vercel login          # 按提示在浏览器授权
npx vercel link           # 关联/创建项目
npx vercel env add LLM_API_KEY production   # 按提示粘贴 key，其他变量同理
npx vercel --prod         # 部署到生产环境
```

### 2.3 关键配置与注意事项

- **函数时长在路由文件里声明**：`src/app/api/chat/route.ts` 顶部有
  ```ts
  export const runtime = "nodejs";
  export const dynamic = "force-dynamic";
  export const maxDuration = 300;
  ```
  生成链路耗时较长（本机真实模型实测一次 **41s / 57s**），需要较长的函数时长。依据：[Vercel 函数最大时长文档](https://vercel.com/docs/functions/configuring-functions/duration)。
- **⚠️ Hobby 计划的 60s 坑**：Vercel Hobby 的函数上限按项目是否启用 Fluid Compute 而不同（官方文档新口径为 300s，但**未启用 Fluid Compute 的账户/旧项目仍是 60s**，以 Project → Settings → Functions 显示为准）。`maxDuration = 300` 只是"允许的最大值"，**平台实际仍可能在 60s 处杀掉请求**，表现为生成到一半断流。
  - 应对：Hobby 下把 `AGENT_BUDGET_MS` 设到 **≤ 55000**（让 Agent 在平台杀请求前主动收尾），或升级 Pro / 自托管 / 用 Render；
  - 服务端预算默认 `AGENT_BUDGET_MS=300000`，真实生成通常 40~60s，预算调低后仍能完成多数生成，只是复杂需求会被截断为"未完成"而不是被平台 kill。
- **SSE 已在路由里配置**：`Content-Type: text/event-stream; charset=utf-8`、`Cache-Control: no-cache, no-transform`、`Connection: keep-alive`、`X-Accel-Buffering: no`（最后一条就是防代理缓冲的关键），Vercel 支持 Route Handler 流式响应，无需额外配置。
- **`vercel.json` 已提供**（仓库根）：只做 `framework: "nextjs"` 的显式声明，**没有** `routes`/`rewrites` 覆盖 App Router，也没有静态导出。
- **不要用 `output: "export"` 静态导出**：`/api/chat`、`/api/config` 需要 Node.js Route Handler 运行时。
- **改环境变量后必须 Redeploy** 才会生效（Deployments → ⋯ → Redeploy）。
- 区域：默认 iad1（美东），国内访问较慢；可在 Project → Settings → Functions → Region 选离用户更近的区域（视套餐可用性）。
- 自定义域名：Settings → Domains，绑定后自动签发 HTTPS 证书。

### 2.4 部署后验证

```bash
# 1) 能力探测（应返回 JSON；没有 key 时 mockMode=true）
curl -s https://<project>.vercel.app/api/config

# 2) 服务端状态与配额（mode/model/quota/rateLimits/version）
curl -s https://<project>.vercel.app/api/status

# 3) 用冒烟脚本打线上（有 key 时默认只测 config/status，不消耗 token）
node scripts/smoke.mjs --base https://<project>.vercel.app

# 4) 浏览器打开站点，点示例 prompt 走一次完整生成；
#    再验证：代码 tab / 版本 diff / 全屏 / 快捷键面板 / 设置里的剩余额度
```

## 3. Netlify

Netlify 通过官方 **Next.js Runtime** 支持 App Router（自动检测，无需手动装构建插件）。

1. <https://app.netlify.com> → **Add new site → Import an existing project** → 选 GitHub 仓库。
2. 构建设置保持默认即可（Next.js 自动）：Build command `npm run build`，Publish directory 会被插件自动接管。
3. **Site configuration → Environment variables** 添加 `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY`（或 `MOCK_LLM=1`）。
4. **Deploy site**，得到 `https://<site>.netlify.app`。

可选 `netlify.toml`（仓库目前未内置；如需要可放在根目录）：

```toml
[build]
  command = "npm run build"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

注意事项：

- Netlify Functions 的**执行时长上限**比 Vercel 紧（免费档同步函数约 10s 级），一次真实生成（几十秒）可能被截断。若必须用 Netlify，建议：
  - 演示时设置 `MOCK_LLM=1`（mock 生成约 10~20s 内完成，仍可能逼近上限）；
  - 或升级计划放宽函数超时；
  - 或选 Vercel / Render 作为主链接。
- `index.html` 预览在浏览器 iframe 中运行，不依赖 Netlify 的静态托管能力。

## 4. Render

1. <https://dashboard.render.com> → **New → Web Service** → 连接 GitHub 仓库。
2. 配置：
   - **Runtime**：`Node`
   - **Build Command**：`npm install && npm run build`
   - **Start Command**：`npm run start`
   - **Health Check Path**：`/api/status`
   - **Environment Variables**：`NODE_VERSION=24`、`LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY`（可省略 → mock）、`RATE_LIMIT_PER_HOUR`、`RATE_LIMIT_CONCURRENT`
3. 创建后等待首次部署，得到 `https://<service>.onrender.com`（自动 HTTPS）。

注意事项：

- 免费实例**空闲 15 分钟休眠**，冷启动首次访问约 20~60s，评测前可先访问一次「预热」。
- Render 允许较长请求时长，SSE 可用；如果生成被代理截断，确认未启用会缓冲响应的 CDN 层。
- 免费实例内存较小，Next.js 生产构建 + 运行通常够用；如构建 OOM 可升级实例。

## 5. Docker / 自托管

仓库当前**没有** `Dockerfile`（按团队约定只加必要文件）。需要容器化时，用下面这份可直接跑通的配置：

```dockerfile
# Dockerfile（放在仓库根目录）
FROM node:24-alpine

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 先装依赖（构建需要 devDependencies，所以不加 --omit=dev）
COPY package*.json ./
RUN npm install

# 再拷贝源码并构建
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start"]
```

构建与运行：

```bash
docker build -t atoms-demo .
docker run -d --name atoms-demo -p 3000:3000 \
  -e LLM_BASE_URL=https://api.deepseek.com \
  -e LLM_MODEL=deepseek-chat \
  -e LLM_API_KEY=sk-xxxx \
  atoms-demo
# 或不把 key 写进命令行，用 env 文件（.env.local 已被 gitignore）：
docker run -d --name atoms-demo -p 3000:3000 --env-file .env.local atoms-demo
```

`docker-compose.yml` 可用：

```yaml
services:
  web:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env.local   # 没有就删掉这两行，自动 mock 演示模式
    restart: unless-stopped
```

不自建镜像时的裸机方式：

```bash
npm ci            # 没有 package-lock.json 时用 npm install
npm run build
npm run start     # http://0.0.0.0:3000（next start -p 3000）
```

**反向代理（SSE 关键）**：Nginx 默认会缓冲响应，必须关掉，否则生成过程会“憋到最后一次性出现”甚至超时。示例：

```nginx
location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Host $host;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_set_header   Connection "";
    proxy_buffering    off;          # ← SSE 必须
    proxy_read_timeout 330s;         # ← 大于 AGENT_BUDGET_MS（默认 300s）
}
```

## 6. 评审期临时公网链接（cloudflared quick tunnel，无需账号）

本机没有 vercel/netlify/cloudflared/ngrok CLI，仓库内置了 `scripts/tunnel.ps1` 封装 **Cloudflare Quick Tunnel**：无需注册、无需域名，直接得到一个临时 HTTPS 链接。

> 📎 **当前公开演示实例（2026-11-05）**：
> - **Vercel 正式部署（首选）**：<https://atoms-demo-wine.vercel.app>（GitHub 仓库 `Luguoyn/atoms-demo` 自动部署；Hobby 计划；环境变量在 Vercel Project → Settings → Environment Variables 配置；每次 push 到 `main` 自动重新部署）。
> - 备用临时隧道：<https://powered-mailman-kitty-keywords.trycloudflare.com>（指向本机 `3200` 生产构建实例；quick tunnel 进程/本机网络中断即失效，重启后 URL 会变化）。

### 6.1 使用（PowerShell，Windows）

**评审口径：用生产构建起服务，再把隧道指向生产端口（3100/3200）**，外部评测者首屏不用等 dev 编译：

```powershell
# 1) 生产构建 + 在 3100 端口起生产服务（dev server 仅本地开发用）
npm run build
npm start -p 3100            # 或 npx next start -p 3100（若上面的端口没生效，用这条最稳）
#   说明：package.json 的 start 脚本是 "next start -p 3000"，多传的 -p 3100 通常覆盖前者；
#   若实际仍监听 3000，请直接用 npx next start -p 3100。

# 2) 起隧道，端口必须和上面一致
powershell -ExecutionPolicy Bypass -File scripts\tunnel.ps1 -Port 3100 -Detach
# 有 PowerShell 7 时也可以用：pwsh -File scripts\tunnel.ps1 -Port 3100 -Detach

# 3) 查看 / 停止
powershell -ExecutionPolicy Bypass -File scripts\tunnel.ps1 -Status
powershell -ExecutionPolicy Bypass -File scripts\tunnel.ps1 -Stop
```

> 本地开发仍用 `npm run dev`（3000 端口）即可；给外部看的链接不要指向 dev server（首屏编译慢且不稳定）。
> 隧道脚本只负责链路：**不会**自己启动/停掉 dev 或生产服务。

脚本行为：

- 首次运行自动下载 `cloudflared-windows-amd64.exe` 到 `tools/cloudflared.exe`（GitHub 直连不通时自动切换镜像源），校验体积与 `--version`；
- 启动前检查 `-Port`（默认 3000，可传 3100 等任意本地端口）是否有服务在监听，**不会**自己启动/停掉任何服务；端口未就绪可以 `-WaitForPort 60` 等待；
- 输出公网 URL 并写入 `tools/tunnel-url.txt` / `tools/tunnel-state.json`（**URL 不写死在任何文件里**，每次启动都会变）；
- 可重复执行：已有存活隧道会直接复用并打印 URL（端口不同会提示重启），`-Force` 强制重启；
- `-Provider cloudflared|localtunnel|localhostrun` 可指定方案，`auto` 会按顺序回退；`-Protocol http2`（默认，受限网络比 quic 稳）。

> ⚠️ **dev 和 prod 不要同时跑在同一份 `.next` 上**：`next dev` 与 `next start` 共用项目里的 `.next` 目录，同时运行可能互相覆盖构建产物。生产模式演示时先停 dev server，再 `npm run build` + `npx next start -p 3100`；隧道脚本只负责链路，不负责启停服务。

### 6.2 本机实测记录（2026-11-04）

| 项目 | 结果 |
|---|---|
| cloudflared 下载 | ✅ GitHub 直连被 reset，改走 `ghfast.top` 镜像成功；`cloudflared version 2026.10.7`，52.8 MB |
| quick tunnel 建立 | ✅ 约 10s 内打印 `https://<random>.trycloudflare.com`，日志显示 `Registered tunnel connection`，连通性预检全 PASS |
| 公网可达性 | ✅ `curl` 公网 URL 返回 **200**（DNS 首次生效约 3~60s 不等，第二次实测约 40~60s；脚本会重试探测，首次探测为 warn 属正常） |
| 复用 / 状态 / 停止 | ✅ `-Detach` 进程跨命令驻留；重复执行复用同一 URL；`-Stop` 后进程与状态文件均清理 |
| 端口未就绪 | ✅ 直接报错并退出码 2（提示先启动 dev server） |
| SSE 经隧道 | ✅ `node scripts/smoke.mjs --base https://<tunnel>` 全绿（mock 生成 ~6.6s、54 段流式、事件顺序/产物断言通过）。**注意：Cloudflare 会剥离 `X-Accel-Buffering` 响应头**，smoke 对远程地址把该头缺失降级为警告，并以「事件是否流式到达」断言兜底；本地直连仍为硬断言 |
| 公网生产验证（2026-11-05） | ✅ 生产构建 + 真实模型（deepseek-v4.1-flash）+ quick tunnel：`smoke.mjs --base https://<tunnel> --allow-real` **61 项检查通过 / 0 失败**（真实生成 81.6s、55 段流式、`usage` 事件 prompt=26,167 / cached=14,080（54%）/ completion=14,551 / reasoning=6,200）；首页/静态资源/`/api/status` 均正常 |
| 备选方案 | `npx localtunnel`（npm registry 可访问）与 `ssh -R 80:127.0.0.1:3000 nokey@localhost.run`（本机 22 端口可达）均可用，作为 cloudflared 失败时的回退 |

> 实测时隧道目标为生产构建端口（3100/3200），机制验证后对 `-Port` 任意本地端口生效。

### 6.3 注意事项

- **URL 每次重启都会变化**，适合评审期临时交付；长期演示请用正式部署（Vercel/Render）。
- **隧道依赖本机进程常驻**：机器睡眠/关机、网络切换、进程被杀都会导致链接失效；重新执行脚本会拿到**新的 URL**，记得同步更新 README / 提交文档里的「在线演示」链接。可用 `-Status` 随时检查、`-Stop` 关闭。
- quick tunnel 公网可访问且本项目无鉴权：**只用于评审，用完 `-Stop`**；不要用它承载敏感数据。
- 少部分网络环境下 `*.trycloudflare.com` 可能需要几秒生效；首次打不开可等 10s 再试或重新执行脚本。
- 对外发布链接前请先与项目负责人确认。

## 7. 发布前检查清单

- [ ] `npm run typecheck` 无错误
- [ ] `npm run build` 成功
- [ ] 本地 3000 端口一次完整生成（mock 或真实）→ 预览有内容 → 刷新后项目/消息/版本仍在
- [ ] 线上 `/api/config` 返回正确：有 key → `hasServerKey=true, mockMode=false`；无 key → `mockMode=true`
- [ ] 线上完成一次生成，iframe 预览正常（无外链、无白屏）
- [ ] 分享链接（`#share=...`）在无痕窗口打开可用
- [ ] 移动端 390px 宽度布局可用
- [ ] 浏览器控制台无报错；生成失败时 UI 有明确错误提示
- [ ] 仓库中无 `.env.local`、无 key、无 `node_modules/.next` 等构建产物（`/tools/` 与 `/screenshots/*.png` 已被 gitignore，提交前仍建议 `git status` 复核）

## 8. 常见坑速查

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 页面 404 / 构建后只有静态页 | Vercel 输出目录填了 `out`，或 `next.config` 开了静态导出 | 输出目录保持默认，删除 `output: "export"` |
| `/api/chat` 返回 500 | 环境变量未生效（改完没 Redeploy）或 key 无效 | Redeploy；本地 `.env.local` 用同样变量验证 |
| 生成到一半被截断 | 平台函数时长限制（Netlify 免费档 / 未开 Fluid 的 Vercel） | 提高 `maxDuration`/升级计划；或用 mock 模式演示 |
| 线上「演示模式」但本地有 key | 线上没配 `LLM_API_KEY`，或配的是 Preview 环境而访问的是 Production | 在正确的 Environment 添加变量后 Redeploy |
| 评测者看到 429「额度已用完」 | 公开演示按 IP 限流（默认 12 次/小时），多人/多次试用会触发 | 属预期保护；提示评测者填自己的 key（BYOK）或等重置；可调 `RATE_LIMIT_PER_HOUR` |
| 多实例下 429 计数不共享 | 限流是**进程内存**实现，多实例/serverless 各自计数 | 演示用单实例即可；需要严格全局限流时接 Redis 等共享存储 |
| `/api/status` 显示 `mode: server-key` 但设置里显示 BYOK | BYOK 是客户端设置，`/api/status` 是服务端视角（无 BYOK 上下文） | 属预期；客户端在请求体里带 `provider` 即走 BYOK |
| usage 显示缓存命中为 0 | 上游未返回缓存字段 / 首次请求无缓存 / 非 OpenCode Go 网关 | 属正常；见 PRODUCT.md §8.4 的命中条件 |
| 生成过程没有流式效果 | 反向代理/网关缓冲了响应 | Nginx `proxy_buffering off`；不要加会缓冲的 CDN 规则；用 `smoke.mjs` 的「事件为流式到达」断言确认 |
| 线上/隧道测 SSE 缺少 `X-Accel-Buffering` 头 | Cloudflare 等 CDN 会剥离该响应头（本地 route 已设置） | 属正常现象；以事件是否分段到达为准（`smoke.mjs` 远程地址对该头缺失只告警） |
| 刚起隧道时公网 502 | 隧道已建立但本地服务未就绪，或本地服务正在重启 | 确认 `-Port` 对应服务在监听；重启本地服务后等几秒再试 |
| 刷新后项目消失 | 浏览器隐私模式 / 禁用了 IndexedDB / 换了浏览器 | 用普通窗口访问；数据本来就只存本地 |
| 预览空白但生成成功 | 生成物引用了外部资源或 JS 报错 | 用预览面板「控制台」看错误；重新对话修复 |
| 预览内应用数据刷新后不保留 | 预览 iframe 为 sandbox（无 `allow-same-origin`），生成物的 localStorage 被垫片为内存 | 设计如此（隔离生成物与宿主数据）；「在新窗口打开」或导出后运行可真实持久化 |
| 隧道链接 502/530 | cloudflared 进程没起来或被防火墙拦截 | `-Status` 查看；重跑脚本，注意 `http2` 协议；公司网络放行 443 |
| 隧道公网域名解析失败（DNS NXDOMAIN） | quick tunnel 域名刚生成、DNS 尚未生效 | 等 10~60s 重试；脚本探测失败不一定代表不可用，直接用 `curl` 确认 |
| 移动端布局错乱 | 生成物本身未响应式 | 预览切到手机视口，让 Agent 修复「移动端适配」 |
