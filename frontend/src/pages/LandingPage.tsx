import { Link } from 'react-router-dom';
import { ApiStatus } from '@/components/ApiStatus';
import { config } from '@/config';

/** Entry page. Institutional sign-in (OpenID Connect) replaces the portal links in feature/auth-oidc. */
export function LandingPage() {
  return (
    <div className="landing">
      <section className="card">
        <h1>{config.appName}</h1>
        <p className="muted">Institutional video training and interactive assessment platform</p>
        <ApiStatus />
        <div className="landing-actions">
          <Link to="/learner" className="btn btn-primary">
            Learner portal
          </Link>
          <Link to="/admin" className="btn btn-secondary">
            Admin portal
          </Link>
        </div>
      </section>
    </div>
  );
}
