import { useMemo, useRef, useState, useEffect, type ReactElement } from 'react';
import type { Item, Plan } from '../core/types';
import { updatePlan } from '../state/plans';

/**
 * 缸体画布：平面图 / 侧视图 双视图 SVG。
 * - 比例尺与网格（每 5cm 一格），素材按真实 cm 缩放
 * - 三分法辅助线（可开关）；前/中/后景描边区分
 * - 拖拽移动（Pointer 事件，transform 渲染，≥50fps 轻量实现）
 */

export type ViewMode = 'top' | 'side';

type Props = {
  plan: Plan;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export const LAYER_COLORS: Record<string, string> = {
  front: '#d9534f',
  mid: '#f0ad4e',
  back: '#4285f4',
};

const GRID_CM = 5;

export default function Canvas({ plan, selectedId, onSelect }: Props) {
  const [view, setView] = useState<ViewMode>('top');
  const [guides, setGuides] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const { tank } = plan;
  // 侧视图：宽=缸长(l)，高=缸高(h)；平面图：宽=缸长(l)，深=缸宽(w)
  const canvasWcm = tank.l;
  const canvasHcm = view === 'top' ? tank.w : tank.h;

  // 自适应：画布区域宽度按容器缩放（px per cm）
  const [pxPerCm, setPxPerCm] = useState(6);
  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const fit = () => setPxPerCm(Math.max(3, Math.min(12, (el.clientWidth - 40) / canvasWcm)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [canvasWcm]);

  const W = canvasWcm * pxPerCm;
  const H = canvasHcm * pxPerCm;
  const waterCm = Math.min(tank.h, tank.waterLevelMm / 10);

  // 素材位置：平面图 x,y 直接映射；侧视图 x 保持，y = 素材“前后位置”映射为高度堆叠示意
  const toPx = (cm: number) => cm * pxPerCm;

  const gridLines = useMemo(() => {
    const lines: ReactElement[] = [];
    for (let c = 0; c <= canvasWcm; c += GRID_CM) {
      lines.push(
        <line key={`v${c}`} x1={toPx(c)} y1={0} x2={toPx(c)} y2={H} className="grid-line" />,
      );
    }
    for (let c = 0; c <= canvasHcm; c += GRID_CM) {
      lines.push(
        <line key={`h${c}`} x1={0} y1={toPx(c)} x2={W} y2={toPx(c)} className="grid-line" />,
      );
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasWcm, canvasHcm, pxPerCm]);

  function cmFromEvent(e: PointerEvent | React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvasWcm,
      y: ((e.clientY - rect.top) / rect.height) * canvasHcm,
    };
  }

  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const plan_ = planRef.current;
      const cm = cmFromEvent(e);
      const item = plan_.items.find((i) => i.id === dragging);
      if (!item) return;
      const nx = Math.max(0, Math.min(canvasWcm, cm.x - dragOffset.current.x));
      const ny = Math.max(0, Math.min(canvasHcm, cm.y - dragOffset.current.y));
      updatePlan(plan_.id, {
        items: plan_.items.map((i) => (i.id === dragging ? { ...i, x: round1(nx), y: round1(ny) } : i)),
      });
    };
    const up = () => setDragging(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, canvasWcm, canvasHcm]);

  // 渲染层级：硬景观在下，水草按 后→中→前 叠放（前景草最上层，符合遮挡关系）
  const LAYER_ORDER = { back: 0, mid: 1, front: 2 } as const;
  const items = [...plan.items].sort((a, b) => {
    const ka = a.kind === 'hardscape' ? -1 : LAYER_ORDER[a.layer ?? 'mid'];
    const kb = b.kind === 'hardscape' ? -1 : LAYER_ORDER[b.layer ?? 'mid'];
    return ka - kb;
  });

  return (
    <div className="canvas-wrap" data-testid="canvas-wrap">
      <div className="row canvas-toolbar">
        <button
          className={`btn ${view === 'top' ? 'primary' : ''}`}
          data-testid="view-top"
          onClick={() => setView('top')}
        >
          平面图
        </button>
        <button
          className={`btn ${view === 'side' ? 'primary' : ''}`}
          data-testid="view-side"
          onClick={() => setView('side')}
        >
          侧视图
        </button>
        <label className="chk">
          <input
            type="checkbox"
            checked={guides}
            data-testid="guides-toggle"
            onChange={(e) => setGuides(e.target.checked)}
          />
          三分法辅助线
        </label>
        <span className="muted small">
          比例尺 1 格 = {GRID_CM}cm（{pxPerCm.toFixed(1)}px/cm）
        </span>
      </div>
      <div className="canvas-frame">
        <svg
          ref={svgRef}
          data-testid="canvas"
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', maxWidth: 900, background: '#eaf3f6', touchAction: 'none' }}
          onPointerDown={(e) => {
            if (e.target === svgRef.current || (e.target as Element).classList.contains('grid-line')) {
              onSelect(null);
            }
          }}
        >
          {/* 水体区域（侧视图显示水面线） */}
          {view === 'side' && (
            <>
              <rect x={0} y={toPx(tank.h - waterCm)} width={W} height={toPx(waterCm)} fill="#cfe8f7" opacity={0.7} />
              <line x1={0} y1={toPx(tank.h - waterCm)} x2={W} y2={toPx(tank.h - waterCm)} stroke="#5a9fd4" strokeDasharray="4 3" />
              <text x={4} y={toPx(tank.h - waterCm) - 4} fontSize={10} fill="#39709e">
                水面 {waterCm.toFixed(0)}cm
              </text>
            </>
          )}
          {gridLines}

          {/* 三分法 */}
          {guides && (
            <g className="guides" data-testid="guides">
              <line x1={W / 3} y1={0} x2={W / 3} y2={H} stroke="#e6a23c" opacity={0.6} />
              <line x1={(2 * W) / 3} y1={0} x2={(2 * W) / 3} y2={H} stroke="#e6a23c" opacity={0.6} />
              <line x1={0} y1={H / 3} x2={W} y2={H / 3} stroke="#e6a23c" opacity={0.6} />
              <line x1={0} y1={(2 * H) / 3} x2={W} y2={(2 * H) / 3} stroke="#e6a23c" opacity={0.6} />
            </g>
          )}

          {/* 底砂（平面为整片色带；侧视画梯形坡） */}
          {view === 'side' ? (
            (() => {
              const base = plan.substrate.thicknessMm / 10;
              const slope = plan.substrate.slopeMm / 10;
              const h0 = toPx(base);
              const h1 = toPx(base + slope);
              return (
                <polygon
                  points={`0,${H} 0,${H - h0} ${W},${H - h1} ${W},${H}`}
                  fill="#c9b18a"
                  data-testid="substrate-side"
                />
              );
            })()
          ) : (
            <rect x={0} y={0} width={W} height={H} fill="#c9b18a" opacity={0.25} data-testid="substrate-top" />
          )}

          {/* 素材 */}
          {items.map((it) => (
            <ItemShape
              key={it.id}
              item={it}
              pxPerCm={pxPerCm}
              view={view}
              canvasHcm={canvasHcm}
              selected={it.id === selectedId}
              onSelect={() => onSelect(it.id)}
              onDragStart={(e) => {
                e.stopPropagation();
                onSelect(it.id);
                const cm = cmFromEvent(e);
                dragOffset.current = { x: cm.x - it.x, y: cm.y - it.y };
                setDragging(it.id);
              }}
            />
          ))}
        </svg>
      </div>
      <div className="muted small">
        {view === 'top'
          ? `平面图：${tank.l} × ${tank.w} cm`
          : `侧视图：${tank.l} × ${tank.h} cm（可看层次与遮挡）`}
      </div>
    </div>
  );
}

