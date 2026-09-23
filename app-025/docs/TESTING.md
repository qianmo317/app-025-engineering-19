# 测试文档 · TESTING

## 1. 测试策略总览

三层测试金字塔，全部实测通过：

| 层级 | 框架 | 数量 | 目标 |
|---|---|---|---|
| 单元测试 | Vitest + jsdom | 139（含组件 16） | `core/` 纯函数正确性，验收用例全覆盖 |
| 组件交互测试 | Testing Library + user-event | 16（含在 139 内） | 用户点击路径：新建→编辑→水质→兼容→清单→导出 |
| E2E | Playwright（Chromium） | preview 3/3 + 容器 4/4 | 构建产物/容器上的全链路验收 |

```bash
npm test                  # 单元 + 组件（~秒级）
npm run e2e               # E2E（自动起 vite preview，约 1 分钟）
E2E_BASE_URL=http://localhost:8105 E2E_NO_SERVER=1 npm run e2e   # 针对容器
```

## 2. 单元测试用例清单

### tests/volume.test.ts —— 水量与底砂（56 用例）

- **50 组随机缸体+底砂**（mulberry32 固定种子，可复现）：与测试内独立手工核算对照，毛水量/底砂体积/重量误差 ≤2%；
- 有效水量专门用例：`有效 = 毛水量 − 底砂体积 − 素材排水`（60×45 缸逐项验证）；
- 水草不计入排水；极端参数（底砂厚于水）不出负水量；水面高度被缸高夹取（防超注）；底砂平均厚度 = 基础 + 坡度/2；水面面积换算。

### tests/water.test.ts —— GH 调配与 CO₂（28 用例）

- **10 组降 GH**：RO 方案比率 = (GH_tap − GH_target)/GH_tap，`tapL + roL = totalL`，线性混合反算一致，且不出加盐方案；
- **10 组升 GH**：加盐 m = ΔGH×V/贡献，且不出 RO 方案；
- 目标=自来水双方案都不给；目标>自来水 RO 防负比率；
- CO₂ 公式抽查（KH4/pH7→12ppm 等 4 组）；反解 pH 往返一致（5×5 组合）；25ppm@KH4 落在弱酸区 6.5~6.9；
- 泡/秒非负且带估算+监测液标注；pH 表覆盖 5.2~7.8 共 14 行；换水建议三档（30/40/50%）。

### tests/equipment.test.ts —— 设备（10 用例）

- 流明/面积三档边界（2400/2500/4800/5200 lm/m²）；
- 推荐流明/功率随有效水量缩放；
- 高光草配中光 → 出「建议提高光强或改用低光草」；高光下阴性草 → 爆藻警告；匹配不告警；
- 过滤 5~8 倍；加热棒 50L/ΔT10 → 60W、规格上取整 100W、ΔT0 保底 25W；玻璃厚度经验表；equipmentSummary 汇总自洽。

### tests/compatibility.test.ts —— 兼容性与密度（24 用例）

验收要求"30 组混养用例全部检出"由以下参数化组构成（每组内含多断言）：

- 规则 1（10 组）：攻击性×温和缸不足 → 硬冲突（含 1.5 倍边界 3 组精确判定：`need−1` 冲突、`need` 警告）；缸够 → 降级警告含"隔离区"；攻击性×半凶 → 警告；温和×温和无输出；
- 规则 2（5 组）：体长差参数化（30/3、15/4、20/5、12/3.5、60/2），检出"吞食风险"或正确不报；
- 规则 3（8 组）：水温/GH/pH 单项无交集各检出硬冲突；三项全无交集出 3 条；边界相接（4 组）视为有交集不误报；
- 规则 4（3 组）：啃草×草缸警告、无植物缸不报；
- 规则 5（4 组）：群游 1/3/5 尾建议补足、6 尾不报；singleMale 多尾警告；checkStocking 汇总组合检出；
- 密度：超标提示且"不阻断"、大鱼阈值放宽到 1cm/2L（200L/500L 对照）、空输入防护。

### tests/bom.test.ts —— 物料清单（5 用例）

底砂行 kg 与重量公式一致；水草按株数；生物按尾数；硬景观+三设备（过滤 L/h、灯 lm/W、加热 W）齐备；养护卡四要素（换水/喂食/光照/CO₂ 日程）。

## 3. 组件测试（tests/app.test.tsx，16 用例）

