import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(root, '发布包');
const stagingRoot = await mkdtemp(join(tmpdir(), 'summer-workbench-package-'));
const packageName = 'Summer工作台-Lite';
const packageDir = join(stagingRoot, packageName);
const packageVersion = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;

await mkdir(packageDir, { recursive: true });

let html = await readFile(join(root, 'app', 'workbench.html'), 'utf8');
html = html.replaceAll('href="/', 'href="./').replaceAll('src="/', 'src="./');
await writeFile(join(packageDir, 'index.html'), html);

for (const file of [
  'app.js',
  'ai-connector.js',
  'avatar-default.svg',
  'cola.js',
  'day-rollover.js',
  'favicon.svg',
  'file.svg',
  'globe.svg',
  'icon-192.png',
  'icon-512.png',
  'manifest.webmanifest',
  'qr.js',
  'styles.css',
  'sw.js',
  'sync.js',
  'update.json',
  'window.svg',
]) {
  await cp(join(root, 'public', file), join(packageDir, file));
}

const pluginPackageDir = join(packageDir, 'cola-plugin');
await mkdir(pluginPackageDir, { recursive: true });
await cp(join(root, 'cola-plugin', 'package.json'), join(pluginPackageDir, 'package.json'));
await cp(join(root, 'cola-plugin', 'README.md'), join(pluginPackageDir, 'README.md'));
await cp(join(root, 'cola-plugin', 'src'), join(pluginPackageDir, 'src'), { recursive: true });
await cp(join(root, 'cola-plugin', 'dist'), join(pluginPackageDir, 'dist'), { recursive: true });

const connectorPackageDir = join(packageDir, 'workbench-connector');
await mkdir(connectorPackageDir, { recursive: true });
await cp(join(root, 'workbench-connector', 'package.json'), join(connectorPackageDir, 'package.json'));
await cp(join(root, 'workbench-connector', 'README.md'), join(connectorPackageDir, 'README.md'));
await cp(join(root, 'workbench-connector', 'src'), join(connectorPackageDir, 'src'), { recursive: true });
try {
  await cp(join(root, 'workbench-connector', 'pnpm-lock.yaml'), join(connectorPackageDir, 'pnpm-lock.yaml'));
} catch {
  // The lockfile is optional until the connector dependencies are installed.
}
await cp(join(root, 'scripts', 'local_server.py'), join(packageDir, 'local_server.py'));
await writeFile(join(packageDir, 'VERSION'), `${packageVersion}\n`);

await writeFile(join(packageDir, 'README.md'), `# Summer 工作台 Lite · 纯本地版

这是一个不依赖云端服务的本地工作台。普通使用不需要注册账号，也不会带入作者的头像、昵称或工作记录。

工作台会在启动或点击“刷新”时检查 GitHub 上是否有新版本；发现新版会提示下载。双击启动文件时也会自动检查并更新本地程序。更新安装包不会清空记录，数据保存在电脑的独立用户目录中。

## 粉丝直接使用

- macOS：双击 start.command
- Windows：双击 start.bat

启动后浏览器会自动打开工作台。第一次使用填写自己的昵称和头像，之后记录会保存在自己的设备上。

## 连接手机或另一台电脑

电脑和手机连接同一 Wi‑Fi 后：

1. 在电脑工作台点击“连接设备”，选择“这台已有内容”，生成二维码。
2. 用手机扫码进入这个工作台。扫码后的地址会带有短时配对参数，请不要先删掉它。
3. 如果微信里不能添加到桌面，复制手机地址栏里的完整网址（必须包含 ?pair=）到手机准备长期使用的 Safari 或 Chrome。
4. 配对成功后，必须在这个同一个浏览器里点击“添加到手机桌面”，以后也从这个入口进入，不要换另一个浏览器。
5. 之后在任一设备点击“刷新”，两台设备同步工作台记录；每次同步前会保留上一份本机安全备份。

如果复制到普通浏览器后仍然要求重新设置，说明复制时漏掉了 ?pair= 后面的内容，或者配对码已超过 10 分钟。回到电脑重新生成二维码，再复制完整地址即可。

这只在同一 Wi‑Fi 下工作，不经过云端；离开这个网络后，两台设备不会自动同步。二维码打不开时，也可以复制二维码下方的手机地址。

## 数据边界

工作台记录保存在运行工作台的电脑本地文件和各设备浏览器中，只在同一 Wi‑Fi 下按配对关系同步，不上传到云端，也不需要注册账号。
同目录下的“workbench-connector”可选用于连接支持 MCP 的其他 AI；点击工作台里的“AI 连接器”可查看连接状态和配置提示，连接器只读取脱敏后的工作台记录。

如果要连接 Cola：在 Cola 里选择“技能 → 渠道 → 安装本地插件”，选择同目录下的“cola-plugin”文件夹，再打开本机工作台，点击「连接 Cola」。只有你在「结束今天」里确认过的经历卡才会发送。

如果要连接其他支持 MCP 的 AI：打开工作台里的「AI 连接器」，点击「复制标准配置」，把解压后的实际路径替换进去，再粘贴到 AI 的 MCP 设置。首次配置完成后，工作台里的按钮只负责检测连接状态。

本地版不提供跨网络云同步；同一 Wi‑Fi 下可以通过“连接设备”同步。离开这个网络后，两台设备不会自动同步。
`);

