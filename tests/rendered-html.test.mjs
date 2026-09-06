import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

test("fan edition keeps its core product flows", async () => {
  const [page, layout, manifest, appScript] = await Promise.all([
    readFile(new URL("app/workbench.html", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("public/manifest.webmanifest", root), "utf8"),
    readFile(new URL("public/app.js", root), "utf8"),
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
  assert.match(appScript, /data-decide-action[\s\S]*?state\.decisions = state\.decisions\.filter\(decision => decision\.id !== id\)/);
  assert.match(appScript, /下一条切换为/);
  assert.equal(JSON.parse(manifest).display, "standalone");
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
  assert.match(syncScript, /refreshInstalledApp/);
  assert.match(syncScript, /registration\.update/);
  assert.match(syncScript, /window\.location\.reload/);
  assert.match(worker, /summer-workbench-lite-v6/);
  assert.match(worker, /SKIP_WAITING/);
  assert.match(worker, /cache: "no-store"/);
});

test("durable storage and pairing routes are packaged", async () => {
  const [schema, workspaceRoute, startRoute, joinRoute, avatarRoute, resetRoute, hosting] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/api/workspace/route.ts", root), "utf8"),
    readFile(new URL("app/api/pair/start/route.ts", root), "utf8"),
    readFile(new URL("app/api/pair/join/route.ts", root), "utf8"),
    readFile(new URL("app/api/avatar/route.ts", root), "utf8"),
    readFile(new URL("app/api/reset/route.ts", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
  ]);
  assert.match(schema, /workspaces/);
  assert.match(schema, /devices/);
  assert.match(schema, /pairCodes/);
  assert.match(workspaceRoute, /UPDATE workspaces/);
  assert.match(startRoute, /5 \* 60 \* 1000/);
  assert.match(joinRoute, /pair_attempts/);
  assert.match(schema, /avatarData/);
  assert.match(avatarRoute, /avatar_data = \?/);
  assert.match(avatarRoute, /encodeBase64/);
  assert.match(await readFile(new URL("public/sync.js", root), "utf8"), /readJsonResponse/);
  assert.match(resetRoute, /state_json = '\{\}'/);
  assert.equal(JSON.parse(hosting).d1, "DB");
  assert.equal(JSON.parse(hosting).r2, "ASSETS");
});