| 分组 | 验证点 |
|---|---|
| 方案列表 | 空列表引导文案；输入名称→新建→跳编辑器 |
| 编辑器 | 点素材库加入水草→水量汇总与画布节点出现；选中硬景观→改尺寸（占缸比例 42%）；删除选中素材→画布清空；改底砂厚度→重量联动；前景草被 30cm 硬景观遮挡→遮挡提示 |
| 水质页 | 默认 GH12→8 显示 RO 方案（无盐方案）；目标改 18 →切换为盐方案；CO₂ 卡含估算+监测液标注且泡数>0；高光草+中光→交叉校验警告 |
| 兼容页 | 斗鱼+3 尾红绿灯 → aggression+schooling（应激）双检出；金鱼+七彩 → 水温硬冲突；40L 缸 30 尾灯鱼 → 密度卡出现且含"经验估算" |
| 清单页 | 底砂 kg/株数/尾数/三设备齐备+养护卡；SVG 导出触发 Blob 下载（stub `URL.createObjectURL`） |
| 素材库 | 四 tab 切换、搜索过滤（"灯鱼"）行数收窄 |

## 4. E2E（e2e/planner.spec.ts）

- **主流程**（验收原文路径）：设缸体（90×45×45，水面 390mm，ADA 泥 50+60mm）→ 摆 2 硬景观+2 水草 → 选中沉木改尺寸/旋转 → 鼠标拖拽青龙石 → 断言毛水量 158L 且有效<毛 → 侧视图切换 → 水质页断言 RO 方案/泡数>0/目标 pH∈(6.5,7.0)/过滤区间/加热 W/高光草警告 → 兼容页加入斗鱼+3 红绿灯+金鱼+七彩 → 断言 temp 硬冲突/aggression/应激/密度卡 → 清单页断言 kg/株/尾/三设备/养护卡 → 触发 SVG 下载并校验文件名。
- **持久化**：新建方案 → reload 仍在 → 回列表可见 → 删除（自动接受 confirm 对话框）。
- **素材库**：tab 切换与搜索过滤。
- **healthz**：仅当 `baseURL` 含 `:8105`（Docker 场景）运行，否则自动 skip。

两种运行模式（playwright.config.ts）：

```ts
// 默认：自动起 vite preview（构建产物）
webServer: { command: 'npm run preview -- --port 4173 --strictPort', ... }
// 容器模式：E2E_NO_SERVER=1 跳过自启，E2E_BASE_URL 指向容器
E2E_BASE_URL=http://localhost:8105 E2E_NO_SERVER=1 npm run e2e
```

失败排查：`trace: 'retain-on-failure'`，报告在 `playwright-report/`，错误上下文快照在 `test-results/`。

## 5. 测试环境已知问题与处理

| 问题 | 处理 |
|---|---|
| Node 26 全局无 localStorage（jsdom 下同样缺失） | `tests/setup.ts` 注入内存 polyfill（同名字段/方法），并 afterEach 清理 |
| jsdom 不支持 PointerEvent，user-event 的 click 不触发 onPointerDown | 画布素材 `<g>` 上同时挂 `onPointerDown`（拖拽）与 `onClick`（选中兜底），两边环境都可交互 |
| `item-` 前缀被右侧面板输入（item-scale 等）占用，E2E 定位画布元素用 `[data-testid^="item-i"]`（素材 id 以 `i` 开头） | 定位约定见下节 |
| 素材形状相互覆盖时 Playwright 可动性检查失败 | 测试中对该点击使用 `force: true`；App 侧渲染已按 后→中→前 排序降低覆盖概率 |

## 6. 测试基建约定

1. **data-testid 前缀规划**：页面容器 `*-page`、卡片 `card-*`、交互按钮 `add-plant-*/add-hardscape-*/add-fish/inc-*/dec-*`、结果区 `ro-result/salt-result/bps/target-ph/light-warnings/issue-*/density-card/care-card`、画布元素 `item-{id}`。新页面照此命名，E2E 才能稳定定位。
2. **随机测试必须固定种子**：用 `mulberry32(seed)`，保证失败可复现。
3. **手工核算独立于被测代码**：单测内的期望值用内联算式另算一遍（禁止 import 被测函数自身），才满足"误差 ≤2% 对照"的意义。
4. **组件测试间状态隔离**：store 是模块级单例，测试用公开 API `getPlans()/deletePlan()` 清场，而非访问内部变量。