function ItemShape({
  item,
  pxPerCm,
  view,
  canvasHcm,
  selected,
  onSelect,
  onDragStart,
}: {
  item: Item;
  pxPerCm: number;
  view: ViewMode;
  canvasHcm: number;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.PointerEvent) => void;
}) {
  const s = toPxEr(item.scaleCm, pxPerCm);
  const stroke = item.kind === 'plant' ? LAYER_COLORS[item.layer ?? 'mid'] : '#6b4f2a';
  const fill = item.kind === 'plant' ? '#7dbb6c' : '#a08050';
  const opacity = item.kind === 'hardscape' ? 0.9 : 0.75;

  // 侧视图：y 表示离缸底高度 —— 用“后景靠上/前景靠下”的近似映射
  let cy: number;
  if (view === 'top') {
    cy = item.y * pxPerCm;
  } else {
    const layerLift = item.layer === 'back' ? 0.2 : item.layer === 'mid' ? 0.12 : 0.04;
    cy = canvasHcm * (1 - layerLift) * pxPerCm;
  }
  const cx = item.x * pxPerCm;

  const common = {
    stroke,
    strokeWidth: selected ? 3 : 1.5,
    fill,
    opacity,
    style: { cursor: 'grab' as const },
    transform: `rotate(${item.rotDeg} ${cx} ${cy})`,
  };
  const groupHandlers = {
    onPointerDown: onDragStart,
    onClick: onSelect,
    style: { cursor: 'grab' as const },
  };

  return item.kind === 'hardscape' ? (
    <g data-testid={`item-${item.id}`} {...groupHandlers}>
      <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s * 0.7} rx={s * 0.15} {...common} />
      <text x={cx} y={cy + 3} textAnchor="middle" fontSize={9} fill="#333" pointerEvents="none">
        {item.scaleCm}cm
      </text>
    </g>
  ) : (
    <g data-testid={`item-${item.id}`} {...groupHandlers}>
      <circle cx={cx} cy={cy} r={Math.max(3, s / 2)} {...common} />
      <text x={cx} y={cy + 3} textAnchor="middle" fontSize={9} fill="#333" pointerEvents="none">
        {item.qty ?? 1}
      </text>
    </g>
  );
}

function toPxEr(cm: number, pxPerCm: number) {
  return cm * pxPerCm;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** 层次遮挡检查：前景被后景挡住 → 提示（供编辑器展示） */
export function occlusionWarnings(items: Item[]): string[] {
  const warns: string[] = [];
  const backH = (it: Item) => it.kind === 'hardscape' ? it.scaleCm * 0.7 : it.scaleCm;
  for (const f of items.filter((i) => i.kind === 'plant' && i.layer === 'front')) {
    for (const b of items.filter((i) => i.id !== f.id && (i.layer === 'back' || (i.kind === 'hardscape' && i.scaleCm >= 20)))) {
      if (backH(b) > f.scaleCm) {
        warns.push(`前景「${f.name}」（约 ${f.scaleCm}cm）可能被「${b.name}」（约 ${Math.round(backH(b))}cm）遮挡，观赏面会看不到`);
        break;
      }
    }
  }
  return warns;
}
