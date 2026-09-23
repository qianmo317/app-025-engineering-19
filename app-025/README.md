# 水族造景布局与水质参数规划 · Aquarium Scaping Planner（app-025）

> 类型：前端 Web 应用（纯前端，无后端依赖，断网可用）｜技术栈：**React 18 + TypeScript + Vite 5**（SVG 画布绘制；未引入 UI 库与物理引擎）

## 项目文档索引

| 文档 | 内容 |
|---|---|
| [README.md](README.md) | 项目概览：功能、页面、技术栈、算法公式、快速开始、测试与部署结果 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架构设计：分层结构、数据流、路由/画布/状态实现、设计决策记录 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发指南：环境、命令、代码约定、如何加数据/计算模块/页面 |
| [docs/TESTING.md](docs/TESTING.md) | 测试文档：三层测试策略、用例清单、运行方式、已知问题与基建约定 |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 部署文档：Docker 构建、nginx 策略、发版验收清单、运维操作 |

## 1. 一句话简介

开缸前先在屏幕上摆好造景：缸体、底砂、沉木、石头、水草的位置与层次，同时算清水体参数（水量、底砂用量、GH/KH 与 CO₂ 需求、灯与过滤器的功率匹配），最后导出物料清单与养护参数卡。

## 2. 项目背景

- 新手开缸最容易翻车：石头摆得太满没留出游动空间，水草选得不匹配光照（弱光养阳性草必然爆藻）。
- 底砂要买多少斤、CO₂ 要开多少泡、灯要多少瓦，全靠商家报数，买多了浪费、买少了返工。
- 水质参数（GH/KH/pH）与鱼种需求不匹配，鱼活不下来，但没人把「当地自来水 GH」和「鱼的耐受范围」摆在一起算过。
- 造景方案与实拍差太远，因为没有比例参照（石头的 cm 尺寸与缸体尺寸脱节）。

**目标用户**：水族爱好者（淡水草缸、原生缸、虾缸）、水族店（给客户做方案与物料清单）、学校/科普机构（生态缸教学）。

## 3. 功能特性

### 3.1 MVP（全部已实现）

| 模块 | 功能 |
|---|---|
| 缸体设置 | 长×宽×高（cm）、玻璃厚度、开放缸、水面高度；实时计算水体体积与有效水量 |
| 素材布局 | 底砂（类型/厚度/坡度→自动算重量）；硬景观拖拽、缩放、旋转、按真实 cm 显示；水草按前/中/后景分层，标注株数；**前景被后景遮挡自动提示** |
| 水量水质 | 有效水量→每周换水建议；GH/KH 调配（RO 兑水 + 矿物盐双方案）；CO₂ 需求（泡/秒，标注经验估算）；pH-KH-CO₂ 关系表 |
| 设备匹配 | 照明（流明/面积判定低中高光 + 水草需求交叉校验爆藻风险）、过滤（5~8 倍流量）、加热棒（按温差估算） |
| 兼容性检查 | 逐对检查混养冲突（攻击性、体长差 3 倍、水温/GH/pH 无交集、啃草、群游不足），输出原因；密度校验（1cm/1~2L 经验值，不阻断） |
| 导出 | 造景平面图 SVG 下载（含尺寸标注）、物料清单（底砂 kg/水草株数/鱼数/设备参数）、养护参数卡（A4 打印） |

### 3.2 进阶功能

- 造景三分法构图辅助线（可开关）。
- 层次用不同描边区分（前红/中黄/后蓝）。
- 水草生长速度与 CO₂ 需求标注（快生/慢生、需/无需 CO₂）。

## 4. 页面结构（路由）

应用使用内置零依赖 hash 路由（`src/router.tsx`）：

