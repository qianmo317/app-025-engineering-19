import { useState } from 'react';
import { Link, navigate } from '../router';
import { upsertPlan, deletePlan, renamePlan, newPlan, getPlans } from '../state/plans';
import { substrateWeightKg, grossVolumeL } from '../core/volume';

export default function PlanList() {
  const plans = getPlans();
  const [name, setName] = useState('');

  function create() {
    const plan = newPlan(name.trim() || '我的草缸');
    upsertPlan(plan);
    setName('');
    navigate(`/plan/${plan.id}`);
  }

  return (
    <div className="page" data-testid="plan-list">
      <div className="page-head">
        <h1>方案列表</h1>
        <div className="row">
          <input
            data-testid="new-plan-name"
            placeholder="方案名称，如 60 草缸"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button className="btn primary" data-testid="create-plan" onClick={create}>
            新建方案
          </button>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="empty" data-testid="plan-list-empty">
          还没有方案。点「新建方案」开始：设缸体 → 摆素材水草 → 算水质设备 → 检查混养 → 导出物料清单。
        </div>
      ) : (
        <div className="cards">
          {plans.map((p) => (
            <div className="card" key={p.id} data-testid="plan-card">
              <div className="card-title">
                <Link to={`/plan/${p.id}`} className="card-link">
                  {p.name}
                </Link>
                <span className="muted">
                  {p.tank.l}×{p.tank.w}×{p.tank.h}cm · {grossVolumeL(p.tank).toFixed(0)}L
                </span>
              </div>
              <div className="muted small">
                底砂 {substrateWeightKg(p.tank, p.substrate).toFixed(1)}kg · 素材 {p.items.length} 件 · 鱼{' '}
                {p.fishes.reduce((s, f) => s + f.count, 0)} 尾 · 更新 {new Date(p.updatedAt).toLocaleString('zh-CN')}
              </div>
              <div className="row">
                <Link to={`/plan/${p.id}`}>
                  <button className="btn">编辑</button>
                </Link>
                <Link to={`/plan/${p.id}/water`}>
                  <button className="btn">水质</button>
                </Link>
                <Link to={`/plan/${p.id}/stocking`}>
                  <button className="btn">生物</button>
                </Link>
                <Link to={`/plan/${p.id}/bom`}>
                  <button className="btn">清单</button>
                </Link>
                <button
                  className="btn ghost"
                  data-testid={`rename-${p.id}`}
                  onClick={() => {
                    const n = window.prompt('新名称', p.name);
                    if (n && n.trim()) renamePlan(p.id, n.trim());
                  }}
                >
                  重命名
                </button>
                <button
                  className="btn danger"
                  data-testid={`delete-${p.id}`}
                  onClick={() => {
                    if (window.confirm(`删除方案「${p.name}」？`)) deletePlan(p.id);
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
