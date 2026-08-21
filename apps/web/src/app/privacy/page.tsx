export const metadata = {
  title: "Privacy",
  description: "How F1 Racing uses privacy-preserving aggregate site reports.",
};

export default function PrivacyPage() {
  return (
    <div className="page-stack">
      <section className="hero hero--compact" aria-labelledby="privacy-title">
        <p className="eyebrow">Privacy</p>
        <h1 id="privacy-title">Aggregate site reports, without client tracking.</h1>
        <p className="lead">
          F1 Racing may use Netlify Web Analytics aggregate reports to understand route demand, referrers, 404s,
          bandwidth, and broad device categories. No analytics script is added to your browser.
        </p>
      </section>

      <section className="panel" aria-labelledby="collection-title">
        <h2 id="collection-title">What is and is not measured</h2>
        <p>
          Approved reports cover aggregate visits to the Dashboard, Race Desk, Replay, Learn, and Cars route
          families. They measure page demand, not identifiable people or individual journeys.
        </p>
        <p>
          We do not send client events, cookies, identifiers, query strings, URL fragments, Replay timestamps,
          session or race IDs, driver selections, telemetry, camera state, local learning progress, or free text.
          We do not use browser beacons, fingerprints, persistent IDs, client error reporting, or performance RUM.
        </p>
        <p>
          Dashboard activation, Replay starts, learning completion, cross-surface funnels, and return use are not
          measured and are not inferred from pageviews.
        </p>
      </section>

      <section className="panel" aria-labelledby="retention-title">
        <h2 id="retention-title">Retention, access, and requests</h2>
        <p>
          This is a 30-day pilot. F1 Racing keeps no product-side analytics copy. Access is limited to the product
          owner and the minimum Netlify site administrators required for release operations, with monthly review by
          the product owner.
        </p>
        <p>
          Because F1 Racing stores no visitor identity or event record, it cannot find or delete an individual
          contribution to an aggregate report. Privacy requests must be handled through the site operator and
          Netlify privacy processes. A verified operator privacy contact is not currently published; the aggregate
          report must not be used for a product decision until one is provided here.
        </p>
      </section>
    </div>
  );
}
