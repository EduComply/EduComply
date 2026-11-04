export interface NavItem {
  /** Path relative to the portal root, e.g. "training" → /learner/training */
  path: string;
  label: string;
  /** Sprint (proposal v1.1) in which the screen's data becomes real (backend APIs). */
  sprint: number;
}

/** Learner navigation — order and labels from the Figma sidebar (frames 1:2–1:11). */
export const learnerNav: NavItem[] = [
  { path: 'dashboard', label: 'Dashboard', sprint: 2 },
  { path: 'training', label: 'My Training', sprint: 2 },
  { path: 'assessments', label: 'Assessments', sprint: 4 },
  { path: 'progress', label: 'My Progress', sprint: 4 },
  { path: 'profile', label: 'Profile', sprint: 1 },
  { path: 'settings', label: 'Settings', sprint: 6 },
  { path: 'calendar', label: 'Calendar', sprint: 6 },
];

/**
 * Top-bar titles for nested learner pages (Figma frame titles). The sidebar keeps the
 * parent section active, e.g. the course player highlights "My Training".
 */
export const learnerPageTitles: Array<{ pattern: RegExp; title: string }> = [
  { pattern: /^\/learner\/training\/[^/]+$/, title: 'Video Learning' },
  { pattern: /^\/learner\/assessments\/[^/]+\/result$/, title: 'Assessment Results' },
  { pattern: /^\/learner\/assessments\/[^/]+$/, title: 'Interactive Assessment' },
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
