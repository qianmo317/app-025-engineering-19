import type { Fish } from './types';

/**
 * 混养兼容性检查（逐对，输出原因）——需求文档 §8 规则：
 * 1. 攻击性 × 温和 → 冲突（除非缸体 ≥ 攻击性鱼种 minTankL × 1.5 且有隔离区）
 * 2. 成体体长差 > 3 倍 → 小鱼被吃风险
 * 3. 水温/GH/pH 区间无交集 → 硬冲突
 * 4. 啃草鱼 × 草缸 → 警告
 * 5. 群游鱼数量 < 6 尾 → 建议补足
 */

export type Severity = 'conflict' | 'warning' | 'info';

export type StockingIssue = {
  severity: Severity;
  code:
    | 'aggression'
    | 'size-gap'
    | 'param-temp'
    | 'param-gh'
    | 'param-ph'
    | 'plant-nip'
    | 'schooling'
    | 'tank-too-small'
    | 'density';
  message: string;
  /** 涉及的鱼种 id；密度问题为 [] */
  pair?: [string, string];
};

export type PairCheckContext = {
  tankLitres: number;
  hasPlants: boolean;
};

/** 两个区间的交集判断 */
export function rangesOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

/** 逐对兼容性检查 */
export function checkPair(a: Fish, b: Fish, ctx: PairCheckContext): StockingIssue[] {
  const issues: StockingIssue[] = [];
  if (a.id === b.id) return issues;
  const pair: [string, string] = [a.id, b.id];
  const big = a.adultCm >= b.adultCm ? a : b;
  const small = a.adultCm >= b.adultCm ? b : a;

  // 规则 3：水质区间无交集 → 硬冲突（水温 / GH / pH）
  if (!rangesOverlap(a.tempRange, b.tempRange)) {
    issues.push({
      severity: 'conflict',
      code: 'param-temp',
      pair,
      message: `「${a.name}」(${a.tempRange.join('~')}°C) 与「${b.name}」(${b.tempRange.join('~')}°C) 水温区间无交集，硬冲突`,
    });
  }
  if (!rangesOverlap(a.ghRange, b.ghRange)) {
    issues.push({
      severity: 'conflict',
      code: 'param-gh',
      pair,
      message: `「${a.name}」GH(${a.ghRange.join('~')}) 与「${b.name}」GH(${b.ghRange.join('~')}) 区间无交集，硬冲突`,
    });
  }
  if (!rangesOverlap(a.phRange, b.phRange)) {
    issues.push({
      severity: 'conflict',
      code: 'param-ph',
      pair,
      message: `「${a.name}」pH(${a.phRange.join('~')}) 与「${b.name}」pH(${b.phRange.join('~')}) 区间无交集，硬冲突`,
    });
  }

  // 规则 1：攻击性 × 温和（semi 视为过渡，仅在缸偏小时提示）
  const aggressive = [a, b].find((f) => f.temperament === 'aggressive');
  const other = aggressive ? (aggressive === a ? b : a) : null;
  if (aggressive && other && other.temperament === 'peaceful') {
    if (ctx.tankLitres >= aggressive.minTankL * 1.5) {
      issues.push({
        severity: 'warning',
        code: 'aggression',
        pair,
        message: `「${aggressive.name}」攻击性强，与「${other.name}」混养需缸体 ≥ ${Math.round(aggressive.minTankL * 1.5)}L（当前满足），且必须布置隔离区/躲避物`,
      });
    } else {
      issues.push({
        severity: 'conflict',
        code: 'aggression',
        pair,
        message: `「${aggressive.name}」攻击性强 × 「${other.name}」温和 → 混养冲突：缸体需 ≥ ${Math.round(aggressive.minTankL * 1.5)}L（当前约 ${Math.round(ctx.tankLitres)}L，不满足）`,
      });
    }
  } else if (aggressive && other && other.temperament === 'semi') {
    issues.push({
      severity: 'warning',
      code: 'aggression',
      pair,
      message: `「${aggressive.name}」×「${other.name}」均为强势鱼，建议留意追咬`,
    });
  }

  // 规则 2：成体体长差 > 3 倍 → 小鱼被吃风险
  if (big.adultCm > small.adultCm * 3) {
    issues.push({
      severity: 'conflict',
      code: 'size-gap',
      pair,
      message: `「${big.name}」成体 ${big.adultCm}cm 超过「${small.name}」(${small.adultCm}cm) 的 3 倍，存在被吞食风险`,
    });
  }

  // 规则 4：啃草鱼 × 草缸
  if (ctx.hasPlants && (a.plantNip || b.plantNip)) {
    const nipper = a.plantNip ? a : b;
    issues.push({
      severity: 'warning',
      code: 'plant-nip',
      pair,
      message: `「${nipper.name}」有啃草/拔草习性，与草缸混养会破坏水草`,
    });
  }

  return issues;
}

