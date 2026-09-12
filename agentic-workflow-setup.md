# Agentic Coding Workflow — Setup Notes
*(Kun Chen's workflow, adapted to run with Claude Code instead of Pi)*

## Stack
| Tool | Role | Repo |
|---|---|---|
| **Herdr** | Terminal multiplexer — runs each agent in its own visible pane | `github.com/herdrdev/herdr` |
| **Firstmate** | Orchestrator — you talk to one agent ("first mate"), it dispatches "crewmates" | `github.com/kunchenguid/firstmate` |
| **Claude Code** | Your agent CLI (swap-in for Pi) | via Claude |
| **no-mistakes** | Git push gate — AI review/test/docs/lint before opening a PR | `github.com/kunchenguid/no-mistakes` |
| **gnhf** | "Good night, have fun" — autonomous overnight agent runs | `github.com/kunchenguid/gnhf` |
| **lavish-axi** | Turns AI-generated HTML into an annotatable review page | `github.com/kunchenguid/lavish-axi` |

## Install order

```bash
# 1. Herdr (the runtime everything else sits on)
curl -fsSL https://herdr.dev/install.sh | sh
herdr integration install claude

# 2. Firstmate (clone into your project, or wherever you keep dev tooling)
git clone https://github.com/kunchenguid/firstmate

# 3. no-mistakes (per-repo git quality gate)
curl -fsSL https://raw.githubusercontent.com/kunchenguid/no-mistakes/main/docs/install.sh | sh
# then inside each project repo:
no-mistakes init

# 4. gnhf (autonomous runs)
npm install -g gnhf

# 5. lavish-axi — no install, just run when needed
npx -y lavish-axi <html-file>
```

## Using it on a new project
1. `cd` into the project, run `herdr` to start your session.
2. Launch **Firstmate** with Claude Code as the harness — you become the captain, Claude Code is the first mate, dispatching sub-agents into their own Herdr panes/worktrees.
3. Push work through `no-mistakes` instead of `origin` so every PR is gated (review → test → docs → lint) before it opens.
4. For overnight/unattended work, hand a task to `gnhf` with `--agent claude` (or whichever flag targets Claude Code).
5. If Claude Code produces a rich HTML plan/report you want to review visually, open it with `lavish-axi` to annotate and send feedback back.

## Notes / gotchas
- `pi-herdr` is Pi-specific — skip it. Claude Code slots directly into Herdr and Firstmate without needing an equivalent plugin.
- `no-mistakes` needs a real git remote configured — set it up per-repo with `no-mistakes init`.
- Firstmate is a directory-based "agent distro," not something with a global installer — clone it fresh per project or keep one copy and point projects at it.
