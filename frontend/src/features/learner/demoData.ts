/**
 * DEMONSTRATION DATA for the Sprint 1 learner portal.
 *
 * Course assignment, video progress, assessments and grading are later-sprint features
 * (Sprints 2–5). Until their APIs exist, the learner screens render this fixed sample
 * content, taken from the Figma frames. It is never sent to or stored in PostgreSQL and
 * is always shown under a "Demonstration data" notice. Nothing here is a learner
 * achievement or a compliance record.
 */

export type CourseStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface DemoLesson {
  id: string;
  title: string;
  durationSec: number;
  description: string;
}

export interface DemoCourse {
  id: string;
  title: string;
  description: string;
  category: string;
  progress: number;
  lessons: DemoLesson[];
  /** Lessons already watched in the demo (by index). */
  completedLessons: number;
  assessmentId?: string;
}

const dataProtectionLessons: DemoLesson[] = [
  {
    id: 'l1',
    title: 'Why data protection matters',
    durationSec: 30,
    description: 'Understand why institutions must protect personal information.',
  },
  {
    id: 'l2',
    title: 'Types of personal data',
    durationSec: 30,
    description: 'Learn to handle personal information safely.',
  },
  {
    id: 'l3',
    title: 'Collecting data lawfully',
    durationSec: 30,
    description: 'Collect only what you need, with a clear purpose and legal basis.',
  },
  {
    id: 'l4',
    title: 'Storing and sharing records',
    durationSec: 30,
    description: 'Keep records secure and share them only with authorised people.',
  },
  {
    id: 'l5',
    title: 'Reporting a data breach',
    durationSec: 30,
    description: 'Recognise a breach and report it promptly through the right channel.',
  },
];

const lessonsFor = (topic: string): DemoLesson[] =>
  ['Introduction', 'Key concepts', 'Applying the rules', 'Case study', 'Summary'].map(
    (part, i) => ({
      id: `l${i + 1}`,
      title: `${topic}: ${part}`,
      durationSec: 30,
      description: `Sample lesson ${i + 1} of the ${topic} demonstration course.`,
    }),
  );

export const demoCourses: DemoCourse[] = [
  {
    id: 'workplace-safety-essentials',
    title: 'Workplace Safety Essentials',
    description: 'Hazards, safe practices and incident reporting on campus.',
    category: 'Health and safety',
    progress: 100,
    lessons: lessonsFor('Workplace Safety'),
    completedLessons: 5,
  },
  {
    id: 'software-project',
    title: 'Software Project',
    description: 'Secure development practices for institutional software projects.',
    category: 'IT security',
    progress: 62,
    lessons: lessonsFor('Software Project'),
    completedLessons: 3,
  },
  {
    id: 'machine-learning',
    title: 'Machine Learning',
    description: 'Responsible handling of personal data in machine-learning work.',
    category: 'Data protection',
    progress: 35,
    lessons: dataProtectionLessons,
    completedLessons: 2,
    assessmentId: 'ml-assignment-1',
  },
  {
    id: 'computer-architecture',
    title: 'Computer Architecture',
    description: 'Safe use of laboratory computing equipment and shared systems.',
    category: 'IT security',
    progress: 0,
    lessons: lessonsFor('Computer Architecture'),
    completedLessons: 0,
    assessmentId: 'computer-architecture-quiz-02',
  },
  {
    id: 'fire-safety-and-evacuation',
    title: 'Fire Safety and Evacuation',
    description: 'Fire prevention, alarms and evacuation procedures.',
    category: 'Health and safety',
    progress: 100,
    lessons: lessonsFor('Fire Safety'),
    completedLessons: 5,
  },
  {
    id: 'web-application',
    title: 'Web Application',
    description: 'Protecting accounts and data in institutional web applications.',
    category: 'IT security',
    progress: 0,
    lessons: lessonsFor('Web Application'),
    completedLessons: 0,
    assessmentId: 'web-application-quiz-01',
  },
];

