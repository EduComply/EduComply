# Figma analysis — "EduComply — Learner Portal (Recreated)"

Source: https://www.figma.com/design/G4Tydev3HmM7kr5yGXpogo

> **Accuracy note.** The Figma file requires a signed-in session to read frames and styles. This analysis is based on the file's public preview image (10 frames on one page). Screen names, layout and component patterns are reliable; **colour values and typography are approximations**. Replace the values in [frontend/src/styles/tokens.css](../../frontend/src/styles/tokens.css) with the exact Figma styles (Dev Mode → Inspect, or an exported token file) before building pixel-accurate screens.

## Screens in the file

| #   | Screen            | Key content                                                                                                | Route (planned)                   | Sprint |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------- | ------ |
| 1   | Dashboard         | Welcome banner with CTA, stat tiles, "continue learning" progress card, percentage summary, upcoming items | `/learner/dashboard`              | 2      |
| 2   | My Training       | Grid of course cards (icon tile, title, progress, primary button)                                          | `/learner/training`               | 2      |
| 3   | Course player     | Dark video area, course/lesson side panel, progress and action button                                      | `/learner/training/:courseId`     | 3      |
| 4   | Assessments       | List of assessment cards with status and action buttons                                                    | `/learner/assessments`            | 4      |
| 5   | Quiz question     | Question text, single-choice options, next/submit button                                                   | `/learner/assessments/:id`        | 4      |
| 6   | Assessment result | Large score (e.g. 80 %), pass state in green, retry / continue buttons                                     | `/learner/assessments/:id/result` | 4      |
| 7   | My Progress       | Summary stats and bar chart (red → amber → green by completion)                                            | `/learner/progress`               | 4      |
| 8   | Profile           | Avatar, name and role, read-only identity details                                                          | `/learner/profile`                | 1      |
| 9   | Settings          | Preference rows with toggle switches                                                                       | `/learner/settings`               | 6      |
| 10  | Calendar          | Month grid with due dates, upcoming deadline list                                                          | `/learner/calendar`               | 6      |

## Navigation pattern

- **Left sidebar** (fixed, full height): logo at top, vertical nav list, active item highlighted, action/sign-out at bottom. Dark blue gradient background.
- **Top bar**: page title on the left; notifications and user avatar on the right.
- **Content area**: light grey background, white cards on a grid.
- Implemented as the shared `AppShell` component ([frontend/src/components/layout/AppShell.tsx](../../frontend/src/components/layout/AppShell.tsx)); nav items in [frontend/src/navigation.ts](../../frontend/src/navigation.ts).

## Reusable components identified

| Component                   | Used on                          | Notes                                                          |
| --------------------------- | -------------------------------- | -------------------------------------------------------------- |
| `AppShell`                  | all screens                      | Sidebar + top bar + content outlet (**built**)                 |
| `Sidebar` / `NavItem`       | all screens                      | Active state, icon + label                                     |
| `Topbar`                    | all screens                      | Title, notifications, avatar menu                              |
| `Card`                      | all screens                      | White, rounded, subtle shadow (**CSS built**)                  |
| `Button`                    | all screens                      | Primary (blue), accent (teal/green), secondary (**CSS built**) |
| `StatTile`                  | Dashboard, Progress, Assessments | Label, large value, optional delta                             |
| `ProgressBar`               | Dashboard, Training, Player      | Linear, percentage label                                       |
| `CourseCard`                | Training, Dashboard              | Icon tile, title, meta, progress, CTA                          |
| `Badge`                     | Assessments, Result              | Pass / fail / pending (**CSS built**)                          |
| `ScoreRing` / score display | Result, Dashboard                | Large % with pass colour                                       |
| `OptionList` (radio)        | Quiz                             | Keyboard-accessible single choice                              |
| `BarChart`                  | Progress                         | Colour by completion band                                      |
| `Toggle`                    | Settings                         | Accessible switch (`role="switch"`)                            |
| `CalendarMonth`             | Calendar                         | Month grid with markers                                        |
| `Avatar`                    | Top bar, Profile                 | Initials fallback                                              |

## Design tokens (approximate)

| Token                  | Value                             | Use                                |
| ---------------------- | --------------------------------- | ---------------------------------- |
| `--ec-navy-800/900`    | `#1e3a8a` → `#0f1f5c`             | Sidebar gradient, brand            |
| `--ec-blue-600`        | `#2563eb`                         | Primary buttons, links, focus ring |
| `--ec-teal-500`        | `#14b8a6`                         | Accent buttons, course icon tiles  |
| `--ec-success`         | `#16a34a`                         | Pass score, completed, toggles on  |
| `--ec-warning`         | `#f59e0b`                         | Mid progress                       |
| `--ec-danger`          | `#dc2626`                         | Low progress, fail                 |
| `--ec-bg`              | `#f5f7fb`                         | Page background                    |
| `--ec-surface`         | `#ffffff`                         | Cards                              |
| `--ec-text` / `-muted` | `#0f172a` / `#64748b`             | Body / secondary text              |
| Font                   | Inter, system sans-serif fallback | To confirm in Figma                |
| Type scale             | 12 / 14 / 16 / 18 / 24 / 32 px    | Labels → page headings             |
| Radius                 | 6 / 10 / 14 px                    | Inputs & buttons / tiles / cards   |

## Admin portal plan (not in Figma — to be designed)

The admin portal reuses the same `AppShell`, tokens and components so both portals read as one product. Differences: an "Admin" label in the sidebar footer and denser data tables.

| Screen            | Route                   | Sprint | New components needed                                           |
| ----------------- | ----------------------- | ------ | --------------------------------------------------------------- |
| Overview          | `/admin/dashboard`      | 1      | `StatTile`, recent activity list                                |
| Users & Roles     | `/admin/users`          | 1      | `DataTable`, `RoleSelect`, confirm dialog with reason (audited) |
| Audit Log         | `/admin/audit`          | 1      | `DataTable`, filters                                            |
| Courses           | `/admin/courses`        | 2      | Course form, version list                                       |
| Question Banks    | `/admin/question-banks` | 2      | Question editor                                                 |
| Enrolments        | `/admin/enrolments`     | 2      | Assignment picker                                               |
| Monitoring Review | `/admin/monitoring`     | 5      | Flag detail, decision + reason                                  |
| Certificates      | `/admin/certificates`   | 5      | Revoke dialog                                                   |
| Reports           | `/admin/reports`        | 6      | Filter bar, CSV/PDF export                                      |

Next step for design: create the admin frames in the same Figma file (or a sibling page) using these tokens, starting with Overview, Users & Roles and Audit Log for Sprint 1.

## Accessibility requirements carried into components (proposal §14.3)

Visible focus ring on every interactive element, keyboard-operable nav/quiz/toggles, labelled controls, WCAG AA contrast (check teal-on-white text — use teal for fills, not small text), captions for video.
