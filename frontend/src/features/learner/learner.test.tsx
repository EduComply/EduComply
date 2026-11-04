// @vitest-environment jsdom
/**
 * Learner portal screens (MOCKED GET /api/v1/me; real routes, components and demo data).
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, ME, mockFetch, renderApp, stubMedia } from '@/test/harness';

beforeEach(() => {
  mockFetch({ '/api/v1/me': () => json(200, ME) });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const pageTitle = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('dashboard', () => {
  it('welcomes the real user and summarises demo training', async () => {
    renderApp('/learner/dashboard');
    expect(await screen.findByRole('heading', { name: 'Welcome back, Lea!' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('Demonstration data');
    expect(screen.getByText('6 Assigned courses')).toBeTruthy();
    expect(screen.getByText('2 In progress')).toBeTruthy();
    expect(screen.getByText('2 Completed')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Continue learning' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Resume Machine Learning' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Overall training progress' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pending training activities' })).toBeTruthy();
  });
});

describe('navigation shell', () => {
  it('lists the Figma sidebar items in order and marks the active page', async () => {
    renderApp('/learner/dashboard');
    const nav = await screen.findByRole('navigation', { name: 'Learner portal' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Dashboard',
      'My Training',
      'Assessments',
      'My Progress',
      'Profile',
      'Settings',
      'Calendar',
    ]);
    expect(within(nav).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe(
      'page',
    );

    fireEvent.click(within(nav).getByRole('link', { name: 'My Training' }));
    expect(await pageTitle('My Training')).toBeTruthy();
    expect(
      within(nav).getByRole('link', { name: 'My Training' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(
      within(nav).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('mobile menu button toggles the drawer and Escape closes it', async () => {
    renderApp('/learner/dashboard');
    const button = await screen.findByRole('button', { name: 'Open menu' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('has a skip link and an honest notifications panel', async () => {
    renderApp('/learner/dashboard');
    expect(await screen.findByRole('link', { name: 'Skip to main content' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByRole('dialog', { name: 'Notifications' }).textContent).toContain(
      'No notifications',
    );
  });

  it('shows a 404 inside the portal for unknown learner pages', async () => {
    renderApp('/learner/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });
});

describe('My Training', () => {
  it('shows the six Figma course cards with progress and actions', async () => {
    renderApp('/learner/training');
    expect(await screen.findByRole('heading', { name: 'Assigned training courses' })).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(6);
    expect(
      screen
        .getByRole('progressbar', { name: 'Software Project progress' })
        .getAttribute('aria-valuenow'),
    ).toBe('62');
    expect(
      screen.getByRole('link', { name: 'Review Training: Workplace Safety Essentials' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start Training: Web Application' })).toBeTruthy();
  });

  it('filters by search text and status, with an empty state', async () => {
    renderApp('/learner/training');
    const search = await screen.findByRole('searchbox', { name: 'Search courses' });

    fireEvent.change(search, { target: { value: 'fire' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Fire Safety and Evacuation' })).toBeTruthy();

    fireEvent.change(search, { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by status' }), {
      target: { value: 'COMPLETED' },
    });
    expect(screen.getAllByRole('article')).toHaveLength(2);

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByRole('heading', { name: 'No courses match' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getAllByRole('article')).toHaveLength(6);
  });
});

describe('Course Player (prototype)', () => {
  it('renders the Video Learning layout with outline, controls and prototype labels', async () => {
    stubMedia();
    renderApp('/learner/training/machine-learning');
    expect(await pageTitle('Video Learning')).toBeTruthy();
    expect(screen.getByText('Prototype video · progress not tracked')).toBeTruthy();
    expect(
      screen.getByText(/Server-validated viewing progress is implemented in Sprint 3/i),
    ).toBeTruthy();

    const outline = screen.getByRole('complementary', { name: 'Course content' });
    expect(within(outline).getAllByRole('button')).toHaveLength(5);
    // Resumes at the first unwatched lesson.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Collecting data lawfully' }),
    ).toBeTruthy();
    expect(screen.getByText('Machine Learning · Lesson 3 of 5')).toBeTruthy();

    fireEvent.click(within(outline).getByRole('button', { name: /Types of personal data/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Types of personal data' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next lesson' }));
    expect(screen.getByText('Machine Learning · Lesson 3 of 5')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy());
    expect(screen.getByRole('slider', { name: 'Seek' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Captions' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    expect(screen.getByRole('link', { name: 'Take assessment' }).getAttribute('href')).toBe(
      '/learner/assessments/ml-assignment-1',
    );
  });

  it('shows an error state for an unknown course', async () => {
    renderApp('/learner/training/unknown-course');
    expect(await screen.findByRole('heading', { name: 'Course not found' })).toBeTruthy();
  });
});

describe('Assessments, Quiz and Result (demonstration)', () => {
  it('lists the four Figma assessments with status and actions', async () => {
    renderApp('/learner/assessments');
    expect(await screen.findByRole('heading', { name: 'Your assessments' })).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Start assessment: ML Assignment 1' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View result: Web Application Quiz 01' })).toBeTruthy();
    expect(screen.getAllByText('Pending')).toHaveLength(3);
  });

  it('takes the demo quiz with navigation, blocks incomplete submission and shows the result', async () => {
    renderApp('/learner/assessments/ml-assignment-1');
    expect(await pageTitle('Interactive Assessment')).toBeTruthy();
    expect(screen.getByText('Question 1 of 5')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Which of these is personal data?' })).toBeTruthy();

    // Correct answers for the demo set: B, B, C, B, B
    const correct = [1, 1, 2, 1, 1];
    fireEvent.click(screen.getAllByRole('radio')[correct[0]!]!);
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    expect(screen.getByText('Question 2 of 5')).toBeTruthy();

    // Jump to the last question and try to submit with gaps.
    fireEvent.click(screen.getByRole('button', { name: 'Question 5' }));
    fireEvent.click(screen.getByRole('button', { name: /Submit/ }));
    expect(screen.getByRole('alert').textContent).toContain('Question 2 is unanswered');
    expect(screen.getByText('Question 2 of 5')).toBeTruthy();

    for (let i = 1; i < 5; i++) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Question ${i + 1}`) }));
      fireEvent.click(screen.getAllByRole('radio')[correct[i]!]!);
    }
    expect(screen.getByRole('button', { name: 'Question 1, answered' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Submit \(5\/5 answered\)/ }));

    expect(await pageTitle('Assessment Results')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('PASSED')).toBeTruthy();
    expect(screen.getByText(/5 correct\s+·\s+0 incorrect\s+·\s+Pass mark 60%/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Review Answers' }));
    expect(screen.getAllByText('(correct)')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toBeTruthy();
  });

  it('a failing demo attempt shows NOT PASSED with the correct answers', async () => {
    renderApp('/learner/assessments/computer-architecture-quiz-02');
    await pageTitle('Interactive Assessment');
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Question ${i + 1}`) }));
      fireEvent.click(screen.getAllByRole('radio')[0]!);
    }
    fireEvent.click(screen.getByRole('button', { name: /Submit/ }));
    expect(await screen.findByText('NOT PASSED')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review Answers' }));
    expect(screen.getAllByText(/Correct answer:/).length).toBeGreaterThan(0);
  });

  it('the result page without an attempt shows an empty state', async () => {
    renderApp('/learner/assessments/ml-assignment-1/result');
    expect(await screen.findByRole('heading', { name: 'No result to show' })).toBeTruthy();
  });
});

describe('My Progress', () => {
  it('shows summary tiles, an accessible chart and completion history', async () => {
    renderApp('/learner/progress');
    expect(await screen.findByText('73% Average Score')).toBeTruthy();
    expect(screen.getByText('2 Completed Courses')).toBeTruthy();
    expect(
      screen.getByRole('img', { name: /Average assessment score by month: May 45%/ }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Completion history' })).toBeTruthy();
    expect(screen.getAllByText('Fire Safety and Evacuation').length).toBeGreaterThan(0);
  });
});

describe('Profile and Settings', () => {
  it('profile shows real /me details and marks unavailable fields', async () => {
    renderApp('/learner/profile');
    expect(await pageTitle('Profile')).toBeTruthy();
    expect(screen.getAllByText('Lea Learner').length).toBeGreaterThan(0);
    expect(screen.getAllByText('learner1@educomply.test').length).toBeGreaterThan(0);
    expect(screen.getByText('Student')).toBeTruthy();
    expect(screen.getAllByText('Not provided by your institution')).toHaveLength(2);
    expect(
      (screen.getByRole('button', { name: 'Edit Profile' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('settings toggles are accessible switches and clearly not saved', async () => {
    renderApp('/learner/settings');
    expect(await screen.findByRole('heading', { name: 'Account settings' })).toBeTruthy();
    expect(screen.getByText(/Preferences are not saved yet/)).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: 'Email notifications' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(/EduComply never sees or stores your password/)).toBeTruthy();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });
});

describe('Calendar', () => {
  it('shows the current month with demo events, navigation and an empty month', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T10:00:00'));
    renderApp('/learner/calendar');

    expect(await screen.findByRole('heading', { name: 'November 2026' })).toBeTruthy();
    expect(
      screen.getByLabelText(
        /Thursday 5 November: Assessment deadline — Web Application — Assessment 1/,
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Wednesday 4 November, today/)).toBeTruthy();
    const upcoming = screen
      .getByRole('heading', { name: 'Upcoming activities' })
      .closest('section')!;
    expect(within(upcoming).getByText(/Web Application — Assessment 1/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeTruthy();
    expect(
      screen.getByLabelText(/Wednesday 28 October: Assessment deadline — ML Assignment 1/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'December 2026' })).toBeTruthy();
    expect(screen.getByText('No scheduled training or deadlines in December 2026.')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'December 2026 days' })).toBeTruthy();
  });
});