const updateScript = `#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PARENT="$(dirname "$ROOT")"
MANIFEST_URL="https://raw.githubusercontent.com/wangxiujuan626-bit/summer-workbench/main/public/update.json"
CURRENT_VERSION="0.0.0"
if [ -f "$ROOT/VERSION" ]; then CURRENT_VERSION=$(tr -d '\\r\\n ' < "$ROOT/VERSION"); fi
MANIFEST_FILE=$(mktemp "/tmp/summer-workbench-manifest.XXXXXX")
cleanup_manifest() { rm -f "$MANIFEST_FILE"; }
trap cleanup_manifest EXIT

if ! command -v curl >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then exit 0; fi
if ! curl -fsSL --max-time 5 "$MANIFEST_URL?t=$(date +%s)" -o "$MANIFEST_FILE"; then exit 0; fi
REMOTE_VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$MANIFEST_FILE" | head -n 1)
PACKAGE_URL=$(sed -n 's/.*"packageUrl"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$MANIFEST_FILE" | head -n 1)
if [ -z "$REMOTE_VERSION" ] || [ -z "$PACKAGE_URL" ]; then exit 0; fi

VERSION_IS_NEWER=$(awk -v a="$REMOTE_VERSION" -v b="$CURRENT_VERSION" 'BEGIN { split(a,A,"."); split(b,B,"."); for (i=1;i<=3;i++) { if ((A[i]+0)>(B[i]+0)) { print 1; exit } if ((A[i]+0)<(B[i]+0)) { print 0; exit } } print 0 }')
if [ "$VERSION_IS_NEWER" != "1" ]; then exit 0; fi

UPDATE_DIR=$(mktemp -d "$PARENT/.summer-workbench-update.XXXXXX")
cleanup_update() { rm -rf "$UPDATE_DIR"; rm -f "$MANIFEST_FILE"; }
trap cleanup_update EXIT
if ! curl -fsSL --max-time 90 "$PACKAGE_URL" -o "$UPDATE_DIR/update.zip"; then exit 0; fi
mkdir "$UPDATE_DIR/unpacked"
if ! unzip -tq "$UPDATE_DIR/update.zip" >/dev/null || ! unzip -q "$UPDATE_DIR/update.zip" -d "$UPDATE_DIR/unpacked"; then exit 0; fi
NEW="$UPDATE_DIR/unpacked/${packageName}"
if [ ! -f "$NEW/local_server.py" ] || [ ! -f "$NEW/index.html" ] || [ ! -f "$NEW/start.command" ] || [ ! -f "$NEW/VERSION" ]; then exit 0; fi
if [ "$(tr -d '\\r\\n ' < "$NEW/VERSION")" != "$REMOTE_VERSION" ]; then exit 0; fi
# Preserve a legacy workspace in the installation folder during the first update.
# Newer versions also keep a separate per-user data file, never inside the download.
if [ -f "$ROOT/.summer-workbench-local.json" ]; then
  cp "$ROOT/.summer-workbench-local.json" "$NEW/.summer-workbench-local.json"
fi
BACKUP=$(mktemp -d "$PARENT/.summer-workbench-previous.XXXXXX")
rmdir "$BACKUP"
if ! mv "$ROOT" "$BACKUP"; then exit 1; fi
if ! mv "$NEW" "$ROOT"; then
  mv "$BACKUP" "$ROOT"
  echo "更新未完成，已恢复原版。" >&2
  exit 1
fi
echo "已更新到 v\${REMOTE_VERSION}；上一版保留在 $BACKUP" >&2
`;
await writeFile(join(packageDir, 'update.sh'), updateScript);
await chmod(join(packageDir, 'update.sh'), 0o755);