| 路由 | 页面 |
|---|---|
| `#/` | 方案列表（新建/重命名/删除/入口） |
| `#/plan/:id` | 造景编辑器（左素材库 ｜ 中缸体画布·平面/侧视切换 ｜ 右参数面板） |
| `#/plan/:id/water` | 水质与设备计算（GH/KH、CO₂、灯、过滤、加热） |
| `#/plan/:id/stocking` | 生物清单与兼容性检查 |
| `#/plan/:id/bom` | 物料清单与参数卡（可打印） |
| `#/library` | 素材库（水草/鱼种/硬景观/底砂，搜索过滤） |

## 5. 技术栈与目录结构

- **React 18 + TypeScript + Vite 5**，严格模式 TS。
- 零 UI 库、零状态库、零路由库：状态为集中式 store（`src/state/plans.ts`，localStorage 持久化），组件只做展示与用户动作。
- 素材缩略数据库随包发布（`src/data/*.json`），构建时打包，不请求外部资源。

```
app-025/
├── index.html                    # 入口 HTML
├── package.json / tsconfig.json / vite.config.ts
├── Dockerfile                    # 多阶段：node:20-alpine 构建 → nginx:1.27-alpine
├── docker-compose.yml            # 服务 app-025，端口 8105:80，healthcheck
├── nginx.conf                    # SPA 回退 / healthz / gzip / 缓存策略
├── .dockerignore / .gitignore
├── playwright.config.ts          # E2E 配置（默认 vite preview，可用 E2E_BASE_URL 指向容器）
├── e2e/
│   └── planner.spec.ts           # E2E 全链路用例
├── tests/
│   ├── setup.ts                  # 测试环境初始化（含 localStorage polyfill）
│   ├── volume.test.ts            # 水量/底砂 56 用例
│   ├── water.test.ts             # GH/CO₂ 28 用例
│   ├── equipment.test.ts         # 设备 10 用例
│   ├── compatibility.test.ts     # 兼容性/密度 24 用例
│   ├── bom.test.ts               # 物料清单 5 用例
│   └── app.test.tsx              # 组件交互 16 用例（RTL）
└── src/
    ├── main.tsx / App.tsx / router.tsx / styles.css
    ├── core/                     # 纯计算层（"后端"逻辑，全部可单测）
    │   ├── types.ts              # 数据模型（Tank/Substrate/Item/Fish/Plan/Water）
    │   ├── volume.ts             # 水量与底砂
    │   ├── water.ts              # 换水/GH-KH/CO₂
    │   ├── equipment.ts          # 照明/过滤/加热
    │   ├── compatibility.ts      # 混养兼容与密度
    │   └── bom.ts                # 物料清单与养护卡
    ├── data/
    │   ├── db.ts                 # 类型化数据出口
    │   ├── plants.json           # 水草 12 种（层次/光照/生长速度/CO₂）
    │   ├── fishes.json           # 鱼种 26 种（成体/水温/GH/pH/性格/群游）
    │   ├── hardscape.json        # 硬景观 6 种（默认尺寸/排水系数）
    │   └── substrates.json       # 底砂 4 类（密度 kg/L）
    ├── state/
    │   └── plans.ts              # 方案 CRUD store（localStorage）
    ├── components/
    │   └── Canvas.tsx            # SVG 画布（平面/侧视、网格、辅助线、拖拽、遮挡检查）
    └── pages/
        ├── PlanList.tsx / Editor.tsx / Water.tsx
        ├── Stocking.tsx / Bom.tsx / Library.tsx
```

## 6. 核心算法与公式

### 6.1 水体与底砂（最容易算错的部分，已重点测试）

```
毛水量(L)      = l × w × 水柱高度(cm) / 1000          // 水柱高度 = min(缸高, 水面高度/10)
底砂平均厚度    = 基础厚度(mm)/10 + 坡度(mm)/10/2
底砂体积(L)    = l × w × 平均厚度 / 1000
底砂重量(kg)   = 体积 × 密度                          // 砂 1.5~1.7、水草泥 1.0~1.2，密度表可配
素材排水(L)    = 硬景观包围盒体积 × 排水系数            // 石 0.55 / 木 0.3，按条目可配
有效水量(L)    = 毛水量 − 底砂体积 − 素材排水           // 必须扣除，否则加药施肥剂量偏高
```

