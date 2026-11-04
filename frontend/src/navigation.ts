export interface NavItem {
  /** Path relative to the portal root, e.g. "training" → /learner/training */
  path: string;
  label: string;
  /** Sprint (proposal v1.1) in which the screen becomes functional. */
  sprint: number;
}

/** Learner navigation — mirrors the sidebar in the Figma learner portal. */
export const learnerNav: NavItem[] = [
  { path: 'dashboard', label: 'Dashboard', sprint: 2 },
  { path: 'training', label: 'My Training', sprint: 2 },
  { path: 'assessments', label: 'Assessments', sprint: 4 },
  { path: 'progress', label: 'My Progress', sprint: 4 },
  { path: 'calendar', label: 'Calendar', sprint: 6 },
  { path: 'profile', label: 'Profile', sprint: 1 },
  { path: 'settings', label: 'Settings', sprint: 6 },
];

/** Admin navigation — new portal, styled to match the learner design. */
export const adminNav: NavItem[] = [
  { path: 'dashboard', label: 'Overview', sprint: 1 },
  { path: 'users', label: 'Users & Roles', sprint: 1 },
  { path: 'courses', label: 'Courses', sprint: 2 },
  { path: 'question-banks', label: 'Question Banks', sprint: 2 },
  { path: 'enrolments', label: 'Enrolments', sprint: 2 },
  { path: 'monitoring', label: 'Monitoring Review', sprint: 5 },
  { path: 'certificates', label: 'Certificates', sprint: 5 },
  { path: 'reports', label: 'Reports', sprint: 6 },
  { path: 'audit', label: 'Audit Log', sprint: 1 },
];
