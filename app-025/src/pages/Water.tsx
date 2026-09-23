import { useMemo, useState } from 'react';
import type { Plan } from '../core/types';
import { updateWater } from '../state/plans';
import { Link } from '../router';
import { effectiveVolumeL } from '../core/volume';
import {
  roMixForGh,
  saltForGh,
  co2FromPhKh,
  targetPhForCo2,
  co2BubblesPerSec,
  phKhCo2Table,
  weeklyWaterChangePct,
} from '../core/water';
import {
  classifyLightByLumen,
  recommendLumens,
  recommendWatts,
  checkLight,
  filterFlowLph,
  heaterWatts,
} from '../core/equipment';
import { LIGHT_LUMEN_PER_M2 } from '../core/equipment';

export default function Water({ plan }: { plan: Plan }) {
  const w = plan.water;
  const eff = effectiveVolumeL(plan.tank, plan.substrate, plan.items);
  const plantQty = plan.items.filter((i) => i.kind === 'plant').reduce((s, i) => s + (i.qty ?? 1), 0);

  const [actualLumens, setActualLumens] = useState<number>(() => recommendLumens('mid', (plan.tank.l * plan.tank.w) / 10000));

  const ghRo = useMemo(() => roMixForGh(w.tapGh, w.targetGh, eff), [w.tapGh, w.targetGh, eff]);
  const ghSalt = useMemo(() => saltForGh(w.tapGh, w.targetGh, eff), [w.tapGh, w.targetGh, eff]);

  const targetPh = useMemo(() => targetPhForCo2(w.tapKh, w.targetCo2Ppm), [w.tapKh, w.targetCo2Ppm]);
  const currentCo2AtTargetPh = targetPh ? co2FromPhKh(w.tapKh, targetPh) : 0;
  const bubbles = co2BubblesPerSec(w.targetCo2Ppm, eff);

  const areaM2 = (plan.tank.l * plan.tank.w) / 10000;
  const level = classifyLightByLumen(actualLumens, areaM2);
  const lightCheck = checkLight(level, plan.items);
  const flow = filterFlowLph(eff);
  const heater = heaterWatts(eff, w.roomTempC, w.targetTempC);
  const wc = weeklyWaterChangePct(plantQty, eff);
  const table = phKhCo2Table();

  return (
    <div className="page" data-testid="water-page">
      <nav className="row tabs">
        <Link to={`/plan/${plan.id}`} className="tab">
          ← 造景编辑
        </Link>
        <span className="tab active">水质与设备</span>
        <Link to={`/plan/${plan.id}/stocking`} className="tab">
          生物兼容 →
        </Link>
      </nav>
      <h1>水质与设备计算（{plan.name}）</h1>
      <p className="muted">
        有效水量 {eff.toFixed(1)}L（已扣除底砂与素材排水）· 水面面积 {areaM2.toFixed(2)}m²
      </p>

      <div className="cards2">
        {/* 换水 */}
        <section className="card2" data-testid="card-waterchange">
          <h3>换水建议（每周）</h3>
          <p className="big">{wc.value}%</p>
          <p className="muted small">{wc.note}（{plantQty} 株草 / {eff.toFixed(0)}L）</p>
        </section>

        {/* GH/KH */}
        <section className="card2" data-testid="card-gh">
          <h3>GH/KH 调配</h3>
          <div className="grid4">
            <Field label="自来水 GH" value={w.tapGh} onChange={(v) => updateWater(plan.id, { tapGh: v })} testid="tap-gh" />
            <Field label="自来水 KH" value={w.tapKh} onChange={(v) => updateWater(plan.id, { tapKh: v })} testid="tap-kh" />
            <Field label="目标 GH" value={w.targetGh} onChange={(v) => updateWater(plan.id, { targetGh: v })} testid="target-gh" />
            <Field label="目标 CO₂ ppm" value={w.targetCo2Ppm} onChange={(v) => updateWater(plan.id, { targetCo2Ppm: v })} testid="target-co2" />
          </div>
          {ghRo && (
            <div className="result" data-testid="ro-result">
              <b>RO 兑水方案（降 GH）：</b>
              目标 {eff.toFixed(0)}L 中，自来水 {ghRo.tapL.toFixed(1)}L + RO 纯水 {ghRo.roL.toFixed(1)}L
              （RO 占 {(ghRo.roRatio * 100).toFixed(0)}%）。公式：V_ro/V_total = (GH_tap − GH_target)/GH_tap。
              <div className="muted small">{ghRo.applicable}</div>
            </div>
          )}
          {ghSalt && (
            <div className="result" data-testid="salt-result">
              <b>矿物盐方案（升 GH）：</b>
              加入 {ghSalt.salt} {ghSalt.grams.toFixed(2)}g（ΔGH {((w.targetGh - w.tapGh) || 0).toFixed(1)} × {eff.toFixed(1)}L ÷ {ghSalt.ghPerGramPerL}）。
              <div className="muted small">{ghSalt.applicable}</div>
            </div>
          )}
          {!ghRo && !ghSalt && (
            <div className="result muted">目标 GH 与自来水一致或参数未定，无需调配。</div>
          )}
        </section>

        {/* CO2 */}
        <section className="card2" data-testid="card-co2">
          <h3>CO₂ 需求（经验估算）</h3>
          {targetPh ? (
            <>
              <p>
                KH {w.tapKh} + 目标 {w.targetCo2Ppm}ppm → 建议 pH 降至 <b data-testid="target-ph">{targetPh.toFixed(2)}</b>
                （反解 pH = 7 − log10(CO₂ / 3KH)）
              </p>
              <p>
                校验：该 pH/KH 下 CO₂ ≈ <b>{currentCo2AtTargetPh.toFixed(1)}</b> ppm（CO₂ ≈ 3×KH×10^(7−pH)）
              </p>
              <p>
                计泡器建议：<b data-testid="bps">{bubbles.value}</b> 泡/秒
              </p>
              <p className="warnbox">{bubbles.note}</p>
            </>
          ) : (
            <p className="muted">KH 与目标 CO₂ 需大于 0。</p>
          )}
          <details>
            <summary className="muted">pH-KH-CO₂ 关系表（KH={w.tapKh}，ppm）</summary>
            <table className="table small-table" data-testid="co2-table">
              <tbody>
                <tr>
                  {table.map((r) => (
                    <th key={r.ph}>pH {r.ph}</th>
                  ))}
                </tr>
                <tr>
                  {table.map((r) => (
                    <td key={r.ph}>{co2FromPhKh(w.tapKh, r.ph).toFixed(0)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </details>
        </section>

        {/* 照明 */}
        <section className="card2" data-testid="card-light">
          <h3>照明匹配</h3>
          <div className="grid4">
            <Field
              label="灯具总流明"
              value={actualLumens}
              onChange={(v) => setActualLumens(v)}
              testid="light-lumens"
            />
          </div>
          <p>
            光强 = {actualLumens} lm ÷ {areaM2.toFixed(2)}m² ={' '}
            <b>{(actualLumens / areaM2).toFixed(0)} lm/m²</b> → 判定：
            <b data-testid="light-level">{level === 'low' ? '低光' : level === 'mid' ? '中光' : '高光'}</b>
            （阈值：低 &lt;2500 / 中 2500~5000 / 高 &gt;5000，经验值）
          </p>
          <p>
            推荐：约 {recommendLumens(level, areaM2)} lm ｜ {recommendWatts(level, eff)} W（W/L 法，{eff.toFixed(0)}L）
          </p>
          {!lightCheck.ok && (
            <div className="warnbox" data-testid="light-warnings">
              {lightCheck.warnings.map((x, i) => (
                <div key={i}>⚠ {x}</div>
              ))}
            </div>
          )}
        </section>

        {/* 过滤 */}
        <section className="card2" data-testid="card-filter">
          <h3>过滤流量</h3>
          <p className="big">
            {flow.min}~{flow.max} L/h
          </p>
          <p className="muted small">5~8 倍有效水量/小时（经验值，按 {eff.toFixed(0)}L）</p>
        </section>

        {/* 加热 */}
        <section className="card2" data-testid="card-heater">
          <h3>加热棒</h3>
          <div className="grid4">
            <Field label="室温 °C" value={w.roomTempC} onChange={(v) => updateWater(plan.id, { roomTempC: v })} testid="room-temp" />
            <Field label="目标水温 °C" value={w.targetTempC} onChange={(v) => updateWater(plan.id, { targetTempC: v })} testid="target-temp" />
          </div>
          <p className="big">{heater.suggested} W</p>
          <p className="muted small">
            计算 {heater.watts}W = {eff.toFixed(0)}L × ΔT{(w.targetTempC - w.roomTempC).toFixed(0)}°C × 0.12（经验估算），按市售规格上取整
          </p>
        </section>
      </div>

      <p className="muted small" style={{ marginTop: 16 }}>
        光照等级参考阈值流明/面积：低 {LIGHT_LUMEN_PER_M2.low.join('~')}、中 {LIGHT_LUMEN_PER_M2.mid.join('~')}、高{' '}
        {LIGHT_LUMEN_PER_M2.high[0]}+。
      </p>
    </div>
  );
}

function Field(props: { label: string; value: number; onChange: (v: number) => void; testid: string }) {
  return (
    <label>
      {props.label}
      <input
        type="number"
        data-testid={props.testid}
        value={props.value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) props.onChange(v);
        }}
      />
    </label>
  );
}
