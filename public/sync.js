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
  const pairShare = $('#pairShare');
  const pairQr = $('#pairQr');
  const pairUrl = $('#pairUrl');
  const copyPairUrl = $('#copyPairUrl');
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
  const updateNotice = $('#updateNotice');
  const updateNoticeText = $('#updateNoticeText');
  const updateOpenButton = $('#updateOpenButton');
  const updateDismissButton = $('#updateDismissButton');
  const PENDING_SYNC_KEY = 'summer-os-pending-sync-v1';
  const DISPLAY_NAME_KEY = 'summer-os-display-name-v1';
  const LOCAL_AVATAR_KEY = 'summer-os-avatar-v1';
  const LOCAL_AVATAR_BACKUP_KEY = 'summer-os-avatar-backup-v1';
  const WORKSPACE_ID_KEY = 'summer-os-workspace-id-v1';
  const PAIR_HANDOFF_KEY = 'summer-os-pair-handoff-v1';
  const UPDATE_DISMISSED_KEY = 'summer-os-update-dismissed-v1';
  const APP_VERSION = '1.1.1';
  const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/wangxiujuan626-bit/summer-workbench/main/public/update.json';
  // HTTP is reserved for the local package; the hosted version is HTTPS.
  const localOnly = location.protocol === 'file:' || location.protocol === 'http:';
  const workspaceApiPath = localOnly ? '/api/local/workspace' : '/api/workspace';
  let revision = 0;
  let displayName = localStorage.getItem(DISPLAY_NAME_KEY) || '';
  let initialized = false;
  let syncing = false;
  let pendingUpload = localStorage.getItem(PENDING_SYNC_KEY) === '1';
  let deferredInstallPrompt = null;
  let pendingAvatar = null;
  let avatarUrl = localStorage.getItem(LOCAL_AVATAR_KEY) || '/avatar-default.svg';
  let avatarFallbackAttempted = false;
  let workspaceMismatch = false;

  function setStatus(label, tone = '') {
    statusElement.querySelector('span').textContent = label;
    statusElement.dataset.tone = tone;
  }

  function markPendingUpload() {
    pendingUpload = true;
    localStorage.setItem(PENDING_SYNC_KEY, '1');
  }

  function clearPendingUpload() {
    pendingUpload = false;
    localStorage.removeItem(PENDING_SYNC_KEY);
  }

  function rememberPairHandoff(code) {
    const normalized = String(code || '').replace(/\D/g, '').slice(0, 6);
    if (normalized.length === 6) localStorage.setItem(PAIR_HANDOFF_KEY, normalized);
  }

  function hasRememberedPairHandoff(code) {
    const normalized = String(code || '').replace(/\D/g, '').slice(0, 6);
    return normalized.length === 6 && localStorage.getItem(PAIR_HANDOFF_KEY) === normalized;
  }

  function persistLocalAvatar(url) {
    try {
      const normalized = String(url || '').trim();
      if (!normalized || normalized === '/avatar-default.svg') return true;
      const previous = localStorage.getItem(LOCAL_AVATAR_KEY);
      if (previous && previous !== normalized) localStorage.setItem(LOCAL_AVATAR_BACKUP_KEY, previous);
      localStorage.setItem(LOCAL_AVATAR_KEY, normalized);
      return true;
    } catch (error) {
      console.error('Local avatar persistence failed:', error);
      return false;
    }
  }

  function setLocalStatus() {
    setStatus(localOnly ? '本机保存 · 可连接设备' : '已保存到本机', 'local');
    if (localOnly) {
      accountButton.hidden = false;
      refreshAppButton.title = '刷新并同步已连接设备';
    }
  }

  function setFeedback(message, error = false) {
    authFeedback.textContent = message;
    authFeedback.classList.toggle('error', error);
  }

  function compareVersions(left, right) {
    const parse = value => String(value || '0').split('.').map(part => Number.parseInt(part, 10) || 0);
    const a = parse(left);
    const b = parse(right);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
    }
    return 0;
  }

  async function checkForUpdates() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const manifest = await response.json();
      if (!manifest?.version || compareVersions(manifest.version, APP_VERSION) <= 0) return null;
      if (localStorage.getItem(UPDATE_DISMISSED_KEY) === String(manifest.version)) return manifest;
      updateNoticeText.textContent = `发现工作台 v${manifest.version}，当前版本 v${APP_VERSION}。记录会保留，更新后无需重新设置。`;
      updateNotice.hidden = false;
      updateOpenButton.onclick = () => window.open(manifest.downloadUrl || 'https://github.com/wangxiujuan626-bit/summer-workbench', '_blank', 'noopener,noreferrer');
      updateDismissButton.onclick = () => {
        localStorage.setItem(UPDATE_DISMISSED_KEY, String(manifest.version));
        updateNotice.hidden = true;
      };
      return manifest;
    } catch (error) {
      // 更新检查不是工作台运行条件；离线时安静跳过。
      console.debug('Update check skipped:', error);
      return null;
    }
  }

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const helper = document.createElement('textarea');
    helper.value = value;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand('copy');
    helper.remove();
    if (!copied) throw new Error('复制失败，请长按地址复制');
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
    if (displayName) localStorage.setItem(DISPLAY_NAME_KEY, displayName);
    else localStorage.removeItem(DISPLAY_NAME_KEY);
    const label = displayName ? `${displayName} OS` : 'MY OS';
    workspaceName.textContent = label.toUpperCase();
    brandInitial.textContent = (displayName || 'M').slice(0, 1).toUpperCase();
    document.title = `${displayName || '我的'}工作台 · 今日`;
  }

  function applyAvatar(url, allowCache = true) {
    const cachedAvatar = localStorage.getItem(LOCAL_AVATAR_KEY) || localStorage.getItem(LOCAL_AVATAR_BACKUP_KEY) || '';
    const requestedAvatar = String(url || '').trim();
    avatarUrl = requestedAvatar && requestedAvatar !== '/avatar-default.svg'
      ? requestedAvatar
      : (allowCache ? cachedAvatar : '') || '/avatar-default.svg';
    persistLocalAvatar(avatarUrl);
    const freshUrl = avatarUrl.startsWith('data:')
      ? avatarUrl
      : `${avatarUrl}${avatarUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
    workspaceAvatar.src = freshUrl;
    avatarPreview.src = freshUrl;
  }

  function recoverAvatarAfterLoadFailure() {
    if (avatarFallbackAttempted) return;
    avatarFallbackAttempted = true;
    const backup = localStorage.getItem(LOCAL_AVATAR_BACKUP_KEY);
    const fallback = backup && backup !== avatarUrl ? backup : '/avatar-default.svg';
    // Do not reselect a broken cached image when falling back to the default.
    applyAvatar(fallback, false);
  }

  workspaceAvatar.addEventListener('load', () => { avatarFallbackAttempted = false; });
  workspaceAvatar.addEventListener('error', recoverAvatarAfterLoadFailure);

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('图片保存失败'));
      reader.readAsDataURL(blob);
    });
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
    pairShare.hidden = true;
    pairUrl.textContent = '';
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

  function applyWorkspace(workspace, joining = false) {
    if (!workspace) return;
    if (joining) workspaceMismatch = false;
    const incomingId = String(workspace.workspaceId || '');
    const previousId = localStorage.getItem(WORKSPACE_ID_KEY);
    const switched = joining || (incomingId && previousId && incomingId !== previousId);
    if (switched) {
      localStorage.removeItem(LOCAL_AVATAR_KEY);
      localStorage.removeItem(LOCAL_AVATAR_BACKUP_KEY);
    }
    if (incomingId) localStorage.setItem(WORKSPACE_ID_KEY, incomingId);
    revision = Number(workspace.revision || 0);
    applyName(workspace.displayName || (switched ? '' : displayName));
    applyAvatar(workspace.avatarUrl || '/avatar-default.svg', !switched);
    const remoteState = workspace.state;
    if (remoteState && typeof remoteState === 'object' && (joining || Object.keys(remoteState).length)) {
      window.SummerOS.applyRemoteState(remoteState);
    }
  }

  async function fetchWorkspace() {
    const response = await fetch(workspaceApiPath, { cache: 'no-store' });
    const data = await readJsonResponse(response, '暂时无法连接同步服务');
    if (!response.ok) throw new Error(data?.error || '暂时无法连接同步服务');
    return data;
  }

  async function joinWorkspaceByCode(code) {
    const response = await fetch(localOnly ? '/api/local/pair/join' : '/api/pair/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await readJsonResponse(response, '暂时无法连接设备，请重新启动工作台后再试');
    if (!response.ok) throw new Error(data?.error || '连接失败');
    if (!data?.workspace) throw new Error('没有找到可同步的工作台');
    return data;
  }

  async function uploadState(attempt = 0) {
    // The local package syncs over the same Wi‑Fi, so it must not depend on
    // the browser's internet-connectivity flag. navigator.onLine can be false
    // while the local server is still reachable on the LAN.
    if (!initialized || syncing || (!localOnly && !navigator.onLine) || !pendingUpload) return false;
    syncing = true;
    setStatus('正在同步…', 'working');
    try {
      for (let retry = attempt; retry <= 1; retry += 1) {
        const body = { displayName, state: window.SummerOS.getState(), revision };
        if (localOnly) body.avatarUrl = avatarUrl;
        const response = await fetch(workspaceApiPath, {
          method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await readJsonResponse(response, '同步稍后会自动重试');
        if (response.status === 409 && data?.workspace) {
          const mergedState = window.SummerOS.mergeRemoteState(data.workspace.state, body.state);
          const localDisplayName = displayName;
          const localAvatar = avatarUrl;
          applyWorkspace({ ...data.workspace, displayName: localDisplayName || data.workspace.displayName, avatarUrl: localAvatar, state: mergedState });
          markPendingUpload();
          if (retry < 1) continue;
          throw new Error('其他设备仍在更新，请再点一次刷新；本机记录已保留');
        }
        if (!response.ok) throw new Error(data?.error || '同步失败');
        revision = Number(data.revision || revision + 1);
        break;
      }
      clearPendingUpload();
      setStatus('已同步', 'ready');
      checkForUpdates();
      return true;
    } catch (error) {
      markPendingUpload();
      setLocalStatus();
      console.error('Workspace sync failed:', error);
      return false;
    } finally {
      syncing = false;
    }
  }

  function scheduleUpload() {
    if (!initialized) return;
    markPendingUpload();
    setLocalStatus();
  }

  async function initialize() {
    setLocalStatus();
    applyAvatar(avatarUrl);
    try {
      const params = new URLSearchParams(location.search);
      const linkPairCode = params.get('pair')?.replace(/\D/g, '').slice(0, 6) || '';
      let pairedFromLink = false;
      let pairLinkFailed = false;
      if (params.get('fresh') === '1') {
        await fetch(localOnly ? '/api/local/reset' : '/api/reset', { method: 'POST' }).catch(() => {});
        history.replaceState({}, '', `${location.pathname}${location.hash}`);
      }
      initialized = true;
      if (localOnly) {
        const rememberedPair = hasRememberedPairHandoff(linkPairCode);
        if (linkPairCode.length === 6 && !rememberedPair) {
          try {
            setStatus('正在连接设备…', 'working');
            const data = await joinWorkspaceByCode(linkPairCode);
            applyWorkspace(data.workspace, true);
            clearPendingUpload();
            rememberPairHandoff(linkPairCode);
            pairedFromLink = true;
            // Keep ?pair=... in the address bar for the short handoff from
            // WeChat to Safari/Chrome. The receiving browser can use the
            // same live code before it expires, then the home-screen app
            // keeps the workspace through its own cookie and local storage.
            setStatus('已连接，可添加到桌面', 'ready');
          } catch (error) {
            pairLinkFailed = true;
            setLocalStatus();
            console.error('Pair link initialization failed:', error);
          }
        } else if (rememberedPair) {
          // This browser already joined this handoff link. Do not retry a
          // code that may have expired; its local workspace is authoritative.
          pairedFromLink = true;
          setStatus('已连接，可添加到桌面', 'ready');
        }
        try {
          if (!pairedFromLink && !pairLinkFailed) {
            const workspace = await fetchWorkspace();
            const savedWorkspaceId = localStorage.getItem(WORKSPACE_ID_KEY);
            if (savedWorkspaceId && workspace.workspaceId && savedWorkspaceId !== workspace.workspaceId) {
              workspaceMismatch = true;
              setStatus('工作台已更换，请重新连接设备；本机记录未上传', 'working');
              return;
            }
            const hasRemoteContent = Boolean(
              workspace?.displayName
              || (workspace?.avatarUrl && workspace.avatarUrl !== '/avatar-default.svg')
              || (workspace?.state && Object.keys(workspace.state).length)
            );
            if (hasRemoteContent) {
              if (pendingUpload) {
                // Keep local edits (including a newly selected avatar) until
                // the next explicit refresh uploads them. A remote read must
                // never silently replace an unsynced local change.
                const localState = window.SummerOS.getState();
                const mergedState = window.SummerOS.mergeRemoteState(workspace.state, localState);
                const localAvatar = localStorage.getItem(LOCAL_AVATAR_KEY);
                applyWorkspace({
                  ...workspace,
                  displayName: displayName || workspace.displayName,
                  avatarUrl: localAvatar || workspace.avatarUrl,
                  state: mergedState,
                });
                markPendingUpload();
              } else {
                applyWorkspace(workspace);
              }
            } else if (localStorage.getItem('summer-os-minimum-v1') || displayName || avatarUrl !== '/avatar-default.svg') {
              // An older package may have saved browser records before the
              // standalone user-data file existed. Keep them and let one
              // explicit refresh copy them into the new local server.
              revision = Number(workspace.revision || 0);
              if (workspace.workspaceId) localStorage.setItem(WORKSPACE_ID_KEY, workspace.workspaceId);
              markPendingUpload();
              setStatus('本机旧记录待同步，点击刷新', 'working');
            }
          }
        } catch (error) {
          console.error('Local workspace initialization failed:', error);
        }
      }
      if (pairLinkFailed) {
        openAuthModal();
        showPairMode('join');
        authEmail.value = linkPairCode;
        setFeedback('二维码配对没有完成，请确认手机和电脑在同一 Wi‑Fi 后，再点击“连接并同步”。', true);
        return;
      }
      if (!displayName) {
        openNameModal(true);
      }
    } catch (error) {
      initialized = true;
      setLocalStatus();
      console.error('Workspace initialization failed:', error);
    }
  }

  window.addEventListener('summer-os:state-saved', scheduleUpload);
  window.addEventListener('online', setLocalStatus);
  window.addEventListener('offline', setLocalStatus);

  async function syncNow() {
    if (!initialized || syncing) return false;
    if (workspaceMismatch) {
      setStatus('请先重新连接设备；本机记录已保留', 'working');
      return false;
    }
    if (!localOnly && !navigator.onLine) {
      setLocalStatus();
      return false;
    }
    refreshAppButton.disabled = true;
    refreshAppButton.textContent = '同步中…';
    const hadPendingUpload = pendingUpload;
    try {
      if (pendingUpload) {
        const uploaded = await uploadState();
        if (!uploaded && pendingUpload) {
          throw new Error('本机记录已保留，请稍后再试');
        }
      }
      const workspace = await fetchWorkspace();
      if (workspace) applyWorkspace(workspace);
      clearPendingUpload();
      const conflictCount = window.SummerOS.getSyncConflictCount?.() || 0;
      setStatus(conflictCount ? `已同步 · 保留${conflictCount}个冲突` : '已同步', conflictCount ? 'working' : 'ready');
      return true;
    } catch (error) {
      if (hadPendingUpload) markPendingUpload();
      setLocalStatus();
      console.error('Manual workspace sync failed:', error);
      return false;
    } finally {
      refreshAppButton.disabled = false;
      refreshAppButton.textContent = '刷新';
    }
  }

  refreshAppButton.addEventListener('click', syncNow);

  nameForm.addEventListener('submit', async event => {
    event.preventDefault();
    const name = nameInput.value.trim().slice(0, 16);
    if (!name) return;
    nameSave.disabled = true;
    nameSave.textContent = '正在保存…';
    applyName(name);
    markPendingUpload();
    setLocalStatus();
    let avatarSaveFailed = false;
    if (pendingAvatar) {
      try {
        if (localOnly) {
          const localAvatar = await blobToDataUrl(pendingAvatar);
          if (!persistLocalAvatar(localAvatar)) throw new Error('头像保存失败，请稍后再试');
          applyAvatar(localAvatar);
        } else {
          const form = new FormData();
          form.append('avatar', pendingAvatar, 'avatar.webp');
          const response = await fetch('/api/avatar', { method: 'POST', body: form });
          const data = await readJsonResponse(response, '头像上传失败，请稍后再试');
          if (!response.ok) throw new Error(data.error || '头像上传失败');
          applyWorkspace(data);
        }
      } catch (error) {
        avatarSaveFailed = true;
        alert(error instanceof Error ? error.message : '头像上传失败');
      }
    }
    if (avatarSaveFailed) {
      nameSave.disabled = false;
      nameSave.textContent = '保存个人设置';
      return;
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
    localStorage.removeItem(LOCAL_AVATAR_KEY);
    localStorage.removeItem(LOCAL_AVATAR_BACKUP_KEY);
    localStorage.removeItem(WORKSPACE_ID_KEY);
    localStorage.removeItem(DISPLAY_NAME_KEY);
    localStorage.removeItem(PENDING_SYNC_KEY);
    localStorage.removeItem(PAIR_HANDOFF_KEY);
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
      markPendingUpload();
      const synced = await syncNow();
      if (!synced) throw new Error('电脑上的最新记录还没有保存成功，请先点击“刷新”后再生成二维码');
      const response = await fetch(localOnly ? '/api/local/pair/start' : '/api/pair/start', { method: 'POST' });
      const data = await readJsonResponse(response, '暂时无法生成同步码，请重新启动工作台后再试');
      if (!response.ok) throw new Error(data.error || '暂时无法生成同步码');
      pairCode.textContent = `${data.code.slice(0, 3)} · ${data.code.slice(3)}`;
      pairCode.hidden = false;
      if (localOnly && data.lanUrl && window.SummerQr) {
        try {
          const joinUrl = data.pairUrl || `${data.lanUrl}?pair=${data.code}`;
          pairUrl.textContent = joinUrl;
          window.SummerQr.render(pairQr, joinUrl);
          pairShare.hidden = false;
        } catch (error) {
          pairShare.hidden = true;
          console.error('QR rendering failed:', error);
        }
      }
      pairHint.textContent = localOnly
        ? '10 分钟有效。手机扫码后请在同一个 Safari/Chrome 里添加到桌面，记录会继续保留；不要切换浏览器。'
        : '10 分钟有效，用过即失效';
    } catch (error) {
      pairHint.textContent = error instanceof Error ? error.message : '暂时无法生成同步码';
    } finally {
      pairStartButton.disabled = false;
    }
  });

  authEmail.addEventListener('input', () => {
    authEmail.value = authEmail.value.replace(/\D/g, '').slice(0, 6);
  });

  copyPairUrl.addEventListener('click', async () => {
    const value = pairUrl.textContent.trim();
    if (!value) return;
    copyPairUrl.disabled = true;
    try {
      await copyText(value);
      copyPairUrl.textContent = '已复制手机地址';
    } catch (error) {
      pairHint.textContent = error instanceof Error ? error.message : '复制失败，请长按地址复制';
    } finally {
      setTimeout(() => {
        copyPairUrl.disabled = false;
        copyPairUrl.textContent = '复制手机地址';
      }, 1500);
    }
  });

  authForm.addEventListener('submit', async event => {
    event.preventDefault();
    authSubmit.disabled = true;
    setFeedback('正在连接…');
    try {
      const data = await joinWorkspaceByCode(authEmail.value);
      applyWorkspace(data.workspace, true);
      rememberPairHandoff(authEmail.value);
      clearPendingUpload();
      setStatus('已同步', 'ready');
      setFeedback('连接成功，之后点击“刷新”即可同步。');
      setTimeout(closeAuthModal, 700);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '连接失败', true);
    } finally {
      authSubmit.disabled = false;
    }
  });

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  installButton.hidden = !(isMobile && !isStandalone);
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
      iosInstallModal.querySelector('.install-instructions').textContent = '请在当前 Safari 中点击“分享”，选择“添加到主屏幕”。不要切换到其他浏览器，否则手机会变成新的工作台。';
      iosInstallClose.focus();
    } else if (isMobile) {
      iosInstallModal.querySelector('.install-instructions').textContent = '请在当前浏览器菜单中选择“添加到主屏幕”或“安装应用”，以后从同一个浏览器入口打开。不要切换浏览器，否则会变成新的工作台。';
      iosInstallModal.hidden = false;
      iosInstallClose.focus();
    }
  });
  iosInstallClose.addEventListener('click', () => { iosInstallModal.hidden = true; installButton.focus(); });
  iosInstallModal.addEventListener('click', event => { if (event.target === iosInstallModal) iosInstallClose.click(); });

  if (window.SummerOS) initialize().then(checkForUpdates);
  else window.addEventListener('summer-os:ready', () => initialize().then(checkForUpdates), { once: true });
})();
