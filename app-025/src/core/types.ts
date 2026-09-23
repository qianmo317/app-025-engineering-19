// 数据模型（与需求文档 §7 对齐）
export type Tank = {
  id: string;
  name: string;
  l: number; // 长 cm
  w: number; // 宽 cm
  h: number; // 高 cm
  glassMm: number; // 玻璃厚度 mm
  waterLevelMm: number; // 水面高度（自缸底起算，mm）
  openTop: boolean; // 是否开放缸
};

export type Substrate = {
  kind: 'sand' | 'gravel' | 'soil' | 'ada';
  densityKgPerL: number; // 密度 kg/L（可配）
  thicknessMm: number; // 基础厚度 mm
  slopeMm: number; // 坡度（前后落差 mm）
};

export type Item = {
  id: string;
  kind: 'hardscape' | 'plant';
  name: string;
  x: number; // 平面坐标 cm（左上原点）
  y: number; // cm
  scaleCm: number; // 实际尺寸 cm（最大维度）
  rotDeg: number;
  layer?: 'front' | 'mid' | 'back'; // 水草层次
  lightNeed?: 'low' | 'mid' | 'high';
  growth?: 'slow' | 'mid' | 'fast';
  qty?: number; // 水草株数
  displacement?: number; // 硬景观排水系数（0~1，可配）
  shape?: 'rock' | 'wood';
};

export type Fish = {
  id: string;
  name: string;
  adultCm: number;
  minTankL: number;
  tempRange: [number, number];
  ghRange: [number, number];
  phRange: [number, number];
  temperament: 'peaceful' | 'semi' | 'aggressive';
  plantNip: boolean;
  schooling: boolean;
  minSchool?: number;
  singleMale?: boolean;
};

export type WaterConfig = {
  tapGh: number;
  tapKh: number;
  targetGh: number;
  targetCo2Ppm: number;
  roomTempC: number;
  targetTempC: number;
};

export type Plan = {
  id: string;
  name: string;
  tank: Tank;
  substrate: Substrate;
  items: Item[];
  fishes: { fishId: string; count: number }[];
  water: WaterConfig;
  updatedAt: number;
};

export const EMPTY_WATER: WaterConfig = {
  tapGh: 12,
  tapKh: 6,
  targetGh: 8,
  targetCo2Ppm: 25,
  roomTempC: 24,
  targetTempC: 26,
};
