# Agentic Canvas - Slack Mentions + Transforms Audit Plan

## Scope
Audit the Slack data path and the new transform-aware tooling with emphasis on error visibility and recovery behavior when Slack mentions require a user token.

## Subsystems
| # | Subsystem | Files | Side Effects | Priority |
|---|-----------|-------|--------------|----------|
| 1 | Slack API Route | `src/app/api/slack/route.ts` | Network | High |
| 2 | Data Fetching + Cache + Transforms | `src/store/data-slice.ts` | Network, in-memory state | High |
| 3 | Assistant Tool Execution | `src/lib/canvas-tools.tsx` | State mutation, network trigger | High |
| 4 | AI Prompt + Canvas Context | `src/lib/ai-tools.ts`, `src/lib/canvas-context.ts`, `src/components/chat/AssistantProvider.tsx`, `src/app/api/chat/route.ts` | Prompt generation | High |
| 5 | Component Error Rendering | `src/components/canvas/ComponentContent.tsx` | UI rendering | Low |

## Methodology
- Trace Slack mentions request from tool call → data binding → API route → error surfaced to UI and system prompt.
- Verify error propagation paths are awaited and surfaced in both tool output and prompt context.
- Validate prompt accuracy for Slack token requirements and fallback guidance.

## Known Issue Under Investigation
Slack mentions request fails with:
"Mentions feature requires a User OAuth Token (xoxp-). Bot tokens cannot use the search API. Use Channel Activity instead, or set up OAuth to get a user token."

The assistant currently adds the component but does not respond to the error or offer the channel-activity + transform fallback.
