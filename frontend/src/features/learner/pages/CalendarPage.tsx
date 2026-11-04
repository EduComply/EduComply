import { useMemo, useState } from 'react';
import { Card, DemoNotice } from '@/components/ui';
import { Icon } from '@/components/icons';
import { isoDay } from '@/lib/format';
import { demoCalendarEvents, kindLabel, type DemoCalendarEvent } from '../demoData';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Figma frame 1:11 "EduComply / Calendar". */
export function CalendarPage() {
  const today = new Date();
  const todayKey = isoDay(today);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthName = cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const byDay = useMemo(() => {
    const map = new Map<string, DemoCalendarEvent[]>();
    for (const e of demoCalendarEvents) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, []);

  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthEvents = demoCalendarEvents.filter((e) =>
    e.date.startsWith(isoDay(cursor).slice(0, 7)),
  );
  const upcoming = demoCalendarEvents
    .filter((e) => e.date >= todayKey && e.kind !== 'completed')
    .slice(0, 4);

  const move = (delta: number) => setCursor(new Date(year, month + delta, 1));

  return (
    <>
      <DemoNotice>
        Scheduled activities are sample dates; training schedules come from course enrolments in
        Sprint 2.
      </DemoNotice>
      <div className="calendar-layout">
        <section aria-labelledby="calendar-month">
          <div className="calendar-header">
            <h2 id="calendar-month" aria-live="polite">
              {monthName}
            </h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Previous month"
              onClick={() => move(-1)}
            >
              <Icon name="chevronLeft" />
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            >
              Today
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Next month"
              onClick={() => move(1)}
            >
              <Icon name="chevronRight" />
            </button>
          </div>

          <ul className="month-grid" aria-label={`${monthName} days`}>
            {WEEKDAYS.map((d) => (
              <li key={d} className="weekday" aria-hidden="true">
                {d}
              </li>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <li key={`blank-${i}`} className="day outside" aria-hidden="true" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const key = isoDay(new Date(year, month, day));
              const events = byDay.get(key) ?? [];
              const label = new Date(year, month, day).toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              });
              return (
                <li
                  key={key}
                  className={`day ${key < todayKey ? 'past' : ''} ${key === todayKey ? 'today' : ''}`}
                  aria-label={`${label}${key === todayKey ? ', today' : ''}${
                    events.length
                      ? `: ${events.map((e) => `${kindLabel[e.kind]} — ${e.title}`).join('; ')}`
                      : ''
                  }`}
                >
                  <span className="day-number" aria-hidden="true">
                    {day}
                  </span>
                  {events.length > 0 && (
                    <span className="events" aria-hidden="true">
                      {events.map((e) => (
                        <span
                          key={e.title}
                          className={`event-bar event-${e.kind}`}
                          title={e.title}
                        />
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {monthEvents.length === 0 && (
            <p className="muted" style={{ margin: '20px 0 0 30px' }}>
              No scheduled training or deadlines in {monthName}.
            </p>
          )}
        </section>

        <div className="stack" style={{ alignContent: 'start' }}>
          <Card title="Upcoming activities">
            {upcoming.length === 0 ? (
              <p className="muted">Nothing scheduled.</p>
            ) : (
              <ul className="upcoming-list">
                {upcoming.map((e, i) => (
                  <li key={e.title}>
                    <p className={`date ${i === 0 ? 'soon' : ''}`}>
                      {new Date(`${e.date}T00:00:00`).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </p>
                    <p className="title">
                      {e.title} <span className="sr-only">({kindLabel[e.kind]})</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Legend">
            <ul className="legend">
              {(['training', 'deadline', 'completed'] as const).map((k) => (
                <li key={k}>
                  <span className={`swatch event-${k}`} aria-hidden="true" />
                  {kindLabel[k]}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
