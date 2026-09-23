import plantsJson from './plants.json';
import fishesJson from './fishes.json';
import hardscapeJson from './hardscape.json';
import substratesJson from './substrates.json';
import type { Fish, Item } from '../core/types';

export type PlantRow = {
  id: string;
  name: string;
  layer: Item['layer'] & ('front' | 'mid' | 'back');
  lightNeed: Item['lightNeed'] & ('low' | 'mid' | 'high');
  growth: Item['growth'] & ('slow' | 'mid' | 'fast');
  co2Need: boolean;
  tempC: [number, number];
  pricePerPlant: number;
  note: string;
};

export type HardscapeRow = {
  id: string;
  name: string;
  kind: 'hardscape';
  defaultCm: number;
  displacement: number;
  note: string;
  shape: 'rock' | 'wood';
};

export type SubstrateRow = {
  kind: 'sand' | 'gravel' | 'soil' | 'ada';
  label: string;
  densityKgPerL: number;
};

export const PLANTS = plantsJson as PlantRow[];
export const FISHES = fishesJson as Fish[];
export const HARDSCAPES = hardscapeJson as HardscapeRow[];
export const SUBSTRATES = substratesJson as SubstrateRow[];

export function plantById(id: string): PlantRow | undefined {
  return PLANTS.find((p) => p.id === id);
}
export function fishById(id: string): Fish | undefined {
  return FISHES.find((f) => f.id === id);
}
