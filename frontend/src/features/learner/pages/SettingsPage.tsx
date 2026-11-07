import { useState } from 'react';
import { Toggle } from '@/components/ui';
import { Icon } from '@/components/icons';

/**
 * Figma frame 1:10 "EduComply / Settings". Preference toggles work on this page only:
 * the preferences API (PATCH /me/preferences) is a later-sprint feature, so nothing is
 * saved and the page says so. Passwords belong to the institutional identity provider.
 */
export function SettingsPage() {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [assessmentReminders, setAssessmentReminders] = useState(true);
  const [captionsByDefault, setCaptionsByDefault] = useState(true);

  return (
    <section className="settings-panel" aria-labelledby="settings-title">
      <h2 id="settings-title">Account settings</h2>
      <div className="demo-notice" role="note" style={{ marginTop: 20 }}>
        <Icon name="info" />
        <p>
          <strong>Preferences are not saved yet.</strong> Saving preferences arrives with the
          preferences API in a later sprint; changes here reset when you leave the page.
        </p>
      </div>

      <div className="settings-list">
        <Toggle
          id="setting-email"
          label="Email notifications"
          checked={emailNotifications}
          onChange={setEmailNotifications}
        />
        <Toggle
          id="setting-reminders"
          label="Assessment reminders"
          checked={assessmentReminders}
          onChange={setAssessmentReminders}
        />
        <Toggle
          id="setting-captions"
          label="Show captions by default"
          description="Accessibility preference for training videos."
          checked={captionsByDefault}
          onChange={setCaptionsByDefault}
        />
      </div>

      <h3>Change password</h3>
      <p className="settings-note">
        Your password is managed by your institution’s sign-in service (Keycloak in development),
        not by EduComply. EduComply never sees or stores your password. Use your institution’s
        account page to change it.
      </p>
    </section>
  );
}
