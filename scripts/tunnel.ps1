#Requires -Version 5.1
<#
.SYNOPSIS
  把本地 Atoms Demo 暴露成公网 HTTPS 链接（无需付费账号）。

.DESCRIPTION
  默认顺序（-Provider auto）：
    1. cloudflared quick tunnel  —— 首选。自动下载 windows-amd64 到 tools/cloudflared.exe，
       输出 https://<random>.trycloudflare.com，无需 Cloudflare 账号和域名。
    2. npx localtunnel            —— 备选。输出 https://<random>.loca.lt（访客首次会看到
                                     “Tunnel Password” 页，密码是本机公网 IP，见 docs/DEPLOY.md）。
    3. ssh localhost.run          —— 备选。输出 https://<random>.lhr.life（依赖本机 OpenSSH）。

  脚本可重复执行：已有存活隧道时直接复用并打印 URL；-Force 强制重开；-Stop 关闭。
  隧道 URL 每次启动都会变化，脚本会把结果写到 tools/tunnel-url.txt / tools/tunnel-state.json，
  不会把任何 URL 写死在代码里。

.PARAMETER Port
  本地端口，默认 3000（Next.js dev server）。

.PARAMETER Provider
  auto（默认）/ cloudflared / localtunnel / localhostrun。

.PARAMETER Protocol
  cloudflared 隧道协议，默认 http2（在受限网络下比 quic 稳）。

.PARAMETER Detach
  后台运行并立刻返回（默认前台运行，Ctrl+C 结束）。自动化/agent 请用这个。

.PARAMETER Stop
  停掉当前隧道并清理状态文件。

.PARAMETER Status
  只打印当前隧道状态。

.PARAMETER Force
  已有存活隧道时也强制重启。

.PARAMETER WaitForPort
  端口还没就绪时最多等待多少秒（默认 0 = 不等，直接报错）。

.PARAMETER SkipPortCheck
  跳过本地端口检查（排障用）。

.PARAMETER ReadyTimeoutSec
  等待公网 URL 出现的超时（默认 90 秒）。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\tunnel.ps1 -Detach
  # => 打印 https://xxxx.trycloudflare.com 并退出，隧道保持运行

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\tunnel.ps1 -Status
  powershell -ExecutionPolicy Bypass -File scripts\tunnel.ps1 -Stop

.NOTES
  - 需要本机已启动 dev server（npm run dev），本脚本不会去启动它。
  - 对外发布链接（发给评测者等）前请先得到项目负责人确认。
