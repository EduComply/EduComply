# Figma — "EduComply — Learner Portal (Recreated)"

Source: https://www.figma.com/design/G4Tydev3HmM7kr5yGXpogo (page 1, frames `1:2`–`1:11`, each 1440×900).

**Verified (Task 5).** Values were read through the Figma MCP integration (`get_design_context`, `get_metadata`, screenshots) from the actual layers — exact fills, gradients, font sizes/weights, radii and geometry. The file defines no Figma variables or shared styles, so the tokens in [frontend/src/styles/tokens.css](../../frontend/src/styles/tokens.css) are the literal layer values. Assets (logo, icons, avatar, toggle knob, play icon) were downloaded from the file into `frontend/src/assets/figma/` unchanged.

## Screens → routes

| Frame  | Figma name             | Route                                       | Component                              |
| ------ | ---------------------- | ------------------------------------------- | -------------------------------------- |
| `1:2`  | Dashboard              | `/learner/dashboard`                        | `features/learner/pages/DashboardPage` |
| `1:3`  | My Training            | `/learner/training`                         | `TrainingPage`                         |
| `1:4`  | Video Learning         | `/learner/training/:courseId`               | `CoursePlayerPage` + `VideoPlayer`     |
| `1:5`  | Assessments            | `/learner/assessments`                      | `AssessmentsPage`                      |
| `1:6`  | Interactive Assessment | `/learner/assessments/:assessmentId`        | `QuizPage`                             |
| `1:7`  | Assessment Results     | `/learner/assessments/:assessmentId/result` | `ResultPage`                           |
| `1:8`  | My Progress            | `/learner/progress`                         | `ProgressPage`                         |
| `1:9`  | Profile                | `/learner/profile`                          | `ProfilePage` (real `GET /me` data)    |
| `1:10` | Settings               | `/learner/settings`                         | `SettingsPage`                         |
| `1:11` | Calendar               | `/learner/calendar`                         | `CalendarPage`                         |

The shared frame "Layout / Sidebar + Header" is `components/layout/AppShell`.

## Verified tokens (excerpt)

| Element                          | Figma value                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Sidebar (236 px)                 | `linear-gradient(97.3deg, #2563eb 12.7%, #1e40af 53.7%, #0f235c 87.3%)`             |
| Active nav item                  | `#315db1`, 200×48, radius 7; label Inter 16 Bold white                              |
| Log out button                   | `#2563eb`, radius 8, red logout icon asset                                          |
| Top bar                          | `#f7f9fc`, height 76; title Inter 24 Bold `#1b2940`                                 |
| Avatar (small / large)           | `#87a8e0` 34 px, initials 12 Bold `#1f3361` / `#88a9e1` 110 px                      |
| Welcome banner                   | `#eaf5f1`, radius 18; title 27 Bold `#173e3a`                                       |
| Summary cards                    | white, radius 16; label 17 Bold; value 30 Bold `#2965e8` / `#19a653` / `#d92d32`    |
| Primary / success / teal buttons | `#365fa8` / `#16a34a` / `#19a5a2`, height 42, radius 8, label 14 Bold               |
| Progress (dashboard, quiz)       | track `#e5eefa`, fill `#137f75` (overall `#84c43d`), 9 px, radius 5                 |
| Course cards                     | thumbnail `#d8eee8` radius 12; track `#94b0e4`, fill `#ff7914` (100%: `#e3292e`)    |
| Video player                     | `#19283d`, radius 18; selected lesson `#e5eefc`                                     |
| Assessment pill                  | `#fff0d9` / `#b94c00`, height 32, radius 16                                         |
| Quiz answers                     | `#f7f9fc`, selected `#e5eefc`, 59 px, radius 10; question 25 Bold                   |
| Result                           | score 72 Bold `#11833e`, verdict 24 Bold                                            |
| Chart bars                       | 55 px, radius 7: `#e3292e`, `#f0b900`, `#ff7914`, `#83cf0b`, `#16a34a`              |
| Calendar                         | day `#ecf3ff` radius 8; training `#2865e8`, deadline `#e47800`, completed `#137e75` |
| Toggle                           | `#16a34a`, 64×30, radius 18, white knob asset                                       |
| Typography                       | Inter (self-hosted via `@fontsource/inter`), Regular 400 / Bold 700                 |

## Deliberate deviations from the frames

- **Layout is responsive**, not absolutely positioned: grids and flex reproduce the 1440 px frames; below 960 px the sidebar becomes an off-canvas drawer (menu button, Escape to close, focus return).
- **Demonstration labels** are added on screens whose data belongs to later sprints (courses, progress, assessments, calendar). Nothing is persisted.
- **Video player** adds controls (play/pause, seek, time, mute, captions, speed, full screen) and a "Prototype video · progress not tracked" label; the frame shows only a play icon.
- **Quiz** adds Previous and question-number navigation and a Submit step; **Result** adds an answer review.
- **Profile** fields are read-only values from `GET /me`; "Edit Profile" is disabled (identity data comes from the institution). Institution and phone are not collected, so the grid shows User type, Department, Learner ID, Last sign-in, Account status and Member since.
- **Settings → Change password**: no password fields — passwords belong to the identity provider (Keycloak), so the section explains that instead of showing inputs that could not work. Toggles are clearly marked "not saved yet".
- **Header** "Search" links to My Training search; "Notifications" opens an honest "No notifications" panel.
- **Course card colour for 100%** follows Figma (red `#e3292e`) although red usually signals a problem — flagged for design review.
- Figma node `1-12` from the shared link does not exist in the file; the ten learner frames are `1:2`–`1:11`.

## Admin portal

Not in Figma. It reuses `AppShell`, tokens and components; its screens are placeholders until later tasks and are restricted to ADMIN and REVIEWER.
