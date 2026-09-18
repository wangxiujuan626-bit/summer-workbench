import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/sync.js', import.meta.url), 'utf8');

function harness() {
  const values = new Map();
  const elements = new Map();
  const windowListeners = {};
  const element = selector => {
    if (!elements.has(selector)) {
      elements.set(selector, {
        listeners: {}, hidden: true, textContent: '', src: '', dataset: {}, classList: { toggle() {} },
        addEventListener(event, handler) { this.listeners[event] = handler; },
        querySelector: () => element(`${selector} span`),
        focus() {},
      });
    }
    return elements.get(selector);
  };
  let currentState = { tasks: [{ id: 'local', title: '本机修改' }] };
  let remoteState = { tasks: [{ id: 'remote', title: '另一台修改' }] };
  let remoteRevision = 1;
  const puts = [];
  let conflictOnce = false;
  const jsonResponse = (status, data) => ({ status, ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(data), json: async () => data });
  const fetch = async (path, options = {}) => {
    if (String(path).startsWith('https://raw.githubusercontent.com/')) return jsonResponse(200, { version: '1.1.0' });
    if (path === '/api/local/workspace' && options.method === 'PUT') {
      const body = JSON.parse(options.body);
      puts.push(body);
      if (conflictOnce) {
        conflictOnce = false;
        remoteRevision += 1;
        return jsonResponse(409, { workspace: workspace() });
      }
      assert.equal(body.revision, remoteRevision);
      remoteState = body.state;
      remoteRevision += 1;
      return jsonResponse(200, workspace());
    }
    if (path === '/api/local/workspace') return jsonResponse(200, workspace());
    throw new Error(`Unexpected request ${path}`);
  };
  function workspace() {
    return { workspaceId: 'ws-one', revision: remoteRevision, displayName: '使用者',
      avatarUrl: '/avatar-default.svg', state: remoteState };
  }
  const window = {
    SummerOS: {
      getState: () => structuredClone(currentState),
      applyRemoteState: state => { currentState = structuredClone(state); },
      mergeRemoteState: (remote, local) => ({ tasks: [...remote.tasks, ...local.tasks] }),
      getSyncConflictCount: () => 0,
    },
    matchMedia: () => ({ matches: false }),
    addEventListener(event, handler) { windowListeners[event] = handler; },
    open() {},
  };
  const context = {
    document: { querySelector: element, title: '' }, localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    },
    window, location: { protocol: 'http:', search: '', pathname: '/' },
    navigator: { onLine: true, userAgent: 'desktop' },
    fetch, URLSearchParams, AbortController, Date, setTimeout, clearTimeout,
    structuredClone, console, history: { replaceState() {} },
  };
  vm.runInNewContext(source, context);
  return { values, element, puts, setConflict: () => { conflictOnce = true; },
    editLocally: () => {
      currentState = { tasks: [{ id: 'local', title: '本机修改' }] };
      windowListeners['summer-os:state-saved']();
    }, getState: () => currentState };
}

test('one click completes conflict merge and uploads both device changes', async () => {
  const app = harness();
  await new Promise(resolve => setTimeout(resolve, 0));
  app.editLocally();
  app.setConflict();
  await app.element('#refreshAppButton').listeners.click();
  assert.equal(app.puts.length, 2);
  assert.deepEqual(app.puts[1].state.tasks.map(item => item.id), ['remote', 'local']);
  assert.equal(app.values.has('summer-os-pending-sync-v1'), false);
  assert.equal(app.element('#syncState span').textContent, '已同步');
});
