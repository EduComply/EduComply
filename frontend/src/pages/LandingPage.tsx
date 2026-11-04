import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/authContext';
import { loginUrl } from '@/auth/session';
import { ApiStatus } from '@/components/ApiStatus';
import { config } from '@/config';
import logo from '@/assets/figma/educomply-logo.png';

/** Messages for ?authError=<code> set by the API after a failed sign-in (no details exposed). */
const AUTH_ERRORS: Record<string, string> = {
  LOGIN_CANCELLED: 'Sign-in was cancelled.',
  LOGIN_EXPIRED: 'Your sign-in attempt expired. Please try again.',
  LOGIN_FAILED: 'Sign-in could not be completed. Please try again.',
  IDP_UNAVAILABLE: 'The institutional sign-in service is unavailable. Try again shortly.',
  EMAIL_NOT_VERIFIED: 'Your institutional account has no verified email address.',
  ACCOUNT_DISABLED: 'Your EduComply account is disabled. Contact an administrator.',
  IDENTITY_CONFLICT: 'This email is already linked to another institutional account.',
  SERVICE_UNAVAILABLE: 'EduComply is temporarily unavailable. Try again shortly.',
};

/** Entry page. Sign-in is a full-page navigation to the API, which redirects to the IdP. */
export function LandingPage() {
  const [params] = useSearchParams();
  const authError = params.get('authError');
  const { state } = useAuth();
  const signedIn = state.status === 'authenticated' ? state.user : null;

  return (
    <div className="landing">
      <section className="card">
        <div className="landing-logo-wrap">
          <img className="landing-logo" src={logo} alt="" width={213} height={71} />
        </div>
        <h1>{config.appName}</h1>
        <p className="muted">Institutional video training and interactive assessment platform</p>
        {authError && (
          <p role="alert" className="badge badge-danger">
            {AUTH_ERRORS[authError] ?? AUTH_ERRORS.LOGIN_FAILED}
          </p>
        )}
        <ApiStatus />
        <div className="landing-actions">
          {signedIn ? (
            <>
              <p>
                Signed in as <strong>{signedIn.displayName}</strong> ({signedIn.roles.join(', ')})
              </p>
              <Link to={signedIn.homePath} className="btn btn-primary">
                {signedIn.portals.includes('admin') ? 'Go to admin portal' : 'Go to learner portal'}
              </Link>
            </>
          ) : (
            // No fixed returnTo: the server picks the portal for the user's role.
            <a href={loginUrl()} className="btn btn-primary">
              Sign in with institutional account
            </a>
          )}
        </div>
        <div className="landing-actions">
          <Link to="/learner" className="btn btn-secondary">
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
