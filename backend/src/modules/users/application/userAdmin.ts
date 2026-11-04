import type { AuthUser, RequestContext } from '../../auth/application/ports.js';
import type { RoleName } from '../domain/roles.js';

export interface UserListQuery {
  q?: string;
  role?: RoleName;
  limit: number;
  cursor?: string;
}

export interface Page<T> {
  data: T[];
  page: { nextCursor: string | null; limit: number };
}

export interface ChangeRoleInput {
  actor: AuthUser;
  userId: string;
  role: RoleName;
  reason: string;
  ctx: RequestContext;
}

export type ChangeRoleError = 'NOT_FOUND' | 'SELF_CHANGE' | 'LAST_ADMIN';

export class UserAdminError extends Error {
  constructor(public readonly reason: ChangeRoleError) {
    super(reason);
    this.name = 'UserAdminError';
  }
}

/** Port for administrator user management (Prisma in the app, in-memory in tests). */
export interface UserAdminService {
  list(query: UserListQuery): Promise<Page<AuthUser>>;
  get(userId: string): Promise<AuthUser | null>;
  /** Changes the user's single role and writes an audit event in the same transaction. */
  changeRole(input: ChangeRoleInput): Promise<AuthUser>;
}
