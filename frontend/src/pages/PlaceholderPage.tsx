interface PlaceholderPageProps {
  title: string;
  sprint: number;
}

/** Temporary page for screens scheduled in later branches or sprints. */
export function PlaceholderPage({ title, sprint }: PlaceholderPageProps) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted">
        This screen is planned for Sprint {sprint}. The layout and navigation are in place.
      </p>
    </section>
  );
}
