import { createServer } from 'node:http';
import { ensureDataDir, readActions, readState, safeState, statePath, writeJsonAtomic, actionsPath } from './shared.mjs';

const PORT = Number(process.env.SUMMER_WORKBENCH_BRIDGE_PORT || 43128);
const ALLOWED_ORIGINS = new Set(['http://127.0.0.1:8765', 'http://localhost:8765']);
const MAX_BODY_SIZE = 2_000_000;

function writeJson(response, status, body, origin = '') {
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

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error('工作台数据太大，连接器已拒绝本次同步'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function handle(request, response) {
  const origin = String(request.headers.origin || '');
  if (request.method === 'OPTIONS') {
    writeJson(response, 204, {}, origin);
    return;
  }
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    writeJson(response, 403, { error: '只允许本机工作台连接' }, origin);
    return;
  }
  if (request.method === 'GET' && request.url === '/health') {
    writeJson(response, 200, { ok: true, connector: 'summer-workbench', port: PORT });
    return;
  }
  if (request.method === 'GET' && request.url === '/actions') {
    writeJson(response, 200, { actions: await readActions() }, origin);
    return;
  }
  if (request.method === 'GET' && request.url === '/state') {
    writeJson(response, 200, { state: await readState() }, origin);
    return;
  }
  if (request.method !== 'POST') {
    writeJson(response, 404, { error: 'Not found' }, origin);
    return;
  }
  try {
    const payload = JSON.parse(await readBody(request));
    if (request.url === '/state') {
      await writeJsonAtomic(statePath, safeState(payload.state));
      writeJson(response, 202, { ok: true }, origin);
      return;
    }
    if (request.url === '/actions/ack') {
      const ids = new Set(Array.isArray(payload.ids) ? payload.ids.map(String) : []);
      const remaining = (await readActions()).filter(action => !ids.has(String(action.id)));
      await writeJsonAtomic(actionsPath, remaining);
      writeJson(response, 202, { ok: true, acknowledged: ids.size }, origin);
      return;
    }
    writeJson(response, 404, { error: 'Not found' }, origin);
  } catch (error) {
    writeJson(response, 400, { error: error instanceof Error ? error.message : '连接器请求失败' }, origin);
  }
}

await ensureDataDir();
const server = createServer((request, response) => {
  handle(request, response).catch(error => {
    writeJson(response, 500, { error: error instanceof Error ? error.message : '连接器内部错误' });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.error(`Summer Workbench connector bridge listening on 127.0.0.1:${PORT}`);
});
