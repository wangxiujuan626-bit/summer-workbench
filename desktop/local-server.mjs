import http from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, copyFile, unlink, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
const MAX_BODY = 2_000_000;
const PAIR_TTL_MS = 10 * 60 * 1000;
const DEVICE_COOKIE = 'summer_local_device';
const PUBLIC_FILES = new Set([
  'index.html', 'app.js', 'ai-connector.js', 'avatar-default.svg', 'cola.js',
  'day-rollover.js', 'favicon.svg', 'file.svg', 'globe.svg', 'icon-192.png',
  'icon-512.png', 'manifest.webmanifest', 'qr.js', 'styles.css', 'sw.js',
  'sync.js', 'update.json', 'window.svg',
]);

let queue = Promise.resolve();

function withLock(task) {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

function now() {
  return Date.now();
}

function cleanName(value) {
  return String(value || '').trim().replace(/[<>]/g, '').slice(0, 16);
}

function cleanState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const encoded = JSON.stringify(value);
  if (encoded.length > 250_000) throw new Error('工作台记录太大，已拒绝本次同步');
  return value;
}

function emptyData() {
  return { workspaces: {}, devices: {}, pairCodes: {} };
}

function newWorkspace() {
  return {
    displayName: '',
    avatarUrl: '/avatar-default.svg',
    state: {},
    revision: 1,
    updatedAt: now(),
  };
}

function validData(data) {
  return data && typeof data === 'object'
    && ['workspaces', 'devices', 'pairCodes'].every((key) => data[key] && typeof data[key] === 'object' && !Array.isArray(data[key]));
}

async function readData(path, backupPath) {
  for (const candidate of [path, backupPath]) {
    if (!existsSync(candidate)) continue;
    try {
      const data = JSON.parse(await readFile(candidate, 'utf8'));
      if (validData(data)) return data;
    } catch {
      // Try the backup before refusing to write anything.
    }
  }
  if (existsSync(path) || existsSync(backupPath)) {
    throw new Error('本地记录无法读取，已停止写入以保护原文件；请先备份并检查数据文件');
  }
  return emptyData();
}

