# 开发指南 · DEVELOPMENT

## 1. 环境要求

- Node.js ≥ 20（实测 Node 26 + npm 11）
- 首次跑 E2E 需 `npx playwright install chromium`
- 可选：Docker（本地验证容器部署）

## 2. 常用命令

```bash
cd app-025

npm install          # 安装依赖
npm run dev          # 开发服务器 http://localhost:5173（LAN 可访问）
npm run build        # 类型检查(tsc -b) + 生产构建 → dist/
npm run preview      # 预览构建产物 http://localhost:4173

npm test             # 单元 + 组件测试（Vitest，139 用例）
npm run test:watch   # 监听模式
npm run e2e          # E2E（自动起 vite preview）
npm run e2e:headed   # 有头模式（观察浏览器操作）
```

## 3. 代码约定

1. **计算只进 `core/`**：页面组件禁止出现业务公式。需要新计算 → 在 `core/` 建纯函数 → 单测 → 页面调用。
2. **状态只经 `state/plans.ts`**：组件不持有跨页面共享的方案数据；修改方案一律调用 store 公开 API（`upsertPlan`/`updatePlan`/`updateWater`…），不做局部 state 镜像。
3. **TypeScript 严格模式**：`strict: true`；`Plan` 等核心类型定义在 `core/types.ts`，UI 层不得另造平行类型。
4. **经验值必须带标注**：非精确公式的返回值用 `Estimate`（`{ value, estimated: true, note }`），note 要说清校验方式（如 CO₂ 用监测液校验）。
5. **可配参数集中**：阈值/系数（光照流明阈值、GH 盐贡献、排水系数等）以常量或数据表存放，不散落在函数体内。

## 4. 如何修改素材数据库

数据文件位于 `src/data/`，经 `src/data/db.ts` 做类型化出口，改 JSON 即生效（开发服务器热更新）。

### 新增水草（plants.json）

```json
{ "id": "p-xxx", "name": "名称", "layer": "front|mid|back", "lightNeed": "low|mid|high",
  "growth": "slow|mid|fast", "co2Need": true, "tempC": [20, 28], "pricePerPlant": 10, "note": "备注" }
```

### 新增鱼种（fishes.json）

```json
{ "id": "f-xxx", "name": "名称", "adultCm": 5, "minTankL": 40,
  "tempRange": [22, 26], "ghRange": [2, 15], "phRange": [6.0, 7.5],
  "temperament": "peaceful|semi|aggressive", "plantNip": false,
  "schooling": true, "minSchool": 6, "singleMale": false }
```

注意：`tempRange/ghRange/phRange` 决定兼容性硬冲突判定（无交集即冲突），录入前请核对可靠来源；`minTankL` 是攻击性降级判定（缸体 ≥ minTankL×1.5）与"缸体过小"提示的依据。

### 新增硬景观（hardscape.json）

`defaultCm` 为加入画布时的默认实际尺寸；`displacement` 为排水系数（石 0.35~0.55、木 0.25~0.3），直接影响有效水量；`shape` 只影响默认排水系数兜底。

### 新增底砂（substrates.json）

`densityKgPerL` 直接决定底砂重量计算；`kind` 是 Editor 下拉的 value。

## 5. 如何新增一个计算模块

以"新增施肥剂量计算"为例：

1. `src/core/` 新建 `fertilizer.ts`，导出纯函数；涉及经验值时返回 `Estimate`。
2. `src/core/types.ts` 补充必要类型（如 `FertConfig`），并按需扩展 `Plan.water` 或新增 `Plan.fert`。
3. `tests/` 新建 `fertilizer.test.ts`：先写边界用例（0 值、负值防护、方向互斥），再写随机组与手工核算对照（参考 `tests/volume.test.ts` 的 mulberry32 模式）。
4. 页面（如 `pages/Water.tsx`）加卡片调用展示；若需持久化，扩展 `state/plans.ts` 的对应 updater。
5. 跑 `npm test` 全绿后提交。

## 6. 如何新增页面

1. `src/pages/` 新建组件，顶部放统一的 `tabs` 导航（参考 Water.tsx 的页头模式）。
2. `src/router.tsx`：`Route` 联合类型加成员 → `parseHash` 加分支 → `App.tsx` 的 `switch` 加渲染分支（TS 会强制穷尽）。
3. 关键交互元素加 `data-testid`（测试基建约定，见 [TESTING.md §6](TESTING.md)）。

## 7. 本地联调与调试

- 画布拖拽问题：先在 `npm run e2e:headed` 下观察 Pointer 轨迹；组件测试环境（jsdom）不支持 PointerEvent，只能验证 onClick 选中路径。
- localStorage 查看方案原始数据：DevTools → Application → Local Storage → `aquaplans.v1`。
- 手工核对计算：`tests/volume.test.ts` / `tests/water.test.ts` 内都有独立的手工核算算式，可当计算器参考。

## 8. 提交前自检清单

```bash
npx tsc -b        # ① 类型零错误
npm test          # ② 139 用例全绿
npm run build     # ③ 构建通过
npm run e2e       # ④ E2E 通过（改动画布/交互/路由时必跑）
```

如改动涉及 Docker（依赖、nginx、构建产物体积），按 [DEPLOYMENT.md](DEPLOYMENT.md) 重新验证 healthz 与镜像大小。
