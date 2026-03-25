# 2026-03-15 — Feed refresh stalled + client-side OREF filtering option
- Bug: Emess feed UI did not update for hours unless the page reloaded or filters toggled.
- Root Cause: The feed render logic treated the first item as the "most recent" without sorting, so if the API returned oldest-first, the most recent ID never changed.
- Fix: Added a shared feed utility to sort feed items by date descending before determining updates.
- Verification: Added and ran `tests/feed-utils.test.js`.

# 2026-03-15 — Optional client-side OREF filtering
- Bug: Developer tools no longer offered a way to fetch all alerts and apply location filtering in the browser.
- Root Cause: The city filter moved fully to server-side query parameters with no client-only alternative in the endpoint selector.
- Fix: Added a developer endpoint option that fetches all alerts and applies location filtering in the UI.
- Verification: Manual toggle via the developer endpoint selector.

# 2026-03-16 — OREF UI misses updates when latest alert is unchanged
- Bug: The OREF list sometimes failed to refresh even though the response payload changed.
- Root Cause: The UI only compared the most recent alert ID, so changes to older alerts did not trigger a re-render.
- Fix: Added a stable alert list fingerprint and used it to detect any changes in the visible alerts.
- Verification: Added and ran `tests/alert-utils.test.js`.

# 2026-03-25 — Repeat live alert re-triggers sound + UI refresh
- Bug: The UI re-rendered and re-triggered alert sounds for the same live alert on every poll.
- Root Cause: Live alerts without a parseable timestamp were assigned `new Date()` on each fetch, changing the alert fingerprint and most-recent date every poll. Numeric IDs were FILETIME ticks and were being mis-parsed as epoch seconds.
- Fix: Parse FILETIME tick IDs using BigInt, only parse date-like strings, and fall back to a stable identifier when no timestamp is available.
- Verification: Added and ran `tests/proxy.test.mjs` plus full test run (`tests/*.test.js`, `tests/*.test.mjs`).
