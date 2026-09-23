import type { Item, Substrate, Tank } from './types';

/**
 * 水量与底砂计算（需求文档 §8 —— 最易算错的模块）。
 * 全部输入单位：缸体 cm、厚度/坡度 mm。
 */

/** 实际水柱高度（cm）= 水面高度(自缸底) mm 换算 cm，并被缸高夹取 */
export function waterHeightCm(tank: Tank): number {
  return Math.max(0, Math.min(tank.h, tank.waterLevelMm / 10));
}

/** 毛水量(L) = l × w × 水柱高度 / 1000（即 (h − 水面留空) 的等价实现） */
export function grossVolumeL(tank: Tank): number {
  return (tank.l * tank.w * waterHeightCm(tank)) / 1000;
}

/** 底砂平均厚度（cm）= 基础厚度 + 坡度/2 */
export function substrateAvgThicknessCm(sub: Substrate): number {
  return Math.max(0, sub.thicknessMm / 10 + sub.slopeMm / 10 / 2);
}

/** 底砂体积(L) = l × w × 平均厚度(cm) / 1000 */
export function substrateVolumeL(tank: Tank, sub: Substrate): number {
  return (tank.l * tank.w * substrateAvgThicknessCm(sub)) / 1000;
}

/** 底砂重量(kg) = 体积(L) × 密度(kg/L) */
export function substrateWeightKg(tank: Tank, sub: Substrate): number {
  return substrateVolumeL(tank, sub) * sub.densityKgPerL;
}

/** 素材排水体积估算（L）：按硬景观实际尺寸的包围盒 × 排水系数（石 0.55 / 木 0.3，可配） */
export function hardscapeDisplacementL(items: Item[]): number {
  return items
    .filter((it) => it.kind === 'hardscape')
    .reduce((sum, it) => {
      const factor = it.displacement ?? (it.shape === 'wood' ? 0.3 : 0.55);
      // scaleCm 为最大维度；按常见比例（0.7 × 0.7）估包围盒，再乘排水系数
      const bboxL = (it.scaleCm * 0.7 * it.scaleCm * 0.7 * it.scaleCm) / 1000;
      return sum + bboxL * factor;
    }, 0);
}

/**
 * 有效水量(L) = 毛水量 − 底砂体积 − 素材排水体积。
 * 必须扣除底砂与素材，否则加药/施肥剂量会偏高。
 */
export function effectiveVolumeL(tank: Tank, sub: Substrate, items: Item[]): number {
  return Math.max(
    0,
    grossVolumeL(tank) - substrateVolumeL(tank, sub) - hardscapeDisplacementL(items),
  );
}

/** 缸体水面面积（m²），用于光照估算 */
export function waterSurfaceAreaM2(tank: Tank): number {
  return (tank.l * tank.w) / 10000;
}
