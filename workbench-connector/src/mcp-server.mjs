import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { appendAction, jsonResult, readState, safeState, textResult } from './shared.mjs';

const server = new McpServer({
  name: 'summer-workbench-connector',
  version: '0.1.0',
});

const today = () => new Date().toISOString().slice(0, 10);

function withoutPrivateNotes(review) {
  if (!review || typeof review !== 'object') return review;
  const safe = { ...review };
  delete safe.privateNotes;
  return safe;
}

function normalizedState(state) {
  return safeState(state);
}

function contextForRange(state, range) {
  const current = normalizedState(state);
  const end = today();
  const start = range === 'seven_days'
    ? new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10)
    : end;
  const inRange = value => String(value || '').slice(0, 10) >= start && String(value || '').slice(0, 10) <= end;
  return {
    date: current.date || end,
    commitment: current.commitment,
    nextStep: current.nextStep,
    tomorrow: current.tomorrow,
    tasks: current.tasks.filter(item => inRange(item.date || item.doneAt)),
    decisions: current.decisions,
    captures: current.captures.filter(item => inRange(item.createdAt || item.date)),
    scheduleItems: current.scheduleItems.filter(item => inRange(item.date || item.doneAt)),
    dailyReviews: current.dailyReviews.filter(item => inRange(item.date)).map(withoutPrivateNotes),
    memoryItems: current.memoryItems.slice(-30),
  };
}

function action(type, payload) {
  return { id: randomUUID(), type, payload, createdAt: new Date().toISOString(), source: 'ai' };
}

server.registerTool(
  'get_workbench_context',
  {
    description: '读取 Summer 工作台中经过本地保存的今日或最近 7 天工作上下文，不包含私密备注。',
    inputSchema: z.object({
      range: z.enum(['today', 'seven_days']).default('today').describe('读取范围：today 或 seven_days'),
    }),
  },
  async ({ range }) => jsonResult(contextForRange(await readState(), range)),
);

server.registerTool(
  'get_handoff_card',
  {
    description: '生成一张可复制给任何 AI 的标准工作台交接卡。',
    inputSchema: z.object({
      date: z.string().optional().describe('可选日期，格式 YYYY-MM-DD'),
    }),
  },
  async ({ date }) => {
    const state = normalizedState(await readState());
    const review = state.dailyReviews.find(item => item.date === (date || today()));
    const facts = review?.facts?.length ? review.facts : [`今天唯一最重要的结果：${state.commitment || '尚未填写'}`];
    const lines = [
      '【Summer 工作台｜AI 交接卡】',
      `日期：${date || today()}`,
      '',
      '请只基于以下真实记录进行分析，不要补写不存在的经历。',
      '',
      '事实：',
      ...facts.map(item => `- ${item}`),
      '',
      `有感觉的一刻：${review?.feeling || '今天跳过'}`,
      `为什么在意：${review?.why || '今天跳过'}`,
      `明天第一步：${review?.tomorrow || state.tomorrow || '未填写'}`,
      '',
      '请根据我的要求完成下一步，并把最终结果返回给我。',
    ];
    return textResult(lines.join('\n'));
  },
);

server.registerTool(
  'search_workbench',
  {
    description: '搜索工作台中的任务、收件内容、判断、资料和经历卡。',
    inputSchema: z.object({
      query: z.string().min(1).describe('要搜索的关键词'),
      limit: z.number().int().min(1).max(30).default(10).describe('最多返回多少条'),
    }),
  },
  async ({ query, limit }) => {
    const state = normalizedState(await readState());
    const needle = query.toLocaleLowerCase();
    const buckets = [
      ['任务', state.tasks],
      ['收件箱', state.captures],
      ['判断', state.decisions],
      ['资料', state.memoryItems],
      ['日程', state.scheduleItems],
      ['经历卡', state.dailyReviews.map(withoutPrivateNotes)],
    ];
    const matches = [];
    for (const [kind, items] of buckets) {
      for (const item of items) {
        const text = JSON.stringify(item).toLocaleLowerCase();
        if (text.includes(needle)) matches.push({ kind, item });
      }
    }
    return jsonResult({ query, results: matches.slice(0, limit) });
  },
);

server.registerTool(
  'add_to_workbench_inbox',
  {
    description: '把一段灵感、事项或待跟进内容放进工作台收件箱，等待用户整理。',
    inputSchema: z.object({
      text: z.string().min(1).max(500).describe('要放入收件箱的内容'),
      category: z.enum(['summer-os', 'content-ip', 'client-partner', 'admin-other', 'uncategorized']).default('uncategorized'),
    }),
  },
  async ({ text, category }) => {
    const item = action('capture', { text, category });
    await appendAction(item);
    return textResult(`已放入工作台收件箱，等待你确认整理。操作编号：${item.id}`);
  },
);

server.registerTool(
  'create_task_draft',
  {
    description: '生成一条待确认任务草稿，不会直接改变主线任务。',
    inputSchema: z.object({
      title: z.string().min(1).max(160).describe('任务名称'),
      nextStep: z.string().max(160).default('').describe('可以马上开始的下一步'),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('安排日期，默认今天'),
    }),
  },
  async ({ title, nextStep, date }) => {
    const item = action('task-draft', { title, nextStep, date: date || today() });
    await appendAction(item);
    return textResult(`已生成待确认任务草稿，回到工作台后会出现在收件箱。操作编号：${item.id}`);
  },
);

server.registerTool(
  'save_ai_result',
  {
    description: '把 AI 分析、方案或选题保存回工作台的可复用资料，不会覆盖原始记录。',
    inputSchema: z.object({
      title: z.string().min(1).max(120).describe('结果标题'),
      content: z.string().min(1).max(10_000).describe('要保存的结果'),
      source: z.string().max(80).default('AI 工具').describe('来源名称'),
    }),
  },
  async ({ title, content, source }) => {
    const item = action('ai-result', { title, content, source });
    await appendAction(item);
    return textResult(`AI 结果已送回工作台，打开“已保存资料”即可查看。操作编号：${item.id}`);
  },
);

void serveStdio(() => server);
console.error('Summer Workbench MCP connector running on stdio');