### 6.2 GH/KH 调配（两种方式，按方向给出）

- **RO 兑水（降 GH）**：`V_ro / V_total = (GH_tap − GH_target) / GH_tap`（线性混合）
- **矿物盐（升 GH）**：`m(g) = ΔGH × V(L) / 盐的GH贡献(gH per g per L)`，默认无水氯化钙 0.50，二水氯化钙 0.38，泻盐 0.23（可配）

### 6.3 CO₂ 估算（输出必须带「估算」标注）

- 关系式：`CO₂(ppm) ≈ 3 × KH × 10^(7−pH)`
- 反解目标 pH：`pH = 7 − log10(CO₂ / 3KH)`
- 泡/秒经验估算：`目标ppm × 有效水量(L) / 2000`，并提示用 CO₂ 监测液校验

### 6.4 设备匹配

- 光照判定：`光强 = 灯具流明 / 水面面积(m²)` → 低 <2500 / 中 2500~5000 / 高 >5000 lm/m²（经验阈值可配）；功率按 W/L（低 0.25 / 中 0.45 / 高 0.8 × 有效水量）
- 交叉校验：高光草配中光 → 「建议提高光强或改用低光草」；强光配阴性草 → 爆藻风险
- 过滤：`流量 = 5~8 × 有效水量 / 小时`；加热棒：`W = 有效水量 × 温差 × 0.12`，下限 25W，按市售规格上取整

### 6.5 混养兼容性（逐对检查，输出原因）

1. 攻击性 × 温和 → 冲突（除非缸体 ≥ 攻击性鱼种 `minTankL × 1.5`，且提示需隔离区）
2. 成体体长差 > 3 倍 → 小鱼被吃风险
3. 水温/GH/pH 区间**无交集** → 硬冲突
4. 啃草鱼 × 草缸 → 警告
5. 群游鱼 < minSchool 尾（默认 6）→ 建议补足（单养会应激）
6. 附加：singleMale 鱼种多尾互斗警告；低于 `minTankL` → 硬冲突提示

### 6.6 密度校验（经验估算，不阻断）

- 小型鱼（平均成体 3cm）1cm/1L，大型鱼（10cm）1cm/2L，中间线性过渡；超标仅提示为建议。

## 7. 快速开始

```bash
cd app-025
npm install
npm run dev        # 开发：http://localhost:5173
npm run build      # 生产构建（tsc + vite）
npm run preview    # 预览构建产物：http://localhost:4173
```

## 8. 测试

三层测试全部通过（实测结果）：

| 层级 | 框架 | 结果 | 覆盖 |
|---|---|---|---|
| 核心计算单测 | Vitest | **139/139 通过** | 50 组随机缸体/底砂与手工核算误差 ≤2%；20 组 GH 方向与公式；CO₂ 反解往返一致且带估算标注；24 组兼容性（攻击性×温和、体长差 5 倍、区间无交集、群游 3 尾等全部检出并给出原因）；密度超标提示不阻断；BOM 完整性 |
| 组件交互测试 | Testing Library（含在 139 内） | 16 用例 | 方案创建、素材增删改、RO/加盐切换、兼容冲突检出、清单内容、SVG 导出 |
| E2E | Playwright（Chromium） | preview **3/3**，容器 **4/4** | 验收主流程「设缸体→摆素材→算水质→查混养→导出清单」、方案持久化（刷新不丢）、素材库搜索、healthz |

```bash
npm test                      # 单元 + 组件测试
npx playwright install chromium   # 首次需要安装浏览器
npm run e2e                   # E2E（自动起 vite preview）
# 针对 Docker 容器跑 E2E：
E2E_BASE_URL=http://localhost:8105 E2E_NO_SERVER=1 npm run e2e
```

## 9. Docker 部署

```bash
cd app-025
docker compose up -d --build
curl http://localhost:8105/healthz     # → ok
# 浏览器访问 http://localhost:8105
docker compose down
```

