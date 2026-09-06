(() => {
  const $ = selector => document.querySelector(selector);
  const statusElement = $('#syncState');
  const accountButton = $('#accountButton');
  const profileButton = $('#profileButton');
  const authModal = $('#authModal');
  const authClose = $('#authClose');
  const authForm = $('#authForm');
  const authEmail = $('#authEmail');
  const authSubmit = $('#authSubmit');
  const authFeedback = $('#authFeedback');
  const pairStartTab = $('#pairStartTab');
  const pairJoinTab = $('#pairJoinTab');
  const pairStartPanel = $('#pairStartPanel');
  const pairStartButton = $('#pairStartButton');
  const pairCode = $('#pairCode');
  const pairHint = $('#pairHint');
  const nameModal = $('#nameModal');
  const nameForm = $('#nameForm');
  const nameInput = $('#nameInput');
  const nameClose = $('#nameClose');
  const nameSave = $('#nameSave');
  const avatarInput = $('#avatarInput');
  const avatarPreview = $('#avatarPreview');
  const workspaceAvatar = $('#workspaceAvatar');
  const resetWorkspace = $('#resetWorkspace');
  const workspaceName = $('#workspaceName');
  const brandInitial = $('#brandInitial');
  const installButton = $('#installButton');
  const refreshAppButton = $('#refreshAppButton');
  const iosInstallModal = $('#iosInstallModal');
  const iosInstallClose = $('#iosInstallClose');
  let revision = 0;
  let displayName = '';
  let initialized = false;
  let uploadTimer = null;
  let syncing = false;
  let deferredInstallPrompt = null;
  let pendingAvatar = null;
  let avatarUrl = '/avatar.png';

  function setStatus(label, tone = '') {
    statusElement.querySelector('span').textContent = label;
    statusElement.dataset.tone = tone;
  }

  function setFeedback(message, error = false) {
    authFeedback.textContent = message;
    authFeedback.classList.toggle('error', error);
  }

  async function readJsonResponse(response, fallbackMessage) {
    const text = await response.text();
    if (!text) {
      if (!response.ok) throw new Error(fallbackMessage);
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(response.ok ? '服务器返回异常，请刷新后重试' : fallbackMessage);
    }
  }

  function applyName(name) {
    displayName = String(name || '').trim().slice(0, 16);
    const label = displayName ? `${displayName} OS` : 'MY OS';
    workspaceName.textContent = label.toUpperCase();
    brandInitial.textContent = (displayName || 'M').slice(0, 1).toUpperCase();
    document.title = `${displayName || '我的'}工作台 · 今日`;
  }

  function applyAvatar(url) {
    avatarUrl = url || '/avatar.png';
    const separator = avatarUrl.includes('?') ? '&' : '?';
    const freshUrl = `${avatarUrl}${separator}t=${Date.now()}`;
    workspaceAvatar.src = freshUrl;
    avatarPreview.src = freshUrl;
  }

  function openNameModal(required = false) {
    nameInput.value = displayName;
    avatarPreview.src = workspaceAvatar.src || avatarUrl;
    nameClose.hidden = required;
    resetWorkspace.hidden = required;
    nameModal.hidden = false;
    setTimeout(() => nameInput.focus(), 0);
  }

  function closeNameModal() {
    if (!displayName) return;
    nameModal.hidden = true;
    pendingAvatar = null;
    avatarInput.value = '';
    profileButton.focus();
  }

  function openAuthModal() {
    authModal.hidden = false;
    setFeedback('');
    showPairMode('start');
    pairCode.hidden = true;
    pairCode.textContent = '';
    pairHint.textContent = '';
  }

  function closeAuthModal() {
    authModal.hidden = true;
    accountButton.focus();
  }

  function showPairMode(mode) {
    const joining = mode === 'join';
    pairStartTab.classList.toggle('active', !joining);
    pairJoinTab.classList.toggle('active', joining);
    pairStartPanel.hidden = joining;
    authForm.hidden = !joining;
    setFeedback('');
    if (joining) setTimeout(() => authEmail.focus(), 0);
  }

  function applyWorkspace(workspace) {
    if (!workspace) return;
    revision = Number(workspace.revision || 0);
    applyName(workspace.displayName || '');
    applyAvatar(workspace.avatarUrl || '/avatar.png');
    const remoteState = workspace.state;
    if (remoteState && typeof remoteState === 'object' && Object.keys(remoteState).length) {
      window.SummerOS.applyRemoteState(remoteState);
    }
  }

  async function fetchWorkspace() {
    const response = await fetch('/api/workspace', { cache: 'no-store' });
    if (!response.ok) throw new Error('工作台暂时连接不上');
    return response.json();
  }

  async function uploadState() {
    if (!initialized || syncing || !navigator.onLine) return;
    syncing = true;
    setStatus('同步中…', 'working');
    try {
      const response = await fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName, state: window.SummerOS.getState(), revision })
      });
      const data = await response.json();
      if (response.status === 409 && data.workspace) {
        applyWorkspace(data.workspace);
      } else if (!response.ok) {
        throw new Error(data.error || '同步失败');
      } else {
        revision = Number(data.revision || revision + 1);
      }
      setStatus('已同步', 'ready');
    } catch (error) {
      setStatus(navigator.onLine ? '同步失败' : '离线 · 已缓存', navigator.onLine ? 'error' : 'offline');
      console.error('Workspace sync failed:', error);
    } finally {
      syncing = false;
    }
  }

  function scheduleUpload() {
    if (!initialized) return;
    setStatus(navigator.onLine ? '待同步' : '离线 · 已缓存', navigator.onLine ? 'working' : 'offline');
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(uploadState, 700);
  }

  async function initialize() {
    setStatus('正在连接…', 'working');
    try {
      const params = new URLSearchParams(location.search);
      if (params.get('fresh') === '1') {
        await fetch('/api/reset', { method: 'POST' });
        history.replaceState({}, '', `${location.pathname}${location.hash}`);
      }
      const workspace = await fetchWorkspace();
      revision = Number(workspace.revision || 0);
      applyName(workspace.displayName || '');
      applyAvatar(workspace.avatarUrl || '/avatar.png');
      if (workspace.state && typeof workspace.state === 'object' && Object.keys(workspace.state).length) {
        window.SummerOS.applyRemoteState(workspace.state);
      }
      initialized = true;
      setStatus('已同步', 'ready');
      if (!displayName) {
        openNameModal(true);
      } else if (!workspace.state || !Object.keys(workspace.state).length) {
        await uploadState();
      }
    } catch (error) {
      initialized = true;
      setStatus('本机可用 · 待联网', 'offline');
      console.error('Workspace initialization failed:', error);
    }
  }

  window.addEventListener('summer-os:state-saved', scheduleUpload);
  window.addEventListener('online', () => { setStatus('待同步', 'working'); uploadState(); });
  window.addEventListener('offline', () => setStatus('离线 · 已缓存', 'offline'));

  async function refreshInstalledApp() {
    refreshAppButton.disabled = true;
    refreshAppButton.textContent = '刷新中…';
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update().catch(() => {});
          if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    } finally {
      window.location.reload();
    }
  }

  refreshAppButton.addEventListener('click', refreshInstalledApp);

  nameForm.addEventListener('submit', async event => {
    event.preventDefault();
    const name = nameInput.value.trim().slice(0, 16);
    if (!name) return;
    nameSave.disabled = true;
    nameSave.textContent = '正在保存…';
    applyName(name);
    await uploadState();
    if (pendingAvatar) {
      try {
        const form = new FormData();
        form.append('avatar', pendingAvatar, 'avatar.webp');
        const response = await fetch('/api/avatar', { method: 'POST', body: form });
        const data = await readJsonResponse(response, '头像上传失败，请稍后再试');
        if (!response.ok) throw new Error(data.error || '头像上传失败');
        applyWorkspace(data);
      } catch (error) {
        alert(error instanceof Error ? error.message : '头像上传失败');
      }
    }
    pendingAvatar = null;
    avatarInput.value = '';
    nameModal.hidden = false;
    closeNameModal();
    nameSave.disabled = false;
    nameSave.textContent = '保存个人设置';
  });

  profileButton.addEventListener('click', () => openNameModal(false));
  nameClose.addEventListener('click', closeNameModal);
  nameModal.addEventListener('click', event => { if (event.target === nameModal) closeNameModal(); });

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('请使用 JPG、PNG 或 WebP 图片');
      avatarInput.value = '';
      return;
    }
    try {
      const image = await createImageBitmap(file);
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      const sourceSize = Math.min(image.width, image.height);
      const sourceX = (image.width - sourceSize) / 2;
      const sourceY = (image.height - sourceSize) / 2;
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
      image.close();
      pendingAvatar = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片处理失败')), 'image/webp', .8));
      avatarPreview.src = URL.createObjectURL(pendingAvatar);
    } catch {
      alert('这张图片暂时无法读取，请换一张再试');
      avatarInput.value = '';
    }
  });

  resetWorkspace.addEventListener('click', () => {
    if (!confirm('确定清空当前测试数据，并从第一次打开重新开始吗？')) return;
    localStorage.removeItem('summer-os-minimum-v1');
    location.href = '/?fresh=1';
  });

  accountButton.addEventListener('click', openAuthModal);
  authClose.addEventListener('click', closeAuthModal);
  authModal.addEventListener('click', event => { if (event.target === authModal) closeAuthModal(); });
  pairStartTab.addEventListener('click', () => showPairMode('start'));
  pairJoinTab.addEventListener('click', () => showPairMode('join'));

  pairStartButton.addEventListener('click', async () => {
    pairStartButton.disabled = true;
    pairHint.textContent = '正在生成…';
    try {
      await uploadState();
      const response = await fetch('/api/pair/start', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '暂时无法生成同步码');
      pairCode.textContent = `${data.code.slice(0, 3)} · ${data.code.slice(3)}`;
      pairCode.hidden = false;
      pairHint.textContent = '5 分钟有效，用过即失效';
    } catch (error) {
      pairHint.textContent = error instanceof Error ? error.message : '暂时无法生成同步码';
    } finally {
      pairStartButton.disabled = false;
    }
  });

  authEmail.addEventListener('input', () => {
    authEmail.value = authEmail.value.replace(/\D/g, '').slice(0, 6);
  });

  authForm.addEventListener('submit', async event => {
    event.preventDefault();
    authSubmit.disabled = true;
    setFeedback('正在连接…');
    try {
      const response = await fetch('/api/pair/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: authEmail.value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '连接失败');
      applyWorkspace(data.workspace);
      setFeedback('连接成功，这台设备会自动同步。');
      setTimeout(closeAuthModal, 700);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '连接失败', true);
    } finally {
      authSubmit.disabled = false;
    }
  });

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  installButton.hidden = !(isIos && !isStandalone);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
  });
  window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; installButton.hidden = true; });
  installButton.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installButton.hidden = true;
    } else if (isIos) {
      iosInstallModal.hidden = false;
      iosInstallClose.focus();
    }
  });
  iosInstallClose.addEventListener('click', () => { iosInstallModal.hidden = true; installButton.focus(); });
  iosInstallModal.addEventListener('click', event => { if (event.target === iosInstallModal) iosInstallClose.click(); });

  setInterval(async () => {
    if (!initialized || syncing || !navigator.onLine) return;
    try {
      const workspace = await fetchWorkspace();
      if (Number(workspace.revision || 0) > revision) {
        applyWorkspace(workspace);
        setStatus('已同步', 'ready');
      }
    } catch {
      // 短暂断网时保留当前页面，下一轮自动重试。
    }
  }, 5000);

  if (window.SummerOS) initialize();
  else window.addEventListener('summer-os:ready', initialize, { once: true });
})();
