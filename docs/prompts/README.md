# Prompt Docs

Prompt and policy text is stored here so it can be versioned and queried via CLI
without reading TypeScript route/tool files.

## Files

- `assistant-system-guidelines.md`: static assistant policy sections appended to the canvas system prompt.
- `assistant-integration-notes.md`: static integration caveats merged with runtime token availability.
- `briefing-narrative-system.md`: narrative JSON prompt for `/api/briefing`.
- `morning-brief-reasoner-system.md`: v0.2 reasoner prompt for `/api/briefing`.
- `rules-score-system.md`: classifier prompt for `/api/rules/score`.

## Useful Queries

```bash
rg "^## " docs/prompts
rg "fallback|verification|confidence" docs/prompts/*.md
rg "Slack|GitHub|PostHog|Vercel" docs/prompts/*.md
```