#>
[CmdletBinding()]
param(
    [int]$Port = 3000,
    [ValidateSet('auto', 'cloudflared', 'localtunnel', 'localhostrun')]
    [string]$Provider = 'auto',
    [ValidateSet('auto', 'http2', 'quic')]
    [string]$Protocol = 'http2',
    [switch]$Detach,
    [switch]$Stop,
    [switch]$Status,
    [switch]$Force,
    [int]$WaitForPort = 0,
    [switch]$SkipPortCheck,
    [int]$ReadyTimeoutSec = 90
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ---------------------------------------------------------------- 路径与常量

$Script:RepoRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$Script:ToolsDir = Join-Path $RepoRoot 'tools'
$Script:LogDir = Join-Path $ToolsDir 'logs'
$Script:StatePath = Join-Path $ToolsDir 'tunnel-state.json'
$Script:UrlPath = Join-Path $ToolsDir 'tunnel-url.txt'
$Script:CloudflaredPath = Join-Path $ToolsDir 'cloudflared.exe'
$Script:CloudflaredDownloadUrls = @(
    'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
    'https://ghfast.top/https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
    'https://gh-proxy.com/https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
)

function Write-Info([string]$Message) { Write-Host "  $Message" }
function Write-Step([string]$Message) { Write-Host "  -> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "  [ok] $Message" -ForegroundColor Green }
function Write-Warn2([string]$Message) { Write-Host "  [warn] $Message" -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host "  [error] $Message" -ForegroundColor Red }

function Ensure-ToolsDir {
    if (-not (Test-Path -LiteralPath $ToolsDir)) {
        New-Item -ItemType Directory -Path $ToolsDir -Force | Out-Null
    }
    if (-not (Test-Path -LiteralPath $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
}

function Get-LogPath([string]$Name) {
    return (Join-Path $LogDir ("$Name-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log'))
}

# ---------------------------------------------------------------- 进程与端口

function Test-PortOpen([int]$TargetPort) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync('127.0.0.1', $TargetPort)
        if (-not $task.Wait(1500)) { return $false }
        return $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Wait-PortOpen([int]$TargetPort, [int]$TimeoutSec) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortOpen -TargetPort $TargetPort) { return $true }
        Start-Sleep -Milliseconds 750
    }
    return (Test-PortOpen -TargetPort $TargetPort)
}

# 返回 HTTP 状态码（连不上返回 $null）。用于确认本地服务和公网 URL 真的能响应。
function Get-HttpStatus([string]$Url, [int]$TimeoutSec = 10) {
    $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time $TimeoutSec -L $Url 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    $text = ("$code").Trim()
    if ($text -match '^\d{3}$') { return [int]$text }
    return $null
}

function Test-PublicUrl([string]$Url) {
    $last = $null
    for ($i = 1; $i -le 12; $i++) {
        $status = Get-HttpStatus -Url $Url -TimeoutSec 10
        $last = $status
        if ($null -ne $status -and $status -ge 200 -and $status -lt 400) {
            return @{ Ok = $true; Status = $status }
        }
        if ($null -ne $status) {
            Write-Info "  第 $i 次探测：HTTP $status（公网还在生效，继续等）"
        }
        else {
            Write-Info "  第 $i 次探测：暂无响应（DNS/边缘生效中，继续等）"
        }
        Start-Sleep -Seconds 3
    }
    return @{ Ok = $false; Status = $last }
}

# ---------------------------------------------------------------- 状态文件

function Read-State {
    if (-not (Test-Path -LiteralPath $StatePath)) { return $null }
    try {
        $raw = Get-Content -LiteralPath $StatePath -Raw -ErrorAction Stop
        if (-not $raw) { return $null }
        return ($raw | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function Test-StateProcessAlive($State) {
    if ($null -eq $State -or -not $State.pid) { return $false }
    $proc = Get-Process -Id ([int]$State.pid) -ErrorAction SilentlyContinue
    return ($null -ne $proc)
}

function Save-State([string]$ProviderName, [string]$Url, [int]$ProcessId, [int]$LocalPort, [string]$LogPath) {
    Ensure-ToolsDir
    $payload = [ordered]@{
        provider  = $ProviderName
        url       = $Url
        pid       = $ProcessId
        port      = $LocalPort
        log       = $LogPath
        startedAt = (Get-Date).ToString('o')
    }
    ($payload | ConvertTo-Json) | Set-Content -LiteralPath $StatePath -Encoding utf8
    $Url | Set-Content -LiteralPath $UrlPath -Encoding utf8
}

function Clear-State {
    foreach ($path in @($StatePath, $UrlPath)) {
        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
        }
    }
}

function Stop-ExistingTunnel {
    $state = Read-State
    if ($null -eq $state) {
        Write-Info '当前没有已记录的隧道。'
        Clear-State
        return $false
    }
    $killed = $false
    if (Test-StateProcessAlive $state) {
        Write-Step "停止隧道进程 pid=$($state.pid)（$($state.provider)）"
        # /T 结束子进程树（localtunnel 是 npx 子进程；ssh 是子进程）
        & taskkill.exe /PID ([int]$state.pid) /T /F 2>&1 | Out-Null
        Start-Sleep -Milliseconds 500
        $killed = $true
        Write-Ok '已停止'
    }
    else {
        Write-Info "记录中的隧道进程已不存在（pid=$($state.pid)），清理状态文件。"
    }
    Clear-State
    return $killed
}

function Show-State {
    Ensure-ToolsDir
    $state = Read-State
    if ($null -eq $state) {
        Write-Info '当前没有隧道记录（tools/tunnel-state.json 不存在）。'
        return
    }
    $alive = Test-StateProcessAlive $state
    Write-Info "provider : $($state.provider)"
    Write-Info "url      : $($state.url)"
    Write-Info "local    : http://127.0.0.1:$($state.port)"
    Write-Info "pid      : $($state.pid)（$(if ($alive) { '运行中' } else { '已退出/失效' })）"
    Write-Info "log      : $($state.log)"
    Write-Info "started  : $($state.startedAt)"
}

# ---------------------------------------------------------------- cloudflared

function Get-CloudflaredBinary {
    if ($env:CLOUDFLARED_EXE -and (Test-Path -LiteralPath $env:CLOUDFLARED_EXE)) {
        return $env:CLOUDFLARED_EXE
    }
    if (Test-Path -LiteralPath $CloudflaredPath) {
        $size = (Get-Item -LiteralPath $CloudflaredPath).Length
        if ($size -gt 10MB) { return $CloudflaredPath }
        Write-Warn2 "tools/cloudflared.exe 体积异常（$size B），重新下载。"
        Remove-Item -LiteralPath $CloudflaredPath -Force -ErrorAction SilentlyContinue
    }
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return (Install-Cloudflared)
}

function Install-Cloudflared {
    Ensure-ToolsDir
    $tmp = "$CloudflaredPath.download"
    foreach ($url in $CloudflaredDownloadUrls) {
        Write-Step "下载 cloudflared：$url"
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
        & curl.exe -L --fail --retry 2 --retry-delay 2 --max-time 600 -o $tmp $url 2>$null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $tmp)) {
            Write-Warn2 "下载失败（exit=$LASTEXITCODE），换下一个源。"
            continue
        }
        $size = (Get-Item -LiteralPath $tmp).Length
        if ($size -lt 10MB) {
            Write-Warn2 "下载文件只有 $size B，不像 cloudflared，换下一个源。"
            Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
            continue
        }
        Move-Item -LiteralPath $tmp -Destination $CloudflaredPath -Force
        $version = (& $CloudflaredPath --version 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or -not ($version -match 'cloudflared version')) {
            Write-Warn2 "二进制无法运行：$version"
            Remove-Item -LiteralPath $CloudflaredPath -Force -ErrorAction SilentlyContinue
            continue
        }
        Write-Ok "已安装 tools/cloudflared.exe（$(Get-Item -LiteralPath $CloudflaredPath).Length / $version）"
        return $CloudflaredPath
    }
    Write-Fail 'cloudflared 下载失败（GitHub 与镜像均不可用）。可手动下载到 tools/cloudflared.exe，或改用 -Provider localtunnel / localhostrun。'
    return $null
}

function Start-CloudflaredTunnel {
    $bin = Get-CloudflaredBinary
    if (-not $bin) { return $null }

    $log = Get-LogPath 'cloudflared'
    $errLog = "$log.err"
    $localUrl = "http://127.0.0.1:$Port"
    $argList = @('tunnel', '--url', $localUrl, '--no-autoupdate', '--logfile', $log)
    if ($Protocol -ne 'auto') { $argList += @('--protocol', $Protocol) }

    Write-Step "启动 cloudflared quick tunnel -> $localUrl（protocol=$Protocol）"
    $proc = Start-Process -FilePath $bin -ArgumentList $argList -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput "$log.out" -RedirectStandardError $errLog
    Write-Info "pid=$($proc.Id)，日志：$log"

    $pattern = 'https://[a-z0-9-]+\.trycloudflare\.com'
    $url = Wait-ForLogUrl -Path $log -Pattern $pattern -TimeoutSec $ReadyTimeoutSec
    if (-not $url) {
        Write-Fail '等待 cloudflared 公网 URL 超时。日志尾部：'
        Show-LogTail -Paths @($log, $errLog)
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        return $null
    }

    Write-Step "验证公网 URL 可访问：$url"
    $probe = Test-PublicUrl -Url $url
    if ($probe.Ok) {
        Write-Ok "公网可达（HTTP $($probe.Status)）"
    }
    else {
        $statusText = if ($null -eq $probe.Status) { '无响应' } else { "HTTP $($probe.Status)" }
        Write-Warn2 "URL 已生成但暂未返回 2xx/3xx（$statusText），通常再等几秒即可访问；也可直接打开链接确认。"
    }

    return [pscustomobject]@{
        provider = 'cloudflared'
        url      = $url
        pid      = $proc.Id
        log      = $log
        probe    = $probe
    }
}

function Wait-ForLogUrl([string]$Path, [string]$Pattern, [int]$TimeoutSec) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path -LiteralPath $Path) {
            try {
                $text = Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue
            }
            catch {
                $text = $null
            }
            if ($text -and ($text -match $Pattern)) {
                return $Matches[0]
            }
        }
        Start-Sleep -Milliseconds 500
    }
    return $null
}

