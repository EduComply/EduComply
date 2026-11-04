import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui';

/** 404. `embedded` renders inside a portal shell instead of a full page. */
export function NotFoundPage({ embedded = false }: { embedded?: boolean }) {
  const body = (
    <EmptyState
      title="Page not found"
      message="The page you requested does not exist."
      action={
        <Link to={embedded ? '/learner/dashboard' : '/'} className="btn btn-primary">
          {embedded ? 'Go to dashboard' : 'Go home'}
        </Link>
      }
    />
  );
  if (embedded) return body;
  return (
    <div className="landing">
      <section className="card">{body}</section>
    </div>
  );
}