const macLauncher = `#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ -x "./update.sh" ]; then ./update.sh || true; fi
cd "$(dirname "$0")"
port_file=".summer-workbench-port"
connector_pid=''
server_pid=''
cleanup() {
  if [ -n "$connector_pid" ]; then kill "$connector_pid" >/dev/null 2>&1 || true; fi
  if [ -n "$server_pid" ]; then kill "$server_pid" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM
rm -f "$port_file"
if command -v node >/dev/null 2>&1 && [ -f "workbench-connector/src/bridge.mjs" ]; then
  (cd workbench-connector && node src/bridge.mjs) >/dev/null 2>&1 &
  connector_pid=$!
fi
start_server() {
  "$1" local_server.py &
  server_pid=$!
  tries=0
  while [ ! -s "$port_file" ] && kill -0 "$server_pid" >/dev/null 2>&1 && [ "$tries" -lt 100 ]; do
    sleep 0.1
    tries=$((tries + 1))
  done
  if [ -s "$port_file" ]; then
    port=$(cat "$port_file")
    open "http://127.0.0.1:$port/" >/dev/null 2>&1 || true
  else
    echo "本地服务启动失败，请重新双击 start.command。"
  fi
  wait "$server_pid"
}
if command -v python3 >/dev/null 2>&1; then start_server python3; exit; fi
if command -v python >/dev/null 2>&1; then start_server python; exit; fi
echo "需要安装 Python 3 后再启动。"
read -r _
`;
await writeFile(join(packageDir, 'start.command'), macLauncher);
await chmod(join(packageDir, 'start.command'), 0o755);

const windowsUpdateScript = `param()
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ManifestUrl = "https://raw.githubusercontent.com/wangxiujuan626-bit/summer-workbench/main/public/update.json"
$VersionFile = Join-Path $Root "VERSION"
$CurrentVersion = [version]"0.0.0"
if (Test-Path $VersionFile) { $CurrentVersion = [version]((Get-Content $VersionFile -Raw).Trim()) }
try { $Manifest = Invoke-RestMethod -Uri ($ManifestUrl + "?t=" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -TimeoutSec 5 } catch { exit 0 }
if (-not $Manifest.version -or -not $Manifest.packageUrl) { exit 0 }
try { $RemoteVersion = [version]$Manifest.version } catch { exit 0 }
if ($RemoteVersion -le $CurrentVersion) { exit 0 }
$UpdateRoot = Join-Path ([IO.Path]::GetTempPath()) ("summer-workbench-update-" + [guid]::NewGuid().ToString())
$ZipPath = Join-Path $UpdateRoot "update.zip"
$ExtractPath = Join-Path $UpdateRoot "unpacked"
try {
  New-Item -ItemType Directory -Path $ExtractPath -Force | Out-Null
  Invoke-WebRequest -Uri $Manifest.packageUrl -OutFile $ZipPath -TimeoutSec 90
  Expand-Archive -Path $ZipPath -DestinationPath $ExtractPath -Force
  $Source = Join-Path $ExtractPath "${packageName}"
  if (-not (Test-Path (Join-Path $Source "local_server.py")) -or
      -not (Test-Path (Join-Path $Source "index.html")) -or
      -not (Test-Path (Join-Path $Source "VERSION"))) { throw "安装包缺少必要文件" }
  if ((Get-Content (Join-Path $Source "VERSION") -Raw).Trim() -ne $Manifest.version) { throw "安装包版本与更新通知不符" }
  # Keep the previous files in a recoverable sibling directory. User data is
  # never copied into a downloadable package and is not deleted on failure.
  $Backup = Join-Path (Split-Path -Parent $Root) (".summer-workbench-previous-" + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $Backup | Out-Null
  Get-ChildItem -LiteralPath $Root -Force | Copy-Item -Destination $Backup -Recurse -Force
  try {
    Get-ChildItem -LiteralPath $Source -Force | Copy-Item -Destination $Root -Recurse -Force
    Write-Host "已更新到 v$($Manifest.version)；上一版保留在 $Backup"
  } catch {
    Get-ChildItem -LiteralPath $Backup -Force | Copy-Item -Destination $Root -Recurse -Force
    throw "更新失败，已尝试恢复旧版；备份在 $Backup"
  }
} catch {
  Write-Warning $_
} finally {
  Remove-Item $UpdateRoot -Recurse -Force -ErrorAction SilentlyContinue
}
`;
await writeFile(join(packageDir, 'update.ps1'), windowsUpdateScript);

