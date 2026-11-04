import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { adminNav, learnerNav, type NavItem } from '@/navigation';
import { LandingPage } from '@/pages/LandingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

function portalRoutes(nav: NavItem[]) {
  return [
    <Route key="index" index element={<Navigate to="dashboard" replace />} />,
    ...nav.map((item) => (
      <Route
        key={item.path}
        path={item.path}
        element={<PlaceholderPage title={item.label} sprint={item.sprint} />}
      />
    )),
  ];
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      {/* Learner portal — Figma "EduComply — Learner Portal" */}
      <Route
        path="/learner"
        element={<AppShell basePath="/learner" portalLabel="Learner portal" nav={learnerNav} />}
      >
        {portalRoutes(learnerNav)}
      </Route>

      {/* Admin portal — new design, matches the learner design system */}
      <Route
        path="/admin"
        element={<AppShell basePath="/admin" portalLabel="Admin portal" nav={adminNav} />}
      >
        {portalRoutes(adminNav)}
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
