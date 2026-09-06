(() => {
  const KEY = 'summer-os-minimum-v1';
  const dateKey = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const defaults = {
    commitment: '写下今天唯一最重要的结果', nextStep: '写下可以立即开始的第一步', completed: false, captures: [], memoryItems: [], scheduleItems: [],
    date: dateKey(), planDate: dateKey(), mainTaskId: '',
    tasks: [],
    tomorrow: '', mode: 'flow',
    plans: [],
    decisions: [], timer: 1500
  };
  const INBOX_PAGE_SIZE = 20;
  const INBOX_CATEGORIES = {
    'summer-os': '我的系统',
    'content-ip': '内容/IP',
    'client-partner': '客户/合作',
    'admin-other': '行政/其他',
    uncategorized: '未分类'
  };
  let inboxVisibleLimit = INBOX_PAGE_SIZE;
  let captureMigrationNeeded = false;
  let state = load();
  let running = false;
  let interval = null;
  let editingScheduleId = '';
  let editingTaskId = '';
  let editingCaptureId = '';
  let editingDecisionId = '';
  let editingMemoryId = '';
  let pendingScheduleSource = null;
  const $ = selector => document.querySelector(selector);

  function inferCategory(text) {
    const value = String(text || '');
    if (/Summer\s*OS|工作台|Supabase|PWA|同步|登录/i.test(value)) return 'summer-os';
    if (/内容|视频|选题|IP|小红书|抖音|脚本|发布/i.test(value)) return 'content-ip';
    if (/客户|合作|对方|跟进|回复|联系/i.test(value)) return 'client-partner';
    if (/发票|报销|合同|付款|账号|日程/i.test(value)) return 'admin-other';
    return 'uncategorized';
  }
  function isInboxCategory(category) { return Object.prototype.hasOwnProperty.call(INBOX_CATEGORIES, category); }
  function normalizedCaptureCategory(category, text) { return isInboxCategory(category) ? category : inferCategory(text); }
  function inboxCategoryLabel(category) { return INBOX_CATEGORIES[category] || INBOX_CATEGORIES.uncategorized; }
  function inboxCategoryOptions(selected) {
    return Object.entries(INBOX_CATEGORIES).map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      const rawCaptures = Array.isArray(saved.captures) ? saved.captures : [];
      const state = { ...structuredClone(defaults), ...saved, tasks: saved.tasks || structuredClone(defaults.tasks), decisions: saved.decisions || structuredClone(defaults.decisions), captures: rawCaptures, memoryItems: Array.isArray(saved.memoryItems) ? saved.memoryItems : [], scheduleItems: Array.isArray(saved.scheduleItems) ? saved.scheduleItems : [], plans: Array.isArray(saved.plans) ? saved.plans : [] };
      state.mode = state.mode === 'flow' ? 'flow' : 'planner';
      state.captures = state.captures.map(capture => {
        const item = capture || {};
        if (!isInboxCategory(item.category)) captureMigrationNeeded = true;
        return { ...item, category: normalizedCaptureCategory(item.category, item.text) };
      });
      state.tasks = state.tasks.map(task => ({ ...task, date: task.date || dateKey(), done: Boolean(task.done), doneAt: task.doneAt || null }));
      if (state.decisions.some(decision => decision?.status)) captureMigrationNeeded = true;
      state.decisions = state.decisions.filter(decision => decision && !decision.status);
      state.scheduleItems = state.scheduleItems.map(item => ({ ...item, kind: item.kind === 'event' ? 'event' : 'deadline', time: item.time || '', done: Boolean(item.done), doneAt: item.doneAt || null }));
      state.planDate = state.planDate || dateKey();
      const rollover = window.SummerDayRollover.apply(state, dateKey());
      if (rollover.rolledOver) localStorage.setItem(KEY, JSON.stringify(state));
      return state;
    }
    catch { return structuredClone(defaults); }
  }
  function save(options = {}) {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (!options.remote) window.dispatchEvent(new CustomEvent('summer-os:state-saved', { detail: state }));
  }
  function setTodayLabel() {
    const today = new Date();
    $('#todayLabel').textContent = `${today.getMonth() + 1}月${today.getDate()}日`;
  }
  function ensureCurrentDay(options = {}) {
    const rollover = window.SummerDayRollover.apply(state, dateKey());
    if (!rollover.rolledOver) return false;
    running = false;
    clearInterval(interval);
    $('#focusStrip').hidden = true;
    save();
    setTodayLabel();
    render();
    if (!options.silent) toast('已把昨晚写的第一件事接到今天。');
    return true;
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c])); }
  function toast(message) {
    $('#toast').textContent = message; $('#toast').classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 2500);
  }
  function typeOf(text) {
    if (/[?？]|是否|怎么|哪个|哪一|要不要/.test(text)) return 'decision';
    if (/等|回复|跟进|提醒|联系/.test(text)) return 'followup';
    return 'task';
  }
  function typeLabel(type) { return ({ task: '任务', decision: '判断', followup: '跟进' })[type] || '事项'; }
  function memoryTypeLabel(type) { return ({ idea: '背景/判断', resource: '文件/资料', review: '复盘结论', template: '方案模板' })[type] || '文件/资料'; }
  function memoryDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });
  }

  function scheduleItem(id) { return state.scheduleItems.find(item => String(item.id) === String(id)) || null; }
  function scheduleTypeLabel(kind) { return kind === 'event' ? '固定活动' : '最晚截止'; }
  function scheduleDateLabel(item) {
    if (!item?.date) return '未设置日期';
    const [year, month, day] = item.date.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const weekday = date.toLocaleDateString('zh-CN', { weekday: 'short' });
    return `${month}月${day}日 ${weekday}${item.time ? ` ${item.time}` : ''}`;
  }
  function scheduleStatus(item) {
    if (item.done) return { key: 'done', label: '已完成' };
    const today = dateKey();
    if (item.date < today) return { key: 'overdue', label: item.kind === 'event' ? '活动已过' : '已经逾期' };
    if (item.date === today) return { key: 'today', label: item.kind === 'event' ? '今天参加' : '今天截止' };
    const [year, month, day] = item.date.split('-').map(Number);
    const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
    const distance = Math.round((new Date(year, month - 1, day) - new Date(todayYear, todayMonth - 1, todayDay)) / 86400000);
    if (distance === 1) return { key: 'soon', label: item.kind === 'event' ? '明天参加' : '明天截止' };
    if (distance <= 7) return { key: 'soon', label: `${distance} 天后` };
    return { key: 'future', label: `${distance} 天后` };
  }
  function completionDate(item) { return String(item?.doneAt || item?.date || '').slice(0, 10); }
  function historyDate(value) {
    const date = new Date(`${String(value || '').slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? '日期待补' : date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });
  }
  function scheduleBadge(id) {
    const item = scheduleItem(id);
    if (!item) return '';
    const status = scheduleStatus(item);
    return `<span class="linked-date ${status.key}">${escapeHtml(scheduleTypeLabel(item.kind))} · ${escapeHtml(scheduleDateLabel(item))}</span>`;
  }
  function createScheduleItem({ title, kind = 'deadline', date, time = '' }) {
    const item = { id: `s${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, kind: kind === 'event' ? 'event' : 'deadline', date, time, done: false, doneAt: null, createdAt: new Date().toISOString() };
    state.scheduleItems.push(item);
    return item;
  }

  function addTaskToToday(title, nextStep = '完成这件事的第一个可交付动作', scheduleId = '') {
    const task = { id: `t${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, nextStep, date: dateKey(), done: false, doneAt: null, scheduleId };
    state.tasks.push(task);
    state.planDate = dateKey();
    return task;
  }

  function currentMainTask() {
    return state.tasks.find(task => task.id === state.mainTaskId && !task.done && task.date === dateKey()) || state.tasks.find(task => !task.done && task.date === dateKey()) || null;
  }
  function setMainTask(task) {
    if (!task) return null;
    state.mainTaskId = task.id;
    state.commitment = task.title;
    state.nextStep = task.nextStep || '完成这件事的第一个可交付动作';
    state.completed = false;
    return task;
  }
  function advanceMainTask(completedTaskId = '') {
    const next = state.tasks.find(task => !task.done && task.date === dateKey() && task.id !== completedTaskId);
    if (next) {
      setMainTask(next);
      state.timer = 1500;
      return next;
    }
    const todayTasks = state.tasks.filter(task => task.date === dateKey());
    state.mainTaskId = '';
    state.completed = todayTasks.length > 0 && todayTasks.every(task => task.done);
    state.commitment = state.completed ? '今天的任务都完成了' : '写下今天唯一最重要的结果';
    state.nextStep = state.completed ? '结束今天，或添加下一件事' : '写下可以立即开始的第一步';
    state.timer = 1500;
    return null;
  }
  // 让首屏承诺与主线任务保持一致（单真值：主线任务 → 派生承诺与下一步）
  function syncCommitmentFromMain() {
    const main = currentMainTask();
    if (!main) return;
    setMainTask(main);
  }
  function renderCommitment() {
    const main = currentMainTask();
    if (main && state.mainTaskId !== main.id) syncCommitmentFromMain();
    $('#commitmentTitle').textContent = state.commitment;
    $('#focusTask').textContent = state.commitment;
    $('#dayState').textContent = state.completed ? '今日已完成' : running ? '正在推进' : '今日已承诺';
    $('#completeCommitment').textContent = state.completed ? '已完成' : '标记完成';
    $('#completeCommitment').disabled = state.completed || !main;
    $('#focusButton').disabled = !main;
  }
  function renderToday() {
    const todayTasks = state.tasks.filter(task => task.date === dateKey());
    const visibleTasks = state.tasks.filter(task => task.date === state.planDate);
    const done = todayTasks.filter(task => task.done).length;
    $('#closeSummary').textContent = state.tomorrow ? `明天第一步：${state.tomorrow}` : `今天完成 ${done}/${todayTasks.length || 0}，结束前确认明天第一步。`;
    $('#planDate').value = state.planDate;
    const [, month, day] = state.planDate.split('-');
    const dateLabel = state.planDate === dateKey() ? '今日执行流' : `${Number(month)}月${Number(day)}日的安排`;
    $('#planTitle').textContent = dateLabel;
    $('#addTaskButton').hidden = false;
    const ordered = [...visibleTasks].sort((a, b) => Number(a.done) - Number(b.done));
    const slotLabel = (task, index) => {
      if (task.done) return '已完成';
      if (task.id === state.mainTaskId) return '正在推进';
      if (index === 0) return '下一步';
      return 8 + index + ':00';
    };
    if (!visibleTasks.length) { $('#todayList').innerHTML = '<p class="empty">这个日期还没有安排。添加一件真正值得完成的事。</p>'; return; }
    $('#todayList').innerHTML = ordered.map((task, index) => `
      <article class="today-item ${task.done ? 'done' : ''} ${task.id === state.mainTaskId ? 'is-main' : ''}">
        <button class="today-check" type="button" data-task="${task.id}" aria-label="${task.done ? '恢复' : '完成'} ${escapeHtml(task.title)}">${task.done ? '✓' : ''}</button>
        <div>
          <strong>${escapeHtml(task.title)}</strong>
          <small>${task.nextStep ? escapeHtml(task.nextStep) : '完成这件事的第一个可交付动作'}</small>
          ${scheduleBadge(task.scheduleId)}
          <div class="task-meta"><small>${slotLabel(task, index)}</small><button type="button" data-edit-task="${task.id}">修改</button>${!task.done ? `<button type="button" data-focus-task="${task.id}" ${task.id === state.mainTaskId ? 'disabled' : ''}>${task.id === state.mainTaskId ? '专注中' : '开始专注'}</button>` : ''}${task.id !== state.mainTaskId && task.date === dateKey() ? `<button type="button" data-main-task="${task.id}">设为主线</button>` : ''}${task.date === dateKey() ? '' : `<input class="task-date" type="date" value="${task.date}" data-task-date="${task.id}" aria-label="${escapeHtml(task.title)}的日期">`}</div>
        </div>
        <button class="task-remove" type="button" data-remove-task="${task.id}" aria-label="移除 ${escapeHtml(task.title)}">×</button>
      </article>`).join('');
  }
  function renderInboxSummary() {
    $('#inboxHomeCount').textContent = `待处理 ${state.captures.length} 条`;
    const recent = [...state.captures].reverse().slice(0, 3);
    $('#inboxRecentPreview').innerHTML = recent.length ? recent.map(item => {
      const category = normalizedCaptureCategory(item.category, item.text);
      return `<article class="inbox-recent-item"><span class="inbox-recent-category">${escapeHtml(inboxCategoryLabel(category))}</span><div><p>${escapeHtml(item.text)}</p>${scheduleBadge(item.scheduleId)}</div><button class="inbox-recent-edit" type="button" data-inbox-edit="${escapeHtml(item.id)}">修改</button></article>`;
    }).join('') : '<p class="empty">还没有收件内容。写下一个想法，稍后再整理。</p>';
  }
  function renderInbox() {
    const query = $('#captureSearch').value.trim().toLocaleLowerCase();
    const selectedCategory = $('#captureCategory').value;
    const matches = [...state.captures].reverse().filter(item => {
      const category = normalizedCaptureCategory(item.category, item.text);
      const searchable = `${item.text || ''} ${inboxCategoryLabel(category)} ${typeLabel(item.type)}`.toLocaleLowerCase();
      return (!query || searchable.includes(query)) && (selectedCategory === 'all' || category === selectedCategory);
    });
    const visibleItems = matches.slice(0, inboxVisibleLimit);
    $('#inboxCount').textContent = `匹配 ${matches.length} 条`;
    $('#inboxMore').hidden = matches.length <= visibleItems.length;
    $('#inboxRemaining').textContent = String(Math.max(0, matches.length - visibleItems.length));
    $('#inboxPreview').innerHTML = visibleItems.length ? visibleItems.map(item => {
      const category = normalizedCaptureCategory(item.category, item.text);
      return `<article class="inbox-item"><select class="inbox-category" data-inbox-category="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.text)}的分类">${inboxCategoryOptions(category)}</select><div><p>${escapeHtml(item.text)}</p>${scheduleBadge(item.scheduleId)}<div class="inbox-actions"><button type="button" data-inbox-edit="${escapeHtml(item.id)}">修改</button><button type="button" data-inbox-today="${escapeHtml(item.id)}">排进今天</button><button type="button" data-inbox-schedule="${escapeHtml(item.id)}">${item.scheduleId ? '修改日期' : '设置日期'}</button><button type="button" data-inbox-decision="${escapeHtml(item.id)}">转为判断</button><button type="button" data-inbox-delete="${escapeHtml(item.id)}" aria-label="删除 ${escapeHtml(item.text)}">删除</button></div></div></article>`;
    }).join('') : `<p class="empty">${state.captures.length ? '没有找到匹配的收件内容。' : '收件箱还没有内容。新内容会先停在这里，等你安排。'}</p>`;
  }
  function renderSchedule() {
    const pending = state.scheduleItems.filter(item => !item.done);
    const completed = state.scheduleItems.filter(item => item.done).sort((a, b) => `${b.doneAt || b.date}T${b.time || ''}`.localeCompare(`${a.doneAt || a.date}T${a.time || ''}`));
    const overdue = pending.filter(item => scheduleStatus(item).key === 'overdue').length;
    const todayCount = pending.filter(item => scheduleStatus(item).key === 'today').length;
    const soon = pending.filter(item => scheduleStatus(item).key === 'soon').length;
    $('#scheduleSummary').innerHTML = `
      <article class="schedule-stat ${overdue ? 'alert' : ''}"><b>${overdue}</b><span>已逾期</span></article>
      <article class="schedule-stat ${todayCount ? 'today' : ''}"><b>${todayCount}</b><span>今天</span></article>
      <article class="schedule-stat"><b>${soon}</b><span>未来 7 天</span></article>`;
    const ordered = [...pending].sort((a, b) => `${a.date}T${a.time || '23:59'}`.localeCompare(`${b.date}T${b.time || '23:59'}`));
    const pendingHtml = ordered.length ? ordered.map(item => {
      const status = scheduleStatus(item);
      const [, month, day] = item.date.split('-');
      const alreadyPlanned = state.tasks.some(task => task.scheduleId === item.id && !task.done);
      return `<article class="schedule-item ${status.key}">
        <div class="schedule-date-block"><span>${Number(month)}月</span><b>${Number(day)}</b><small>${item.time || '全天'}</small></div>
        <div class="schedule-item-main">
          <div class="schedule-item-top"><span class="schedule-kind ${item.kind}">${escapeHtml(scheduleTypeLabel(item.kind))}</span><span class="schedule-status ${status.key}">${escapeHtml(status.label)}</span></div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(scheduleDateLabel(item))}</p>
        </div>
        <div class="schedule-actions">
          <button type="button" data-schedule-today="${item.id}" ${alreadyPlanned ? 'disabled' : ''}>${alreadyPlanned ? '已排进今天' : '排进今天'}</button><button type="button" data-schedule-done="${item.id}">完成</button>
          <button type="button" data-schedule-edit="${item.id}">修改</button>
          <button type="button" data-schedule-delete="${item.id}" aria-label="删除 ${escapeHtml(item.title)}">删除</button>
        </div>
      </article>`;
    }).join('') : '<p class="empty schedule-empty">暂时没有待办日期。已完成事项会收进下面的历史记录。</p>';
    const archiveHtml = completed.length ? `<details class="schedule-archive"><summary><span>已完成日期</span><span>${completed.length} 项，不再堆在主列表</span></summary><div class="schedule-archive-list">${completed.map(item => `<article class="schedule-history-item"><div><span class="schedule-history-kind">${escapeHtml(scheduleTypeLabel(item.kind))}</span><time>${escapeHtml(historyDate(item.doneAt || item.date))}</time></div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(scheduleDateLabel(item))}</p><div class="schedule-actions"><button type="button" data-schedule-done="${item.id}">恢复</button><button type="button" data-schedule-edit="${item.id}">修改</button><button type="button" data-schedule-delete="${item.id}" aria-label="删除 ${escapeHtml(item.title)}">删除</button></div></article>`).join('')}</div></details>` : '';
    $('#scheduleList').innerHTML = pendingHtml + archiveHtml;
  }
  function renderDecisions() {
    const pending = state.decisions.filter(item => !item.status);
    $('#decisionCount').textContent = String(pending.length).padStart(2, '0');
    $('#decisionList').innerHTML = pending.length ? pending.map((item, index) => {
      return `<article class="decision" data-id="${item.id}"><div class="decision-row"><span class="decision-number">${String(index + 1).padStart(2, '0')}</span><div><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.context)}</p>${scheduleBadge(item.scheduleId)}</div><div class="decision-row-actions"><button class="decide-button" type="button" data-decide="${item.id}">做决定</button><button class="decision-edit-button" type="button" data-edit-decision="${item.id}">修改</button></div></div><div class="decision-choices" data-choices="${item.id}" hidden><button type="button" data-decide-action="do" data-decide-id="${item.id}">排进今天 →</button><button type="button" data-decide-action="later" data-decide-id="${item.id}">稍后再说</button><button type="button" data-decide-action="drop" data-decide-id="${item.id}">放弃这个</button></div></article>`;
    }).join('') : '<p class="empty">今天没有等待判断的事项。</p>';
  }
  function renderRadar() {
    const now = new Date();
    const todayStr = dateKey();
    const dayOfWeek = now.getDay(); // 0=周日
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const monthStr = todayStr.slice(0, 7);

    const doneTasks = state.tasks.filter(task => task.done);
    const byRange = (from, to) => doneTasks.filter(task => completionDate(task) >= from && completionDate(task) <= to);
    const doneToday = byRange(todayStr, todayStr);
    const doneWeek = byRange(mondayStr, todayStr);
    const doneMonth = byRange(`${monthStr}-01`, `${monthStr}-31`);

    const doneList = (items) => items.length ? `<ul class="radar-done-list">${items.map(t => `<li>${escapeHtml(t.title)}<button class="radar-edit" type="button" data-radar-task-edit="${escapeHtml(t.id)}">修改</button></li>`).join('')}</ul>` : '<p class="radar-empty">还没有完成记录。</p>';

    const linkedScheduleIds = new Set(doneTasks.map(task => task.scheduleId).filter(Boolean));
    const historyEntries = [
      ...doneTasks.map(task => ({ kind: '任务', title: task.title, at: completionDate(task), exact: Boolean(task.doneAt), taskId: task.id })),
      ...state.scheduleItems.filter(item => item.done && !linkedScheduleIds.has(item.id)).map(item => ({ kind: scheduleTypeLabel(item.kind), title: item.title, at: completionDate(item), exact: Boolean(item.doneAt) }))
    ].filter(item => item.at).sort((a, b) => `${b.at}`.localeCompare(`${a.at}`));
    const historyGroups = historyEntries.reduce((groups, item) => {
      const key = item.at.slice(0, 7) || 'unknown';
      (groups[key] ||= []).push(item);
      return groups;
    }, {});
    const historyHtml = historyEntries.length ? Object.entries(historyGroups).map(([key, items]) => `<section class="radar-history-group"><h3>${key === 'unknown' ? '日期待补' : `${key.slice(0, 4)}年${Number(key.slice(5))}月`}<span>${items.length} 项</span></h3><ul class="radar-history-list">${items.map(item => `<li><span class="history-kind">${escapeHtml(item.kind)}</span><span>${escapeHtml(item.title)}</span><time>${item.exact ? '' : '约 '}${escapeHtml(historyDate(item.at))}</time>${item.taskId ? `<button class="radar-edit" type="button" data-radar-task-edit="${escapeHtml(item.taskId)}">修改</button>` : ''}</li>`).join('')}</ul></section>`).join('') : '<p class="radar-empty">完成的任务会一直保存在这里，不会因为月份变化消失。</p>';

    // 展望 = 收件箱里未排期事项的直接投影（计划型模式使用）
    const upcoming = state.captures.filter(c => !c.done);

    $('#radarGrid').innerHTML = `
      <div class="radar-block radar-review">
        <div class="radar-block-head"><span class="radar-block-label">回顾 · 已做</span></div>
        <div class="radar-stat-row">
          <div class="radar-stat"><b>${doneToday.length}</b><span>今天完成</span>${doneList(doneToday)}</div>
          <div class="radar-stat"><b>${doneWeek.length}</b><span>本周完成</span>${doneList(doneWeek)}</div>
          <div class="radar-stat"><b>${doneMonth.length}</b><span>本月完成</span>${doneList(doneMonth)}</div>
        </div>
      </div>
      <div class="radar-block radar-plan">
        <div class="radar-block-head"><span class="radar-block-label">展望 · 待做</span><span class="radar-block-hint">来自收件箱，处理后自动消失</span></div>
        ${upcoming.length ? `<ul class="radar-done-list">${upcoming.map(c => `<li><span class="radar-upcoming-type">${typeLabel(c.type)}</span>${escapeHtml(c.text)}<button class="radar-edit" type="button" data-radar-inbox-edit="${escapeHtml(c.id)}">修改</button></li>`).join('')}</ul>` : '<p class="radar-empty">收件箱还没有待做的事。丢进收件箱就会出现在这里。</p>'}
      </div>
      <details class="radar-history"><summary><span>全部完成记录</span><span>${historyEntries.length} 条 · 按月份保存</span></summary><div class="radar-history-body">${historyHtml}</div></details>`;
  }
  function renderMemory() {
    const query = $('#memorySearch').value.trim().toLocaleLowerCase();
    const items = [...state.memoryItems]
      .filter(item => !query || `${item.title} ${item.content} ${memoryTypeLabel(item.type)}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0));
    $('#memoryCount').textContent = query ? `${items.length} 条匹配` : `${state.memoryItems.length} 条记录`;
    if (!items.length) {
      $('#memoryList').innerHTML = query ? '<p class="empty">没有找到匹配的工作记忆。</p>' : '<p class="empty memory-empty">还没有工作记忆。这里不是囤资料，而是保存下一次工作需要调用的上下文。</p>';
      return;
    }
    $('#memoryList').innerHTML = items.map(item => `<article class="memory-item"><div class="memory-item-head"><span class="memory-type">${memoryTypeLabel(item.type)}</span><time datetime="${escapeHtml(item.createdAt || '')}">${escapeHtml(memoryDate(item.createdAt))}</time></div><h3>${escapeHtml(item.title)}</h3><p class="memory-content">${escapeHtml(item.content).replace(/\n/g, '<br>')}</p><div class="memory-actions"><button type="button" data-memory-edit="${escapeHtml(item.id)}">修改</button><button type="button" data-memory-inbox="${escapeHtml(item.id)}">加入收件箱</button><button type="button" data-memory-delete="${escapeHtml(item.id)}">删除</button></div></article>`).join('');
  }
  function markdownText(value) { return String(value || '').replace(/\r?\n/g, '\n  '); }
  function buildWorkbenchMarkdown() {
    const lines = [`# 我的工作台记录`, ``, `> 导出日期：${dateKey()}`, ``];
    const completedTasks = state.tasks.filter(task => task.done).sort((a, b) => completionDate(b).localeCompare(completionDate(a)));
    const completedSchedules = state.scheduleItems.filter(item => item.done && !state.tasks.some(task => task.scheduleId === item.id && task.done)).sort((a, b) => completionDate(b).localeCompare(completionDate(a)));
    lines.push('## 完成记录', '');
    if (!completedTasks.length && !completedSchedules.length) lines.push('暂时还没有完成记录。', '');
    completedTasks.forEach(task => lines.push(`- [x] ${markdownText(task.title)}（${historyDate(completionDate(task))}）`));
    completedSchedules.forEach(item => lines.push(`- [x] ${markdownText(item.title)} · ${scheduleTypeLabel(item.kind)}（${historyDate(completionDate(item))}）`));
    lines.push('');
    const pendingTasks = state.tasks.filter(task => !task.done);
    lines.push('## 未完成任务', '');
    if (!pendingTasks.length) lines.push('暂时没有未完成任务。', '');
    pendingTasks.forEach(task => lines.push(`- [ ] ${markdownText(task.title)}${task.nextStep ? `：${markdownText(task.nextStep)}` : ''}`));
    lines.push('');
    lines.push('## 日程与截止', '');
    const pendingSchedules = state.scheduleItems.filter(item => !item.done).sort((a, b) => `${a.date}T${a.time || ''}`.localeCompare(`${b.date}T${b.time || ''}`));
    if (!pendingSchedules.length) lines.push('暂时没有待处理日期。', '');
    pendingSchedules.forEach(item => lines.push(`- ${markdownText(item.title)} · ${scheduleDateLabel(item)}`));
    lines.push('');
    lines.push('## 快速收件', '');
    if (!state.captures.length) lines.push('收件箱为空。', '');
    state.captures.slice().reverse().forEach(item => lines.push(`- ${markdownText(item.text)}（${typeLabel(item.type)} · ${inboxCategoryLabel(normalizedCaptureCategory(item.category, item.text))}）`));
    lines.push('');
    lines.push('## 判断队列', '');
    if (!state.decisions.length) lines.push('没有等待判断的事项。', '');
    state.decisions.forEach(item => lines.push(`- ${markdownText(item.question)}：${markdownText(item.context)}`));
    lines.push('');
    lines.push('## 可复用资料', '');
    if (!state.memoryItems.length) lines.push('暂时没有可复用资料。', '');
    state.memoryItems.forEach(item => lines.push(`### ${markdownText(item.title)}`, ``, markdownText(item.content), ``));
    return lines.join('\n');
  }
  function downloadMarkdown() {
    const blob = new Blob([buildWorkbenchMarkdown()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `工作台记录-${dateKey()}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已导出 Markdown 文件。');
  }
  async function openObsidian() {
    const markdown = buildWorkbenchMarkdown();
    if (!navigator.clipboard?.writeText) {
      downloadMarkdown();
      toast('当前浏览器无法直接打开 Obsidian，已先导出 Markdown。');
      return;
    }
    try {
      await navigator.clipboard.writeText(markdown);
      const noteName = encodeURIComponent(`工作台记录-${dateKey()}`);
      window.location.href = `obsidian://new?name=${noteName}&clipboard=true`;
      toast('内容已复制，正在打开 Obsidian。');
    } catch {
      downloadMarkdown();
      toast('未能打开 Obsidian，已先导出 Markdown。');
    }
  }
  function renderTimer() {
    const minutes = Math.floor(state.timer / 60).toString().padStart(2, '0');
    const seconds = (state.timer % 60).toString().padStart(2, '0');
    $('#timerDisplay').textContent = `${minutes}:${seconds}`;
    $('#timerToggle').textContent = running ? '暂停' : '继续';
  }
  function renderMode() {
    const flowMode = state.mode === 'flow';
    document.body.classList.toggle('flow-mode', flowMode);
    const button = $('#modeButton');
    button.textContent = flowMode ? '计划模式' : '随手模式';
    button.setAttribute('aria-pressed', String(flowMode));
    button.title = flowMode ? '回到完整的计划与提醒视图' : '隐藏计划和提醒，只保留记录与回顾';
    $('#captureIntro').textContent = flowMode ? '有灵感就记，不用先安排。系统会自动归类，之后再整理。' : '想到什么先写下来，系统会先帮你识别类型。';
    $('#captureInput').placeholder = flowMode ? '想到什么就说或写下来……' : '任务、想法、要跟进的人……';
    renderCaptureAssist();
  }
  function renderCaptureAssist() {
    const text = $('#captureInput').value.trim();
    const type = text ? typeOf(text) : 'task';
    const category = text ? inferCategory(text) : 'uncategorized';
    $('#captureModeHint').textContent = text ? `自动归类：${typeLabel(type)} · ${inboxCategoryLabel(category)}${state.mode === 'flow' ? ' · 不设提醒' : ''}` : state.mode === 'flow' ? '自动归类 · 不设提醒 · 之后再整理' : '自动识别为任务 / 判断 / 跟进';
  }
  function render() { syncCommitmentFromMain(); renderMode(); renderCommitment(); renderToday(); renderSchedule(); renderInboxSummary(); renderInbox(); renderRadar(); renderDecisions(); renderMemory(); renderTimer(); }

  let speechRecognition = null;
  function setVoiceStatus(message, active = false) {
    $('#voiceStatus').textContent = message;
    $('#voiceCaptureButton').textContent = active ? '停止记录' : '语音记录';
    $('#voiceCaptureButton').classList.toggle('is-recording', active);
  }
  function startVoiceCapture() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus('当前浏览器暂不支持语音转文字，可以直接输入。');
      toast('当前浏览器暂不支持语音转文字。');
      return;
    }
    const baseText = $('#captureInput').value.trim();
    const recognition = new Recognition();
    speechRecognition = recognition;
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => setVoiceStatus('正在听，你说完后会自动变成文字。', true);
    recognition.onresult = event => {
      const transcript = [...event.results].map(result => result[0].transcript).join('');
      $('#captureInput').value = [baseText, transcript].filter(Boolean).join('，');
      $('#captureInput').dataset.captureSource = 'voice';
      renderCaptureAssist();
    };
    recognition.onerror = event => {
      const message = event.error === 'not-allowed' ? '麦克风权限未打开，请允许浏览器使用麦克风。' : '这次没有听清，可以再试一次。';
      setVoiceStatus(message);
      speechRecognition = null;
    };
    recognition.onend = () => {
      if (speechRecognition !== recognition) return;
      speechRecognition = null;
      setVoiceStatus($('#captureInput').value.trim() ? '已转成文字，确认后点“收进来”。' : '没有收到内容，可以再说一次。');
      $('#captureInput').focus();
    };
    recognition.start();
  }
  $('#modeButton').addEventListener('click', () => {
    state.mode = state.mode === 'flow' ? 'planner' : 'flow';
    save();
    renderMode();
    toast(state.mode === 'flow' ? '已进入随手模式，先记录，不提醒。' : '已回到计划模式。');
  });
  $('#captureInput').addEventListener('input', renderCaptureAssist);
  $('#voiceCaptureButton').addEventListener('click', () => {
    if (speechRecognition) { speechRecognition.stop(); return; }
    startVoiceCapture();
  });
  $('#exportMarkdownButton').addEventListener('click', downloadMarkdown);
  $('#openObsidianButton').addEventListener('click', openObsidian);

  const mobileTabLinks = [...document.querySelectorAll('[data-mobile-tab]')];
  function setMobileTab(tab) {
    mobileTabLinks.forEach(link => link.classList.toggle('active', link.dataset.mobileTab === tab));
  }
  mobileTabLinks.forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const target = link.dataset.mobileTab === 'capture' ? $('#capture') : link.dataset.mobileTab === 'today' ? $('#today') : $('#workRadar');
    setMobileTab(link.dataset.mobileTab);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', link.getAttribute('href'));
  }));
  if ('IntersectionObserver' in window) {
    const mobileObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setMobileTab(visible.target.id === 'capture' ? 'capture' : visible.target.id === 'today' ? 'today' : 'radar');
    }, { rootMargin: '-18% 0px -58% 0px', threshold: [0, .25, .6] });
    ['capture', 'today', 'workRadar'].forEach(id => mobileObserver.observe($(`#${id}`)));
  }

  $('#editCommitment').addEventListener('click', () => {
    $('#commitmentInput').value = state.commitment; $('#nextStepInput').value = state.nextStep;
    $('#commitmentView').hidden = true; $('#commitmentForm').hidden = false; $('#commitmentInput').focus();
  });
  $('#cancelCommitment').addEventListener('click', () => { $('#commitmentForm').hidden = true; $('#commitmentView').hidden = false; });
  $('#commitmentForm').addEventListener('submit', event => {
    event.preventDefault(); state.commitment = $('#commitmentInput').value.trim(); state.nextStep = $('#nextStepInput').value.trim(); state.completed = false;
    const mainTask = currentMainTask();
    if (mainTask) { mainTask.title = state.commitment; mainTask.nextStep = state.nextStep; mainTask.done = false; state.mainTaskId = mainTask.id; }
    save(); render(); $('#commitmentForm').hidden = true; $('#commitmentView').hidden = false; toast('今日承诺已更新。');
  });
  $('#completeCommitment').addEventListener('click', () => {
    running = false; clearInterval(interval); $('#focusStrip').hidden = true;
    const matchingTask = currentMainTask();
    if (matchingTask) {
      matchingTask.done = true;
      matchingTask.doneAt = new Date().toISOString();
      const linkedSchedule = scheduleItem(matchingTask.scheduleId);
      if (linkedSchedule) { linkedSchedule.done = true; linkedSchedule.doneAt = matchingTask.doneAt; }
    }
    const next = advanceMainTask(matchingTask?.id || '');
    save(); render(); toast(next ? `已完成，下一条切换为「${next.title}」。` : '今日任务全部完成。');
  });

  function openTaskEdit(task) {
    if (!task) return;
    editingTaskId = task.id;
    $('#taskEditTitle').value = task.title;
    $('#taskEditNextStep').value = task.nextStep || '完成这件事的第一个可交付动作';
    $('#taskEditDate').value = task.date || dateKey();
    $('#taskEditModal').hidden = false;
    document.body.classList.add('modal-open');
    setTimeout(() => $('#taskEditTitle').focus(), 0);
  }
  function closeTaskEdit() {
    $('#taskEditModal').hidden = true;
    $('#taskEditForm').reset();
    editingTaskId = '';
    syncModalOpenState();
  }
  $('#taskEditClose').addEventListener('click', closeTaskEdit);
  $('#cancelTaskEdit').addEventListener('click', closeTaskEdit);
  $('#taskEditModal').addEventListener('click', event => { if (event.target === $('#taskEditModal')) closeTaskEdit(); });
  $('#taskEditForm').addEventListener('submit', event => {
    event.preventDefault();
    const task = state.tasks.find(item => item.id === editingTaskId);
    if (!task) return closeTaskEdit();
    const title = $('#taskEditTitle').value.trim();
    const nextStep = $('#taskEditNextStep').value.trim();
    const taskDate = $('#taskEditDate').value || dateKey();
    const linkedSchedule = scheduleItem(task.scheduleId);
    if (linkedSchedule?.kind === 'deadline' && linkedSchedule.date < taskDate) {
      toast('安排日期不能晚于截止日期，请先调整日期。');
      return;
    }
    task.title = title;
    task.nextStep = nextStep || '完成这件事的第一个可交付动作';
    task.date = taskDate;
    if (linkedSchedule) linkedSchedule.title = title;
    if (task.id === state.mainTaskId) {
      if (!task.done && task.date === dateKey()) setMainTask(task);
      else advanceMainTask(task.id);
    } else if (!currentMainTask() && !task.done && task.date === dateKey()) {
      setMainTask(task);
    }
    save();
    closeTaskEdit();
    render();
    toast('任务已修改。');
  });

  function openScheduleForm({ item = null, source = null, title = '' } = {}) {
    editingScheduleId = item?.id || '';
    pendingScheduleSource = source;
    $('#scheduleTitleInput').value = item?.title || title;
    $('#scheduleTypeInput').value = item?.kind || 'deadline';
    $('#scheduleDateInput').value = item?.date || dateKey();
    $('#scheduleTimeInput').value = item?.time || '';
    $('#scheduleSaveButton').textContent = item ? '保存修改' : '保存日期';
    $('#scheduleForm').hidden = false;
    $('#schedule').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('#scheduleTitleInput').focus(), 250);
  }
  function closeScheduleForm(returnToInbox = false) {
    $('#scheduleForm').hidden = true;
    $('#scheduleForm').reset();
    editingScheduleId = '';
    const shouldReturn = returnToInbox && pendingScheduleSource?.type === 'capture';
    pendingScheduleSource = null;
    if (shouldReturn) openInboxModal();
  }

  $('#addScheduleButton').addEventListener('click', () => openScheduleForm());
  $('#cancelSchedule').addEventListener('click', () => closeScheduleForm(true));
  $('#scheduleForm').addEventListener('submit', event => {
    event.preventDefault();
    const wasEditing = Boolean(editingScheduleId);
    const title = $('#scheduleTitleInput').value.trim();
    const date = $('#scheduleDateInput').value;
    if (!title || !date) return;
    let item = editingScheduleId ? scheduleItem(editingScheduleId) : null;
    if (item) {
      item.title = title;
      item.kind = $('#scheduleTypeInput').value === 'event' ? 'event' : 'deadline';
      item.date = date;
      item.time = $('#scheduleTimeInput').value;
    } else {
      item = createScheduleItem({ title, kind: $('#scheduleTypeInput').value, date, time: $('#scheduleTimeInput').value });
    }
    if (pendingScheduleSource?.type === 'capture') {
      const capture = state.captures.find(entry => String(entry.id) === String(pendingScheduleSource.id));
      if (capture) capture.scheduleId = item.id;
    }
    save();
    closeScheduleForm(false);
    render();
    toast(wasEditing ? '日期已更新。' : '日期已加入工作台。');
  });
  $('#scheduleList').addEventListener('click', event => {
    const todayButton = event.target.closest('[data-schedule-today]');
    const doneButton = event.target.closest('[data-schedule-done]');
    const editButton = event.target.closest('[data-schedule-edit]');
    const deleteButton = event.target.closest('[data-schedule-delete]');
    const id = todayButton?.dataset.scheduleToday || doneButton?.dataset.scheduleDone || editButton?.dataset.scheduleEdit || deleteButton?.dataset.scheduleDelete;
    if (!id) return;
    const item = scheduleItem(id);
    if (!item) return;
    if (todayButton) {
      addTaskToToday(item.title, item.kind === 'event' ? '准时参加并准备好所需资料' : '完成截止前最关键的一步', item.id);
      save(); render(); toast('已排进今日执行流，日期仍然保留。');
      return;
    }
    if (doneButton) {
      item.done = !item.done;
      item.doneAt = item.done ? new Date().toISOString() : null;
      let completedMainId = '';
      let restoredTodayTask = null;
      state.tasks.filter(task => task.scheduleId === item.id).forEach(task => {
        task.done = item.done;
        task.doneAt = item.done ? item.doneAt : null;
        if (task.id === state.mainTaskId && item.done) completedMainId = task.id;
        if (!item.done && task.date === dateKey() && !restoredTodayTask) restoredTodayTask = task;
      });
      const next = completedMainId ? advanceMainTask(completedMainId) : null;
      if (!item.done && !currentMainTask() && restoredTodayTask) setMainTask(restoredTodayTask);
      save(); render(); toast(next ? `日期事项已完成，下一条切换为「${next.title}」。` : item.done ? '日期事项已完成。' : '日期事项已恢复。');
      return;
    }
    if (editButton) {
      openScheduleForm({ item });
      return;
    }
    state.scheduleItems = state.scheduleItems.filter(entry => entry.id !== item.id);
    state.tasks.forEach(task => { if (task.scheduleId === item.id) task.scheduleId = ''; });
    state.captures.forEach(capture => { if (capture.scheduleId === item.id) capture.scheduleId = ''; });
    state.decisions.forEach(decision => { if (decision.scheduleId === item.id) decision.scheduleId = ''; });
    save(); render(); toast('日期已删除，原事项仍然保留。');
  });

  $('#planDate').addEventListener('change', event => { state.planDate = event.target.value || dateKey(); save(); renderToday(); });
  $('#addTaskButton').addEventListener('click', () => {
    $('#newTaskDate').value = state.planDate;
    $('#newTaskDeadline').value = '';
    $('#newTaskDeadlineTime').value = '';
    $('#addTaskForm').hidden = false;
    $('#newTaskInput').focus();
  });
  $('#cancelTask').addEventListener('click', () => { $('#addTaskForm').hidden = true; });
  $('#addTaskForm').addEventListener('submit', event => {
    event.preventDefault();
    const taskDate = $('#newTaskDate').value || state.planDate;
    const title = $('#newTaskInput').value.trim();
    const deadlineDate = $('#newTaskDeadline').value;
    if (deadlineDate && deadlineDate < taskDate) {
      toast('截止日不能早于安排执行日，请检查日期。');
      return;
    }
    const linkedSchedule = deadlineDate ? createScheduleItem({ title, kind: 'deadline', date: deadlineDate, time: $('#newTaskDeadlineTime').value }) : null;
    state.tasks.push({ id: `t${Date.now()}`, title, nextStep: '完成这件事的第一个可交付动作', date: taskDate, done: false, doneAt: null, scheduleId: linkedSchedule?.id || '' });
    $('#newTaskInput').value = ''; $('#newTaskDeadline').value = ''; $('#newTaskDeadlineTime').value = ''; $('#addTaskForm').hidden = true; save(); render(); toast(deadlineDate ? '任务和截止日都已保存。' : taskDate === dateKey() ? '已加入今天。' : '已加入所选日期。');
  });
  $('#todayList').addEventListener('click', event => {
    const check = event.target.closest('[data-task]');
    const remove = event.target.closest('[data-remove-task]');
    const mainButton = event.target.closest('[data-main-task]');
    const editButton = event.target.closest('[data-edit-task]');
    let completionMessage = '';
    if (editButton) {
      openTaskEdit(state.tasks.find(item => item.id === editButton.dataset.editTask));
      return;
    }
    if (check) {
      const task = state.tasks.find(item => item.id === check.dataset.task);
      if (task) {
        task.done = !task.done;
        task.doneAt = task.done ? new Date().toISOString() : null;
        const linkedSchedule = scheduleItem(task.scheduleId);
        if (linkedSchedule) { linkedSchedule.done = task.done; linkedSchedule.doneAt = task.done ? task.doneAt : null; }
        if (task.id === state.mainTaskId) {
          if (task.done) {
            running = false; clearInterval(interval); $('#focusStrip').hidden = true;
            const next = advanceMainTask(task.id);
            completionMessage = next ? `已完成，下一条切换为「${next.title}」。` : '今日任务全部完成。';
          } else setMainTask(task);
        } else if (!task.done && !currentMainTask() && task.date === dateKey()) {
          setMainTask(task);
        }
      }
    }
    const focusButton = event.target.closest('[data-focus-task]');
    if (focusButton) {
      const task = state.tasks.find(item => item.id === focusButton.dataset.focusTask);
      if (task) {
        state.mainTaskId = task.id; state.commitment = task.title; state.nextStep = task.nextStep || '完成这件事的第一个可交付动作'; state.completed = false;
        save(); render(); startTimer();
        document.querySelector('#today').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    if (mainButton) {
      const task = state.tasks.find(item => item.id === mainButton.dataset.mainTask);
      if (task) {
        setMainTask(task);
        toast('已设为今日主线。');
        document.querySelector('#today').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    if (remove) {
      const removedMain = remove.dataset.removeTask === state.mainTaskId;
      state.tasks = state.tasks.filter(item => item.id !== remove.dataset.removeTask);
      if (removedMain) advanceMainTask(remove.dataset.removeTask);
    }
    if (check || remove || mainButton) { save(); render(); if (completionMessage) toast(completionMessage); }
  });

  $('#todayList').addEventListener('change', event => {
    const dateInput = event.target.closest('[data-task-date]');
    if (!dateInput) return;
    const task = state.tasks.find(item => item.id === dateInput.dataset.taskDate);
    if (!task) return;
    task.date = dateInput.value;
    if (task.id === state.mainTaskId && task.date !== dateKey()) {
      advanceMainTask(task.id);
    }
    save(); render(); toast('任务日期已更新。');
  });

  function startTimer() {
    running = true; $('#focusStrip').hidden = false; clearInterval(interval);
    interval = setInterval(() => {
      if (!running) return;
      state.timer -= 1;
      if (state.timer <= 0) { state.timer = 0; running = false; clearInterval(interval); toast('25 分钟完成。决定下一步，或标记承诺完成。'); }
      save(); renderTimer(); renderCommitment();
    }, 1000);
    render();
  }
  $('#focusButton').addEventListener('click', startTimer);
  $('#timerToggle').addEventListener('click', () => { if (running) { running = false; clearInterval(interval); render(); } else startTimer(); });
  $('#timerReset').addEventListener('click', () => { running = false; clearInterval(interval); state.timer = 1500; save(); render(); toast('计时已重置。'); });

  const inboxModal = $('#inboxModal');
  const inboxClose = $('#inboxClose');
  function syncModalOpenState() {
    const hasOpenModal = [...document.querySelectorAll('.modal-backdrop')].some(modal => !modal.hidden);
    document.body.classList.toggle('modal-open', hasOpenModal);
  }
  function openInboxModal(category = '') {
    if (category && isInboxCategory(category)) $('#captureCategory').value = category;
    inboxVisibleLimit = INBOX_PAGE_SIZE;
    inboxModal.hidden = false;
    document.body.classList.add('modal-open');
    renderInbox();
    setTimeout(() => $('#captureSearch').focus(), 0);
  }
  function closeInboxModal() {
    inboxModal.hidden = true;
    syncModalOpenState();
    $('#openInboxButton').focus();
  }
  function openCaptureEdit(id) {
    const item = state.captures.find(capture => String(capture.id) === String(id));
    if (!item) return;
    editingCaptureId = String(item.id);
    $('#inboxEditText').value = item.text;
    $('#inboxEditCategory').value = normalizedCaptureCategory(item.category, item.text);
    $('#inboxEditModal').hidden = false;
    document.body.classList.add('modal-open');
    setTimeout(() => $('#inboxEditText').focus(), 0);
  }
  function closeCaptureEdit() {
    $('#inboxEditModal').hidden = true;
    $('#inboxEditForm').reset();
    editingCaptureId = '';
    syncModalOpenState();
  }
  $('#openInboxButton').addEventListener('click', () => openInboxModal());
  inboxClose.addEventListener('click', closeInboxModal);
  inboxModal.addEventListener('click', event => { if (event.target === inboxModal) closeInboxModal(); });
  $('#inboxEditClose').addEventListener('click', closeCaptureEdit);
  $('#cancelInboxEdit').addEventListener('click', closeCaptureEdit);
  $('#inboxEditModal').addEventListener('click', event => { if (event.target === $('#inboxEditModal')) closeCaptureEdit(); });
  $('#inboxEditForm').addEventListener('submit', event => {
    event.preventDefault();
    const item = state.captures.find(capture => String(capture.id) === editingCaptureId);
    if (!item) return closeCaptureEdit();
    const text = $('#inboxEditText').value.trim();
    if (!text) return;
    item.text = text;
    item.category = normalizedCaptureCategory($('#inboxEditCategory').value, text);
    const detectedType = typeOf(text);
    item.type = detectedType === 'decision' ? (item.type || 'task') : detectedType;
    const linkedSchedule = scheduleItem(item.scheduleId);
    if (linkedSchedule) linkedSchedule.title = text;
    save(); closeCaptureEdit(); render(); toast('收件事项已修改。');
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!$('#inboxEditModal').hidden) closeCaptureEdit();
    else if (!$('#taskEditModal').hidden) closeTaskEdit();
    else if (!inboxModal.hidden) closeInboxModal();
  });

  $('#inboxRecentPreview').addEventListener('click', event => {
    const editButton = event.target.closest('[data-inbox-edit]');
    if (editButton) openCaptureEdit(editButton.dataset.inboxEdit);
  });

  $('#captureForm').addEventListener('submit', event => {
    event.preventDefault(); const text = $('#captureInput').value.trim(); if (!text) return;
    const type = typeOf(text);
    const source = $('#captureInput').dataset.captureSource || 'text';
    if (type === 'decision') {
      state.decisions.push({ id: `d${Date.now()}`, question: text, context: source === 'voice' ? '由语音记录自动识别，等待补充事实。' : '从快速收件自动识别，等待补充事实。', source });
    } else {
      state.captures.push({ id: Date.now(), text, type, category: inferCategory(text), source, createdAt: new Date().toISOString() });
    }
    $('#captureInput').value = ''; delete $('#captureInput').dataset.captureSource; setVoiceStatus(''); save(); render();
    toast(type === 'decision' ? '已识别为判断，进入判断队列。' : type === 'followup' ? '已识别为跟进，等待你安排提醒。' : '已收进来，先不打断现在。');
  });

  $('#inboxPreview').addEventListener('click', event => {
    const editButton = event.target.closest('[data-inbox-edit]');
    const todayButton = event.target.closest('[data-inbox-today]');
    const scheduleButton = event.target.closest('[data-inbox-schedule]');
    const decisionButton = event.target.closest('[data-inbox-decision]');
    const deleteButton = event.target.closest('[data-inbox-delete]');
    const id = editButton?.dataset.inboxEdit || todayButton?.dataset.inboxToday || scheduleButton?.dataset.inboxSchedule || decisionButton?.dataset.inboxDecision || deleteButton?.dataset.inboxDelete;
    if (!id) return;
    const item = state.captures.find(capture => String(capture.id) === String(id));
    if (!item) return;
    if (editButton) {
      openCaptureEdit(item.id);
      return;
    }
    if (scheduleButton) {
      closeInboxModal();
      openScheduleForm({ item: scheduleItem(item.scheduleId), source: { type: 'capture', id: item.id }, title: item.text });
      return;
    }
    if (todayButton) {
      addTaskToToday(item.text, '完成这件事的第一个可交付动作', item.scheduleId || '');
      toast('已排进今日执行流。');
    }
    if (decisionButton) {
      state.decisions.push({ id: `d${Date.now()}`, question: item.text, context: '从快速收件转入，等待补充事实。', scheduleId: item.scheduleId || '' });
      toast('已转入判断队列。');
    }
    state.captures = state.captures.filter(capture => String(capture.id) !== String(id));
    save(); render();
  });

  $('#inboxPreview').addEventListener('change', event => {
    const categorySelect = event.target.closest('[data-inbox-category]');
    if (!categorySelect) return;
    const item = state.captures.find(capture => String(capture.id) === String(categorySelect.dataset.inboxCategory));
    if (!item) return;
    item.category = normalizedCaptureCategory(categorySelect.value, item.text);
    save();
    render();
    toast(`已改为${inboxCategoryLabel(item.category)}。`);
  });
  $('#captureSearch').addEventListener('input', () => { inboxVisibleLimit = INBOX_PAGE_SIZE; renderInbox(); });
  $('#captureCategory').addEventListener('change', () => { inboxVisibleLimit = INBOX_PAGE_SIZE; renderInbox(); });
  $('#inboxMore').addEventListener('click', () => { inboxVisibleLimit += INBOX_PAGE_SIZE; renderInbox(); });

  function openDecisionForm(item = null) {
    editingDecisionId = item ? String(item.id) : '';
    $('#decisionQuestionInput').value = item?.question || '';
    $('#decisionContextInput').value = item?.context || '';
    $('#decisionSubmitButton').textContent = item ? '保存修改' : '加入判断队列';
    $('#addDecisionForm').hidden = false;
    $('#decisionQuestionInput').focus();
  }
  function closeDecisionForm() {
    editingDecisionId = '';
    $('#addDecisionForm').reset();
    $('#decisionSubmitButton').textContent = '加入判断队列';
    $('#addDecisionForm').hidden = true;
  }
  $('#addDecisionButton').addEventListener('click', () => openDecisionForm());
  $('#cancelDecision').addEventListener('click', closeDecisionForm);
  $('#addDecisionForm').addEventListener('submit', event => {
    event.preventDefault();
    const question = $('#decisionQuestionInput').value.trim();
    const context = $('#decisionContextInput').value.trim();
    const item = state.decisions.find(decision => String(decision.id) === editingDecisionId);
    if (item) {
      item.question = question;
      item.context = context;
      const linkedSchedule = scheduleItem(item.scheduleId);
      if (linkedSchedule) linkedSchedule.title = question;
    } else {
      state.decisions.push({ id: `d${Date.now()}`, question, context });
    }
    const wasEditing = Boolean(item);
    closeDecisionForm();
    save(); render(); toast(wasEditing ? '判断事项已修改。' : '已加入判断队列。');
  });

  $('#decisionList').addEventListener('click', event => {
    const editButton = event.target.closest('[data-edit-decision]');
    if (editButton) {
      openDecisionForm(state.decisions.find(decision => String(decision.id) === String(editButton.dataset.editDecision)));
      return;
    }
    const decideButton = event.target.closest('[data-decide]');
    if (decideButton) {
      const choices = $(`[data-choices="${decideButton.dataset.decide}"]`);
      if (choices) choices.hidden = !choices.hidden;
      return;
    }
    const actionButton = event.target.closest('[data-decide-action]');
    if (!actionButton) return;
    const id = actionButton.dataset.decideId;
    const item = state.decisions.find(decision => decision.id === id);
    if (!item) return;
    const action = actionButton.dataset.decideAction;
    if (action === 'do') {
      addTaskToToday(item.question, '把这个判断往前推一步', item.scheduleId || '');
      toast('已排进今天，直接去做。');
    } else if (action === 'later') {
      state.captures.push({ id: Date.now(), type: 'task', text: `（暂缓）${item.question}`, category: inferCategory(item.question), scheduleId: item.scheduleId || '' });
      toast('已搁置，放进收件箱稍后处理。');
    } else {
      toast('已放弃这个判断。');
    }
    state.decisions = state.decisions.filter(decision => decision.id !== id);
    save(); render();
  });
  $('#closeDayButton').addEventListener('click', () => { $('#closeDayButton').hidden = true; $('#closeDayForm').hidden = false; $('#tomorrowInput').value = state.tomorrow; $('#tomorrowInput').focus(); });
  $('#cancelClose').addEventListener('click', () => { $('#closeDayForm').hidden = true; $('#closeDayButton').hidden = false; });
  $('#closeDayForm').addEventListener('submit', event => {
    event.preventDefault(); state.tomorrow = $('#tomorrowInput').value.trim(); save(); renderToday();
    $('#closeDayForm').hidden = true; $('#closeDayButton').hidden = false; toast('今天已收好，明天第一步已留下。');
  });

  function openMemoryForm(item = null) {
    editingMemoryId = item ? String(item.id) : '';
    $('#memoryTitleInput').value = item?.title || '';
    $('#memoryContentInput').value = item?.content || '';
    $('#memoryTypeInput').value = item?.type || 'idea';
    $('#memorySubmitButton').textContent = item ? '保存修改' : '保存到可复用资料';
    $('#memoryForm').hidden = false;
    $('#memoryTitleInput').focus();
  }
  function closeMemoryForm() {
    editingMemoryId = '';
    $('#memoryForm').reset();
    $('#memorySubmitButton').textContent = '保存到可复用资料';
    $('#memoryForm').hidden = true;
  }
  $('#addMemoryButton').addEventListener('click', () => openMemoryForm());
  $('#cancelMemory').addEventListener('click', closeMemoryForm);
  $('#memoryForm').addEventListener('submit', event => {
    event.preventDefault();
    const title = $('#memoryTitleInput').value.trim();
    const content = $('#memoryContentInput').value.trim();
    if (!title || !content) return;
    const item = state.memoryItems.find(memory => String(memory.id) === editingMemoryId);
    if (item) {
      item.title = title;
      item.content = content;
      item.type = $('#memoryTypeInput').value;
    } else {
      state.memoryItems.push({ id: `m${Date.now()}`, title, content, type: $('#memoryTypeInput').value, createdAt: new Date().toISOString() });
    }
    const wasEditing = Boolean(item);
    closeMemoryForm();
    save(); renderMemory(); toast(wasEditing ? '可复用资料已修改。' : '已保存到可复用资料。');
  });
  $('#memorySearch').addEventListener('input', renderMemory);
  $('#memoryList').addEventListener('click', event => {
    const editButton = event.target.closest('[data-memory-edit]');
    const inboxButton = event.target.closest('[data-memory-inbox]');
    const deleteButton = event.target.closest('[data-memory-delete]');
    const id = editButton?.dataset.memoryEdit || inboxButton?.dataset.memoryInbox || deleteButton?.dataset.memoryDelete;
    if (!id) return;
    const item = state.memoryItems.find(memory => String(memory.id) === String(id));
    if (!item) return;
    if (editButton) {
      openMemoryForm(item);
      return;
    }
    if (inboxButton) {
      const text = `${item.title}：${item.content}`;
      state.captures.push({ id: Date.now(), type: 'task', text, category: inferCategory(text) });
      save(); render(); toast('已加入快速收件箱。');
      return;
    }
    state.memoryItems = state.memoryItems.filter(memory => String(memory.id) !== String(id));
    save(); renderMemory(); toast('工作记忆已删除。');
  });

  $('#radarGrid').addEventListener('click', event => {
    const taskButton = event.target.closest('[data-radar-task-edit]');
    const inboxButton = event.target.closest('[data-radar-inbox-edit]');
    if (taskButton) openTaskEdit(state.tasks.find(task => String(task.id) === String(taskButton.dataset.radarTaskEdit)));
    if (inboxButton) openCaptureEdit(inboxButton.dataset.radarInboxEdit);
  });

  const captureInput = $('#captureInput');
  captureInput.addEventListener('focus', () => {
    $('#mobileCapture').hidden = true;
    setTimeout(() => $('#capture').scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  });
  captureInput.addEventListener('blur', () => setTimeout(() => { $('#mobileCapture').hidden = false; }, 120));
  $('#mobileCapture').addEventListener('click', () => { $('#capture').scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => captureInput.focus(), 250); });

  setTodayLabel();
  if (captureMigrationNeeded) { save(); captureMigrationNeeded = false; }
  render();

  window.addEventListener('focus', () => ensureCurrentDay());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ensureCurrentDay(); });
  setInterval(() => ensureCurrentDay(), 60000);

  window.SummerOS = {
    getState() { return structuredClone(state); },
    applyRemoteState(remoteState) {
      if (!remoteState || typeof remoteState !== 'object' || Array.isArray(remoteState)) return false;
      state = {
        ...structuredClone(defaults),
        ...structuredClone(remoteState),
        tasks: Array.isArray(remoteState.tasks) ? structuredClone(remoteState.tasks) : structuredClone(defaults.tasks),
        decisions: Array.isArray(remoteState.decisions) ? structuredClone(remoteState.decisions) : structuredClone(defaults.decisions),
        captures: Array.isArray(remoteState.captures) ? structuredClone(remoteState.captures) : [],
        memoryItems: Array.isArray(remoteState.memoryItems) ? structuredClone(remoteState.memoryItems) : [],
        scheduleItems: Array.isArray(remoteState.scheduleItems) ? structuredClone(remoteState.scheduleItems) : [],
        plans: Array.isArray(remoteState.plans) ? structuredClone(remoteState.plans) : []
      };
      state.captures = state.captures.map(capture => ({ ...capture, category: normalizedCaptureCategory(capture.category, capture.text) }));
      state.mode = state.mode === 'flow' ? 'flow' : 'planner';
      state.tasks = state.tasks.map(task => ({ ...task, date: task.date || dateKey(), done: Boolean(task.done), doneAt: task.doneAt || null }));
      state.scheduleItems = state.scheduleItems.map(item => ({ ...item, kind: item.kind === 'event' ? 'event' : 'deadline', time: item.time || '', done: Boolean(item.done), doneAt: item.doneAt || null }));
      state.planDate = state.planDate || dateKey();
      const rollover = window.SummerDayRollover.apply(state, dateKey());
      running = false;
      clearInterval(interval);
      $('#focusStrip').hidden = true;
      save({ remote: true });
      if (rollover.rolledOver) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('summer-os:state-saved', { detail: state })), 0);
      }
      setTodayLabel();
      render();
      return true;
    }
  };
  window.dispatchEvent(new Event('summer-os:ready'));
})();