const windowsLauncher = `@echo off
cd /d "%~dp0"
if exist "%~dp0update.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
where node >nul 2>nul
if %errorlevel%==0 if exist "%~dp0workbench-connector\\src\\bridge.mjs" start "Summer Workbench Connector" /min cmd /c "cd /d ""%~dp0workbench-connector"" && node src\\bridge.mjs"
where py >nul 2>nul
if %errorlevel%==0 (
  del "%~dp0.summer-workbench-port" >nul 2>nul
  start "Summer Workbench Local Server" /min py local_server.py
  goto wait_for_server
  exit /b
)
where python >nul 2>nul
if %errorlevel%==0 (
  del "%~dp0.summer-workbench-port" >nul 2>nul
  start "Summer Workbench Local Server" /min python local_server.py
  goto wait_for_server
  exit /b
)
echo 需要安装 Python 3 后再启动。
pause
exit /b

:wait_for_server
for /l %%i in (1,1,100) do (
  if exist "%~dp0.summer-workbench-port" goto open_workbench
  timeout /t 1 /nobreak >nul
)
echo 本地服务启动失败，请重新双击启动文件。
pause
exit /b

:open_workbench
set /p PORT=<"%~dp0.summer-workbench-port"
start "" "http://127.0.0.1:%PORT%/"
`;
await writeFile(join(packageDir, 'start.bat'), windowsLauncher);

const stagedZipPath = join(stagingRoot, `${packageName}.zip`);
execFileSync('zip', ['-qr', stagedZipPath, packageName], { cwd: stagingRoot, stdio: 'inherit' });
const stagedSourceZipPath = join(stagingRoot, `${packageName}-纯本地开源源码.zip`);
execFileSync('zip', ['-qr', stagedSourceZipPath, packageName], { cwd: stagingRoot, stdio: 'inherit' });
await mkdir(packageRoot, { recursive: true });
const zipPath = join(packageRoot, `${packageName}.zip`);
const sourceZipPath = join(packageRoot, `${packageName}-纯本地开源源码.zip`);
await cp(stagedZipPath, zipPath);
await cp(stagedSourceZipPath, sourceZipPath);
await cp(stagedZipPath, join(root, `${packageName}.zip`));
await cp(stagedSourceZipPath, join(root, `${packageName}-纯本地开源源码.zip`));
await cp(packageDir, join(packageRoot, packageName), { recursive: true, force: true });
await rm(stagingRoot, { recursive: true, force: true });
await writeFile(join(packageRoot, 'README.md'), `# Summer 工作台发布包

这里集中放给自己和粉丝使用的成品，不要去系统临时目录找。

- “${packageName}.zip”：纯本地开源版，里面包含工作台和“cola-plugin”。
- “${packageName}-纯本地开源源码.zip”：内含同一版运行文件和本地脚本；完整开发源码请看 GitHub 仓库。
- 下载包里也包含“workbench-connector”，用于连接支持 MCP 的其他 AI 工具。
- 本版双击启动文件会检查并更新程序；旧版没有更新脚本，需要手动换用本版一次。更新前会保留上一版目录，记录不会被清空。
- 解压后：“${packageName}/cola-plugin”是 Cola 本地插件目录。
- 解压后：“${packageName}/workbench-connector”是通用 AI 连接器目录。
- 源码位置：项目根目录的“cola-plugin/”和“workbench-connector/”。

使用时在 Cola 里选择“技能 → 渠道 → 安装本地插件”，选择解压后的“cola-plugin”文件夹，不要选择里面的“dist”文件夹。
`);
console.log(`${zipPath}\n${sourceZipPath}`);
