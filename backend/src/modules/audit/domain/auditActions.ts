/** Audit action names (dot-separated `<resource>.<event>`). Extend as features are added. */
export const AuditAction = {
  UserCreated: 'user.created',
  UserRoleChanged: 'user.role_changed',
  IdentityLinked: 'identity.linked',
  AuthLogin: 'auth.login',
  AuthLoginDenied: 'auth.login_denied',
  AuthLogout: 'auth.logout',
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];
