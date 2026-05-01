[CmdletBinding()]
param(
    [string]$PythonExe = "python",
    [string]$VenvDir = ".venv",
    [string]$BindHost = "",
    [int]$Port = 0,
    [switch]$NoStart
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $projectRoot

function Write-Step {
    param([string]$Message)
    Write-Host "[start] $Message" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Python 检测
# ---------------------------------------------------------------------------
function Get-PythonPath {
    param([string]$exe)
    $found = $null
    try {
        $out = & $exe -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $out) { $found = $out.Trim() }
    } catch {}
    return $found
}

# 优先用命令行参数指定，其次尝试 python/python3，最后按 PATH 找
$bootPython = ""
if (-not [string]::IsNullOrWhiteSpace($PythonExe) -and $PythonExe -ne "python") {
    $bootPython = Get-Command $PythonExe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
}
if ([string]::IsNullOrWhiteSpace($bootPython)) {
    foreach ($cand in @("python", "python3", "py")) {
        $p = Get-Command $cand -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
        if ($p) { $bootPython = $p; break }
    }
}
if ([string]::IsNullOrWhiteSpace($bootPython)) {
    Write-Host "[start] 错误：未检测到 Python，请先安装 Python 3.9+ 后重试" -ForegroundColor Red
    exit 1
}
Write-Step "引导解释器: $bootPython"

# ---------------------------------------------------------------------------
# 虚拟环境检测
# ---------------------------------------------------------------------------
$venvPython = Join-Path (Join-Path $projectRoot $VenvDir) "Scripts\python.exe"
if (Test-Path $venvPython) {
    $pythonCmd = $venvPython
    Write-Step "Using venv python: $venvPython"
} else {
    $pythonCmd = $bootPython
    Write-Step "Using system python: $pythonCmd"
}

# ---------------------------------------------------------------------------
# 端口占用检查 + 自动换端口
# ---------------------------------------------------------------------------
function Test-PortInUse {
    param([int]$Port)
    $tcp = $null
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $result = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
        $handle = $result.AsyncWaitHandle
        $waited = $false
        if ($null -ne $handle) {
            $waited = $handle.WaitOne(1000)
        }
        $tcp.EndConnect($result) | Out-Null
        if ($tcp) { $tcp.Close() }
        if ($tcp) { $tcp.Dispose() }
        return $true
    } catch {
        if ($tcp) { $tcp.Close() }
        if ($tcp) { $tcp.Dispose() }
        return $false
    }
}

# Resolve effective port from env -> config -> default 8000
$defaultPort = 8000
if ($Port -gt 0) {
    $defaultPort = $Port
} else {
    $envPortRaw = ""
    try { $envPortRaw = [string]$env:SERVER_PORT } catch { $envPortRaw = "" }
    $envPortTrimmed = $envPortRaw.Trim()
    if ($envPortTrimmed.Length -gt 0) {
        try {
            $defaultPort = [int]$envPortTrimmed
        } catch {
            # env port invalid, try config.json
            $envPortTrimmed = ""
        }
    }
    if ($envPortTrimmed.Length -eq 0) {
        $cfgPath = Join-Path $projectRoot "config.json"
        if (Test-Path $cfgPath) {
            try {
                $cfgText = Get-Content $cfgPath -Raw -Encoding UTF8
                $cfg = $cfgText | ConvertFrom-Json
                $sysSection = $cfg.system
                if ($null -ne $sysSection) {
                    $portVal = $sysSection.server_port
                    if ($null -ne $portVal) {
                        $defaultPort = [int]$portVal
                    }
                }
            } catch {
                # config read failed, keep 8000
            }
        }
    }
}

$actualPort = $defaultPort
while (Test-PortInUse -Port $actualPort) {
    Write-Step "Port $actualPort is in use, trying $($actualPort + 1)"
    $actualPort++
}

if ($actualPort -ne $defaultPort) {
    Write-Step "Port changed from $defaultPort to $actualPort (was occupied)"
}
$env:SERVER_PORT = "$actualPort"
Write-Step "SERVER_PORT=$actualPort"

# ---------------------------------------------------------------------------
# Host override
# ---------------------------------------------------------------------------
if ($BindHost) {
    $env:SERVER_HOST = $BindHost
    Write-Step "SERVER_HOST=$BindHost"
}

# ---------------------------------------------------------------------------
# No-start check
# ---------------------------------------------------------------------------
if ($NoStart) {
    Write-Step "NoStart enabled"
    exit 0
}

# ---------------------------------------------------------------------------
# 启动服务 (后台) -> 等待端口可用 -> 浏览器打开
# ---------------------------------------------------------------------------
Write-Step "Starting server.py ..."

# Launch server as a background process so we can poll & open browser
$serverArgs = @{
    FilePath     = $pythonCmd
    ArgumentList = @(Join-Path $projectRoot "server.py")
    NoNewWindow  = $true
    RedirectStandardOutput = Join-Path $projectRoot "server-start.log"
    RedirectStandardError  = Join-Path $projectRoot "server-start-error.log"
    PassThru     = $true
}
$serverProc = Start-Process @serverArgs

# Poll until the port is actually listening (timeout 30s)
$pollInterval = 500  # ms
$timeout = 30000     # 30s
$elapsed = 0
$portOpened = $false
while ($elapsed -lt $timeout) {
    Start-Sleep -Milliseconds $pollInterval
    $elapsed += $pollInterval
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $result = $tcp.BeginConnect("127.0.0.1", $actualPort, $null, $null)
        $handle = $null
        $waited = $false
        try { $handle = $result.AsyncWaitHandle } catch { $handle = $null }
        if ($null -ne $handle) {
            $waited = $handle.WaitOne(1000)
        }
        if ($waited) {
            $tcp.EndConnect($result) | Out-Null
            if ($tcp) { $tcp.Close() }
            if ($tcp) { $tcp.Dispose() }
            $portOpened = $true
            break
        }
        if ($tcp) { $tcp.Close() }
        if ($tcp) { $tcp.Dispose() }
    } catch {
        if ($tcp) { $tcp.Close() }
        if ($tcp) { $tcp.Dispose() }
    }
}

if (-not $portOpened) {
    Write-Host "[start] WARNING: Server did not respond within 30s. Check server-start.log" -ForegroundColor Red
    exit 1
}

Write-Step "Server is running on port $actualPort"
Write-Step "Opening dashboard in browser..."

# Open browser (cross-platform: uses default browser)
$accessUrl = "http://localhost:$actualPort"
try {
    Start-Process $accessUrl
} catch {
    Write-Host "[start] Could not open browser automatically. Please visit $accessUrl" -ForegroundColor Yellow
}

Write-Step "Dashboard available at $accessUrl"

# Wait for the server process to finish (blocking)
$serverProc.WaitForExit() | Out-Null
exit $serverProc.ExitCode
