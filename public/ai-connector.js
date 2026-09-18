(() => {
  const BRIDGE_URL = 'http://127.0.0.1:43128';
  const LOCAL_ORIGINS = new Set(['http://127.0.0.1:8765', 'http://localhost:8765']);
  let pollTimer = null;

  function isLocalWorkBench() {
    return LOCAL_ORIGINS.has(window.location.origin);
  }

  async function request(path, options = {}) {
    const response = await fetch(`${BRIDGE_URL}${path}`, {
      ...options,
      headers: { accept: 'application/json', ...(options.headers || {}) },
      mode: 'cors',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '通用 AI 连接器请求失败');
    return data;
  }

  function safeState(state) {
    const reviews = Array.isArray(state?.dailyReviews) ? state.dailyReviews.map(review => {
      const safeReview = { ...(review || {}) };
      delete safeReview.privateNotes;
      return safeReview;
    }) : [];
    return {
      date: state?.date || '',
      planDate: state?.planDate || '',
      commitment: state?.commitment || '',
      nextStep: state?.nextStep || '',
      tomorrow: state?.tomorrow || '',
      mode: state?.mode || 'flow',
      tasks: Array.isArray(state?.tasks) ? state.tasks : [],
      decisions: Array.isArray(state?.decisions) ? state.decisions : [],
      captures: Array.isArray(state?.captures) ? state.captures : [],
      memoryItems: Array.isArray(state?.memoryItems) ? state.memoryItems : [],
      scheduleItems: Array.isArray(state?.scheduleItems) ? state.scheduleItems : [],
      plans: Array.isArray(state?.plans) ? state.plans : [],
      dailyReviews: reviews,
    };
  }

  async function syncState(state = window.SummerOS?.getState()) {
    if (!isLocalWorkBench() || !state) return false;
    try {
      await request('/state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: safeState(state) }),
      });
      return true;
    } catch {
      return false;
    }
  }

  async function pullActions() {
    if (!isLocalWorkBench() || !window.SummerOS) return false;
    try {
      const data = await request('/actions');
      const appliedIds = [];
      for (const action of Array.isArray(data.actions) ? data.actions : []) {
        const result = window.SummerOS.applyConnectorAction(action);
        if (result?.accepted || result?.duplicate) appliedIds.push(action.id);
      }
      if (appliedIds.length) {
        await request('/actions/ack', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids: appliedIds }),
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  async function check() {
    if (!isLocalWorkBench()) throw new Error('在线版不能直接连接本机 AI 连接器，请使用本地下载版');
    return request('/health');
  }

  function start() {
    if (!isLocalWorkBench() || pollTimer) return;
    window.addEventListener('summer-os:state-saved', event => syncState(event.detail));
    syncState();
    pullActions();
    pollTimer = window.setInterval(pullActions, 1800);
  }

  window.SummerAIConnector = {
    bridgeUrl: BRIDGE_URL,
    check,
    sync: syncState,
    pullActions,
  };

  if (window.SummerOS) start();
  else window.addEventListener('summer-os:ready', start, { once: true });
})();
