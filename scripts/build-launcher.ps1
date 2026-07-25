# 编译 launcher 启动器，输出到项目根目录
# 参数:
#   -installer   : 同时生成 NSIS 安装包（需要安装 NSIS: https://nsis.sourceforge.io/Download）
param(
    [switch]$installer
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$launcherDir = Join-Path $projectRoot "launcher"
$embedBinDir = Join-Path $launcherDir "internal\embedbin"
$binDir = Join-Path $projectRoot "bin"

# ── Step 1: 打包 bin/ → bin.zip（嵌入到 exe 中） ──
Write-Host "Packaging bin/ to bin.zip..."
$zipPath = Join-Path $embedBinDir "bin.zip"

# 清理旧的 bin.zip
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# 使用 Compress-Archive 压缩整个 bin/ 目录
# Compress-Archive 会把 bin/ 下的内容作为 zip 根目录
# 这样解压后直接得到 rg.exe, node/, git/, vcredist/ 等
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($binDir, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

Write-Host "bin.zip created: $zipPath"

# ── Step 2: 编译 ──
Write-Host "Building launcher..."

Push-Location $launcherDir

# 设置国内 Go 代理，避免网络超时
$env:GOPROXY = "https://goproxy.cn,direct"

# 使用 wails 编译
if ($installer) {
    Write-Host "Building with NSIS installer..."
    wails build -platform windows/amd64 -o ../qingzhu-launcher.exe -nsis
} else {
    wails build -platform windows/amd64 -o ../qingzhu-launcher.exe
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed"
    Pop-Location
    exit 1
}

$src = Join-Path (Join-Path $launcherDir "build") "qingzhu-launcher.exe"
$dst = Join-Path $projectRoot "qingzhu-launcher.exe"

if (Test-Path $src) {
    Copy-Item $src $dst -Force
    Write-Host "Launcher built and copied to: $dst"
} else {
    Write-Error "Build output not found: $src"
    Pop-Location
    exit 1
}

# 如果生成了安装包，也复制到项目根目录
$installerSrc = Join-Path (Join-Path $launcherDir "build") "qingzhu-launcher-installer.exe"
if ($installer -and (Test-Path $installerSrc)) {
    $installerDst = Join-Path $projectRoot "qingzhu-launcher-installer.exe"
    Copy-Item $installerSrc $installerDst -Force
    Write-Host "Installer copied to: $installerDst"
}

Pop-Location
Write-Host "Done."
