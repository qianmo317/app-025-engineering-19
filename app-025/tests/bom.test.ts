import { describe, it, expect } from 'vitest';
import { buildBom } from '../src/core/bom';
import { FISHES, PLANTS } from '../src/data/db';
import type { Plan } from '../src/core/types';
import { substrateWeightKg } from '../src/core/volume';

const plan: Plan = {
  id: 'p1',
  name: '60 草缸',
  tank: { id: 't1', name: '60', l: 60, w: 45, h: 45, glassMm: 8, waterLevelMm: 390, openTop: true },
  substrate: { kind: 'ada', densityKgPerL: 1.15, thicknessMm: 50, slopeMm: 60 },
  items: [
    { id: 'i1', kind: 'hardscape', name: '曼珠沉木', x: 20, y: 15, scaleCm: 25, rotDeg: 0, displacement: 0.3, shape: 'wood' },
    { id: 'i2', kind: 'plant', name: '红宫廷', x: 30, y: 10, scaleCm: 25, rotDeg: 0, layer: 'back', lightNeed: 'high', growth: 'fast', qty: 20 },
    { id: 'i3', kind: 'plant', name: '小水榕', x: 10, y: 15, scaleCm: 8, rotDeg: 0, layer: 'front', lightNeed: 'low', growth: 'slow', qty: 3 },
  ],
  fishes: [
    { fishId: 'f-cardinal-tetra', count: 10 },
    { fishId: 'f-cherry-shrimp', count: 20 },
  ],
  water: { tapGh: 12, tapKh: 6, targetGh: 8, targetCo2Ppm: 25, roomTempC: 24, targetTempC: 26 },
  updatedAt: 0,
};

describe('物料清单（验收：底砂 kg、水草株数、鱼数、设备参数齐备）', () => {
  const bom = buildBom(
    plan,
    new Map(FISHES.map((f) => [f.id, f])),
    new Map(PLANTS.map((p) => [p.id, { name: p.name, lightNeed: p.lightNeed }])),
  );

  it('底砂行含 kg 且与重量公式一致', () => {
    const line = bom.lines.find((l) => l.category === '底砂')!;
    expect(line).toBeTruthy();
    const expectKg = substrateWeightKg(plan.tank, plan.substrate);
    expect(line.qty).toBe(`${expectKg.toFixed(1)} kg`);
  });

  it('水草行按株数列出', () => {
    const lines = bom.lines.filter((l) => l.category === '水草');
    expect(lines.length).toBe(2);
    expect(lines.find((l) => l.name === '红宫廷')!.qty).toBe('20 株');
    expect(lines.find((l) => l.name === '小水榕')!.qty).toBe('3 株');
  });

  it('生物行按尾数列出', () => {
    const lines = bom.lines.filter((l) => l.category === '生物');
    expect(lines.length).toBe(2);
    expect(lines.find((l) => l.name === '宝莲灯灯鱼')!.qty).toBe('10 尾');
    expect(lines.find((l) => l.name === '樱花虾')!.qty).toBe('20 尾');
  });

  it('硬景观与设备（过滤/灯/加热棒）齐备', () => {
    expect(bom.lines.find((l) => l.category === '硬景观')).toBeTruthy();
    const eq = bom.lines.filter((l) => l.category === '设备');
    expect(eq.map((e) => e.name)).toEqual(expect.arrayContaining(['过滤器', '照明灯', '加热棒']));
    expect(eq.find((e) => e.name === '过滤器')!.spec).toMatch(/L\/h/);
    expect(eq.find((e) => e.name === '照明灯')!.spec).toMatch(/lm/);
    expect(eq.find((e) => e.name === '加热棒')!.spec).toMatch(/W/);
  });

  it('养护参数卡：换水/喂食/光照/CO₂ 日程齐备', () => {
    expect(bom.care.waterChangePct).toBeGreaterThan(0);
    expect(bom.care.feedingTimes).toContain('每日');
    expect(bom.care.lightHours).toContain('小时');
    expect(bom.care.co2Schedule).toContain('CO₂');
  });
});
