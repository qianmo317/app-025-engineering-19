#!/usr/bin/env node
/**
 * 机械检查（离线可跑，仅用 Node 内置模块）：
 * 1. 素材库数据校验 —— 逐条检查 src/data/ 下四个 JSON：
 *    必填字段、枚举取值、数值区间首项 ≤ 末项、编号同类不重复、
 *    温度/GH/pH 三组区间落在合理绝对范围内。
 * 2. 构建产物体积 —— 统计 dist/ 下 js/css 原始与 gzip 体积，
 *    超过上限报错，并打印体积最大的前若干个文件。
 * 任一检查失败则以非零码退出。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA_DIR = join(ROOT, 'src', 'data');
const DIST_DIR = join(ROOT, 'dist');

/** 产物体积上限（当前基线：js 约 187KB/62KB gzip，css 约 5KB/1.5KB gzip） */
const BUDGET = {
  jsRaw: 300 * 1024,
  jsGzip: 100 * 1024,
  cssRaw: 30 * 1024,
  cssGzip: 10 * 1024,
};
const TOP_N = 5;

/** 三组水质区间的合理绝对范围（用于判断"互相说得通"） */
const PLAUSIBLE = {
  temp: { min: 0, max: 45, label: '温度°C' },
  gh: { min: 0, max: 40, label: 'GH' },
  ph: { min: 0, max: 14, label: 'pH' },
};

const problems = [];
let failed = false;

function problem(file, id, message) {
  problems.push(`${file} [${id}]: ${message}`);
}

// ---------- 数据校验辅助 ----------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function checkString(file, id, row, field) {
  if (!isNonEmptyString(row[field])) problem(file, id, `字段 ${field} 缺失或不是非空字符串`);
}

function checkNumber(file, id, row, field, { min, max, integer = false } = {}) {
  const v = row[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    problem(file, id, `字段 ${field} 缺失或不是有限数值`);
    return;
  }
  if (integer && !Number.isInteger(v)) problem(file, id, `字段 ${field}=${v} 应为整数`);
  if (min !== undefined && v < min) problem(file, id, `字段 ${field}=${v} 小于下限 ${min}`);
  if (max !== undefined && v > max) problem(file, id, `字段 ${field}=${v} 大于上限 ${max}`);
}

function checkBoolean(file, id, row, field) {
  if (typeof row[field] !== 'boolean') problem(file, id, `字段 ${field} 缺失或不是布尔值`);
}

function checkEnum(file, id, row, field, allowed) {
  if (!allowed.includes(row[field])) {
    problem(file, id, `字段 ${field}=${JSON.stringify(row[field])} 不在允许值 ${allowed.join('/')} 内`);
  }
}

/** 区间：[number, number] 且首项 ≤ 末项；可选落在绝对合理范围内 */
function checkRange(file, id, row, field, plausible) {
  const v = row[field];
  if (!Array.isArray(v) || v.length !== 2 || v.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    problem(file, id, `字段 ${field} 缺失或不是 [下限, 上限] 形式的数值对`);
    return;
  }
  if (v[0] > v[1]) problem(file, id, `字段 ${field} 区间颠倒：[${v[0]}, ${v[1]}]，首项大于末项`);
  if (plausible) {
    if (v[0] < plausible.min || v[1] > plausible.max) {
      problem(file, id, `字段 ${field}=[${v[0]}, ${v[1]}] 超出${plausible.label}合理范围 ${plausible.min}~${plausible.max}`);
    }
  }
}

function loadJson(name) {
  const file = `src/data/${name}`;
  try {
    const data = JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8'));
    if (!Array.isArray(data)) {
      problem(file, '(整体)', '顶层结构应为数组');
      return { file, rows: [] };
    }
    return { file, rows: data };
  } catch (err) {
    problem(file, '(整体)', `JSON 解析失败：${err.message}`);
    return { file, rows: [] };
  }
}

function checkUniqueIds(file, rows, keyOf) {
  const seen = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (typeof key !== 'string' || key === '') continue; // 缺失由必填检查报告
    if (seen.has(key)) problem(file, key, `编号与第 ${seen.get(key) + 1} 条重复`);
    else seen.set(key, seen.size);
  }
}

// ---------- 四个素材库的逐条校验 ----------

function checkPlants() {
  const { file, rows } = loadJson('plants.json');
  rows.forEach((row, i) => {
    const id = isNonEmptyString(row?.id) ? row.id : `(第 ${i + 1} 条)`;
    checkString(file, id, row, 'id');
    checkString(file, id, row, 'name');
    checkEnum(file, id, row, 'layer', ['front', 'mid', 'back']);
    checkEnum(file, id, row, 'lightNeed', ['low', 'mid', 'high']);
    checkEnum(file, id, row, 'growth', ['slow', 'mid', 'fast']);
    checkBoolean(file, id, row, 'co2Need');
    checkRange(file, id, row, 'tempC', PLAUSIBLE.temp);
    checkNumber(file, id, row, 'pricePerPlant', { min: 0 });
    checkString(file, id, row, 'note');
  });
  checkUniqueIds(file, rows, (r) => r?.id);
  return rows.map((r) => r?.id).filter(Boolean);
}

