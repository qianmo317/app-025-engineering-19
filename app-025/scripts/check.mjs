#!/usr/bin/env node
/**
 * 机械检查脚本（零依赖，断网可跑）：
 *   1. 素材库数据校验 —— 逐条检查 src/data 下四个 JSON：
 *      必填字段、枚举取值、数值区间首项 ≤ 末项、同类编号不重复、
 *      温度 / GH / pH 三组区间落在合理绝对范围内且跨度合理（互相说得通）。
 *   2. 构建产物体积 —— 统计 dist 下 js/css 的原始与 gzip 体积，
 *      超过上限即报错，并打印体积最大的前若干个文件。
 *
 * 任一检查失败时以非零码退出。dist 不存在时体积检查跳过（可用 --require-dist 强制）。
 * 体积上限可用环境变量覆盖，见 SIZE_LIMITS 注释。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'src', 'data');
const DIST_DIR = join(ROOT, 'dist');
const REQUIRE_DIST = process.argv.includes('--require-dist');

const problems = []; // { file, id, msg }
const fail = (file, id, msg) => problems.push({ file, id, msg });

// ---------- 通用校验小工具 ----------
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isBool = (v) => typeof v === 'boolean';

function checkEnum(file, id, field, value, allowed) {
  if (!allowed.includes(value)) {
    fail(file, id, `字段 ${field} 取值 ${JSON.stringify(value)} 不在枚举 ${allowed.join('/')} 内`);
  }
}

// 区间：必须是 [数, 数]、首项 ≤ 末项、落在绝对合理范围、跨度不超上限
function checkRange(file, id, field, value, { absMin, absMax, maxSpan }) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(isNum)) {
    fail(file, id, `字段 ${field} 须为 [min, max] 数值对，实际为 ${JSON.stringify(value)}`);
    return;
  }
  const [lo, hi] = value;
  if (lo > hi) {
    fail(file, id, `字段 ${field} 区间颠倒：[${lo}, ${hi}]，首项不得大于末项`);
  }
  if (lo < absMin || hi > absMax) {
    fail(file, id, `字段 ${field} 区间 [${lo}, ${hi}] 超出合理范围 ${absMin}~${absMax}`);
  }
  if (hi - lo > maxSpan) {
    fail(file, id, `字段 ${field} 区间 [${lo}, ${hi}] 跨度 ${hi - lo} 超过合理上限 ${maxSpan}`);
  }
}

function checkUniqueIds(file, rows, keyOf) {
  const seen = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (seen.has(key)) {
      fail(file, key, `编号 ${JSON.stringify(key)} 与第 ${seen.get(key) + 1} 条重复`);
    } else {
      seen.set(key, seen.size);
    }
  }
}

function loadJson(name) {
  const file = `src/data/${name}`;
  try {
    const data = JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8'));
    if (!Array.isArray(data)) {
      fail(file, '-', '顶层结构必须是数组');
      return [];
    }
    return data;
  } catch (e) {
    fail(file, '-', `JSON 解析失败：${e.message}`);
    return [];
  }
}

// 温度 / GH / pH 的绝对合理范围与跨度上限（机械判据，防止写错量级或区间颠倒）
const TEMP_RULE = { absMin: 0, absMax: 40, maxSpan: 20 }; // ℃
const GH_RULE = { absMin: 0, absMax: 40, maxSpan: 35 }; // dGH
const PH_RULE = { absMin: 0, absMax: 14, maxSpan: 4 }; // pH

// ---------- 各素材库校验器 ----------
function checkPlants() {
  const file = 'src/data/plants.json';
  const rows = loadJson('plants.json');
  rows.forEach((p, i) => {
    const id = isStr(p?.id) ? p.id : `#${i}`;
    if (!isStr(p?.id)) fail(file, id, '缺少必填字段 id（非空字符串）');
    if (!isStr(p?.name)) fail(file, id, '缺少必填字段 name');
    checkEnum(file, id, 'layer', p?.layer, ['front', 'mid', 'back']);
    checkEnum(file, id, 'lightNeed', p?.lightNeed, ['low', 'mid', 'high']);
    checkEnum(file, id, 'growth', p?.growth, ['slow', 'mid', 'fast']);
    if (!isBool(p?.co2Need)) fail(file, id, '字段 co2Need 须为布尔值');
    checkRange(file, id, 'tempC', p?.tempC, TEMP_RULE);
    if (!isNum(p?.pricePerPlant) || p.pricePerPlant < 0) {
      fail(file, id, '字段 pricePerPlant 须为不小于 0 的数');
    }
    if (typeof p?.note !== 'string') fail(file, id, '字段 note 须为字符串');
  });
  checkUniqueIds(file, rows, (p) => p?.id);
  return rows.length;
}

function checkFishes() {
  const file = 'src/data/fishes.json';
  const rows = loadJson('fishes.json');
  rows.forEach((f, i) => {
    const id = isStr(f?.id) ? f.id : `#${i}`;
    if (!isStr(f?.id)) fail(file, id, '缺少必填字段 id（非空字符串）');
    if (!isStr(f?.name)) fail(file, id, '缺少必填字段 name');
    if (!isNum(f?.adultCm) || f.adultCm <= 0) fail(file, id, '字段 adultCm 须为正数');
    if (!isNum(f?.minTankL) || f.minTankL <= 0) fail(file, id, '字段 minTankL 须为正数');
    // 温度 / GH / pH 三组区间：各自首项 ≤ 末项，且落在合理范围、跨度合理
    checkRange(file, id, 'tempRange', f?.tempRange, TEMP_RULE);
    checkRange(file, id, 'ghRange', f?.ghRange, GH_RULE);
    checkRange(file, id, 'phRange', f?.phRange, PH_RULE);
    checkEnum(file, id, 'temperament', f?.temperament, ['peaceful', 'semi', 'aggressive']);
    if (!isBool(f?.plantNip)) fail(file, id, '字段 plantNip 须为布尔值');
    if (!isBool(f?.schooling)) fail(file, id, '字段 schooling 须为布尔值');
    if (f?.schooling === true) {
      if (!Number.isInteger(f?.minSchool) || f.minSchool < 2) {
        fail(file, id, '群游鱼（schooling=true）须配 minSchool 且为 ≥2 的整数');
      }
    }
    if (f?.minSchool != null && (!Number.isInteger(f.minSchool) || f.minSchool < 2)) {
      fail(file, id, '字段 minSchool 须为 ≥2 的整数');
    }
    if (f?.singleMale !== undefined && !isBool(f.singleMale)) {
      fail(file, id, '字段 singleMale 须为布尔值');
    }
  });
  checkUniqueIds(file, rows, (f) => f?.id);
  return rows.length;
}

function checkHardscapes() {
  const file = 'src/data/hardscape.json';
  const rows = loadJson('hardscape.json');
  rows.forEach((h, i) => {
    const id = isStr(h?.id) ? h.id : `#${i}`;
    if (!isStr(h?.id)) fail(file, id, '缺少必填字段 id（非空字符串）');
    if (!isStr(h?.name)) fail(file, id, '缺少必填字段 name');
    checkEnum(file, id, 'kind', h?.kind, ['hardscape']);
    if (!isNum(h?.defaultCm) || h.defaultCm <= 0) fail(file, id, '字段 defaultCm 须为正数');
    if (!isNum(h?.displacement) || h.displacement < 0 || h.displacement > 1) {
      fail(file, id, '字段 displacement 须为 0~1 的数');
    }
    if (typeof h?.note !== 'string') fail(file, id, '字段 note 须为字符串');
    checkEnum(file, id, 'shape', h?.shape, ['rock', 'wood']);
  });
  checkUniqueIds(file, rows, (h) => h?.id);
  return rows.length;
}

function checkSubstrates() {
  const file = 'src/data/substrates.json';
  const rows = loadJson('substrates.json');
  rows.forEach((s, i) => {
    const id = isStr(s?.kind) ? s.kind : `#${i}`;
    checkEnum(file, id, 'kind', s?.kind, ['sand', 'gravel', 'soil', 'ada']);
    if (!isStr(s?.label)) fail(file, id, '缺少必填字段 label');
    if (!isNum(s?.densityKgPerL) || s.densityKgPerL <= 0 || s.densityKgPerL > 3) {
      fail(file, id, '字段 densityKgPerL 须为 0~3 kg/L 之间的正数');
    }
  });
  checkUniqueIds(file, rows, (s) => s?.kind);
  return rows.length;
}

// ---------- 构建产物体积检查 ----------
// 上限（KiB），可用环境变量覆盖，如 CHECK_JS_FILE_GZIP_KB=100
const SIZE_LIMITS = {
  jsFileGzipKb: numEnv('CHECK_JS_FILE_GZIP_KB', 150),
  jsTotalGzipKb: numEnv('CHECK_JS_TOTAL_GZIP_KB', 200),
  cssFileGzipKb: numEnv('CHECK_CSS_FILE_GZIP_KB', 30),
  cssTotalGzipKb: numEnv('CHECK_CSS_TOTAL_GZIP_KB', 50),
  jsTotalRawKb: numEnv('CHECK_JS_TOTAL_RAW_KB', 600),
  cssTotalRawKb: numEnv('CHECK_CSS_TOTAL_RAW_KB', 120),
};
const TOP_N = Number.parseInt(process.env.CHECK_TOP_N ?? '5', 10);

function numEnv(name, dflt) {
  const v = Number.parseFloat(process.env[name] ?? '');
  return Number.isFinite(v) ? v : dflt;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const fmtKb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function checkBundleSize() {
  if (!existsSync(DIST_DIR)) {
    const msg = 'dist 目录不存在，跳过体积检查（先执行 npm run build，或用 --require-dist 强制要求）';
    if (REQUIRE_DIST) {
      problems.push({ file: 'dist', id: '-', msg });
      console.log(`✗ ${msg}`);
    } else {
      console.log(`- ${msg}`);
    }
    return;
  }

  const files = walk(DIST_DIR)
    .filter((p) => /\.(js|css)$/.test(p))
    .map((p) => {
      const buf = readFileSync(p);
      return {
        name: relative(ROOT, p),
        kind: p.endsWith('.js') ? 'js' : 'css',
        raw: buf.length,
        gzip: gzipSync(buf, { level: 9 }).length,
      };
    });

  if (files.length === 0) {
    console.log('- dist 下没有 js/css 产物，跳过体积检查');
    return;
  }

  const totals = { js: { raw: 0, gzip: 0 }, css: { raw: 0, gzip: 0 } };
  for (const f of files) {
    totals[f.kind].raw += f.raw;
    totals[f.kind].gzip += f.gzip;
  }

  console.log('\n构建产物体积（原始 / gzip）：');
  for (const f of [...files].sort((a, b) => b.gzip - a.gzip)) {
    console.log(`  ${f.name}  ${fmtKb(f.raw)} / ${fmtKb(f.gzip)}`);
  }
  console.log(
    `  合计 js ${fmtKb(totals.js.raw)} / ${fmtKb(totals.js.gzip)}，` +
      `css ${fmtKb(totals.css.raw)} / ${fmtKb(totals.css.gzip)}`,
  );

  console.log(`\n体积最大的前 ${Math.min(TOP_N, files.length)} 个（按 gzip）：`);
  [...files]
    .sort((a, b) => b.gzip - a.gzip)
    .slice(0, TOP_N)
    .forEach((f, i) => console.log(`  ${i + 1}. ${f.name}  gzip ${fmtKb(f.gzip)}（原始 ${fmtKb(f.raw)}）`));

  const over = (file, what, actual, limit) =>
    problems.push({
      file,
      id: '-',
      msg: `${what} ${fmtKb(actual)} 超过上限 ${limit} KiB`,
    });

  for (const f of files) {
    const fileLimit = f.kind === 'js' ? SIZE_LIMITS.jsFileGzipKb : SIZE_LIMITS.cssFileGzipKb;
    if (f.gzip > fileLimit * 1024) over(f.name, '单文件 gzip', f.gzip, fileLimit);
  }
  if (totals.js.gzip > SIZE_LIMITS.jsTotalGzipKb * 1024) {
    over('dist(js 合计)', 'js gzip 总量', totals.js.gzip, SIZE_LIMITS.jsTotalGzipKb);
  }
  if (totals.css.gzip > SIZE_LIMITS.cssTotalGzipKb * 1024) {
    over('dist(css 合计)', 'css gzip 总量', totals.css.gzip, SIZE_LIMITS.cssTotalGzipKb);
  }
  if (totals.js.raw > SIZE_LIMITS.jsTotalRawKb * 1024) {
    over('dist(js 合计)', 'js 原始总量', totals.js.raw, SIZE_LIMITS.jsTotalRawKb);
  }
  if (totals.css.raw > SIZE_LIMITS.cssTotalRawKb * 1024) {
    over('dist(css 合计)', 'css 原始总量', totals.css.raw, SIZE_LIMITS.cssTotalRawKb);
  }
}

// ---------- 主流程 ----------
console.log('== 素材库数据校验 ==');
const counts = {
  'plants.json': checkPlants(),
  'fishes.json': checkFishes(),
  'hardscape.json': checkHardscapes(),
  'substrates.json': checkSubstrates(),
};
for (const [name, n] of Object.entries(counts)) console.log(`  ${name}: ${n} 条`);

console.log('\n== 构建产物体积 ==');
checkBundleSize();

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p.file} › ${p.id} › ${p.msg}`);
  process.exit(1);
}
console.log('\n全部检查通过。');
