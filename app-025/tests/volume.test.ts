import { describe, it, expect } from 'vitest';
import {
  grossVolumeL,
  substrateVolumeL,
  substrateWeightKg,
  substrateAvgThicknessCm,
  hardscapeDisplacementL,
  effectiveVolumeL,
  waterHeightCm,
  waterSurfaceAreaM2,
} from '../src/core/volume';
import type { Substrate, Tank, Item } from '../src/core/types';

function tank(p: Partial<Tank> = {}): Tank {
  return { id: 't', name: 'T', l: 60, w: 45, h: 45, glassMm: 8, waterLevelMm: 390, openTop: true, ...p };
}
function sub(p: Partial<Substrate> = {}): Substrate {
  return { kind: 'soil', densityKgPerL: 1.05, thicknessMm: 50, slopeMm: 60, ...p };
}

/** 可复现的伪随机（mulberry32） */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('水量与底砂计算（验收：随机 50 组与手工核算一致，误差 ≤ 2%）', () => {
  const rand = mulberry32(20260917);
  const cases = Array.from({ length: 50 }, () => {
    const l = 20 + Math.round(rand() * 280); // 20~300cm
    const w = 20 + Math.round(rand() * 80);
    const h = 20 + Math.round(rand() * 80);
    const waterLevelMm = Math.round(rand() * h * 10);
    const thicknessMm = Math.round(rand() * 120); // 0~120mm
    const slopeMm = Math.round(rand() * 150);
    const densityKgPerL = 1 + rand() * 0.7; // 1.0~1.7
    return { tank: tank({ l, w, h, waterLevelMm }), sub: sub({ thicknessMm, slopeMm, densityKgPerL }) };
  });

  it.each(cases.map((c, i) => [i, c] as const))(
    'case #%i: %sx%sx%s cm, 水面 %smm, 底砂 %s+%smm @%skg/L',
    (_i, { tank: t, sub: s }) => {
      // 手工核算（独立算式，不经被测模块）
      const waterCm = Math.min(t.h, t.waterLevelMm / 10);
      const manualGross = (t.l * t.w * waterCm) / 1000;
      const avgThick = s.thicknessMm / 10 + s.slopeMm / 10 / 2;
      const manualSubVol = (t.l * t.w * avgThick) / 1000;
      const manualWeight = manualSubVol * s.densityKgPerL;

      expect(waterHeightCm(t)).toBeCloseTo(waterCm, 6);
      expect(grossVolumeL(t)).toBeCloseTo(manualGross, 3);
      expect(substrateVolumeL(t, s)).toBeCloseTo(manualSubVol, 3);
      expect(substrateWeightKg(t, s)).toBeCloseTo(manualWeight, 3);

      // 误差 ≤ 2%（相对手工值）
      const errGross = Math.abs(grossVolumeL(t) - manualGross) / (manualGross || 1);
      const errWeight = Math.abs(substrateWeightKg(t, s) - manualWeight) / (manualWeight || 1);
      expect(errGross).toBeLessThanOrEqual(0.02);
      expect(errWeight).toBeLessThanOrEqual(0.02);
    },
  );
});

describe('有效水量必须扣除底砂与素材（专门用例）', () => {
  it('有效水量 = 毛水量 − 底砂体积 − 素材排水体积', () => {
    const t = tank(); // 60×45×45, 水面 390mm → 39cm 水柱
    const s = sub({ thicknessMm: 50, slopeMm: 60, densityKgPerL: 1.05 });
    const items: Item[] = [
      { id: 'h1', kind: 'hardscape', name: '青龙石', x: 10, y: 10, scaleCm: 20, rotDeg: 0, displacement: 0.55, shape: 'rock' },
      { id: 'p1', kind: 'plant', name: '铁皇冠', x: 20, y: 20, scaleCm: 15, rotDeg: 0, qty: 5 },
    ];
    const gross = grossVolumeL(t);
    const subVol = substrateVolumeL(t, s);
    const displace = hardscapeDisplacementL(items);
    const eff = effectiveVolumeL(t, s, items);

    // 手工核对
    expect(gross).toBeCloseTo((60 * 45 * 39) / 1000, 6); // 105.3L
    expect(subVol).toBeCloseTo((60 * 45 * (5 + 3)) / 1000, 6); // 21.6L
    // 硬景观：20cm 石，包围盒 20×0.7×20×0.7×20/1000 = 3.92L × 0.55
    expect(displace).toBeCloseTo(((20 * 0.7 * 20 * 0.7 * 20) / 1000) * 0.55, 6);
    expect(eff).toBeCloseTo(gross - subVol - displace, 6);
    // 底砂+素材确实被扣除
    expect(eff).toBeLessThan(gross);
    expect(eff).toBeCloseTo(gross - subVol - displace, 9);
  });

  it('水草不计入排水体积', () => {
    const t = tank();
    const s = sub();
    const plants: Item[] = [
      { id: 'p1', kind: 'plant', name: 'A', x: 0, y: 0, scaleCm: 30, rotDeg: 0 },
      { id: 'p2', kind: 'plant', name: 'B', x: 0, y: 0, scaleCm: 40, rotDeg: 0 },
    ];
    expect(hardscapeDisplacementL(plants)).toBe(0);
    expect(effectiveVolumeL(t, s, plants)).toBeCloseTo(grossVolumeL(t) - substrateVolumeL(t, s), 9);
  });

  it('极端参数不出现负水量', () => {
    const t = tank({ l: 40, w: 30, h: 30, waterLevelMm: 300 });
    const s = sub({ thicknessMm: 200, slopeMm: 100 }); // 底砂比水还深
    expect(effectiveVolumeL(t, s, [])).toBeGreaterThanOrEqual(0);
  });

  it('水面高度被缸高夹取（超注水不溢出）', () => {
    const t = tank({ h: 30, waterLevelMm: 500 });
    expect(waterHeightCm(t)).toBe(30);
    expect(grossVolumeL(t)).toBeCloseTo((60 * 45 * 30) / 1000, 6);
  });

  it('底砂平均厚度 = 基础 + 坡度/2', () => {
    expect(substrateAvgThicknessCm(sub({ thicknessMm: 40, slopeMm: 80 }))).toBeCloseTo(4 + 4, 9);
  });

  it('水面面积(m²)', () => {
    expect(waterSurfaceAreaM2(tank({ l: 100, w: 50 }))).toBeCloseTo(0.5, 9);
  });
});