export function courseStatus(course: DemoCourse): CourseStatus {
  if (course.progress >= 100) return 'COMPLETED';
  if (course.progress > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

export const statusLabel: Record<CourseStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

export function findCourse(id: string | undefined): DemoCourse | undefined {
  return demoCourses.find((c) => c.id === id);
}

// ── Assessments ──────────────────────────────────────────────────────

export interface DemoQuestion {
  id: string;
  text: string;
  options: string[];
  /** Index of the correct option — demo only; real answer keys never reach the browser. */
  correct: number;
}

export interface DemoAssessment {
  id: string;
  title: string;
  courseId: string;
  minutes: number;
  passMark: number;
  status: 'PENDING' | 'PASSED';
  questions: DemoQuestion[];
  /** Pre-recorded demo answers shown by "View Result". */
  demoAnswers?: number[];
}

const q = (id: string, text: string, options: string[], correct: number): DemoQuestion => ({
  id,
  text,
  options,
  correct,
});

export const demoAssessments: DemoAssessment[] = [
  {
    id: 'ml-assignment-1',
    title: 'ML Assignment 1',
    courseId: 'machine-learning',
    minutes: 10,
    passMark: 60,
    status: 'PENDING',
    questions: [
      q(
        'q1',
        'Which of these is personal data?',
        [
          'A public holiday date',
          'A student’s home address',
          'The campus map',
          'The weather forecast',
        ],
        1,
      ),
      q(
        'q2',
        'What should you do first if you suspect a data breach?',
        [
          'Delete the affected files',
          'Report it through the institution’s breach procedure',
          'Email all students',
          'Wait to see if it happens again',
        ],
        1,
      ),
      q(
        'q3',
        'Which training dataset needs the most protection?',
        [
          'Anonymised weather readings',
          'Public course catalogue',
          'Student records with names and grades',
          'Open-source sample images',
        ],
        2,
      ),
      q(
        'q4',
        'When may personal data be shared with a third party?',
        [
          'Whenever it is convenient',
          'Only with a lawful basis and an approved agreement',
          'If the data is older than a year',
          'Never under any circumstances',
        ],
        1,
      ),
      q(
        'q5',
        'What is data minimisation?',
        [
          'Compressing files to save space',
          'Collecting only the data needed for the stated purpose',
          'Deleting all data after one day',
          'Storing data on fewer servers',
        ],
        1,
      ),
    ],
  },
  {
    id: 'web-application-quiz-01',
    title: 'Web Application Quiz 01',
    courseId: 'web-application',
    minutes: 15,
    passMark: 60,
    status: 'PASSED',
    questions: [
      q(
        'q1',
        'Which password is strongest?',
        ['password123', 'Summer2026', 'A long unique passphrase', 'Your student ID'],
        2,
      ),
      q(
        'q2',
        'What does multi-factor authentication add?',
        ['A second proof of identity', 'A longer username', 'Faster sign-in', 'Automatic logout'],
        0,
      ),
      q(
        'q3',
        'A link asks you to re-enter your university password. You should…',
        [
          'Enter it quickly',
          'Check the address and report suspected phishing',
          'Forward it to classmates',
          'Reply with your password',
        ],
        1,
      ),
    ],
    demoAnswers: [2, 0, 1],
  },
  {
    id: 'computer-architecture-quiz-02',
    title: 'Computer Architecture Quiz 02',
    courseId: 'computer-architecture',
    minutes: 20,
    passMark: 60,
    status: 'PENDING',
    questions: [
      q(
        'q1',
        'Before opening a lab computer case you should…',
        [
          'Keep it running',
          'Power it off and unplug it',
          'Remove the battery while on',
          'Ask a classmate to hold it',
        ],
        1,
      ),
      q(
        'q2',
        'Where should damaged equipment be reported?',
        ['Nowhere', 'To the lab technician or IT service desk', 'On social media', 'To a friend'],
        1,
      ),
      q(
        'q3',
        'Shared lab accounts should…',
        [
          'Use one password for everyone',
          'Be avoided in favour of individual accounts',
          'Never be logged out',
          'Store personal files',
        ],
        1,
      ),
    ],
  },
  {
    id: 'control-system-design-assignment-01',
    title: 'Control System Design Assignment 01',
    courseId: 'software-project',
    minutes: 30,
    passMark: 60,
    status: 'PENDING',
    questions: [
      q(
        'q1',
        'A safety-critical control change must be…',
        [
          'Deployed immediately',
          'Reviewed and tested before release',
          'Kept secret',
          'Applied only on weekends',
        ],
        1,
      ),
      q(
        'q2',
        'Who should approve access to production controllers?',
        ['Anyone on the team', 'The system owner', 'External visitors', 'No one needs to'],
        1,
      ),
      q(
        'q3',
        'Logs of control actions are kept to…',
        [
          'Fill the disk',
          'Provide an audit trail',
          'Slow the system down',
          'Replace documentation',
        ],
        1,
      ),
    ],
  },
];

export function findAssessment(id: string | undefined): DemoAssessment | undefined {
  return demoAssessments.find((a) => a.id === id);
}

export interface ScoredAttempt {
  correct: number;
  total: number;
  percent: number;
  passed: boolean;
}

/** Demo-only scoring in the browser. Real grading is server-side (Sprint 4). */
export function scoreAnswers(assessment: DemoAssessment, answers: number[]): ScoredAttempt {
  const total = assessment.questions.length;
  const correct = assessment.questions.filter(
    (question, i) => answers[i] === question.correct,
  ).length;
  const percent = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { correct, total, percent, passed: percent >= assessment.passMark };
}

// ── Progress and calendar ────────────────────────────────────────────

/** Monthly average assessment score (demo), as drawn in the Figma chart. */
export const demoPerformance = [
  { month: 'May', score: 45 },
  { month: 'Jun', score: 61 },
  { month: 'Jul', score: 53 },
  { month: 'Aug', score: 78 },
  { month: 'Sep', score: 91 },
  { month: 'Oct', score: 100 },
];

export const demoAverageScore = 73;

export const demoCompletionHistory = [
  { courseId: 'fire-safety-and-evacuation', completedOn: '2026-10-05' },
  { courseId: 'workplace-safety-essentials', completedOn: '2026-09-18' },
];

export type CalendarEventKind = 'training' | 'deadline' | 'completed';

export interface DemoCalendarEvent {
  date: string; // YYYY-MM-DD
  kind: CalendarEventKind;
  title: string;
}

export const demoCalendarEvents: DemoCalendarEvent[] = [
  { date: '2026-10-05', kind: 'completed', title: 'Fire Safety and Evacuation completed' },
  { date: '2026-10-16', kind: 'training', title: 'Machine Learning — live training session' },
  { date: '2026-10-28', kind: 'deadline', title: 'ML Assignment 1' },
  { date: '2026-11-05', kind: 'deadline', title: 'Web Application — Assessment 1' },
  { date: '2026-11-12', kind: 'training', title: 'Software Project — secure coding workshop' },
  { date: '2026-11-20', kind: 'deadline', title: 'Computer Architecture Quiz 02' },
];

export const kindLabel: Record<CalendarEventKind, string> = {
  training: 'Training',
  deadline: 'Assessment deadline',
  completed: 'Completed',
};

export function overallProgress(): number {
  const sum = demoCourses.reduce((acc, c) => acc + c.progress, 0);
  return Math.round(sum / demoCourses.length);
}
