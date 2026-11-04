/** Application roles (Initial API Design §4). Stored in the ROLE table; one role per user (ER). */
export const ROLE_NAMES = ['LEARNER', 'ADMIN', 'REVIEWER'] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  LEARNER: 'Own enrolments, playback, attempts and certificates',
  ADMIN: 'Content, users, enrolments and settings',
  REVIEWER: 'Monitoring flag review, reports and audit',
};

/** Role given to a newly provisioned institutional user. Elevated roles are granted explicitly. */
export const DEFAULT_ROLE: RoleName = 'LEARNER';

export function isRoleName(value: string): value is RoleName {
  return (ROLE_NAMES as readonly string[]).includes(value);
}
