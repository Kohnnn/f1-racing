export default function NotFound() {
  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Missing route</p>
        <h1>That session is not in the sample pack yet.</h1>
        <p className="lead">
          The app is scaffolded for static session packs. Add or generate a pack first, then revisit this route.
        </p>
        <div className="hero-actions">
          <a className="button" href="/sessions">Back to sessions</a>
        </div>
      </section>
    </div>
  );
}
