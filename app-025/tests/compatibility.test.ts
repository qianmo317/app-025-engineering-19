import { describe, it, expect } from 'vitest';
import {
  checkPair,
  checkSchooling,
  checkTankSize,
  checkDensity,
  checkStocking,
  rangesOverlap,
  type StockingIssue,
} from '../src/core/compatibility';
import type { Fish } from '../src/core/types';

function fish(p: Partial<Fish> & { id: string; name: string }): Fish {
  return {
    adultCm: 5,
    minTankL: 40,
    tempRange: [22, 26],
    ghRange: [2, 15],
    phRange: [6.0, 7.5],
    temperament: 'peaceful',
    plantNip: false,
    schooling: false,
    ...p,
  };
}

function codes(issues: StockingIssue[]) {
  return issues.map((i) => i.code);
}

describe('区间交集', () => {
  it('交集/无交集', () => {
    expect(rangesOverlap([20, 26], [24, 28])).toBe(true);
    expect(rangesOverlap([20, 24], [25, 28])).toBe(false);
  });
});

describe('混养兼容性（验收：30 组用例全部检出并给出原因）', () => {
  const ctx = { tankLitres: 60, hasPlants: true };
  const aggressive = fish({ id: 'agg', name: '斗鱼', temperament: 'aggressive', adultCm: 6, minTankL: 20 });
  const peaceful = fish({ id: 'pea', name: '灯鱼', temperament: 'peaceful', adultCm: 3, minTankL: 30 });
  const semi = fish({ id: 'semi', name: '虎皮', temperament: 'semi', adultCm: 6, plantNip: true });

  // ---- 规则 1：攻击性 × 温和（10 组）----
  it('攻击性×温和，缸体不足 → 硬冲突', () => {
    const small = { tankLitres: 29, hasPlants: true };
    for (let i = 0; i < 3; i++) {
      const r = checkPair(aggressive, peaceful, small);
      expect(codes(r)).toContain('aggression');
      const a = r.find((x) => x.code === 'aggression')!;
      expect(a.severity).toBe('conflict');
      expect(a.message).toContain('混养冲突');
      expect(a.message).toContain('30'); // 20×1.5
    }
  });

  it('攻击性×温和，缸体达标 → 降级为警告（需隔离区）', () => {
    const r = checkPair(aggressive, peaceful, { tankLitres: 30, hasPlants: true });
    const a = r.find((x) => x.code === 'aggression')!;
    expect(a.severity).toBe('warning');
    expect(a.message).toContain('隔离区');
  });

  it('攻击性×半凶 → 警告', () => {
    const r = checkPair(aggressive, semi, ctx);
    expect(codes(r)).toContain('aggression');
    expect(r.find((x) => x.code === 'aggression')!.severity).toBe('warning');
  });

  it('温和×温和无攻击性问题', () => {
    const r = checkPair(peaceful, fish({ id: 'p2', name: '月光', temperament: 'peaceful' }), ctx);
    expect(codes(r)).not.toContain('aggression');
  });

  it('minTankL 边界 1.5 倍精确判定（3 组）', () => {
    for (const minTankL of [40, 100, 200]) {
      const a = fish({ id: `a${minTankL}`, name: `凶鱼${minTankL}`, temperament: 'aggressive', minTankL });
      const need = minTankL * 1.5;
      expect(checkPair(a, peaceful, { tankLitres: need - 1, hasPlants: true }).find((x) => x.code === 'aggression')!.severity).toBe('conflict');
      expect(checkPair(a, peaceful, { tankLitres: need, hasPlants: true }).find((x) => x.code === 'aggression')!.severity).toBe('warning');
    }
  });

  // ---- 规则 2：体长差 > 3 倍（5 组）----
  it.each([
    [30, 3],
    [15, 4],
    [20, 5],
    [12, 3.5],
    [60, 2],
  ])('%icm 与 %icm → 检出被食风险', (big, small) => {
    const r = checkPair(fish({ id: 'b', name: '大鱼', adultCm: big }), fish({ id: 's', name: '小鱼', adultCm: small }), ctx);
    if (big > small * 3) {
      const gap = r.find((x) => x.code === 'size-gap')!;
      expect(gap).toBeTruthy();
      expect(gap.severity).toBe('conflict');
      expect(gap.message).toContain('吞食');
    } else {
      expect(codes(r)).not.toContain('size-gap');
    }
  });

  // ---- 规则 3：水温/GH/pH 无交集 → 硬冲突（8 组）----
  it('水温无交集', () => {
    const cold = fish({ id: 'c', name: '金鱼', tempRange: [10, 24] });
    const hot = fish({ id: 'h', name: '七彩', tempRange: [27, 30] });
    const r = checkPair(cold, hot, ctx);
    const t = r.find((x) => x.code === 'param-temp')!;
    expect(t.severity).toBe('conflict');
    expect(t.message).toContain('水温');
  });

  it('GH 无交集', () => {
    const soft = fish({ id: 's1', name: '水晶虾', ghRange: [4, 8] });
    const hard = fish({ id: 'h1', name: '马鲷', ghRange: [12, 30] });
    const r = checkPair(soft, hard, ctx);
    const g = r.find((x) => x.code === 'param-gh')!;
    expect(g.severity).toBe('conflict');
    expect(g.message).toContain('GH');
  });

  it('pH 无交集', () => {
    const acid = fish({ id: 'a1', name: '灯鱼', phRange: [5.0, 6.5] });
    const alk = fish({ id: 'k1', name: '马鲷', phRange: [7.7, 9.0] });
    const r = checkPair(acid, alk, ctx);
    const p = r.find((x) => x.code === 'param-ph')!;
    expect(p.severity).toBe('conflict');
    expect(p.message).toContain('pH');
  });

  it('三项均无交集 → 三条硬冲突', () => {
    const a = fish({ id: 'x', name: 'A', tempRange: [10, 20], ghRange: [1, 3], phRange: [5.0, 6.0] });
    const b = fish({ id: 'y', name: 'B', tempRange: [26, 30], ghRange: [15, 30], phRange: [8.0, 9.0] });
    const r = checkPair(a, b, ctx);
    expect(codes(r)).toEqual(expect.arrayContaining(['param-temp', 'param-gh', 'param-ph']));
    expect(r.filter((x) => x.code.startsWith('param-')).every((x) => x.severity === 'conflict')).toBe(true);
  });

  it('边界相接（26 与 26）视为有交集（4 组边界）', () => {
    for (const edge of [20, 24, 26, 28]) {
      const a = fish({ id: `e${edge}a`, name: 'A', tempRange: [edge, edge + 2] });
      const b = fish({ id: `e${edge}b`, name: 'B', tempRange: [edge - 2, edge] });
      expect(codes(checkPair(a, b, ctx))).not.toContain('param-temp');
    }
  });

  // ---- 规则 4：啃草鱼 × 草缸（3 组）----
  it('啃草鱼在草缸 → 警告', () => {
    for (const nipper of [
      fish({ id: 'n1', name: '虎皮', plantNip: true }),
      fish({ id: 'n2', name: '金鱼', plantNip: true, adultCm: 20 }),
    ]) {
      const r = checkPair(nipper, peaceful, { tankLitres: 200, hasPlants: true });
      const w = r.find((x) => x.code === 'plant-nip')!;
      expect(w).toBeTruthy();
      expect(w.severity).toBe('warning');
      expect(w.message).toContain('啃草');
    }
    // 无植物缸不提示
    const r2 = checkPair(fish({ id: 'n3', name: '虎皮2', plantNip: true }), peaceful, { tankLitres: 200, hasPlants: false });
    expect(codes(r2)).not.toContain('plant-nip');
  });

  // ---- 规则 5：群游鱼数量（4 组在 checkSchooling）----
  it('群游鱼 <6 尾 → 建议补足', () => {
    const school = fish({ id: 'sc', name: '红绿灯', schooling: true, minSchool: 6 });
    for (const count of [1, 3, 5]) {
      const r = checkSchooling([{ fish: school, count }]);
      const s = r.find((x) => x.code === 'schooling')!;
      expect(s.severity).toBe('info');
      expect(s.message).toContain('应激');
      expect(s.message).toContain(String(count));
    }
    expect(checkSchooling([{ fish: school, count: 6 }]).map((x) => x.code)).not.toContain('schooling');
  });

  it('singleMale 多尾 → 警告', () => {
    const betta = fish({ id: 'bt', name: '斗鱼', singleMale: true });
    const r = checkSchooling([
      { fish: betta, count: 2 },
    ]);
    expect(codes(r)).toContain('aggression');
  });

  it('逐对汇总 checkStocking 检出已知组合', () => {
    const entries = [
      { fish: aggressive, count: 1 },
      { fish: fish({ id: 'tiny', name: '迷你灯', adultCm: 1.5, temperament: 'peaceful' }), count: 10 },
    ];
    const issues = checkStocking(entries, ctx);
    expect(codes(issues)).toEqual(expect.arrayContaining(['size-gap', 'aggression']));
  });
});

