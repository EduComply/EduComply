import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/auth/RequireAuth';
import { AppShell } from '@/components/layout/AppShell';
import { AssessmentsPage } from '@/features/learner/pages/AssessmentsPage';
import { CalendarPage } from '@/features/learner/pages/CalendarPage';
import { CoursePlayerPage } from '@/features/learner/pages/CoursePlayerPage';
import { DashboardPage } from '@/features/learner/pages/DashboardPage';
import { ProfilePage } from '@/features/learner/pages/ProfilePage';
import { ProgressPage } from '@/features/learner/pages/ProgressPage';
import { QuizPage } from '@/features/learner/pages/QuizPage';
import { ResultPage } from '@/features/learner/pages/ResultPage';
import { SettingsPage } from '@/features/learner/pages/SettingsPage';
import { TrainingPage } from '@/features/learner/pages/TrainingPage';
import { adminNav, learnerNav, learnerPageTitles } from '@/navigation';
import { LandingPage } from '@/pages/LandingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      {/* Learner portal — Figma "EduComply — Learner Portal" (frames 1:2–1:11) */}
      <Route
        path="/learner"
        element={
          <RequireAuth>
            <AppShell
              basePath="/learner"
              portalLabel="Learner portal"
              nav={learnerNav}
              pageTitles={learnerPageTitles}
            />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="training" element={<TrainingPage />} />
        <Route path="training/:courseId" element={<CoursePlayerPage />} />
        <Route path="assessments" element={<AssessmentsPage />} />
        <Route path="assessments/:assessmentId" element={<QuizPage />} />
        <Route path="assessments/:assessmentId/result" element={<ResultPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="*" element={<NotFoundPage embedded />} />
      </Route>

      {/* Admin portal — screens arrive in later tasks; access is restricted now */}
      <Route
        path="/admin"
        element={
          <RequireAuth roles={['ADMIN', 'REVIEWER']}>
            <AppShell basePath="/admin" portalLabel="Admin portal" nav={adminNav} />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        {adminNav.map((item) => (
          <Route
            key={item.path}
            path={item.path}
            element={<PlaceholderPage title={item.label} sprint={item.sprint} />}
          />
        ))}
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
