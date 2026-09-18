import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = resolve(process.env.SUMMER_WORKBENCH_CONNECTOR_DIR || join(packageRoot, 'data'));
export const statePath = join(dataDir, 'state.json');
export const actionsPath = join(dataDir, 'actions.json');

export async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(path, value) {
  await ensureDataDir();
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
  await rename(temporaryPath, path);
}

function safeReview(review) {
  if (!review || typeof review !== 'object') return null;
  const safe = { ...review };
  delete safe.privateNotes;
  return safe;
}

export function safeState(input) {
  const state = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    date: String(state.date || ''),
    planDate: String(state.planDate || ''),
    commitment: String(state.commitment || ''),
    nextStep: String(state.nextStep || ''),
    tomorrow: String(state.tomorrow || ''),
    mode: String(state.mode || 'flow'),
    tasks: Array.isArray(state.tasks) ? state.tasks : [],
    decisions: Array.isArray(state.decisions) ? state.decisions : [],
    captures: Array.isArray(state.captures) ? state.captures : [],
    memoryItems: Array.isArray(state.memoryItems) ? state.memoryItems : [],
    scheduleItems: Array.isArray(state.scheduleItems) ? state.scheduleItems : [],
    plans: Array.isArray(state.plans) ? state.plans : [],
    dailyReviews: Array.isArray(state.dailyReviews) ? state.dailyReviews.map(safeReview).filter(Boolean) : [],
    updatedAt: new Date().toISOString(),
  };
}

export async function readState() {
  return readJson(statePath, safeState({}));
}

export async function readActions() {
  const actions = await readJson(actionsPath, []);
  return Array.isArray(actions) ? actions : [];
}

export async function appendAction(action) {
  const actions = await readActions();
  actions.push(action);
  await writeJsonAtomic(actionsPath, actions.slice(-200));
  return action;
}

export function textResult(text, isError = false) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

export function jsonResult(value) {
  return textResult(JSON.stringify(value, null, 2));
}
