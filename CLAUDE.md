# Serene Desk

- Before planning or building a phase, read `handoff.md` (§9 lists the phases, §1 the ground rules). Stop at each phase's acceptance check and show John before moving on.
- This is a demo shop for a fictional brand. It has to look real, not perfect. The mockup (`design/r3-brand-serene-desk.html`) gives the mood: dusk palette, serif display type, flat cartoon illustration, a lamp at night. It is a starting point, not a spec: good web craft (the installed `impeccable`, `hallmark`, `animate` skills and real shops) wins over it (John 2026-10-28). See `DESIGN.md`.
- Desktop only (Chrome on Windows). No mobile layout work (John 2026-10-28).

## Ground rules (from handoff §1, never bend)

- Never commit secrets. Keys live in `.env` (local) and Cloudflare secrets (relay). The repo is public: run `git diff --cached` and grep for keys before every push.
- Neutral names: repo, README, commits, issues and code mention Serene Desk only, never why the demo exists or who it's for. `handoff.md` is gitignored for that reason: it stays local, never commit it.
- Render Cowork's copy in `site/content/` exactly as given. Some of it conflicts with the help center on purpose. Never "correct" numbers, sizes or policies.
- The site is a knowledge source Zendesk crawls. So every fact is in server-rendered HTML, and **no invented facts anywhere**: no made-up reviews, stock counts, ship-from cities, guarantees or policy text to make the page feel lived-in. Missing copy gets a `[COPY PENDING: ...]` block. "Lived-in" comes from visuals and interaction, not from text Claude makes up.
- No inputs that accept card numbers. Every page footer: "Serene Desk is a fictional brand created for a product demo."
- Public widget config lives in `site/data/config.json` only. The fallback `"widget": "zendesk"` must always work.

## How work runs

- Work is planned in GitHub issues ("maps"), one per phase. Each lists scope, decisions and out-of-scope. Build only what the open maps cover. When a map is done, carry on to the next one whose decisions are already made. Only stop for work that needs John: open design questions (`grilling`), live Zendesk tests, spending or credentials, and the handoff's acceptance checks. Batch those into one checkpoint report instead of stopping for each.
- Truly new features (a capability the project doesn't have yet, not a bug fix or tweak) start with a research phase: search GitHub for open-source projects that solve it, compare their approaches, then build. Note in the issue and the commit which repos inspired the approach. Check each repo's license before reusing code: MIT/BSD/Apache can be copied with attribution; GPL/AGPL or no license means ideas only, no code.
- Agent work happens on branches in git worktrees (`isolation: "worktree"`), one per independent workstream (site, relay, widget, test runner are natural splits). Never two agents in one tree. Claude merges a branch into `main` itself once the checks pass and a separate reviewer agent (`/code-review`) finds no blockers. No PRs needed. Re-run the checks on `main` after merging several branches.
- The window John opens in `C:/dev/serene-desk` is the orchestrator: it doesn't edit code in the main checkout beyond small doc tweaks. Each ticket goes to a subagent with `isolation: "worktree"`, and its first step is `git branch -m issue-<number>` so the tracker links the worktree to its issue. Claude creates, merges, deletes the branch, and cleans up. A worktree left behind by an interrupted subagent shows in the tracker; pick it up from there.
- Progress bar: if `mcp__savvy-progress__progress` is available (load it with ToolSearch if deferred), the orchestrator calls it once the tickets are planned (`title`, `total`, `tasks` as `[{title, tier: "sonnet", after}]`, `phase: "delegate"`), with `done` after each merge into `main`, and with `finished: true` at the checkpoint report. Pass each task's `title` verbatim as the Agent `description`. Skip silently if the tool is absent.
- `.env` is copied into worktrees via `.worktreeinclude`. Merges into `main` happen one at a time; if git reports `index.lock`, another window is merging, so retry.
- Sub-agents: always set `model` explicitly. Coding goes to `sonnet`. Illustration and visual-design work may go to `opus`. Research and mechanical reading go to `sonnet` or `haiku`. Use `opus` only for genuinely complex planning. The main session orchestrates.
- Never kill processes by name; kill only your own, by PID.
- "Save my work" means: commit everything on `main`, check the staged diff for secrets, then push.

## Checks

Fill these in as each phase lands; run the ones for what a branch touches before merging.

- Playwright: no bundled browsers here; launch with `chromium.launch({ channel: "chrome" })` (system Chrome).
- Site: build with no errors; `curl` a product page and see price and specs in the HTML; Playwright screenshots of changed pages at 1440px for Claude's own review (John reviews the running site, not screenshots); Lighthouse accessibility ≥ 90.
- Relay: the curl sequence in handoff §6 (session → message → poll), plus a bad token returns 401.
- Test runner: `--dry-run` on 3 tests. Real runs call Zendesk; ask before running the full set.
