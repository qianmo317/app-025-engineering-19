import { useMemo, useState } from 'react';
import type { Plan } from '../core/types';
import { FISHES, fishById } from '../data/db';
import { updatePlan } from '../state/plans';
import { Link } from '../router';
import { effectiveVolumeL } from '../core/volume';
import {
  checkStocking,
  checkDensity,
  type StockingIssue,
} from '../core/compatibility';

export default function Stocking({ plan }: { plan: Plan }) {
  const [pickId, setPickId] = useState('');
  const eff = effectiveVolumeL(plan.tank, plan.substrate, plan.items);
  const hasPlants = plan.items.some((i) => i.kind === 'plant');

  const entries = useMemo(
    () =>
      plan.fishes
        .map((f) => ({ fish: fishById(f.fishId), count: f.count }))
        .filter((e): e is { fish: NonNullable<ReturnType<typeof fishById>>; count: number } => !!e.fish),
    [plan.fishes],
  );

  const issues = useMemo(
    () => checkStocking(entries, { tankLitres: eff, hasPlants }),
    [entries, eff, hasPlants],
  );
  const density = checkDensity(entries, eff);

  function addFish() {
    if (!pickId) return;
    const found = plan.fishes.find((f) => f.fishId === pickId);
    const next = found
      ? plan.fishes.map((f) => (f.fishId === pickId ? { ...f, count: f.count + 1 } : f))
      : [...plan.fishes, { fishId: pickId, count: 1 }];
    updatePlan(plan.id, { fishes: next });
  }

  function setCount(fishId: string, count: number) {
    const next = count <= 0
      ? plan.fishes.filter((f) => f.fishId !== fishId)
      : plan.fishes.map((f) => (f.fishId === fishId ? { ...f, count } : f));
    updatePlan(plan.id, { fishes: next });
  }

  const conflicts = issues.filter((i) => i.severity === 'conflict');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');

  return (
    <div className="page" data-testid="stocking-page">
      <nav className="row tabs">
        <Link to={`/plan/${plan.id}`} className="tab">
          ← 造景编辑
        </Link>
        <Link to={`/plan/${plan.id}/water`} className="tab">
          水质与设备
        </Link>
        <span className="tab active">生物兼容</span>
        <Link to={`/plan/${plan.id}/bom`} className="tab">
          物料清单 →
        </Link>
      </nav>
      <h1>生物清单与兼容性检查（{plan.name}）</h1>
      <p className="muted">有效水量 {eff.toFixed(1)}L · {hasPlants ? '草缸' : '无植物'}</p>

      <div className="row">
        <select data-testid="fish-select" value={pickId} onChange={(e) => setPickId(e.target.value)}>
          <option value="">选择鱼种…</option>
          {FISHES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}（成体 {f.adultCm}cm，≥{f.minTankL}L）
            </option>
          ))}
        </select>
        <button className="btn primary" data-testid="add-fish" onClick={addFish} disabled={!pickId}>
          加入
        </button>
      </div>

      <table className="table" data-testid="fish-table">
        <thead>
          <tr>
            <th>鱼种</th>
            <th>成体</th>
            <th>耐受（水温/GH/pH）</th>
            <th>性格</th>
            <th>数量</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                还没有选择鱼种。
              </td>
            </tr>
          )}
          {entries.map(({ fish, count }) => (
            <tr key={fish.id} data-testid={`fish-row-${fish.id}`}>
              <td>{fish.name}</td>
              <td>{fish.adultCm}cm</td>
              <td className="muted small">
                {fish.tempRange.join('~')}°C / GH {fish.ghRange.join('~')} / pH {fish.phRange.join('~')}
              </td>
              <td>
                {fish.temperament === 'aggressive' ? '凶' : fish.temperament === 'semi' ? '半凶' : '温和'}
                {fish.plantNip && ' · 啃草'}
                {fish.schooling && ' · 群游'}
              </td>
              <td>
                <div className="row">
                  <button className="btn sm" data-testid={`dec-${fish.id}`} onClick={() => setCount(fish.id, count - 1)}>
                    −
                  </button>
                  <span data-testid={`count-${fish.id}`}>{count}</span>
                  <button className="btn sm" data-testid={`inc-${fish.id}`} onClick={() => setCount(fish.id, count + 1)}>
                    ＋
                  </button>
                </div>
              </td>
              <td>
                <button className="btn ghost sm" onClick={() => setCount(fish.id, 0)}>
                  移除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {density && (
        <section className={`card2 ${density.over ? 'over' : ''}`} data-testid="density-card">
          <h3>密度校验（经验估算，建议）</h3>
          <p>
            总成体长度 <b>{density.totalCm.toFixed(1)}cm</b> ÷ {eff.toFixed(1)}L ={' '}
            <b>{density.cmPerL}cm/L</b>（经验阈值 {density.threshold}cm/L）
          </p>
          <p className={density.over ? 'bad' : 'ok'}>
            {density.over ? '⚠ 超出经验密度，建议减少数量或升级过滤' : '✓ 在经验范围内'}
          </p>
          <p className="muted small">{density.note}</p>
        </section>
      )}

      <h3>检查结果</h3>
      <div data-testid="issues">
        {issues.length === 0 && entries.length > 0 && (
          <div className="okbox" data-testid="no-issues">
            ✓ 未发现混养冲突（不含密度建议）。
          </div>
        )}
        {[
          ['硬冲突', conflicts, 'issue-conflict'],
          ['警告', warnings, 'issue-warning'],
          ['建议', infos, 'issue-info'],
        ].map(([label, list, cls]) =>
          (list as StockingIssue[]).length > 0 ? (
            <div key={label as string}>
              <h4>
                {label as string}（{(list as StockingIssue[]).length}）
              </h4>
              {(list as StockingIssue[]).map((iss, i) => (
                <div key={i} className={`issue ${cls as string}`} data-testid={`issue-${iss.code}`}>
                  {iss.severity === 'conflict' ? '✖' : iss.severity === 'warning' ? '⚠' : 'ℹ'} {iss.message}
                </div>
              ))}
            </div>
          ) : null,
        )}
        {entries.length === 0 && <p className="muted">加入鱼种后自动逐对检查（攻击性、体长差、水质区间、啃草、群游）。</p>}
      </div>
    </div>
  );
}
