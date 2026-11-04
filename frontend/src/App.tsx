import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/auth/RequireAuth';
import { AppShell } from '@/components/layout/AppShell';
import { AdminLayout } from '@/features/admin/AdminLayout';
import { AdminDashboardPage } from '@/features/admin/pages/AdminDashboardPage';
import {
  CertificatesPage,
  CoursesPage,
  MonitoringPage,
  QuestionBanksPage,
  ReportsPage,
  VideosPage,
} from '@/features/admin/pages/ContentPages';
import { LearnersPage } from '@/features/admin/pages/LearnersPage';
import { UserDetailPage } from '@/features/admin/pages/UserDetailPage';
import { UsersPage } from '@/features/admin/pages/UsersPage';
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
import { learnerNav, learnerPageTitles } from '@/navigation';
import { LandingPage } from '@/pages/LandingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/** ADMIN-only page inside the admin portal (REVIEWERs see the access-denied screen). */
const adminOnly = (page: ReactElement) => <RequireAuth roles={['ADMIN']}>{page}</RequireAuth>;

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

      {/* Admin portal — learner design system; ADMIN and REVIEWER only (API enforces the same) */}
      <Route
        path="/admin"
        element={
          <RequireAuth roles={['ADMIN', 'REVIEWER']}>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="users" element={adminOnly(<UsersPage />)} />
        <Route path="users/:userId" element={adminOnly(<UserDetailPage />)} />
        <Route path="learners" element={adminOnly(<LearnersPage />)} />
        <Route path="courses" element={adminOnly(<CoursesPage />)} />
        <Route path="videos" element={adminOnly(<VideosPage />)} />
        <Route path="question-banks" element={adminOnly(<QuestionBanksPage />)} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="certificates" element={adminOnly(<CertificatesPage />)} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage embedded />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
