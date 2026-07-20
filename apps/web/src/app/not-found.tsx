export default function NotFound() {
  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Page unavailable</p>
        <h1>We could not find that session.</h1>
        <p className="lead">
          The replay may not be available in the current library, or this link may be out of date.
        </p>
        <div className="hero-actions">
          <a className="button" href="/replay">Back to replay library</a>
        </div>
      </section>
    </div>
  );
}
