import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { defineChannel, type GatewayContext, type OutboundContext } from '@marswave/cola-plugin-sdk';

const PORT = 43127;
const ALLOWED_ORIGINS = new Set(['http://127.0.0.1:8765', 'http://localhost:8765']);
const SENDER_ID = 'summer-workbench-local';
const MAX_BODY_SIZE = 120_000;

type GatewayState = {
  server?: ReturnType<typeof createServer>;
};

type DailyExperienceCard = {
  id: string;
  date: string;
  facts: string[];
  feeling: string;
  why: string;
  tomorrow: string;
  signals: string[];
};

function writeJson(response: ServerResponse, status: number, body: Record<string, unknown>, origin = '') {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'null';
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error('经历卡太大了，请删减后再发送'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function cardMessage(card: DailyExperienceCard) {
  return [
    '【Summer 工作台｜今日经历卡】',
    `日期：${card.date}`,
    '',
    '请把这张经历卡作为一条新的真实经历：先更新你的觉知，再给我 3 个不重复的内容选题。不要直接写全文，除非我继续确认。',
    '',
    '今日事实：',
    ...card.facts.map(item => `- ${item}`),
    '',
    `有感觉的一刻：${card.feeling || '（今天跳过）'}`,
    `为什么在意：${card.why || '（今天跳过）'}`,
    `明天第一步：${card.tomorrow || '（未填写）'}`,
    `内容信号：${card.signals.length ? card.signals.join('、') : '暂未识别'}`,
    '',
    '这是用户确认后发送的内容，只把它当作真实经历使用，不要补写不存在的细节。',
  ].join('\n');
}

export default defineChannel<GatewayState>({
  id: 'summer-workbench',
  meta: {
    label: 'Summer 工作台',
    description: '把确认后的今日经历卡送进 Cola 主对话',
    markdownCapable: true,
  },
  capabilities: {
    receive: { text: true },
    send: { text: true, markdown: true },
  },
  sessionBinding: 'shared-primary',
  gateway: {
    async start(ctx: GatewayContext<GatewayState>) {
      await ctx.runtime.identity.bind(SENDER_ID);
      ctx.state.server = createServer(async (request, response) => {
        const origin = String(request.headers.origin || '');
        if (request.method === 'OPTIONS') {
          writeJson(response, 204, {}, origin);
          return;
        }
        if (origin && !ALLOWED_ORIGINS.has(origin)) {
          writeJson(response, 403, { error: '只允许本机 Summer 工作台连接' }, origin);
          return;
        }
        if (request.method === 'GET' && request.url === '/health') {
          writeJson(response, 200, { ok: true, plugin: 'summer-workbench', port: PORT }, origin);
          return;
        }
        if (request.method !== 'POST' || request.url !== '/deliver') {
          writeJson(response, 404, { error: 'Not found' }, origin);
          return;
        }
        try {
          const payload = JSON.parse(await readBody(request)) as { type?: string; card?: DailyExperienceCard };
          if (payload.type !== 'daily-experience' || !payload.card?.id) {
            writeJson(response, 400, { error: '无效的今日经历卡' }, origin);
            return;
          }
          await ctx.deliver({
            sessionId: ['dm', SENDER_ID],
            sender: { id: SENDER_ID, name: 'Summer 工作台' },
            deliveryContext: { to: SENDER_ID, messageId: payload.card.id },
            message: cardMessage(payload.card),
          });
          writeJson(response, 202, { ok: true, delivered: true, id: payload.card.id }, origin);
        } catch (error) {
          ctx.logger.error(`Unable to deliver workbench card: ${String(error)}`);
          writeJson(response, 400, { error: error instanceof Error ? error.message : '经历卡发送失败' }, origin);
        }
      });
      await new Promise<void>((resolve, reject) => {
        ctx.state.server?.once('error', reject);
        ctx.state.server?.listen(PORT, '127.0.0.1', () => resolve());
      });
      ctx.logger.info(`Summer Workbench bridge listening on 127.0.0.1:${PORT}`);
    },
    async stop(ctx: GatewayContext<GatewayState>) {
      await new Promise<void>(resolve => {
        if (!ctx.state.server) return resolve();
        ctx.state.server.close(() => resolve());
      });
      ctx.state.server = undefined;
    },
    getStatus() {
      return { connected: true, configured: true };
    },
  },
  outbound: {
    async sendText(ctx: OutboundContext) {
      ctx.logger.info(`Cola replied in the shared Summer Workbench session: ${ctx.text.slice(0, 120)}`);
    },
  },
});
