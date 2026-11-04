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

/** Admin navigation item; `roles` limits who sees it (the API enforces the same rules). */
export interface AdminNavItem extends NavItem {
  roles: Array<'ADMIN' | 'REVIEWER'>;
}

/**
 * Admin portal (not in Figma; built from the learner design system). ADMIN manages users
 * and content; REVIEWER sees monitoring, reports and the activity overview (API Design §4).
 */
export const adminNav: AdminNavItem[] = [
  { path: 'dashboard', label: 'Dashboard', sprint: 1, roles: ['ADMIN', 'REVIEWER'] },
  { path: 'users', label: 'User Management', sprint: 1, roles: ['ADMIN'] },
  { path: 'learners', label: 'Learner Management', sprint: 1, roles: ['ADMIN'] },
  { path: 'courses', label: 'Courses', sprint: 2, roles: ['ADMIN'] },
  { path: 'videos', label: 'Videos', sprint: 3, roles: ['ADMIN'] },
  { path: 'question-banks', label: 'Question Banks', sprint: 2, roles: ['ADMIN'] },
  { path: 'monitoring', label: 'Monitoring', sprint: 5, roles: ['ADMIN', 'REVIEWER'] },
  { path: 'certificates', label: 'Certificates', sprint: 5, roles: ['ADMIN'] },
  { path: 'reports', label: 'Reports', sprint: 6, roles: ['ADMIN', 'REVIEWER'] },
  { path: 'audit', label: 'Audit Events', sprint: 1, roles: ['ADMIN', 'REVIEWER'] },
  { path: 'profile', label: 'Profile', sprint: 1, roles: ['ADMIN', 'REVIEWER'] },
];

export const adminPageTitles: Array<{ pattern: RegExp; title: string }> = [
  { pattern: /^\/admin\/users\/[^/]+$/, title: 'User details' },
  { pattern: /^\/admin\/profile$/, title: 'Administrator profile' },
];
