# Product measurement and privacy

## Approved pilot

The pilot permits Netlify Web Analytics aggregate reports only, and only if they are already available for the production site under the existing Netlify account. Do not buy or enable another analytics service. The approved aggregate route families are:

- `/` (Unified Dashboard)
- `/race-desk`
- `/replay/*`
- `/learn/*`
- `/cars/*`

The owner may also review Netlify's aggregate referrers, 404s, bandwidth, and host-provided device categories. Host 404 aggregates are the only approved error signal. No performance RUM, Core Web Vitals, client errors, or product-side analytics records or exports are approved.

## Prohibited collection

No client events, analytics scripts, browser beacons, cookies, fingerprints, persistent IDs, browser or device IDs, or analytics-related local storage are allowed. The product must not upload query strings, URL fragments, Replay timestamps, session or race IDs, driver selections, telemetry, camera state, local progress, free text, account data, IP addresses, precise location, user-agent values, or derived identifiers.

Referrer URLs may appear only in Netlify's aggregate report. No custom event names or event properties are approved.

## Interpretation

Route reports measure aggregate page demand, not people. Do not describe host-defined unique counts as people or returning users. Pageview sequences may describe aggregate route movement only.

| Outcome | Status |
| --- | --- |
| Dashboard activation | Not measured |
| Replay activation or start | Not measured |
| Learning completion | Not measured |
| Cross-surface or person-level funnels | Not measured |
| Return use | Not measured |
| Performance RUM | Not measured |

These outcomes have no numerator, denominator, exclusions, or success threshold because the approved aggregate reports cannot establish them. Do not infer activation, completion, funnels, or return use from pageviews, and do not block a Dashboard release on them.

## Window, ownership, and decisions

Use one 30-day baseline, limited to Netlify's documented 30-day dashboard window, with no product-side retained copy. Access is limited to the product owner and the minimum Netlify site administrators required for release operations. The product owner reviews the aggregate report monthly.

Reconsider event collection only when the baseline contains at least 100 aggregate Dashboard or Replay pageviews and the owner still needs to know whether a replay began or a learning action completed. Any reconsideration requires a new privacy decision covering provider, procurement, notice, consent or opt-out behavior, retention, access, deletion, and an explicit three-event allowlist. Until then, event collection remains prohibited.

Remove access to aggregate reports when two consecutive baseline periods produce no release, content, reliability, or navigation decision.

## Visitor requests

The product stores no visitor identity or event record, so it cannot locate or delete an individual's contribution to Netlify's aggregate report. Requests must use the site operator and Netlify privacy processes; do not promise per-visitor deletion. The public notice must name a current operator privacy contact before the pilot report is used for a product decision. No verified operator privacy contact is currently documented.
