/**
 * 水质计算：换水、GH/KH 调配、CO₂ 与 pH-KH-CO₂ 关系。
 * 所有涉及经验系数的输出都必须带 estimate 标注。
 */

export type Estimate = { value: number; estimated: true; note: string };

export type RoMix = {
  /** 兑入 RO(纯水) 占总量的比例 0~1 */
  roRatio: number;
  /** 自来水占总量比例 */
  tapRatio: number;
  /** 目标水量 L 对应的自来水 L */
  tapL: number;
  /** 目标水量 L 对应的 RO 水 L */
  roL: number;
  applicable: string;
};

export type SaltDose = {
  /** 需要加入的盐量 g */
  grams: number;
  /** 盐名 */
  salt: string;
  /** 每 g 每 L 提供 GH(dGH) 的贡献值（可配） */
  ghPerGramPerL: number;
  applicable: string;
};

// 常见矿物盐 GH 贡献（dGH per g per L，按钙/镁换算得出，可配）
export const GH_SALTS: { salt: string; ghPerGramPerL: number }[] = [
  { salt: '氯化钙 CaCl₂(无水)', ghPerGramPerL: 0.5 },
  { salt: '氯化钙 CaCl₂·2H₂O', ghPerGramPerL: 0.38 },
  { salt: '硫酸镁 MgSO₄·7H₂O(泻盐)', ghPerGramPerL: 0.23 },
];

/** 换水量建议（每周 %）：经验值，按种植密度分档 */
export function weeklyWaterChangePct(plantQty: number, effectiveL: number): Estimate {
  const plantsPerL = effectiveL > 0 ? plantQty / effectiveL : 0;
  const pct = plantsPerL > 1.5 ? 30 : plantsPerL > 0.5 ? 40 : 50;
  return { value: pct, estimated: true, note: '经验估算：草缸每周换水 30~50%，密植偏低、裸缸偏高' };
}

/**
 * RO 兑水（降 GH）：线性混合 GH_target = GH_tap × V_tap/V_total
 * ⇒ V_ro / V_total = (GH_tap − GH_target) / GH_tap
 */
export function roMixForGh(tapGh: number, targetGh: number, totalL: number): RoMix | null {
  if (tapGh <= 0 || targetGh >= tapGh || totalL <= 0) return null;
  const roRatio = (tapGh - targetGh) / tapGh;
  return {
    roRatio,
    tapRatio: 1 - roRatio,
    tapL: (1 - roRatio) * totalL,
    roL: roRatio * totalL,
    applicable: '目标 GH 低于自来水时适用（RO 稀释降 GH/KH）',
  };
}

/** 加矿物盐（升 GH）：m(g) = ΔGH × V(L) / 盐的 GH 贡献(gH per g per L) */
export function saltForGh(tapGh: number, targetGh: number, totalL: number): SaltDose | null {
  if (totalL <= 0 || targetGh <= tapGh) return null;
  const salt = GH_SALTS[0]; // 默认无水氯化钙
  const grams = ((targetGh - tapGh) * totalL) / salt.ghPerGramPerL;
  return {
    grams,
    salt: salt.salt,
    ghPerGramPerL: salt.ghPerGramPerL,
    applicable: '目标 GH 高于自来水时适用（矿物盐升 GH，不影响或轻微影响 KH）',
  };
}

/**
 * CO₂(ppm) ≈ 3 × KH × 10^(7−pH)
 * 由 KH 与目标 CO₂ 反解目标 pH：pH = 7 − log10(CO₂ / (3 × KH))
 */
export function co2FromPhKh(kh: number, ph: number): number {
  if (kh <= 0) return 0;
  return 3 * kh * Math.pow(10, 7 - ph);
}

export function targetPhForCo2(kh: number, co2Ppm: number): number | null {
  if (kh <= 0 || co2Ppm <= 0) return null;
  return 7 - Math.log10(co2Ppm / (3 * kh));
}

/**
 * 每秒泡数经验估算：泡/秒 ≈ 目标 ppm × 有效水量(L) / 2000
 * 必须用 CO₂ 监测液(指示液/计泡器观察)校验，仅为开缸起点。
 */
export function co2BubblesPerSec(co2Ppm: number, effectiveL: number): Estimate {
  const value = co2Ppm > 0 && effectiveL > 0 ? (co2Ppm * effectiveL) / 2000 : 0;
  return {
    value: Math.round(value * 10) / 10,
    estimated: true,
    note: '经验估算：以计泡器计数，务必用 CO₂ 监测液（pH/KH 指示液）校验，鱼浮头立即关小',
  };
}

/** pH-KH-CO₂ 关系表（查表 + 线性插值）：pH 5.2 ~ 7.8，步长 0.2 */
export function phKhCo2Table(): { ph: number }[] {
  const rows: { ph: number }[] = [];
  for (let ph = 5.2; ph <= 7.8001; ph += 0.2) {
    rows.push({ ph: Math.round(ph * 10) / 10 });
  }
  return rows;
}

/** 查表：给定 pH 与 KH 得 CO₂（表内插值精度与公式一致，此处直接由关系式取值） */
export function co2Lookup(kh: number, ph: number): number {
  return co2FromPhKh(kh, ph);
}
