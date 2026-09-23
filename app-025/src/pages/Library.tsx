import { useMemo, useState } from 'react';
import { PLANTS, FISHES, HARDSCAPES, SUBSTRATES } from '../data/db';

type Tab = 'plant' | 'fish' | 'hardscape' | 'substrate';

export default function Library() {
  const [tab, setTab] = useState<Tab>('plant');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const kw = q.trim();
    if (tab === 'plant') {
      return PLANTS.filter((p) => !kw || p.name.includes(kw) || p.note.includes(kw)).map((p) => ({
        main: p.name,
        tags: [
          p.layer === 'front' ? '前景' : p.layer === 'mid' ? '中景' : '后景',
          `${p.lightNeed === 'high' ? '高光' : p.lightNeed === 'mid' ? '中光' : '低光'}`,
          `${p.growth === 'fast' ? '快生' : p.growth === 'mid' ? '中速' : '慢生'}`,
          p.co2Need ? '需CO₂' : '无需CO₂',
        ],
        sub: p.note,
      }));
    }
    if (tab === 'fish') {
      return FISHES.filter((f) => !kw || f.name.includes(kw)).map((f) => ({
        main: f.name,
        tags: [
          `成体 ${f.adultCm}cm`,
          `≥${f.minTankL}L`,
          `${f.tempRange.join('~')}°C`,
          `GH ${f.ghRange.join('~')}`,
          `pH ${f.phRange.join('~')}`,
          f.temperament === 'aggressive' ? '凶' : f.temperament === 'semi' ? '半凶' : '温和',
          f.plantNip ? '啃草' : null,
          f.schooling ? '群游' : null,
        ].filter(Boolean) as string[],
        sub: '',
      }));
    }
    if (tab === 'hardscape') {
      return HARDSCAPES.filter((h) => !kw || h.name.includes(kw)).map((h) => ({
        main: h.name,
        tags: [`默认 ${h.defaultCm}cm`, h.shape === 'wood' ? '沉木' : '石材', `排水系数 ${h.displacement}`],
        sub: h.note,
      }));
    }
    return SUBSTRATES.filter((s) => !kw || s.label.includes(kw)).map((s) => ({
      main: s.label,
      tags: [`密度 ${s.densityKgPerL} kg/L`],
      sub: '',
    }));
  }, [tab, q]);

  return (
    <div className="page" data-testid="library">
      <h1>素材库（水草 / 鱼种 / 硬景观 / 底砂）</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        {(
          [
            ['plant', '水草'],
            ['fish', '鱼种'],
            ['hardscape', '硬景观'],
            ['substrate', '底砂'],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            className={`btn ${tab === k ? 'primary' : ''}`}
            data-testid={`tab-${k}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
        <input
          data-testid="library-search"
          placeholder="搜索…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <table className="table" data-testid="library-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>参数</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.main}</td>
              <td>
                {r.tags.map((t, j) => (
                  <span className="tag" key={j}>
                    {t}
                  </span>
                ))}
              </td>
              <td className="muted">{r.sub}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">共 {rows.length} 条记录。数据库随包发布（src/data/*.json）。</p>
    </div>
  );
}
