# 架构文档 · ARCHITECTURE

> 项目：水族造景布局与水质参数规划（app-025）｜定位：纯前端单页应用，无后端依赖，断网可用。

## 1. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│  页面层 pages/（PlanList · Editor · Water · Stocking · Bom · Library）
│  只做：展示计算结果 + 收集用户动作；不写业务公式
├─────────────────────────────────────────────────────────────┤
│  组件层 components/Canvas.tsx
│  SVG 画布：平面/侧视双视图、网格、辅助线、Pointer 拖拽、遮挡检查
├─────────────────────────────────────────────────────────────┤
│  路由层 router.tsx（内置 hash 路由，零依赖）
│  #/ /plan/:id[/water|/stocking|/bom] /library
├─────────────────────────────────────────────────────────────┤
│  核心计算层 core/（纯函数，"后端"逻辑，全部可单测）
│  volume.ts · water.ts · equipment.ts · compatibility.ts · bom.ts · types.ts
├─────────────────────────────────────────────────────────────┤
│  状态层 state/plans.ts（集中式 store，观察者模式）
│  方案 CRUD + localStorage 持久化（键 aquaplans.v1）
├─────────────────────────────────────────────────────────────┤
│  数据层 data/*.json（随包发布，构建时打包）
│  plants.json(12) · fishes.json(26) · hardscape.json(6) · substrates.json(4)
└─────────────────────────────────────────────────────────────┘
```

设计原则：

1. **计算与展示分离**：所有公式集中在 `core/` 纯函数中，页面组件只调用不实现。这是项目最高约定，新增功能必须遵守。
2. **零外部依赖扩展**：未引入 UI 库、状态库（zustand/redux）、路由库（react-router）。路由与 store 均为几十行的自研实现，保证可控与轻量。
3. **数据随包发布**：素材数据库以 JSON 形式随构建产物打包，不请求外部接口，离线可用。
4. **经验值必须标注**：所有非精确公式的输出（换水比例、泡/秒、密度阈值等）都通过 `Estimate` 类型携带 `estimated: true` 与提示文案，UI 强制展示。

## 2. 状态管理与数据流

`src/state/plans.ts` 是唯一的状态源：

```
用户动作 ──▶ upsertPlan / updatePlan / deletePlan / renamePlan / updateWater
                │
                ├─▶ plans: Plan[]（模块级内存单例）
                ├─▶ emit() → localStorage.setItem('aquaplans.v1', JSON.stringify(plans))
                └─▶ listeners.forEach(l => l())
                          │
App.tsx: useSyncExternalStore(subscribePlans, getPlans) ──▶ 触发重渲染
```

- 组件通过 `useSyncExternalStore` 订阅（`App.tsx` 统一订阅一次），页面内部直接调用 store 的公开 API 修改数据，避免层层 props 传递。
- 读路径：`getPlan(id)` 按需读取；写路径：所有写操作都会刷新 `updatedAt` 并同步持久化。
- 持久化格式即 `Plan` 数组的 JSON 序列化，无 schema 迁移（v1 键名预留升级空间）。

## 3. 路由设计（src/router.tsx）

自研 hash 路由，约 60 行：

- `parseHash(hash)`：把 `#/plan/:id/water` 解析为 `{ name: 'water', id }` 的判别联合类型 `Route`，页面跳转由 TS 编译期保证穷尽（`switch` + `noFallthroughCasesInSwitch`）。
- `useRoute()`：监听 `hashchange`，返回解析结果。
- `Link` 组件：拦截点击改写 hash（`preventDefault` + `location.hash = to`），与原生锚点行为兼容（直接输 URL / 刷新 / 后退均可用）。

| Route | 页面组件 |
|---|---|
| `{ name: 'home' }` | PlanList |
| `{ name: 'editor', id }` | Editor |
| `{ name: 'water', id }` | Water |
| `{ name: 'stocking', id }` | Stocking |
| `{ name: 'bom', id }` | Bom |
| `{ name: 'library' }` | Library |

## 4. 画布渲染与交互（components/Canvas.tsx）

- **渲染**：SVG。1cm = N px 的比例尺按容器宽度自适应（3~12 px/cm），`viewBox` 随缸体尺寸变化。
- **双视图**：
  - 平面图：`x/y` 直接映射，显示缸宽方向的布局；
  - 侧视图：显示水体高度、水面线、底砂坡度梯形（`thicknessMm + slopeMm`），素材按层次做近似高度堆叠（后景靠上）。
- **网格与辅助线**：每 5cm 一格的 `grid-line`；三分法辅助线由开关控制。
- **渲染层级（z-order）**：硬景观在最底，水草按 后景 → 中景 → 前景 依次叠放，符合真实遮挡关系（这也是前景遮挡提示的视觉基础）。
- **拖拽**：Pointer 事件（`pointerdown` 记录偏移 → `window.pointermove` 更新 `x/y` → `pointerup` 结束），坐标换算基于 SVG 实际渲染矩形，与缩放无关；位置被夹取在缸体内。
- **选中兼容**：jsdom 不支持 PointerEvent，因此 `ItemShape` 的 `<g>` 上同时挂 `onPointerDown`（拖拽）与 `onClick`（选中兜底），组件测试与真实浏览器均可用。
- **遮挡检查**：`occlusionWarnings(items)` 纯函数——前景草高度低于任一后景/大件硬景观高度时输出提示，编辑器页展示。

## 5. 核心计算模块（core/）

| 模块 | 公开函数 | 说明 |
|---|---|---|
| volume.ts | `waterHeightCm` `grossVolumeL` `substrateAvgThicknessCm` `substrateVolumeL` `substrateWeightKg` `hardscapeDisplacementL` `effectiveVolumeL` `waterSurfaceAreaM2` | 毛水量 = l×w×水柱高度/1000；有效水量 = 毛水量 − 底砂体积 − 素材排水（必须扣除） |
| water.ts | `weeklyWaterChangePct` `roMixForGh` `saltForGh` `co2FromPhKh` `targetPhForCo2` `co2BubblesPerSec` `phKhCo2Table` `co2Lookup` | RO 兑水与矿物盐互斥输出；CO₂ ≈ 3×KH×10^(7−pH)；泡/秒估算强制 `estimated` 标注 |
| equipment.ts | `classifyLightByLumen` `recommendLumens` `recommendWatts` `checkLight` `filterFlowLph` `heaterWatts` `suggestGlassMm` `equipmentSummary` | 光照三档判定 + 水草需求交叉校验；过滤 5~8 倍；加热 W = L×ΔT×0.12 |
| compatibility.ts | `rangesOverlap` `checkPair` `checkSchooling` `checkTankSize` `checkDensity` `checkStocking` | 逐对 5 条规则 + 附加规则，输出 `StockingIssue[]`（severity/conflict·warning·info + code + message） |
| bom.ts | `buildBom` | 汇总底砂/水草/硬景观/生物/设备行 + 养护参数卡 |

可配参数集中以常量或数据表存在（`GH_SALTS`、`LIGHT_LUMEN_PER_M2`、`WL_RANGE`、底砂密度表、硬景观排水系数），便于调参与测试边界。

## 6. 类型模型

见 [README.md §10](../README.md)。要点：

- `Tank` 尺寸单位 cm，水面/底砂厚度/坡度单位 mm（输入习惯对齐实际）；
- `Item` 同时承载硬景观（scaleCm/displacement/shape）与水草（layer/lightNeed/growth/qty）；
- `Fish.tempRange/ghRange/phRange` 为二元组区间，兼容性检查依赖区间交集运算 `rangesOverlap`。

## 7. 测试架构映射

| 测试层 | 目标 | 对应 |
|---|---|---|
| 单元（Vitest） | `core/` 全部纯函数，含 50 组随机水量、20 组 GH、24 组兼容性验收用例 | `tests/*.test.ts` |
| 组件（Testing Library，与单元同套件运行） | 页面交互路径（新建→编辑→水质→兼容→清单→导出） | `tests/app.test.tsx` |
| E2E（Playwright） | 构建产物/Docker 容器上的全链路验收 | `e2e/planner.spec.ts` |

详见 [TESTING.md](TESTING.md)。

## 8. 关键设计决策记录

| 决策 | 理由 |
|---|---|
| 用 hash 路由而非 history 路由 | 纯前端静态托管（nginx/Docker）无需服务端配置即可刷新/直达；零依赖 |
| 状态集中一个 store，而非每页独立 state | 方案数据跨 5 个页面共享（缸体改动要实时反映到水质/兼容/清单页），且用户要求状态逻辑集中、组件只做展示 |
| 有效水量强制扣除底砂与素材 | 商家/新手按毛水量配药施肥剂量偏高的真实痛点，验收明确要求专门用例 |
| 估算类输出统一 `Estimate` 类型 | 水族经验值差异大，必须让用户知道哪些是精确公式、哪些需要实测校验（如 CO₂ 用监测液） |
| 素材画布 SVG 而非 Canvas 2D | 素材数量级小（几十个节点），SVG 可直接绑定 DOM 事件（拖拽/选中），无需手写命中检测，且导出平面图可复用同一坐标模型 |
