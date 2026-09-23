import { useEffect, useState, type ReactNode } from 'react';

/**
 * 极简 hash 路由（零依赖，满足页面结构需求）：
 * #/                方案列表
 * #/plan/:id        造景编辑器
 * #/plan/:id/water  水质与设备
 * #/plan/:id/stocking 生物兼容
 * #/plan/:id/bom    物料清单
 * #/library         素材库
 */

export type Route =
  | { name: 'home' }
  | { name: 'editor'; id: string }
  | { name: 'water'; id: string }
  | { name: 'stocking'; id: string }
  | { name: 'bom'; id: string }
  | { name: 'library' };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '') || '/';
  const seg = h.split('/').filter(Boolean);
  if (seg[0] === 'plan' && seg[1]) {
    const id = seg[1];
    if (seg[2] === 'water') return { name: 'water', id };
    if (seg[2] === 'stocking') return { name: 'stocking', id };
    if (seg[2] === 'bom') return { name: 'bom', id };
    return { name: 'editor', id };
  }
  if (seg[0] === 'library') return { name: 'library' };
  return { name: 'home' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(to: string) {
  window.location.hash = to;
}

export function Link(props: { to: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <a
      href={`#${props.to}`}
      className={props.className}
      title={props.title}
      onClick={(e) => {
        e.preventDefault();
        navigate(props.to);
      }}
    >
      {props.children}
    </a>
  );
}
