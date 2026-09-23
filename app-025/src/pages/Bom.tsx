import { useMemo } from 'react';
import type { Plan } from '../core/types';
import { buildBom } from '../core/bom';
import { FISHES, PLANTS } from '../data/db';
import { Link } from '../router';

export default function Bom({ plan }: { plan: Plan }) {
  const fishMap = useMemo(() => new Map(FISHES.map((f) => [f.id, f])), []);
  const plantMap = useMemo(
    () => new Map(PLANTS.map((p) => [p.id, { name: p.name, lightNeed: p.lightNeed }])),
    [],
  );
  const bom = useMemo(() => buildBom(plan, fishMap, plantMap), [plan, fishMap, plantMap]);

  function downloadSvg() {
    const svg = renderPlanSvg(plan);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${plan.name}-平面图.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page bom-page" data-testid="bom-page">
      <nav className="row tabs no-print">
        <Link to={`/plan/${plan.id}`} className="tab">
          ← 造景编辑
        </Link>
        <Link to={`/plan/${plan.id}/water`} className="tab">
          水质与设备
        </Link>
        <Link to={`/plan/${plan.id}/stocking`} className="tab">
          生物兼容
        </Link>
        <span className="tab active">物料清单</span>
      </nav>
      <h1>物料清单与养护参数卡（{plan.name}）</h1>

      <div className="row no-print">
        <button className="btn primary" data-testid="print-btn" onClick={() => window.print()}>
          打印（A4 参数卡）
        </button>
        <button className="btn" data-testid="export-svg" onClick={downloadSvg}>
          导出平面图 SVG
        </button>
      </div>

      <table className="table" data-testid="bom-table">
        <thead>
          <tr>
            <th>类别</th>
            <th>名称</th>
            <th>规格</th>
            <th>数量</th>
          </tr>
        </thead>
        <tbody>
          {bom.lines.map((l, i) => (
            <tr key={i} data-testid={`bom-line-${l.category}`}>
              <td>{l.category}</td>
              <td>{l.name}</td>
              <td className="muted small">{l.spec}</td>
              <td>
                <b>{l.qty}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="card2 care-card" data-testid="care-card">
        <h3>养护参数卡（贴缸）</h3>
        <ul>
          <li>
            换水：每周 <b>{bom.care.waterChangePct}%</b>
          </li>
          <li>
            光照：<b>{bom.care.lightHours}</b>
          </li>
          <li>
            CO₂ 日程：<b>{bom.care.co2Schedule}</b>
          </li>
          <li>
            喂食：<b>{bom.care.feedingTimes}</b>
          </li>
        </ul>
        <p className="muted small">缸体 {plan.tank.l}×{plan.tank.w}×{plan.tank.h}cm · 玻璃 {plan.tank.glassMm}mm · {plan.tank.openTop ? '开放缸' : '封闭缸'}</p>
      </section>
    </div>
  );
}

/** 导出带尺寸标注的平面图 SVG */
function renderPlanSvg(plan: Plan): string {
  const { tank } = plan;
  const scale = 10; // 10px per cm
  const W = tank.l * scale;
  const H = tank.w * scale;
  const shapes = plan.items
    .map((it) => {
      const s = it.scaleCm * scale;
      const color = it.kind === 'plant' ? (it.layer === 'front' ? '#d9534f' : it.layer === 'mid' ? '#f0ad4e' : '#4285f4') : '#a08050';
      const label = `${it.name} ${it.scaleCm}cm`;
      return it.kind === 'hardscape'
        ? `<rect x="${(it.x - it.scaleCm / 2) * scale}" y="${(it.y - it.scaleCm / 2) * scale}" width="${s}" height="${s * 0.7}" rx="${s * 0.15}" fill="#a08050" stroke="#6b4f2a" stroke-width="2"><title>${label}</title></rect>`
        : `<circle cx="${it.x * scale}" cy="${it.y * scale}" r="${s / 2}" fill="#7dbb6c" stroke="${color}" stroke-width="2" opacity="0.8"><title>${label}</title></circle>`;
    })
    .join('\n  ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="0" y="0" width="${W}" height="${H}" fill="#eaf3f6" stroke="#333" stroke-width="3"/>
  <text x="8" y="20" font-size="14" fill="#333">${plan.name} 平面图 ${tank.l}×${tank.w}cm（底砂 ${plan.substrate.thicknessMm}+${plan.substrate.slopeMm}mm）</text>
  ${shapes}
</svg>`;
}
