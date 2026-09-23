import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Node 26 + jsdom 下 localStorage 不可用 → 内存 polyfill（保持既有命名与方法）
const mem = new Map<string, string>();
const shim: Storage = {
  get length() {
    return mem.size;
  },
  clear: () => mem.clear(),
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  key: (i: number) => Array.from(mem.keys())[i] ?? null,
  removeItem: (k: string) => mem.delete(k),
  setItem: (k: string, v: string) => mem.set(k, String(v)),
};
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true });
}
if (typeof window !== 'undefined' && typeof window.localStorage === 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: shim, configurable: true });
}

afterEach(() => {
  cleanup();
  try {
    window.localStorage?.clear();
  } catch {
    // 忽略
  }
});
