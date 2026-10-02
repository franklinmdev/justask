# The agent skill's evals

How the agent skill, [`skills/justask/SKILL.md`](../skills/justask/SKILL.md), was measured before it shipped (#173), with skill-creator's eval loop: task evals, where an agent does a real task with the skill and without it, and trigger evals, where an agent sees only the skill's description and decides whether to load it. Both run by hand, never in CI, since every run is a model call. The sets are in [`skill-eval/`](skill-eval/).

`test/skill.test.ts` keeps the skill true to the package with no model call: every function, hook and piece it names in backticks must still be exported by one of the four entry points, every type it names must typecheck as an import from the core, every ADR it cites and every repository path it links must exist, its name and description must meet the Agent Skills spec, and `package.json`'s `files` must ship it.

Both evals ran on the skill's first draft (commit 0119af1). The code review then reworded it: three sections now name the failure they prevent, and two sentences were shortened. The evals were not rerun after that.

## Task evals

Four tasks in a small fixture app (Next.js layout, a merchants table, a manual expense form and an invoices table) with `@justask/core` 0.1.0 installed from npm, so the agent without the skill could still read the package's README and types. Each task ran once with the skill and once without, on Sonnet 5.5 (`claude-sonnet-5-5`), on 2026-10-01. A grader agent checked each assertion against the code and the reply, and ran `tsc` where an assertion asked. The tasks and assertions are in [`skill-eval/task-evals.json`](skill-eval/task-evals.json).

| Task | With the skill | Without |
|---|---|---|
| `expense-card`: a describe-your-expense box with its server side | 10 of 10 | 10 of 10 |
| `empty-field-fallback`: retry, then fill an empty field with the top candidate | 4 of 4 | 2 of 4 |
| `email-receipts-autosave`: save each inbound receipt email with no UI | 3 of 3 | 2 of 3 |
| `pick-gate`: pick gates and a timeout for a filter "so I can ship today" | 5 of 5 | 5 of 5 |
| All assertions | 22 of 22 | 19 of 22 |

The agent without the skill wrote the requested fallback, which fills an empty field from the top candidate and so bypasses the gate, and a webhook that saves an expense from an email body once its gates pass, with no person checking it. With the skill, the agent declined the fallback and explained how to read why a field is held, and queued each email's card as a draft for a person to confirm. Both configurations used about the same tokens (63,828 against 66,462 on average) and time (58 s against 54 s).

What the numbers do not show: the package's own README already teaches most of the rules, so on the two building tasks both agents marked their gates as placeholders, read card dates in the right direction, and kept the key on the server. The skill's measured difference is in the tasks where the right answer is to push back. One run per task is a small sample.

## Trigger evals

Twenty prompts, nine where the skill should load and eleven near misses where it should not: a support chatbot, Jev classification with no justask, a zod form, full-text search, batch PDF extraction, a date parser, a summarize button, a slow SQL filter, a filter sidebar, a Slack bot that saves with no confirm, and fine-tuning a SKU model. Several of the nine never name justask, and one is in Spanish. Each prompt ran three times through `claude -p` on Opus 5.5 (`claude-opus-5-5`) on 2026-10-01, from an empty project with the owner's other skills installed, and counts as triggered when at least half of its runs load the skill. The set is in [`skill-eval/trigger-evals.json`](skill-eval/trigger-evals.json).

Result: 20 of 20. Every should-trigger prompt loaded the skill in 3 of 3 runs. Every near miss loaded it in 0 of 3 runs, except the fine-tuning prompt, which loaded it in 1 of 3 runs. The description was kept as written; skill-creator's description optimizer was not run.

Run skill-creator's `run_eval` with `--num-workers 1`. With several workers, each one writes its own copy of the skill into the same project's `.claude/commands/`. An agent then sees several identical skills, often loads another worker's copy, and the run counts as no trigger. A first run with six workers scored 11 of 20 this way. Run alone, the same prompts loaded the skill.