function checkFishes() {
  const { file, rows } = loadJson('fishes.json');
  rows.forEach((row, i) => {
    const id = isNonEmptyString(row?.id) ? row.id : `(第 ${i + 1} 条)`;
    checkString(file, id, row, 'id');
    checkString(file, id, row, 'name');
    checkNumber(file, id, row, 'adultCm', { min: 0.1 });
    checkNumber(file, id, row, 'minTankL', { min: 1 });
    checkRange(file, id, row, 'tempRange', PLAUSIBLE.temp);
    checkRange(file, id, row, 'ghRange', PLAUSIBLE.gh);
    checkRange(file, id, row, 'phRange', PLAUSIBLE.ph);
    checkEnum(file, id, row, 'temperament', ['peaceful', 'semi', 'aggressive']);
    checkBoolean(file, id, row, 'plantNip');
    checkBoolean(file, id, row, 'schooling');
    if (row.minSchool !== undefined) checkNumber(file, id, row, 'minSchool', { min: 2, integer: true });
    if (row.schooling === true && row.minSchool === undefined) {
      problem(file, id, '群游鱼缺少 minSchool 字段（代码虽按 6 兜底，素材库应显式给出）');
    }
    if (row.singleMale !== undefined) checkBoolean(file, id, row, 'singleMale');
  });
  checkUniqueIds(file, rows, (r) => r?.id);
}

function checkHardscapes() {
  const { file, rows } = loadJson('hardscape.json');
  rows.forEach((row, i) => {
    const id = isNonEmptyString(row?.id) ? row.id : `(第 ${i + 1} 条)`;
    checkString(file, id, row, 'id');
    checkString(file, id, row, 'name');
    checkEnum(file, id, row, 'kind', ['hardscape']);
    checkNumber(file, id, row, 'defaultCm', { min: 0.1 });
    checkNumber(file, id, row, 'displacement', { min: 0, max: 1 });
    checkString(file, id, row, 'note');
    checkEnum(file, id, row, 'shape', ['rock', 'wood']);
  });
  checkUniqueIds(file, rows, (r) => r?.id);
  return rows.map((r) => r?.id).filter(Boolean);
}

function checkSubstrates() {
  const { file, rows } = loadJson('substrates.json');
  rows.forEach((row, i) => {
    const id = isNonEmptyString(row?.kind) ? row.kind : `(第 ${i + 1} 条)`;
    checkEnum(file, id, row, 'kind', ['sand', 'gravel', 'soil', 'ada']);
    checkString(file, id, row, 'label');
    checkNumber(file, id, row, 'densityKgPerL', { min: 0.01 });
  });
  checkUniqueIds(file, rows, (r) => r?.kind);
}

// ---------- 构建产物体积 ----------

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function fmt(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function checkBundle() {
  console.log('\n== 构建产物体积 ==');
  if (!existsSync(DIST_DIR)) {
    console.log('未找到 dist/，跳过产物体积检查（先运行 npm run build 后再执行本命令可启用）');
    return;
  }
  const files = walk(DIST_DIR)
    .filter((p) => /\.(js|css)$/.test(p))
    .map((p) => {
      const content = readFileSync(p);
      return {
        name: relative(DIST_DIR, p),
        kind: p.endsWith('.js') ? 'js' : 'css',
        raw: content.length,
        gzip: gzipSync(content, { level: 9 }).length,
      };
    });
  if (files.length === 0) {
    console.log('dist/ 下没有 js/css 产物，跳过');
    return;
  }

  const totals = { jsRaw: 0, jsGzip: 0, cssRaw: 0, cssGzip: 0 };
  for (const f of files) {
    totals[`${f.kind}Raw`] += f.raw;
    totals[`${f.kind}Gzip`] += f.gzip;
  }
  console.log(`js  合计: ${fmt(totals.jsRaw)} (gzip ${fmt(totals.jsGzip)}) / 上限 ${fmt(BUDGET.jsRaw)} (gzip ${fmt(BUDGET.jsGzip)})`);
  console.log(`css 合计: ${fmt(totals.cssRaw)} (gzip ${fmt(totals.cssGzip)}) / 上限 ${fmt(BUDGET.cssRaw)} (gzip ${fmt(BUDGET.cssGzip)})`);

  for (const key of Object.keys(BUDGET)) {
    if (totals[key] > BUDGET[key]) {
      failed = true;
      const label = key.replace('Raw', ' 原始体积').replace('Gzip', ' gzip 体积');
      console.error(`超限: ${label} ${fmt(totals[key])} > 上限 ${fmt(BUDGET[key])}`);
    }
  }

  console.log(`\n体积最大的前 ${TOP_N} 个文件：`);
  [...files]
    .sort((a, b) => b.raw - a.raw)
    .slice(0, TOP_N)
    .forEach((f, i) => console.log(`  ${i + 1}. ${f.name}  ${fmt(f.raw)} (gzip ${fmt(f.gzip)})`));
}

// ---------- 主流程 ----------

console.log('== 素材库数据校验 ==');
const plantIds = checkPlants();
checkFishes();
const hardscapeIds = checkHardscapes();
checkSubstrates();

// 水草与硬景观共用画布 Item 的 id 空间，跨库也不能撞号
const collision = plantIds.filter((id) => hardscapeIds.includes(id));
for (const id of collision) {
  problem('src/data/plants.json × src/data/hardscape.json', id, '水草与硬景观编号跨库重复（共用 Item id 空间）');
}

if (problems.length > 0) {
  failed = true;
  console.error(`发现 ${problems.length} 条数据问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
} else {
  console.log('四个素材库全部通过');
}

checkBundle();

if (failed) {
  console.error('\n检查未通过');
  process.exit(1);
}
console.log('\n全部检查通过');
