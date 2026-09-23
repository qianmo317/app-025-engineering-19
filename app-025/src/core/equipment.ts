import type { Item, Tank } from './types';
import { effectiveVolumeL, waterSurfaceAreaM2 } from './volume';
import type { Substrate } from './types';

/** 光照等级：按 流明 / 水面面积(m²) 判定（经验阈值，可配） */
export type LightLevel = 'low' | 'mid' | 'high';

export const LIGHT_LUMEN_PER_M2: Record<LightLevel, [number, number]> = {
  low: [0, 2500],
  mid: [2500, 5000],
  high: [5000, Infinity],
};

/** W/L 经验区间（LED 时代）：低 0.15~0.35、中 0.35~0.6、高 0.6~1.0 */
export const WL_RANGE: Record<LightLevel, [number, number]> = {
  low: [0.15, 0.35],
  mid: [0.35, 0.6],
  high: [0.6, 1.0],
};

export function classifyLightByLumen(lumens: number, areaM2: number): LightLevel {
  const lmPerM2 = areaM2 > 0 ? lumens / areaM2 : 0;
  if (lmPerM2 < 2500) return 'low';
  if (lmPerM2 < 5000) return 'mid';
  return 'high';
}

/** 推荐灯具流明 = 目标等级中值(lm/m²) × 水面面积 */
export function recommendLumens(level: LightLevel, areaM2: number): number {
  const mid = level === 'low' ? 1500 : level === 'mid' ? 3750 : 6250;
  return Math.round(mid * areaM2);
}

/** 推荐功率(W)：按目标等级的 W/L 中值 × 有效水量 */
export function recommendWatts(level: LightLevel, effectiveL: number): number {
  const wl = level === 'low' ? 0.25 : level === 'mid' ? 0.45 : 0.8;
  return Math.round(wl * effectiveL);
}

export type LightCheck = {
  level: LightLevel;
  ok: boolean;
  warnings: string[];
};

/**
 * 光照交叉校验：水草需求 vs 实际光强。
 * 高光草配中光 → 建议提高光强或改用低光草，并提示爆藻风险。
 */
export function checkLight(level: LightLevel, items: Item[]): LightCheck {
  const warnings: string[] = [];
  const order: Record<LightLevel, number> = { low: 0, mid: 1, high: 2 };
  const actual = order[level];
  const needHigh = items.filter((i) => i.kind === 'plant' && i.lightNeed === 'high');
  const lowLightPlants = items.some((i) => i.kind === 'plant' && i.lightNeed === 'low');

  if (level === 'high' && lowLightPlants && !needHigh.length) {
    warnings.push('强光配阴性草易爆藻，建议缩短光照时间或调低功率');
  }
  for (const p of needHigh) {
    if (actual < 2) {
      warnings.push(`「${p.name}」为高光需求，当前光强不足：建议提高光强或改用低光草`);
    }
  }
  if (level === 'high' && needHigh.length && lowLightPlants) {
    warnings.push('高低光需求混植：阴性草易爆藻，建议分区遮挡或替换');
  }
  return { level, ok: warnings.length === 0, warnings };
}

/** 过滤流量建议：5~8 倍有效水量/小时（经验值） */
export function filterFlowLph(effectiveL: number): { min: number; max: number; estimated: true } {
  return { min: Math.round(effectiveL * 5), max: Math.round(effectiveL * 8), estimated: true };
}

/** 加热棒功率：W ≈ 有效水量(L) × 温差(°C) × 0.12，下限 25W，并取市售规格上取整 */
export function heaterWatts(effectiveL: number, roomTempC: number, targetTempC: number): {
  watts: number; suggested: number; estimated: true;
} {
  const dt = Math.max(0, targetTempC - roomTempC);
  const raw = Math.max(25, effectiveL * dt * 0.12);
  const standards = [25, 50, 100, 150, 200, 300, 500];
  const suggested = standards.find((s) => s >= raw) ?? standards[standards.length - 1];
  return { watts: Math.round(raw), suggested, estimated: true };
}

/** 常见成品缸玻璃厚度推荐（mm，经验表） */
export function suggestGlassMm(tank: Tank): number {
  const h = tank.h;
  if (h <= 30) return 5;
  if (h <= 45) return 8;
  if (h <= 60) return 10;
  return 12;
}

export type EquipmentSummary = {
  effectiveL: number;
  areaM2: number;
  light: { recommendLevel: LightLevel; lumens: number; watts: number };
  filter: { min: number; max: number };
  heater: { watts: number; suggested: number };
};

export function equipmentSummary(tank: Tank, sub: Substrate, items: Item[], targetLevel: LightLevel, roomTempC: number, targetTempC: number): EquipmentSummary {
  const eff = effectiveVolumeL(tank, sub, items);
  const area = waterSurfaceAreaM2(tank);
  const flow = filterFlowLph(eff);
  return {
    effectiveL: eff,
    areaM2: area,
    light: {
      recommendLevel: targetLevel,
      lumens: recommendLumens(targetLevel, area),
      watts: recommendWatts(targetLevel, eff),
    },
    filter: { min: flow.min, max: flow.max },
    heater: heaterWatts(eff, roomTempC, targetTempC),
  };
}