- **Dockerfile（多阶段）**：`node:20-alpine` 构建 → `nginx:1.27-alpine` 只拷 `dist/` 与 `nginx.conf`
- **docker-compose.yml**：服务名 `app-025`，端口 `8105:80`，`restart: unless-stopped`，HEALTHCHECK 请求 `/healthz`
- **nginx.conf**：SPA 回退；哈希资源 `immutable` 长缓存；`index.html` no-cache；gzip（水草/鱼种数据库较大）
- 实测镜像 **21.9MB**（验收要求 <60MB），构建上下文 <5MB

## 10. 数据模型

```ts
type Tank = { id: string; name: string; l: number; w: number; h: number; glassMm: number;
              waterLevelMm: number; openTop: boolean };
type Substrate = { kind: 'sand'|'gravel'|'soil'|'ada'; densityKgPerL: number;
                   thicknessMm: number; slopeMm: number };
type Item = { id: string; kind: 'hardscape'|'plant'; name: string;
              x: number; y: number; scaleCm: number; rotDeg: number; layer?: 'front'|'mid'|'back';
              lightNeed?: 'low'|'mid'|'high'; growth?: 'slow'|'mid'|'fast'; qty?: number;
              displacement?: number; shape?: 'rock'|'wood' };
type Fish = { id: string; name: string; adultCm: number; minTankL: number; tempRange: [number, number];
              ghRange: [number, number]; phRange: [number, number]; temperament: 'peaceful'|'semi'|'aggressive';
              plantNip: boolean; schooling: boolean; minSchool?: number; singleMale?: boolean };
type Plan = { id: string; name: string; tank: Tank; substrate: Substrate; items: Item[];
              fishes: { fishId: string; count: number }[];
              water: { tapGh: number; tapKh: number; targetGh: number; targetCo2Ppm: number;
                       roomTempC: number; targetTempC: number };
              updatedAt: number };
```

## 11. 交互与视觉要点

- 画布提供**平面图与侧视图**双视图（侧视图能看出层次与遮挡，是造景的关键视角）。
- 显示比例尺与网格（每 5cm 一格），素材按真实 cm 缩放，可直接对照实物。
- 三分法辅助线（可开关）；层次用不同描边区分（前红/中黄/后蓝）；硬景观标注 cm 尺寸，水草圆点标注株数。
- 参数卡可打印贴在鱼缸旁（含换水量、光照时长、CO₂ 日程、喂食频次）。

## 12. 验收标准对照

| 验收项 | 要求 | 状态 |
|---|---|---|
| 水体与底砂 | 随机 50 组与手工核算一致（误差 ≤2%），有效水量必须扣除底砂与素材（专门用例） | ✅ tests/volume.test.ts |
| GH 调配 | 降 GH 出 RO 方案、升 GH 出加盐方案，数值与公式一致（20 组用例） | ✅ tests/water.test.ts |
| CO₂ 估算 | 给定 KH 与目标 pH，结果在经验范围内且带「估算」标注 | ✅ tests/water.test.ts |
| 兼容性检查 | 30 组混养用例（攻击性+温和、体长差、区间无交集、群游不足）全部检出并给出原因 | ✅ tests/compatibility.test.ts |
| 密度校验 | 超阈值给提示，不阻断，标注为建议 | ✅ tests/compatibility.test.ts |
| 导出物料清单 | 底砂 kg、水草株数、鱼数、设备参数齐备；A4 打印排版 | ✅ tests/bom.test.ts + E2E |
| Docker | healthz 通、镜像 <60MB | ✅ 实测 21.9MB |
| E2E 主流程 | 设缸体→摆素材→算水质→查混养→导出物料清单 | ✅ e2e/planner.spec.ts |

## 13. 边界（刻意不做）

不做水族器材与活体电商、不做订单与购物车、不做养殖日志与健康打卡（只出方案卡）、不做 3D 渲染——核心只做**布局规划 + 参数计算 + 兼容性检查 + 物料清单**。
