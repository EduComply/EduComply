import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="landing">
      <section className="card">
        <h1>Page not found</h1>
        <p className="muted">The page you requested does not exist.</p>
        <Link to="/" className="btn btn-primary">
          Go home
        </Link>
      </section>
    </div>
  );
}
