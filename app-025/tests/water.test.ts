import { describe, it, expect } from 'vitest';
import {
  roMixForGh,
  saltForGh,
  co2FromPhKh,
  targetPhForCo2,
  co2BubblesPerSec,
  phKhCo2Table,
  weeklyWaterChangePct,
} from '../src/core/water';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('GH 调配（验收：20 组用例，公式一致，方向正确）', () => {
  const rand = mulberry32(917);
  // 10 组降 GH（必须给 RO 方案）
  const lower = Array.from({ length: 10 }, () => {
    const tapGh = 6 + Math.round(rand() * 20); // 6~26
    const targetGh = Math.round(rand() * (tapGh - 1) * 10) / 10; // < tap
    const totalL = 20 + Math.round(rand() * 300);
    return { tapGh, targetGh, totalL };
  });
  // 10 组升 GH（必须给加盐方案）
  const higher = Array.from({ length: 10 }, () => {
    const tapGh = Math.round(rand() * 14 * 10) / 10; // 0~14
    const targetGh = tapGh + 1 + Math.round(rand() * 12 * 10) / 10;
    const totalL = 20 + Math.round(rand() * 300);
    return { tapGh, targetGh, totalL };
  });

  it.each(lower.map((c, i) => [i, c] as const))('降 GH #%i: %o', (_i, { tapGh, targetGh, totalL }) => {
    const ro = roMixForGh(tapGh, targetGh, totalL);
    expect(ro).not.toBeNull();
    // 公式：V_ro/V_total = (tap - target)/tap
    expect(ro!.roRatio).toBeCloseTo((tapGh - targetGh) / tapGh, 9);
    expect(ro!.tapRatio).toBeCloseTo(1 - ro!.roRatio, 9);
    expect(ro!.roL).toBeCloseTo(ro!.roRatio * totalL, 6);
    expect(ro!.tapL).toBeCloseTo((1 - ro!.roRatio) * totalL, 6);
    expect(ro!.tapL + ro!.roL).toBeCloseTo(totalL, 6);
    // 反向时不得出加盐方案
    expect(saltForGh(tapGh, targetGh, totalL)).toBeNull();
    // 线性混合验证：tap×V_tap + 0×V_ro = target×V_total
    expect((tapGh * ro!.tapL) / totalL).toBeCloseTo(targetGh, 6);
  });

  it.each(higher.map((c, i) => [i, c] as const))('升 GH #%i: %o', (_i, { tapGh, targetGh, totalL }) => {
    const salt = saltForGh(tapGh, targetGh, totalL);
    expect(salt).not.toBeNull();
    // 公式：m = ΔGH × V / 贡献
    expect(salt!.grams).toBeCloseTo(((targetGh - tapGh) * totalL) / salt!.ghPerGramPerL, 6);
    expect(salt!.grams).toBeGreaterThan(0);
    // 反向时不得出 RO 方案
    expect(roMixForGh(tapGh, targetGh, totalL)).toBeNull();
  });

  it('目标=自来水：两个方案都不给', () => {
    expect(roMixForGh(10, 10, 100)).toBeNull();
    expect(saltForGh(10, 10, 100)).toBeNull();
  });

  it('目标>自来水时 RO 方案无效（负比率防护）', () => {
    expect(roMixForGh(10, 15, 100)).toBeNull();
  });
});

describe('CO₂ 与 pH-KH 关系（验收：结果在经验范围内且带估算标注）', () => {
  it('CO₂ ≈ 3 × KH × 10^(7−pH)', () => {
    expect(co2FromPhKh(4, 7)).toBeCloseTo(12, 9);
    expect(co2FromPhKh(4, 6.6)).toBeCloseTo(30.1, 1);
    expect(co2FromPhKh(6, 7)).toBeCloseTo(18, 9);
    expect(co2FromPhKh(1, 7)).toBeCloseTo(3, 9);
  });

  it('反解目标 pH：pH = 7 − log10(CO₂/3KH)，并往返一致', () => {
    for (const kh of [1, 2, 4, 6, 10]) {
      for (const co2 of [15, 20, 25, 30, 35]) {
        const ph = targetPhForCo2(kh, co2)!;
        expect(co2FromPhKh(kh, ph)).toBeCloseTo(co2, 6);
      }
    }
  });

  it('25ppm@KH4 的目标 pH 落在经验弱酸区（6.5~6.9）', () => {
    const ph = targetPhForCo2(4, 25)!;
    expect(ph).toBeGreaterThan(6.5);
    expect(ph).toBeLessThan(6.9);
  });

  it('泡数为经验估算（带标注与非负）', () => {
    const b = co2BubblesPerSec(25, 100);
    expect(b.estimated).toBe(true);
    expect(b.note).toContain('估算');
    expect(b.note).toContain('监测液');
    expect(b.value).toBeGreaterThan(0);
    expect(co2BubblesPerSec(0, 100).value).toBe(0);
    expect(co2BubblesPerSec(25, 0).value).toBe(0);
  });

  it('pH-KH-CO₂ 表覆盖 5.2~7.8', () => {
    const t = phKhCo2Table();
    expect(t[0].ph).toBe(5.2);
    expect(t[t.length - 1].ph).toBeCloseTo(7.8, 6);
    expect(t.length).toBe(14);
  });
});

describe('换水建议', () => {
  it('按种植密度分档且为估算', () => {
    const eff = 100;
    const dense = weeklyWaterChangePct(200, eff); // 2 株/L
    const mid = weeklyWaterChangePct(80, eff); // 0.8 株/L
    const sparse = weeklyWaterChangePct(10, eff);
    expect([dense.value, mid.value, sparse.value]).toEqual([30, 40, 50]);
    for (const r of [dense, mid, sparse]) {
      expect(r.estimated).toBe(true);
      expect(r.note).toContain('经验估算');
    }
  });
});
