import type { Plan, Tank, Substrate, WaterConfig } from '../core/types';
import { EMPTY_WATER } from '../core/types';

const KEY = 'aquaplans.v1';

export function defaultSubstrate(): Substrate {
  return { kind: 'soil', densityKgPerL: 1.05, thicknessMm: 50, slopeMm: 60 };
}

export function defaultTank(name = '我的草缸'): Tank {
  return { id: 't1', name, l: 60, w: 45, h: 45, glassMm: 8, waterLevelMm: 390, openTop: true };
}

export function newPlan(name = '我的草缸'): Plan {
  return {
    id: `p${Date.now()}${Math.floor(Math.random() * 1e4)}`,
    name,
    tank: defaultTank(name),
    substrate: defaultSubstrate(),
    items: [],
    fishes: [],
    water: { ...EMPTY_WATER },
    updatedAt: Date.now(),
  };
}

function load(): Plan[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

function save(plans: Plan[]) {
  localStorage.setItem(KEY, JSON.stringify(plans));
}

// ---- 集中式 store（React 组件只做展示与用户动作，见项目约定）----
type Listener = () => void;
const listeners = new Set<Listener>();
let plans: Plan[] = load();

function emit() {
  save(plans);
  listeners.forEach((l) => l());
}

export function getPlans(): Plan[] {
  return plans;
}

export function subscribePlans(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getPlan(id: string): Plan | undefined {
  return plans.find((p) => p.id === id);
}

export function upsertPlan(plan: Plan) {
  const idx = plans.findIndex((p) => p.id === plan.id);
  const next = { ...plan, updatedAt: Date.now() };
  if (idx >= 0) plans = plans.map((p) => (p.id === plan.id ? next : p));
  else plans = [next, ...plans];
  emit();
}

export function deletePlan(id: string) {
  plans = plans.filter((p) => p.id !== id);
  emit();
}

export function renamePlan(id: string, name: string) {
  plans = plans.map((p) => (p.id === id ? { ...p, name, updatedAt: Date.now() } : p));
  emit();
}

/** 更新某个 plan 的局部字段并持久化 */
export function updatePlan(id: string, patch: Partial<Plan>) {
  plans = plans.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p));
  emit();
}

export function updateWater(id: string, patch: Partial<WaterConfig>) {
  const plan = getPlan(id);
  if (!plan) return;
  updatePlan(id, { water: { ...plan.water, ...patch } });
}
