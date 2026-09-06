(function (root) {
  const DEFAULT_TITLE = '确认今天最重要的结果';
  const DEFAULT_NEXT_STEP = '完成这件事的第一个可交付动作';

  function cleanText(value) {
    return String(value || '').trim();
  }

  function apply(state, today, createId) {
    if (!state || typeof state !== 'object' || !today) return { state, rolledOver: false };
    const previousDate = cleanText(state.date);
    if (!previousDate) {
      state.date = today;
      state.planDate = state.planDate || today;
      return { state, rolledOver: false };
    }
    if (previousDate >= today) return { state, rolledOver: false };

    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    const unfinishedBeforeToday = tasks.filter(task => task && !task.done && (!task.date || task.date <= previousDate));
    const tomorrowTitle = cleanText(state.tomorrow);
    const currentMain = tasks.find(task => task && !task.done && String(task.id) === String(state.mainTaskId));
    const existingOpening = tomorrowTitle
      ? tasks.find(task => task && !task.done && cleanText(task.title) === tomorrowTitle)
      : (currentMain || unfinishedBeforeToday[0]);
    const commitmentTitle = !state.completed ? cleanText(state.commitment) : '';
    const openingTitle = tomorrowTitle || cleanText(existingOpening?.title) || commitmentTitle || DEFAULT_TITLE;
    const openingTask = existingOpening
      ? { ...existingOpening, title: openingTitle, date: today, done: false, doneAt: null }
      : {
          id: typeof createId === 'function' ? createId() : `t${Date.now()}`,
          title: openingTitle,
          nextStep: DEFAULT_NEXT_STEP,
          date: today,
          done: false
        };
    openingTask.nextStep = cleanText(openingTask.nextStep) || DEFAULT_NEXT_STEP;

    const openingId = String(openingTask.id);
    const carryCandidates = unfinishedBeforeToday.filter(task => String(task.id) !== openingId);
    const carried = carryCandidates.slice(0, 2).map(task => ({ ...task, date: today }));
    const movedIds = new Set([openingId, ...carried.map(task => String(task.id))]);
    const preserved = tasks.filter(task => !movedIds.has(String(task.id)));

    state.date = today;
    state.planDate = today;
    state.tasks = [openingTask, ...carried, ...preserved];
    state.mainTaskId = openingTask.id;
    state.commitment = openingTask.title;
    state.nextStep = openingTask.nextStep;
    state.completed = false;
    state.timer = 1500;
    state.tomorrow = '';
    return { state, rolledOver: true, openingTaskId: openingTask.id };
  }

  root.SummerDayRollover = { apply };
})(globalThis);