function Show-LogTail {
    param([string[]]$Paths)
    foreach ($p in $Paths) {
        if (Test-Path -LiteralPath $p) {
            Write-Info "--- $p（尾部 15 行）---"
            Get-Content -LiteralPath $p -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Info "    $_" }
        }
    }
}

# ---------------------------------------------------------------- localtunnel

function Start-LocaltunnelTunnel {
    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $npx) {
        Write-Fail '找不到 npx，无法使用 localtunnel。'
        return $null
    }
    $log = Get-LogPath 'localtunnel'
    $errLog = "$log.err"
    $cmdLine = "npx --yes localtunnel --port $Port"
    Write-Step "启动 localtunnel：$cmdLine"
    $proc = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/c', $cmdLine) -PassThru `
        -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errLog
    Write-Info "pid=$($proc.Id)，日志：$log"

    $pattern = 'https://[a-z0-9-]+\.loca\.lt'
    $url = Wait-ForLogUrl -Path $log -Pattern $pattern -TimeoutSec $ReadyTimeoutSec
    if (-not $url -and (Test-Path -LiteralPath $errLog)) {
        # localtunnel 有时把地址打到 stderr
        $url = Wait-ForLogUrl -Path $errLog -Pattern $pattern -TimeoutSec 5
    }
    if (-not $url) {
        Write-Fail '等待 localtunnel 公网 URL 超时。日志尾部：'
        Show-LogTail -Paths @($log, $errLog)
        & taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Null
        return $null
    }
    Write-Warn2 'localtunnel 对陌生访客会显示 Tunnel Password 页（密码 = 本机公网 IP），仅作备选。'

    return [pscustomobject]@{
        provider = 'localtunnel'
        url      = $url
        pid      = $proc.Id
        log      = $log
        probe    = @{ Ok = $false; Status = $null }
    }
}

