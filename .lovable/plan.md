# Portfolio charts, live pricing, and AI assistant

## Build
- Finish dashboard charts for account growth, allocation, capital/profit composition, and per-stock performance.
- Add an AI portfolio assistant with multiple conversation threads saved securely inside each owner's account.
- Give the assistant the complete current holdings, transaction ledger, cash history, prices, settings, and calculated totals on every question so its explanations are grounded in the user's own data.
- Add a thread list, new-conversation action, dedicated conversation URLs, streamed answers, loading/error states, and markdown rendering.
- Add database tables for conversations and messages with owner-only access policies.
- Add a signed-in server endpoint that verifies conversation ownership before reading data, calling Lovable AI, or saving replies.

## Egyptian market prices
- Add a refresh action and clear price-source timestamps.
- Use live prices only when a reliable source provides genuinely current EGX data; do not label delayed or stale feeds as live.
- Keep manual prices as the safe fallback and clearly distinguish them from external quotes.

## Verify
- Test two separate conversations, send a question in each, reload both pages, and confirm their histories remain separate.
- Test desktop and mobile layouts, chart rendering, price refresh behavior, and signed-in access controls.

## Technical details
- Stream through the Lovable AI Gateway using `openai/gpt-6-astra` and the Responses API with complete inline history.
- Use AI Elements for the transcript and composer.
- Store thread IDs in dedicated routes and keep message IDs separate from database UUIDs.
