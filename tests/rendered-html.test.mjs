import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

test("fan edition keeps its core product flows", async () => {
  const [page, layout, manifest, appScript, aiConnectorScript, colaScript, colaPackage, colaDist, qrScript] = await Promise.all([
    readFile(new URL("app/workbench.html", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("public/manifest.webmanifest", root), "utf8"),
    readFile(new URL("public/app.js", root), "utf8"),
    readFile(new URL("public/ai-connector.js", root), "utf8"),
    readFile(new URL("public/cola.js", root), "utf8"),
    readFile(new URL("cola-plugin/package.json", root), "utf8"),
    readFile(new URL("cola-plugin/dist/index.js", root), "utf8"),
    readFile(new URL("public/qr.js", root), "utf8"),
  ]);
  assert.match(layout, /Summer工作台 Lite/);
  assert.match(page, /设置你的名字和头像/);
  assert.match(page, /清空当前测试数据，从 0 开始/);
  assert.match(page, /连接另一台设备/);
  assert.match(page, /今天唯一最重要的结果/);
  assert.match(page, /DECISION QUEUE/);
  assert.match(page, /QUICK INBOX/);
  assert.match(page, /WORK RADAR/);
  assert.match(page, /WORK MEMORY/);
  assert.match(page, /DATES &amp; DEADLINES/);
  assert.match(page, /日程与截止/);
  assert.match(page, /最晚哪天交/);
  assert.match(page, /固定活动/);
  assert.match(page, /id="refreshAppButton"/);
  assert.match(page, /id="modeButton"/);
  assert.match(page, /id="voiceCaptureButton"/);
  assert.match(page, /id="mobileBottomNav"/);
  assert.match(page, /id="exportMarkdownButton"/);
  assert.match(page, /id="openObsidianButton"/);
  assert.match(page, /id="colaButton"/);
  assert.match(page, /id="aiConnectorButton"/);
  assert.match(page, /id="pairQr"/);
  assert.match(page, /id="copyPairUrl"/);
  assert.match(page, /复制地址栏里的完整网址到 Safari 或 Chrome/);
  assert.match(page, /<script src="\/qr\.js"><\/script>/);
  assert.match(page, /\/ai-connector\.js/);
  assert.match(page, /id="dayReviewModal"/);
  assert.match(page, /id="experienceCardPreview"/);
  assert.match(page, /交给 Cola/);
  assert.match(appScript, /function buildDailyReview/);
  assert.match(appScript, /getDailyExperienceCard/);
  assert.match(appScript, /colaDeliveryLog/);
  assert.match(appScript, /BACKUP_KEY/);
  assert.match(appScript, /syncConflicts/);
  assert.match(appScript, /getSyncConflictCount/);
  assert.match(appScript, /aiActionLog/);
  assert.match(appScript, /applyConnectorAction/);
  assert.match(appScript, /dailyReviews/);
  assert.match(page, /\/day-rollover\.js/);
  assert.match(page, /id="taskEditModal"/);
  assert.match(page, /修改任务/);
  assert.match(page, /id="inboxEditModal"/);
  assert.match(page, /修改收件事项/);
  assert.match(appScript, /scheduleItems/);
  assert.match(appScript, /data-inbox-schedule/);
  assert.match(appScript, /scheduleId/);
  assert.match(appScript, /截止日不能早于安排执行日/);
  assert.match(appScript, /data-edit-task/);
  assert.match(appScript, /data-inbox-edit/);
  assert.match(appScript, /data-edit-decision/);
  assert.match(appScript, /data-memory-edit/);
  assert.match(appScript, /data-radar-task-edit/);
  assert.match(appScript, /data-radar-inbox-edit/);
  assert.match(appScript, /function advanceMainTask/);
  assert.match(appScript, /function renderDecisions\(\)[\s\S]*?pending\.length \? pending\.map/);
  assert.match(appScript, /schedule-archive/);
  assert.match(appScript, /radar-history/);
  assert.match(appScript, /function renderMode/);
  assert.match(appScript, /SpeechRecognition/);
  assert.match(appScript, /doneAt/);
  assert.match(appScript, /function buildWorkbenchMarkdown/);
  assert.match(appScript, /obsidian:\/\/new/);
  assert.match(appScript, /data-mobile-tab/);
  assert.equal((page.match(/data-mobile-tab=/g) || []).length, 3);
  assert.match(appScript, /state\.tomorrow = review\.tomorrow/);
  assert.match(appScript, /data-decide-action[\s\S]*?state\.decisions = state\.decisions\.filter\(decision => decision\.id !== id\)/);
  assert.match(appScript, /下一条切换为/);
  assert.match(colaScript, /127\.0\.0\.1:43127/);
  assert.match(colaScript, /daily-experience/);
  assert.match(aiConnectorScript, /127\.0\.0\.1:43128/);
  assert.match(aiConnectorScript, /privateNotes/);
  assert.match(qrScript, /SummerQr/);
  assert.equal(JSON.parse(colaPackage).cola.plugin.entry, "./dist/index.js");
  assert.equal(JSON.parse(colaPackage).version, "0.1.1");
  assert.match(colaDist, /function defineChannel/);
  assert.doesNotMatch(colaDist, /^import .*@marswave\/cola-plugin-sdk/m);
  assert.equal(JSON.parse(manifest).display, "browser");
  assert.equal(JSON.parse(manifest).scope, "/");
  assert.match(await readFile(new URL("public/update.json", root), "utf8"), /downloadUrl/);
  assert.match(await readFile(new URL("public/update.json", root), "utf8"), /packageUrl/);
});

test("yesterday's first task becomes today's unique result", async () => {
  const source = await readFile(new URL("public/day-rollover.js", root), "utf8");
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  const rollover = context.globalThis.SummerDayRollover;
  const state = {
    date: "2026-08-27",
    planDate: "2026-08-27",
    tomorrow: "交付品牌视频脚本",
    commitment: "整理今天资料",
    completed: true,
    mainTaskId: "old-main",
    tasks: [
      { id: "old-main", title: "整理今天资料", date: "2026-08-27", done: true },
      { id: "tomorrow-task", title: "交付品牌视频脚本", date: "2026-08-28", done: false, nextStep: "打开脚本终稿" },
      { id: "carry", title: "回复合作方", date: "2026-08-27", done: false }
    ],
    timer: 300
  };

  const result = rollover.apply(state, "2026-08-28", () => "generated");
  assert.equal(result.rolledOver, true);
  assert.equal(state.commitment, "交付品牌视频脚本");
  assert.equal(state.mainTaskId, "tomorrow-task");
  assert.equal(state.tasks[0].id, "tomorrow-task");
  assert.equal(state.tasks[0].date, "2026-08-28");
  assert.equal(state.tasks.filter(task => task.title === "交付品牌视频脚本").length, 1);
  assert.equal(state.tomorrow, "");
  assert.equal(state.completed, false);
  assert.equal(state.timer, 1500);
});

test("a close-day note creates today's main task when it was not already in the task list", async () => {
  const source = await readFile(new URL("public/day-rollover.js", root), "utf8");
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  const state = {
    date: "2026-08-27",
    tomorrow: "上午先完成活动提纲",
    commitment: "昨天的工作",
    completed: true,
    mainTaskId: "",
    tasks: []
  };

  const result = context.globalThis.SummerDayRollover.apply(state, "2026-08-28", () => "new-main");
  assert.equal(result.rolledOver, true);
  assert.equal(state.mainTaskId, "new-main");
  assert.equal(state.tasks[0].title, "上午先完成活动提纲");
  assert.equal(state.tasks[0].date, "2026-08-28");
  assert.equal(state.commitment, "上午先完成活动提纲");
});

test("remote sync and installed app keep rollover and refresh hooks", async () => {
  const [appScript, syncScript, worker] = await Promise.all([
    readFile(new URL("public/app.js", root), "utf8"),
    readFile(new URL("public/sync.js", root), "utf8"),
    readFile(new URL("public/sw.js", root), "utf8")
  ]);
  assert.match(appScript, /applyRemoteState[\s\S]*?SummerDayRollover\.apply\(state, dateKey\(\)\)/);
  assert.match(appScript, /visibilitychange/);
  assert.match(appScript, /window\.addEventListener\('focus'/);
  assert.match(appScript, /mergeRemoteState/);
  assert.match(syncScript, /syncNow/);
  assert.match(syncScript, /PENDING_SYNC_KEY/);
  assert.match(syncScript, /已保存到本机/);
  assert.match(syncScript, /accountButton\.hidden = false/);
  assert.match(syncScript, /api\/local\/pair\/start/);
  assert.match(syncScript, /api\/local\/pair\/join/);
  assert.match(syncScript, /location\.protocol === 'http:'/);
  assert.match(syncScript, /joinWorkspaceByCode/);
  assert.match(syncScript, /params\.get\('pair'\)/);
  assert.match(syncScript, /data\.pairUrl \|\|/);
  assert.match(syncScript, /PAIR_HANDOFF_KEY/);
  assert.match(syncScript, /rememberPairHandoff/);
  assert.match(syncScript, /persistLocalAvatar/);
  assert.match(syncScript, /LOCAL_AVATAR_BACKUP_KEY/);
  assert.match(syncScript, /recoverAvatarAfterLoadFailure/);
  assert.doesNotMatch(syncScript, /localOnly\) return;/);
  assert.match(syncScript, /最新记录还没有保存成功/);
  assert.match(syncScript, /10 分钟有效/);
  assert.match(syncScript, /可添加到桌面/);
  assert.match(syncScript, /同一个 Safari\/Chrome/);
  assert.doesNotMatch(syncScript, /pairedFromLink = true;\s*history\.replaceState/);
  assert.match(syncScript, /pairLinkFailed/);
  assert.match(syncScript, /二维码配对没有完成/);
  assert.match(syncScript, /pendingUpload/);
  assert.match(syncScript, /UPDATE_MANIFEST_URL/);
  assert.match(syncScript, /checkForUpdates/);
  assert.match(syncScript, /更新后无需重新设置/);
  assert.match(syncScript, /uploadState\(attempt = 0\)/);
  assert.match(syncScript, /retry < 1/);
  assert.match(syncScript, /\(!localOnly && !navigator\.onLine\)/);
  assert.doesNotMatch(syncScript, /window\.location\.reload/);
  assert.doesNotMatch(syncScript, /setInterval\(async \(\) => \{/);
  assert.match(worker, /summer-workbench-lite-v16/);
  assert.match(worker, /qr\.js/);
  assert.match(worker, /cola\.js/);
  assert.match(worker, /ai-connector\.js/);
  assert.match(worker, /avatar-default\.svg/);
  assert.doesNotMatch(worker, /avatar\.png/);
  assert.match(worker, /SKIP_WAITING/);
  assert.match(worker, /cache: "no-store"/);
});

test("local pairing, safe storage and AI connectors remain in the fan edition", async () => {
  const [server, sync, colaPlugin, connector] = await Promise.all([
    readFile(new URL("scripts/local_server.py", root), "utf8"),
    readFile(new URL("public/sync.js", root), "utf8"),
    readFile(new URL("cola-plugin/dist/index.js", root), "utf8"),
    readFile(new URL("workbench-connector/src/bridge.mjs", root), "utf8"),
  ]);
  assert.match(server, /"workspaces": \{\}, "devices": \{\}, "pairCodes": \{\}/);
  assert.match(server, /PAIR_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(server, /PUBLIC_FILES/);
  assert.match(server, /default_data_path/);
  assert.match(sync, /readJsonResponse/);
  assert.match(colaPlugin, /function defineChannel/);
  assert.match(connector, /43128/);
});

test("local pairing refuses competing port processes", async () => {
  const [syncScript, localServer, packageScript] = await Promise.all([
    readFile(new URL("public/sync.js", root), "utf8"),
    readFile(new URL("scripts/local_server.py", root), "utf8"),
    readFile(new URL("scripts/package-offline.mjs", root), "utf8"),
  ]);
  assert.match(syncScript, /readJsonResponse\(response, '暂时无法生成同步码/);
  assert.match(syncScript, /readJsonResponse\(response, '暂时无法连接设备/);
  assert.match(localServer, /except OSError as error:/);
  assert.doesNotMatch(localServer, /ThreadingHTTPServer\(\("0\.0\.0\.0", 0\)/);
  assert.match(localServer, /ACTIVE_PORT = server\.server_address\[1\]/);
  assert.match(localServer, /lan_url\(\)/);
  assert.match(localServer, /"pairUrl": f"\{lan_url\(\)\}\?pair=\{code\}"/);
  assert.match(localServer, /PAIR_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(localServer, /def prune_pair_codes/);
  assert.match(localServer, /BACKUP_PATH/);
  assert.match(localServer, /shutil\.copyfile/);
  assert.match(localServer, /default_data_path/);
  assert.match(localServer, /Application Support/);
  assert.match(localServer, /legacy_data_paths/);
  assert.match(localServer, /joinedTokens/);
  assert.doesNotMatch(localServer, /device\["workspaceId"\] = pair\["workspaceId"\][\s\S]{0,300}del data\["pairCodes"\]\[code\]/);
  assert.match(packageScript, /\.summer-workbench-port/);
  assert.match(packageScript, /start_server python3/);
  assert.match(packageScript, /必须包含 \?pair=/);
  assert.match(packageScript, /VERSION/);
  assert.match(packageScript, /update\.sh/);
  assert.match(packageScript, /update\.ps1/);
  assert.match(packageScript, /packageUrl/);
});

test("a damaged browser record is recovered from the last good backup", async () => {
  const source = await readFile(new URL("public/app.js", root), "utf8");
  const start = source.indexOf("  function load() {");
  const end = source.indexOf("  function backupLocalState(", start);
  assert.ok(start > 0 && end > start);
  const values = new Map([
    ["summer-os-minimum-v1", "{damaged"],
    ["summer-os-last-good-backup-v1", JSON.stringify({ state: { tasks: [{ id: "safe-task", title: "保留的记录" }] } })]
  ]);
  const context = {
    localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
    structuredClone,
    window: { SummerDayRollover: { apply: () => ({ rolledOver: false }) } }
  };
  const setup = `(() => {
    const KEY = 'summer-os-minimum-v1', BACKUP_KEY = 'summer-os-last-good-backup-v1', STATE_SCHEMA_VERSION = 2;
    const dateKey = () => '2026-09-18';
    const defaults = { tasks: [], decisions: [], captures: [], memoryItems: [], scheduleItems: [], plans: [], dailyReviews: [], colaDeliveryLog: [], aiActionLog: [], syncConflicts: [], mode: 'flow' };
    const isInboxCategory = () => true;
    const normalizedCaptureCategory = () => 'uncategorized';
    let captureMigrationNeeded = false;
    let recoveredFromBackup = false;
    ${source.slice(start, end)}
    const result = load();
    return { result, recoveredFromBackup };
  })()`;
  const recovered = vm.runInNewContext(setup, context);
  assert.equal(recovered.result.tasks[0].title, "保留的记录");
  assert.equal(recovered.recoveredFromBackup, true);
});
