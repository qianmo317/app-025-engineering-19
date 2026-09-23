import { useMemo, useState } from 'react';
import type { Plan, Item } from '../core/types';
import Canvas, { occlusionWarnings } from '../components/Canvas';
import { updatePlan } from '../state/plans';
import { PLANTS, HARDSCAPES, SUBSTRATES } from '../data/db';
import { Link } from '../router';
import {
  grossVolumeL,
  substrateVolumeL,
  substrateWeightKg,
  hardscapeDisplacementL,
  effectiveVolumeL,
} from '../core/volume';

export default function Editor({ plan }: { plan: Plan }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = plan.items.find((i) => i.id === selectedId) ?? null;

  const vol = useMemo(() => {
    const gross = grossVolumeL(plan.tank);
    const subVol = substrateVolumeL(plan.tank, plan.substrate);
    const subKg = substrateWeightKg(plan.tank, plan.substrate);
    const displace = hardscapeDisplacementL(plan.items);
    const eff = effectiveVolumeL(plan.tank, plan.substrate, plan.items);
    return { gross, subVol, subKg, displace, eff };
  }, [plan]);

  const occlusions = useMemo(() => occlusionWarnings(plan.items), [plan.items]);

  function addPlant(plantId: string, name: string, layer: 'front' | 'mid' | 'back', lightNeed: 'low' | 'mid' | 'high', growth: 'slow' | 'mid' | 'fast') {
    const item: Item = {
      id: `i${Date.now()}${Math.floor(Math.random() * 1e3)}`,
      kind: 'plant',
      name,
      x: 10 + Math.random() * 20,
      y: 10 + Math.random() * 10,
      scaleCm: layer === 'back' ? 25 : layer === 'mid' ? 15 : 5,
      rotDeg: 0,
      layer,
      lightNeed,
      growth,
      qty: 10,
    };
    updatePlan(plan.id, { items: [...plan.items, item] });
  }

  function addHardscape(hId: string, name: string, cm: number, displacement: number, shape: 'rock' | 'wood') {
    const item: Item = {
      id: `i${Date.now()}${Math.floor(Math.random() * 1e3)}`,
      kind: 'hardscape',
      name,
      x: 15 + Math.random() * 20,
      y: 10 + Math.random() * 10,
      scaleCm: cm,
      rotDeg: 0,
      displacement,
      shape,
    };
    updatePlan(plan.id, { items: [...plan.items, item] });
  }

  function patchItem(id: string, patch: Partial<Item>) {
    updatePlan(plan.id, {
      items: plan.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });
  }

  function removeItem(id: string) {
    updatePlan(plan.id, { items: plan.items.filter((i) => i.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }

  function patchTank(patch: Partial<Plan['tank']>) {
    updatePlan(plan.id, { tank: { ...plan.tank, ...patch } });
  }
  function patchSub(patch: Partial<Plan['substrate']>) {
    updatePlan(plan.id, { substrate: { ...plan.substrate, ...patch } });
  }

  return (
    <div className="page editor" data-testid="editor">
      <div className="editor-head">
        <h2 className="plan-title">{plan.name}</h2>
        <nav className="row tabs">
          <span className="tab active">造景编辑</span>
          <Link to={`/plan/${plan.id}/water`} className="tab">
            水质与设备
          </Link>
          <Link to={`/plan/${plan.id}/stocking`} className="tab">
            生物兼容
          </Link>
          <Link to={`/plan/${plan.id}/bom`} className="tab">
            物料清单
          </Link>
        </nav>
      </div>

      <div className="editor-grid">
        {/* 左：素材库 */}
        <aside className="panel" data-testid="library-panel">
          <h3>水草（点击加入）</h3>
          <div className="lib-list">
            {PLANTS.map((p) => (
              <button
                key={p.id}
                className="lib-item"
                data-testid={`add-plant-${p.id}`}
                onClick={() => addPlant(p.id, p.name, p.layer, p.lightNeed, p.growth)}
              >
                {p.name}
                <span className="muted small">
                  {' '}
                  · {p.layer === 'front' ? '前' : p.layer === 'mid' ? '中' : '后'}景·
                  {p.lightNeed === 'high' ? '高' : p.lightNeed === 'mid' ? '中' : '低'}光
                </span>
              </button>
            ))}
          </div>
          <h3>硬景观（点击加入）</h3>
          <div className="lib-list">
            {HARDSCAPES.map((h) => (
              <button
                key={h.id}
                className="lib-item"
                data-testid={`add-hardscape-${h.id}`}
                onClick={() => addHardscape(h.id, h.name, h.defaultCm, h.displacement, h.shape)}
              >
                {h.name}
                <span className="muted small"> · 约 {h.defaultCm}cm</span>
              </button>
            ))}
          </div>
        </aside>

        {/* 中：画布 */}
        <section>
          <Canvas plan={plan} selectedId={selectedId} onSelect={setSelectedId} />
          {occlusions.length > 0 && (
            <div className="warnbox" data-testid="occlusion-warnings">
              {occlusions.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}
          <div className="volbar" data-testid="volume-summary">
            毛水量 <b>{vol.gross.toFixed(1)}L</b> ｜ 底砂体积 <b>{vol.subVol.toFixed(1)}L</b>（{vol.subKg.toFixed(1)}kg）
            ｜ 素材排水 <b>{vol.displace.toFixed(1)}L</b> ｜ 有效水量{' '}
            <b className={vol.eff > 0 ? 'ok' : 'bad'}>{vol.eff.toFixed(1)}L</b>
          </div>
        </section>

        {/* 右：参数面板 */}
        <aside className="panel" data-testid="params-panel">
          <h3>缸体</h3>
          <div className="grid2">
            <NumField label="长 cm" value={plan.tank.l} onChange={(v) => patchTank({ l: v })} testid="tank-l" />
            <NumField label="宽 cm" value={plan.tank.w} onChange={(v) => patchTank({ w: v })} testid="tank-w" />
            <NumField label="高 cm" value={plan.tank.h} onChange={(v) => patchTank({ h: v })} testid="tank-h" />
            <NumField label="玻璃 mm" value={plan.tank.glassMm} onChange={(v) => patchTank({ glassMm: v })} testid="tank-glass" />
            <NumField
              label="水面 mm"
              value={plan.tank.waterLevelMm}
              onChange={(v) => patchTank({ waterLevelMm: v })}
              testid="tank-waterlevel"
            />
            <label className="chk">
              <input
                type="checkbox"
                data-testid="tank-opentop"
                checked={plan.tank.openTop}
                onChange={(e) => patchTank({ openTop: e.target.checked })}
              />
              开放缸
            </label>
          </div>

          <h3>底砂</h3>
          <div className="grid2">
            <label>
              类型
              <select
                data-testid="sub-kind"
                value={plan.substrate.kind}
                onChange={(e) => {
                  const s = SUBSTRATES.find((x) => x.kind === e.target.value)!;
                  patchSub({ kind: s.kind, densityKgPerL: s.densityKgPerL });
                }}
              >
                {SUBSTRATES.map((s) => (
                  <option key={s.kind} value={s.kind}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <NumField
              label="密度 kg/L"
              value={plan.substrate.densityKgPerL}
              onChange={(v) => patchSub({ densityKgPerL: v })}
              testid="sub-density"
              step={0.05}
            />
            <NumField
              label="厚度 mm"
              value={plan.substrate.thicknessMm}
              onChange={(v) => patchSub({ thicknessMm: v })}
              testid="sub-thickness"
            />
            <NumField
              label="坡度 mm"
              value={plan.substrate.slopeMm}
              onChange={(v) => patchSub({ slopeMm: v })}
              testid="sub-slope"
            />
          </div>

          <h3>选中素材</h3>
          {!selected ? (
            <p className="muted small">点击画布中的素材进行编辑（拖拽移动）。</p>
          ) : (
            <div className="grid2" data-testid="item-editor">
              <div className="span2">
                <b>{selected.name}</b>
                <span className="muted small">
                  {' '}
                  占缸长 {((selected.scaleCm / plan.tank.l) * 100).toFixed(0)}%
                </span>
              </div>
              <NumField label="实际尺寸 cm" value={selected.scaleCm} onChange={(v) => patchItem(selected.id, { scaleCm: v })} testid="item-scale" />
              <NumField label="旋转 °" value={selected.rotDeg} onChange={(v) => patchItem(selected.id, { rotDeg: v })} testid="item-rot" />
              <NumField label="X cm" value={selected.x} onChange={(v) => patchItem(selected.id, { x: v })} testid="item-x" />
              <NumField label="Y cm" value={selected.y} onChange={(v) => patchItem(selected.id, { y: v })} testid="item-y" />
              {selected.kind === 'plant' && (
                <>
                  <label>
                    层次
                    <select
                      data-testid="item-layer"
                      value={selected.layer}
                      onChange={(e) => patchItem(selected.id, { layer: e.target.value as Item['layer'] })}
                    >
                      <option value="front">前景</option>
                      <option value="mid">中景</option>
                      <option value="back">后景</option>
                    </select>
                  </label>
                  <NumField label="株数" value={selected.qty ?? 1} onChange={(v) => patchItem(selected.id, { qty: Math.max(1, Math.round(v)) })} testid="item-qty" />
                </>
              )}
              <button className="btn danger span2" data-testid="item-delete" onClick={() => removeItem(selected.id)}>
                删除该素材
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function NumField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  testid?: string;
  step?: number;
}) {
  return (
    <label>
      {props.label}
      <input
        type="number"
        data-testid={props.testid}
        value={props.value}
        step={props.step ?? 1}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) props.onChange(v);
        }}
      />
    </label>
  );
}