async function writeData(path, backupPath, data) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.tmp`;
  if (existsSync(path)) {
    try {
      const current = JSON.parse(await readFile(path, 'utf8'));
      if (validData(current)) await copyFile(path, backupPath);
    } catch {
      // Keep the previous backup if the primary is malformed.
    }
  }
  await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
  await rename(temporary, path);
}

function tokenFrom(request) {
  const cookie = request.headers.cookie || '';
  const match = cookie.match(new RegExp(`${DEVICE_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function newToken() {
  return randomBytes(24).toString('base64url');
}

function ensureDevice(data, token) {
  if (token && data.devices[token]) {
    data.devices[token].lastSeenAt = now();
    return { token, device: data.devices[token], isNew: false };
  }
  const nextToken = newToken();
  const workspaceId = randomUUID();
  data.devices[nextToken] = { workspaceId, lastSeenAt: now() };
  data.workspaces[workspaceId] = newWorkspace();
  return { token: nextToken, device: data.devices[nextToken], isNew: true };
}

function workspacePayload(data, workspaceId) {
  const workspace = data.workspaces[workspaceId] || newWorkspace();
  return {
    workspaceId,
    displayName: workspace.displayName || '',
    avatarUrl: workspace.avatarUrl || '/avatar-default.svg',
    state: workspace.state || {},
    revision: Number(workspace.revision || 1),
    updatedAt: Number(workspace.updatedAt || now()),
  };
}

function prunePairCodes(data) {
  const current = now();
  for (const [code, pair] of Object.entries(data.pairCodes)) {
    if (!pair || Number(pair.expiresAt || 0) < current) delete data.pairCodes[code];
  }
}

function localIp() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

function lanUrl(port) {
  return `http://${localIp()}:${port}/`;
}

function sendJson(response, status, payload, token = null) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    ...(token ? { 'Set-Cookie': `${DEVICE_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; SameSite=Lax` } : {}),
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('工作台数据太大，已拒绝本次同步');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function mimeType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.json') || file.endsWith('.webmanifest')) return 'application/json; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function createRequestHandler({ root, dataPath, port }) {
  const backupPath = `${dataPath}.bak`;

  async function api(request, response, url) {
    const path = url.pathname;
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': request.headers.origin || '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      });
      response.end();
      return;
    }

    try {
      const result = await withLock(async () => {
        const data = await readData(dataPath, backupPath);
        prunePairCodes(data);
        const identity = ensureDevice(data, tokenFrom(request));
        const { token, device, isNew } = identity;

        if (request.method === 'GET' && path === '/api/local/health') {
          await writeData(dataPath, backupPath, data);
          return { status: 200, payload: { ok: true, mode: 'local-lan', lanUrl: lanUrl(port) }, token: isNew ? token : null };
        }
        if (request.method === 'GET' && path === '/api/local/workspace') {
          await writeData(dataPath, backupPath, data);
          return { status: 200, payload: workspacePayload(data, device.workspaceId), token: isNew ? token : null };
        }
        if (request.method === 'POST' && path === '/api/local/pair/start') {
          const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
          const expiresAt = now() + PAIR_TTL_MS;
          data.pairCodes[code] = { workspaceId: device.workspaceId, creatorToken: token, expiresAt, joinedTokens: [] };
          await writeData(dataPath, backupPath, data);
          return {
            status: 200,
            payload: { code, expiresAt, lanUrl: lanUrl(port), pairUrl: `${lanUrl(port)}?pair=${code}` },
            token: isNew ? token : null,
          };
        }
        if (request.method === 'POST' && path === '/api/local/pair/join') {
          const body = await readBody(request);
          const code = String(body.code || '').replaceAll(' ', '');
          const pair = data.pairCodes[code];
          if (!pair || pair.expiresAt < now()) return { status: 400, payload: { error: '同步码无效或已过期' }, token: isNew ? token : null };
          if (pair.creatorToken === token) return { status: 400, payload: { error: '不能连接当前这台设备' }, token: isNew ? token : null };
          device.workspaceId = pair.workspaceId;
          pair.joinedTokens = pair.joinedTokens || [];
          if (!pair.joinedTokens.includes(token)) pair.joinedTokens.push(token);
          await writeData(dataPath, backupPath, data);
          return { status: 200, payload: { workspace: workspacePayload(data, device.workspaceId) }, token: isNew ? token : null };
        }
        if (request.method === 'POST' && path === '/api/local/reset') {
          data.workspaces[device.workspaceId] = newWorkspace();
          await writeData(dataPath, backupPath, data);
          return { status: 200, payload: workspacePayload(data, device.workspaceId), token: isNew ? token : null };
        }
        if (request.method === 'PUT' && path === '/api/local/workspace') {
          const body = await readBody(request);
          const current = workspacePayload(data, device.workspaceId);
          const requestedRevision = Number(body.revision || 0);
          if (requestedRevision !== current.revision) {
            return { status: 409, payload: { error: '另一台设备已有更新', workspace: current }, token: isNew ? token : null };
          }
          const avatarUrl = String(body.avatarUrl || current.avatarUrl);
          if (avatarUrl.length > 1_500_000) throw new Error('头像文件太大，请换一张小一点的图片');
          data.workspaces[device.workspaceId] = {
            ...data.workspaces[device.workspaceId],
            displayName: cleanName(body.displayName),
            avatarUrl,
            state: cleanState(body.state),
            revision: current.revision + 1,
            updatedAt: now(),
          };
          await writeData(dataPath, backupPath, data);
          return { status: 200, payload: workspacePayload(data, device.workspaceId), token: isNew ? token : null };
        }
        return { status: 404, payload: { error: '本地同步地址不存在' }, token: isNew ? token : null };
      });
      sendJson(response, result.status, result.payload, result.token);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : '请求格式不正确' });
    }
  }

  return async (request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
    if (url.pathname.startsWith('/api/local/')) {
      await api(request, response, url);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(404);
      response.end();
      return;
    }
    const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (!PUBLIC_FILES.has(requested) || basename(requested) !== requested) {
      response.writeHead(404);
      response.end();
      return;
    }
    const filePath = join(root, requested);
    try {
      const content = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': mimeType(requested), 'Cache-Control': 'no-store', 'Content-Length': content.length });
      if (request.method === 'HEAD') response.end();
      else response.end(content);
    } catch {
      response.writeHead(404);
      response.end();
    }
  };
}

export async function startLocalServer({ root, dataPath, port = 8765, host = '0.0.0.0' } = {}) {
  const resolvedRoot = root || join(HERE, 'workbench');
  const resolvedDataPath = dataPath || join(process.cwd(), 'workspace.json');
  const server = http.createServer(createRequestHandler({ root: resolvedRoot, dataPath: resolvedDataPath, port }));
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolvePromise();
    });
  });
  return { server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}/` };
}
