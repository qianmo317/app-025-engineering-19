import { test, expect, type Page } from '@playwright/test';

/**
 * E2E 全链路：设缸体 → 摆素材水草 → 算水质设备 → 检查混养 → 导出物料清单
 * 运行环境：vite preview（构建产物）或 Docker 容器（E2E_BASE_URL）。
 */

const PLAN_NAME = `E2E草缸${Date.now() % 100000}`;

async function openPlan(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('plan-list')).toBeVisible();
  await page.getByTestId('new-plan-name').fill(PLAN_NAME);
  await page.getByTestId('create-plan').click();
  await expect(page.getByTestId('editor')).toBeVisible();
}

test.describe('水族造景规划器 E2E', () => {
  test('验收主流程：设缸体→摆素材→算水质→查混养→导出清单', async ({ page }) => {
    // 1. 设缸体
    await openPlan(page);
    const tankL = page.getByTestId('tank-l');
    await tankL.fill('90');
    await page.getByTestId('tank-w').fill('45');
    await page.getByTestId('tank-h').fill('45');
    await page.getByTestId('tank-waterlevel').fill('390');

    // 底砂：ADA 泥 50mm + 60mm 坡
    await page.getByTestId('sub-kind').selectOption('ada');
    await page.getByTestId('sub-thickness').fill('50');
    await page.getByTestId('sub-slope').fill('60');

    // 2. 摆素材与水草（平面图）
    await page.getByTestId('add-hardscape-h-rock-seiryu').click(); // 青龙石 15cm
    await page.getByTestId('add-hardscape-h-wood-manzhicao').click(); // 曼珠沉木 25cm
    await expect(page.locator('[data-testid^="item-"]')).toHaveCount(2);

    // 拖拽青龙石到新位置（pointer 事件，真实鼠标轨迹）
    const rock = page.locator('[data-testid^="item-i"]').nth(0);
    const box = await rock.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 5 });
      await page.mouse.up();
    }

    // 选中沉木，改实际尺寸并旋转（真实 cm 缩放）；SVG 形状可能相互覆盖，用 force 点击
    await page.locator('[data-testid^="item-i"]').nth(1).click({ force: true });
    await page.getByTestId('item-scale').fill('30');
    await page.getByTestId('item-rot').fill('15');
    await page.getByTestId('item-delete').waitFor({ state: 'visible' });

    // 加水草：后景红宫廷 + 前景小水榕
    await page.getByTestId('add-plant-p-ludwigia').click();
    await page.getByTestId('add-plant-p-anubias').click();
    await expect(page.locator('[data-testid^="item-i"]')).toHaveCount(4);

    // 水量汇总：90×45×39/1000 = 158L 毛水量；有效水量必须小于毛水量（扣除底砂与素材）
    const volText = await page.getByTestId('volume-summary').textContent();
    expect(volText).toContain('毛水量');
    const gross = Number(volText!.match(/毛水量\s*([\d.]+)L/)![1]);
    const eff = Number(volText!.match(/有效水量\s*([\d.]+)L/)![1]);
    expect(gross).toBeCloseTo(158, 0);
    expect(eff).toBeLessThan(gross);
    expect(eff).toBeGreaterThan(0);

    // 侧视图切换（层次与遮挡视角）
    await page.getByTestId('view-side').click();
    await expect(page.getByTestId('substrate-side')).toBeVisible();
    await page.getByTestId('view-top').click();

    // 3. 水质与设备
    await page.getByRole('link', { name: '水质与设备' }).first().click();
    await expect(page.getByTestId('water-page')).toBeVisible();
    // 自来水 GH12 → 目标 8：RO 兑水方案出现（V_ro/V = (12-8)/12 = 33%）
    await expect(page.getByTestId('ro-result')).toContainText('RO 兑水方案');
    expect(await page.getByTestId('ro-result').textContent()).toContain('RO 纯水');
    // CO₂：有泡数与估算标注
    expect(Number(await page.getByTestId('bps').textContent())).toBeGreaterThan(0);
    await expect(page.getByTestId('card-co2')).toContainText('估算');
    // 目标 pH 反解展示
    const ph = Number(await page.getByTestId('target-ph').textContent());
    expect(ph).toBeGreaterThan(6.5);
    expect(ph).toBeLessThan(7.0);
    // 过滤与加热：与有效水量挂钩
    const filterText = await page.getByTestId('card-filter').textContent();
    expect(filterText).toMatch(/\d+~\d+ L\/h/);
    await expect(page.getByTestId('card-heater')).toContainText('W');
    // 高光草（红宫廷）+ 默认中光推荐 → 交叉校验警告
    await expect(page.getByTestId('light-warnings')).toContainText('建议提高光强或改用低光草');

    // 4. 生物兼容
    await page.getByRole('link', { name: '生物兼容' }).first().click();
    await expect(page.getByTestId('stocking-page')).toBeVisible();
    const fishSelect = page.getByTestId('fish-select');
    // 斗鱼（凶）
    await fishSelect.selectOption('f-betta');
    await page.getByTestId('add-fish').click();
    // 红绿灯 ×3（群游不足）
    await fishSelect.selectOption('f-neon-tetra');
    await page.getByTestId('add-fish').click();
    await page.getByTestId('inc-f-neon-tetra').click();
    await page.getByTestId('inc-f-neon-tetra').click();
    // 金鱼 + 七彩（水温/GH/pH 无交集 → 硬冲突）
    await fishSelect.selectOption('f-goldfish');
    await page.getByTestId('add-fish').click();
    await fishSelect.selectOption('f-discus');
    await page.getByTestId('add-fish').click();

    await expect(page.getByTestId('issue-param-temp').first()).toContainText('水温');
    await expect(page.getByTestId('issue-aggression').first()).toBeVisible();
    await expect(page.getByTestId('issue-schooling').first()).toContainText('应激');
    // 密度卡（经验估算标注，非阻断）
    await expect(page.getByTestId('density-card')).toContainText('经验估算');

    // 5. 导出物料清单
    await page.getByRole('link', { name: '物料清单' }).first().click();
    await expect(page.getByTestId('bom-page')).toBeVisible();
    const table = page.getByTestId('bom-table');
    await expect(table).toContainText('kg'); // 底砂重量
    await expect(table).toContainText('株'); // 水草株数
    await expect(table).toContainText('尾'); // 鱼数
    await expect(table).toContainText('过滤器');
    await expect(table).toContainText('照明灯');
    await expect(table).toContainText('加热棒');
    // 养护参数卡
    await expect(page.getByTestId('care-card')).toContainText('换水');
    await expect(page.getByTestId('care-card')).toContainText('光照');
    await expect(page.getByTestId('care-card')).toContainText('CO₂');
    // 导出 SVG 触发下载
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-svg').click(),
    ]);
    expect(download.suggestedFilename()).toContain('平面图.svg');
  });

  test('方案列表 CRUD 与刷新持久化', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-plan-name').fill('持久化缸');
    await page.getByTestId('create-plan').click();
    await expect(page.getByTestId('editor')).toBeVisible();
    // 刷新后方案仍在（localStorage）
    await page.reload();
    await expect(page.getByTestId('editor')).toBeVisible();
    // 回列表可见
    await page.getByRole('link', { name: '方案列表' }).first().click();
    await expect(page.getByTestId('plan-list')).toBeVisible();
    await expect(page.getByText('持久化缸').first()).toBeVisible();
    // 清理：删除
    page.once('dialog', (d) => d.accept());
    const card = page.locator('[data-testid="plan-card"]', { hasText: '持久化缸' });
    await card.getByRole('button', { name: '删除' }).click();
    await expect(page.locator('[data-testid="plan-card"]', { hasText: '持久化缸' })).toHaveCount(0);
  });

  test('素材库页签切换与搜索', async ({ page }) => {
    await page.goto('/#/library');
    await expect(page.getByTestId('library')).toBeVisible();
    await page.getByTestId('tab-fish').click();
    await expect(page.getByTestId('library-table')).toContainText('红绿灯灯鱼');
    await page.getByTestId('library-search').fill('灯鱼');
    const rows = page.locator('[data-testid="library-table"] tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(26);
  });

  test('healthz 由 nginx 提供（Docker 场景断言，preview 下跳过）', async ({ page, baseURL }) => {
    test.skip(!baseURL!.includes(':8105'), '仅在 Docker 容器场景运行');
    const res = await page.request.get('/healthz');
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).toContain('ok');
  });
});