/** 群游鱼数量检查（规则 5）与单养斗鱼提示 */
export function checkSchooling(entries: { fish: Fish; count: number }[]): StockingIssue[] {
  const issues: StockingIssue[] = [];
  for (const { fish, count } of entries) {
    if (fish.schooling) {
      const min = fish.minSchool ?? 6;
      if (count < min) {
        issues.push({
          severity: 'info',
          code: 'schooling',
          message: `「${fish.name}」为群游鱼，当前 ${count} 尾 < ${min} 尾，单养会应激，建议补足到 ${min} 尾以上`,
        });
      }
    }
    if (fish.singleMale && count > 1) {
      issues.push({
        severity: 'warning',
        code: 'aggression',
        message: `「${fish.name}」雄性间会激烈互斗，建议只养 1 尾（当前 ${count} 尾）`,
      });
    }
    if (fish.minTankL && count > 0 && fish.adultCm * count > 0) {
      // 缸体最小容量检查在 density 里给出，不在此重复
    }
  }
  return issues;
}

/** 缸体最小容量检查 */
export function checkTankSize(entries: { fish: Fish; count: number }[], tankLitres: number): StockingIssue[] {
  return entries
    .filter(({ fish }) => tankLitres > 0 && tankLitres < fish.minTankL)
    .map(({ fish }) => ({
      severity: 'conflict' as Severity,
      code: 'tank-too-small' as const,
      message: `「${fish.name}」最小缸体要求 ${fish.minTankL}L，当前有效水量约 ${Math.round(tankLitres)}L，不建议饲养`,
    }));
}

export type DensityCheck = {
  totalCm: number;
  cmPerL: number;
  threshold: number;
  over: boolean;
  note: string;
};

/**
 * 密度校验（经验估算，不阻断）：
 * 小型鱼(平均成体 <5cm) 1cm/1L；大型鱼 1cm/2L，中间线性过渡；
 * 过滤强可上浮，结果仅作建议。
 */
export function checkDensity(entries: { fish: Fish; count: number }[], effectiveL: number): DensityCheck | null {
  const fishCount = entries.reduce((s, e) => s + e.count, 0);
  if (fishCount === 0 || effectiveL <= 0) return null;
  const totalCm = entries.reduce((s, e) => s + e.fish.adultCm * e.count, 0);
  const totalN = fishCount;
  const avgCm = totalCm / totalN;
  // 1cm/1L (avg 3cm) → 1cm/2L (avg 10cm) 线性过渡
  const lPerCm = 1 + Math.min(1, Math.max(0, (avgCm - 3) / 7));
  const threshold = 1 / lPerCm; // 允许的最大 cm/L
  const cmPerL = totalCm / effectiveL;
  const over = cmPerL > threshold;
  return {
    totalCm,
    cmPerL: Math.round(cmPerL * 100) / 100,
    threshold: Math.round(threshold * 100) / 100,
    over,
    note: '经验估算：按 1cm 鱼/1~2L 水计，过滤能力强可适当上浮；超标只作建议，不阻断',
  };
}

/** 汇总入口：全部混养 + 密度检查 */
export function checkStocking(
  entries: { fish: Fish; count: number }[],
  ctx: PairCheckContext,
): StockingIssue[] {
  const issues: StockingIssue[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      issues.push(...checkPair(entries[i].fish, entries[j].fish, ctx));
    }
  }
  issues.push(...checkSchooling(entries));
  issues.push(...checkTankSize(entries, ctx.tankLitres));
  return issues;
}
