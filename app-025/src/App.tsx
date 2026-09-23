import { useSyncExternalStore } from 'react';
import { useRoute, Link, navigate } from './router';
import {
  getPlans,
  subscribePlans,
  upsertPlan,
  deletePlan,
  renamePlan,
  getPlan,
  newPlan,
} from './state/plans';
import PlanList from './pages/PlanList';
import Editor from './pages/Editor';
import Water from './pages/Water';
import Stocking from './pages/Stocking';
import Bom from './pages/Bom';
import Library from './pages/Library';

export function usePlans() {
  return useSyncExternalStore(subscribePlans, getPlans);
}

export default function App() {
  const route = useRoute();
  usePlans(); // 订阅方案变化

  let page: React.ReactNode;
  switch (route.name) {
    case 'home':
      page = <PlanList />;
      break;
    case 'editor': {
      const plan = getPlan(route.id);
      page = plan ? <Editor plan={plan} /> : <NotFound />;
      break;
    }
    case 'water': {
      const plan = getPlan(route.id);
      page = plan ? <Water plan={plan} /> : <NotFound />;
      break;
    }
    case 'stocking': {
      const plan = getPlan(route.id);
      page = plan ? <Stocking plan={plan} /> : <NotFound />;
      break;
    }
    case 'bom': {
      const plan = getPlan(route.id);
      page = plan ? <Bom plan={plan} /> : <NotFound />;
      break;
    }
    case 'library':
      page = <Library />;
      break;
  }

  return (
    <div className="app">
      <header className="topbar" data-testid="topbar">
        <Link to="/" className="brand">
          🐠 水族造景规划器
        </Link>
        <nav className="topnav">
          <Link to="/">方案列表</Link>
          <Link to="/library">素材库</Link>
        </nav>
      </header>
      <main className="content">{page}</main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="empty">
      <p>方案不存在或已被删除。</p>
      <button className="btn" onClick={() => navigate('/')}>
        返回方案列表
      </button>
    </div>
  );
}

export { upsertPlan, deletePlan, renamePlan, newPlan, getPlan };
