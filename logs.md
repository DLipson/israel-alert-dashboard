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