# ---------------------------------------------------------------- localhost.run

function Start-LocalhostrunTunnel {
    $ssh = Get-Command ssh.exe -ErrorAction SilentlyContinue
    if (-not $ssh) { $ssh = Get-Command ssh -ErrorAction SilentlyContinue }
    if (-not $ssh) {
        Write-Fail '找不到 ssh，无法使用 localhost.run。'
        return $null
    }
    $log = Get-LogPath 'localhostrun'
    $errLog = "$log.err"
    $forward = "80:127.0.0.1:$Port"
    $argList = @(
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=NUL',
        '-o', 'ServerAliveInterval=20',
        '-o', 'ExitOnForwardFailure=yes',
        '-R', $forward,
        'nokey@localhost.run'
    )
    Write-Step "启动 localhost.run 隧道 -> 127.0.0.1:$Port"
    $proc = Start-Process -FilePath $ssh.Source -ArgumentList $argList -PassThru `
        -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errLog
    Write-Info "pid=$($proc.Id)，日志：$log/$errLog"

    $pattern = 'https://[a-z0-9-]+\.(?:lhr\.life|localhost\.run)'
    $url = Wait-ForLogUrl -Path $log -Pattern $pattern -TimeoutSec $ReadyTimeoutSec
    if (-not $url) { $url = Wait-ForLogUrl -Path $errLog -Pattern $pattern -TimeoutSec 10 }
    if (-not $url) {
        Write-Fail '等待 localhost.run 公网 URL 超时。日志尾部：'
        Show-LogTail -Paths @($log, $errLog)
        & taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Null
        return $null
    }

    return [pscustomobject]@{
        provider = 'localhostrun'
        url      = $url
        pid      = $proc.Id
        log      = $log
        probe    = @{ Ok = $false; Status = $null }
    }
}

# ---------------------------------------------------------------- 输出与主流程

function Print-Banner($Result) {
    $line = '=' * 64
    Write-Host ''
    Write-Host $line -ForegroundColor Magenta
    Write-Host "  公网 HTTPS 地址: $($Result.url)" -ForegroundColor Green
    Write-Host "  本地服务      : http://127.0.0.1:$Port"
    Write-Host "  提供商        : $($Result.provider)"
    Write-Host "  停止          : powershell -ExecutionPolicy Bypass -File scripts\tunnel.ps1 -Stop"
    Write-Host $line -ForegroundColor Magenta
    Write-Host "TUNNEL_URL=$($Result.url)"
    Write-Host ''
}

function Start-TunnelWithFallback {
    $attempts = switch ($Provider) {
        'cloudflared' { @('cloudflared') }
        'localtunnel' { @('localtunnel') }
        'localhostrun' { @('localhostrun') }
        default { @('cloudflared', 'localtunnel', 'localhostrun') }
    }
    foreach ($name in $attempts) {
        $result = switch ($name) {
            'cloudflared' { Start-CloudflaredTunnel }
            'localtunnel' { Start-LocaltunnelTunnel }
            'localhostrun' { Start-LocalhostrunTunnel }
        }
        if ($result) { return $result }
        Write-Warn2 "$name 失败，尝试下一个方案。"
    }
    return $null
}

# -------------------------------------------------------------------- main

Ensure-ToolsDir

if ($Status) {
    Write-Host 'Atoms Demo 隧道状态' -ForegroundColor Magenta
    Show-State
    exit 0
}

if ($Stop) {
    Write-Host '停止 Atoms Demo 隧道' -ForegroundColor Magenta
    $null = Stop-ExistingTunnel
    exit 0
}

Write-Host 'Atoms Demo 公网隧道' -ForegroundColor Magenta

# 1) 复用已有隧道
$state = Read-State
if ($null -ne $state -and (Test-StateProcessAlive $state) -and -not $Force) {
    if ([int]$state.port -ne $Port) {
        Write-Warn2 "已有隧道指向端口 $($state.port)，与本次 -Port $Port 不同，重启隧道。"
        $null = Stop-ExistingTunnel
    }
    else {
        Write-Ok '复用已有隧道。'
        Print-Banner ([pscustomobject]@{ url = $state.url; provider = $state.provider })
        exit 0
    }
}
elseif ($null -ne $state) {
    Write-Info '清理失效的隧道记录。'
    Clear-State
}

# 2) 本地端口就绪检查（绝不自己启动 dev server）
if (-not $SkipPortCheck) {
    if (Test-PortOpen -TargetPort $Port) {
        Write-Ok "本地端口 $Port 有服务在监听。"
    }
    elseif ($WaitForPort -gt 0) {
        Write-Step "端口 $Port 暂未就绪，最多等待 $WaitForPort 秒（等待 Lead 启动 npm run dev）..."
        if (-not (Wait-PortOpen -TargetPort $Port -TimeoutSec $WaitForPort)) {
            Write-Fail "等待 $WaitForPort 秒后端口 $Port 仍无服务。请先启动 dev server（npm run dev），再重跑本脚本。"
            exit 2
        }
        Write-Ok "端口 $Port 已就绪。"
    }
    else {
        Write-Fail "端口 $Port 没有服务。请先启动 dev server（npm run dev），或加 -WaitForPort 60 等待。"
        exit 2
    }
}

# 3) 启动隧道（含回退）
$result = Start-TunnelWithFallback
if (-not $result) {
    Write-Fail '所有隧道方案都失败了。排查：网络是否能访问 Cloudflare / npm registry / localhost.run；详见 docs/DEPLOY.md「公网演示链接」。'
    exit 1
}

$null = Save-State -ProviderName $result.provider -Url $result.url -ProcessId $result.pid -LocalPort $Port -LogPath $result.log
Print-Banner $result

if ($Detach) {
    Write-Ok "隧道已在后台运行（pid=$($result.pid)）。用 -Status 查看，用 -Stop 停止。"
    exit 0
}

# 4) 前台模式：保持进程存活，Ctrl+C / 进程退出时清理
Write-Info '前台模式：按 Ctrl+C 结束隧道。'
$cleanup = {
    param($pid_, $providerName)
    try {
        & taskkill.exe /PID $pid_ /T /F 2>&1 | Out-Null
    }
    catch { }
    try {
        if (Test-Path -LiteralPath $Script:StatePath) { Remove-Item -LiteralPath $Script:StatePath -Force -ErrorAction SilentlyContinue }
        if (Test-Path -LiteralPath $Script:UrlPath) { Remove-Item -LiteralPath $Script:UrlPath -Force -ErrorAction SilentlyContinue }
    }
    catch { }
}
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    & taskkill.exe /PID $Event.MessageData.pid /T /F 2>&1 | Out-Null
    Remove-Item -LiteralPath $Event.MessageData.statePath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $Event.MessageData.urlPath -Force -ErrorAction SilentlyContinue
} -MessageData @{ pid = $result.pid; statePath = $Script:StatePath; urlPath = $Script:UrlPath }

try {
    while ($true) {
        Start-Sleep -Seconds 2
        $alive = Get-Process -Id $result.pid -ErrorAction SilentlyContinue
        if (-not $alive) {
            Write-Warn2 '隧道进程已退出。日志尾部：'
            Show-LogTail -Paths @($result.log, "$($result.log).err")
            Clear-State
            exit 1
        }
    }
}
finally {
    & $cleanup $result.pid $result.provider
    Clear-State
}
