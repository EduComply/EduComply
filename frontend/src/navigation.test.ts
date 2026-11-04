import { describe, expect, it } from 'vitest';
import { adminNav, learnerNav } from './navigation';

describe.each([
  ['learner', learnerNav],
  ['admin', adminNav],
])('%s navigation', (_name, nav) => {
  it('has unique, URL-safe paths', () => {
    const paths = nav.map((n) => n.path);
    expect(new Set(paths).size).toBe(paths.length);
    paths.forEach((p) => expect(p).toMatch(/^[a-z][a-z-]*$/));
  });

  it('starts with the dashboard', () => {
    expect(nav[0]?.path).toBe('dashboard');
  });
});
