(() => {
  const BRIDGE_URL = 'http://127.0.0.1:43127';

  async function request(path, options = {}) {
    const response = await fetch(`${BRIDGE_URL}${path}`, {
      ...options,
      headers: { accept: 'application/json', ...(options.headers || {}) },
      mode: 'cors',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Cola 连接失败');
    return data;
  }

  window.SummerCola = {
    bridgeUrl: BRIDGE_URL,
    async check() {
      if (location.protocol === 'https:') throw new Error('在线版不能直接连接本机 Cola，请使用 GitHub 下载版');
      return request('/health');
    },
    async deliver(card) {
      if (location.protocol === 'https:') throw new Error('在线版不能直接连接本机 Cola，请使用 GitHub 下载版');
      return request('/deliver', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'daily-experience', card }),
      });
    },
  };
})();
