# Agentic Build Process — README to Finished PR
*(Adapted from Kun Chen's workflow — pairs with agentic-workflow-setup.md for tool installs)*

## 1. Setup
Start the session in **Herdr**, with **Firstmate** as the orchestrator (Claude Code as the harness). Agents run in visible panes from the start.

## 2. Slow down before coding
Invoke a "calm" mode/skill early — the goal is to stop the agent from jumping straight into code before there's a plan.

## 3. Product ideation
Talk through the idea by voice (or just describe it plainly): what the app should do and *why*, not a spec. Explain outcome + rationale, not just an action.

## 4. Write the README, then design
Write the README/plan first (the source of truth before any code is written).

From the README, design happens in two passes:
- **Lavish (`npx lavish-axi`) first** — use it to edit/iterate on the **wireframe**: open it in the browser, click directly on elements to give targeted feedback ("make this a floating overlay instead") until the layout is locked.
- **Claude Design second** — generate the **design system** from the locked wireframe: colors, typography, components, overall visual language.

## 5. Implement
- Small task → let the agent implement it directly.
- Big task → hand off to `gnhf`:
  ```
  gnhf "fully implement this plan..."
  ```
  Breaks the task into steps, each in a fresh context window, auto-rolls back failed attempts, respects a token budget.

While that runs, spin up a fresh isolated worktree for the next piece of work:
```
treehouse
```
This lets backend, frontend, etc. progress in parallel without agents stepping on each other.

## 6. Validate — never eyeball the diff
Run `no-mistakes` on every finished chunk:
```
no-mistakes -y
```
It:
- reviews the code in a **fresh context window** (unbiased reviewer — not the same session that wrote it)
- forces **end-to-end proof** the feature works (not just passing unit tests)
- auto-fixes safe/mechanical issues, escalates real product decisions to you
- commits with a conventional message, rebases onto main, opens a clean PR, and babysits CI until green

*(Kun Chen's own stats: 68% of changes pushed through no-mistakes had bugs — this step is the actual quality gate, not a formality.)*

## 7. Repeat and merge
Loop **plan → implement → validate** per feature/module until the app is done. Merge clean PRs as they land.

## Parallelization tips
- Keep each running agent's status visible in its own tab/pane title (working / blocked / done) so you can glance and jump straight to what needs you.
- Aim to have 5–10 tasks moving at once once the pipeline above is set up — most should reach a clean PR without your involvement.

## Mobile/remote continuity (optional)
Tailscale + SSH + mosh lets you reattach to the same tmux/Herdr session from your phone, so nothing pauses when you're away from your desk.