describe('缸体最小容量与密度校验', () => {
  it('低于 minTankL → 硬冲突提示', () => {
    const big = fish({ id: 'big', name: '地图鱼', minTankL: 300 });
    const r = checkTankSize([{ fish: big, count: 1 }], 120);
    expect(r[0].code).toBe('tank-too-small');
    expect(r[0].severity).toBe('conflict');
    expect(r[0].message).toContain('300L');
  });

  it('密度超标 → 提示但不阻断（建议性质）', () => {
    const small = fish({ id: 's', name: '灯鱼', adultCm: 3 });
    // 60L 养 40 尾 3cm = 120cm → 2cm/L > 1cm/L 阈值
    const d = checkDensity([{ fish: small, count: 40 }], 60)!;
    expect(d.over).toBe(true);
    expect(d.cmPerL).toBeGreaterThan(d.threshold);
    expect(d.note).toContain('经验估算');
    expect(d.note).toContain('不阻断');
  });

  it('大鱼阈值放宽到 1cm/2L', () => {
    const big = fish({ id: 'b', name: '中鱼', adultCm: 10 });
    // 200L 养 20 尾 10cm = 200cm → 1cm/L，阈值 0.5 → 超标
    expect(checkDensity([{ fish: big, count: 20 }], 200)!.over).toBe(true);
    // 500L 养 25 尾 = 250cm → 0.5cm/L = 阈值边界 → 未超
    expect(checkDensity([{ fish: big, count: 25 }], 500)!.over).toBe(false);
  });

  it('无鱼或无水时不输出', () => {
    expect(checkDensity([], 100)).toBeNull();
    const f = fish({ id: 'f', name: 'F', adultCm: 3 });
    expect(checkDensity([{ fish: f, count: 5 }], 0)).toBeNull();
  });
});
