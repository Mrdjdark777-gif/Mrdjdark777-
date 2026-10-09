---
name: tt-ecc-workflow
description: Maintain, review and test True Thrills with project-aware specialist assistants. Use when asked to modify or audit this repository.
---
# True Thrills workflow

Read CLAUDE.md and README.md first. Use this skill only in the True Thrills repository; outside it explain that project files are required.
Inspect git status and the actual branch before editing. Preserve unrelated work.

For a substantial task use tt-ecc-planner, then only the specialist needed: tt-ecc-reviewer, tt-ecc-security, tt-ecc-build, tt-ecc-tests or tt-ecc-data.
Do not launch every specialist for every small edit. If the runtime cannot launch a subagent, say so and perform the corresponding review yourself; do not fabricate agent output.
The parent assistant owns implementation, resolves contradictory advice and completes the authorized task.

Use current package.json scripts, not generic ECC recipes or obsolete paths. In the examined version, npm test runs build, guards, unit and integration; test:reader, test:browser and test:phones are separate.
Choose checks according to the change and repository policy. Capture genuine exit codes; do not hide failures with head/tail pipelines or report skipped installation scripts as a successful native build.
New logic/guard tests must satisfy the mutation-check rule in CLAUDE.md.
Do not regenerate layout locks unless an intentional UI change requires it and the user authorized that change.

Finish with changed files, behavior, executed checks (PASS/FAIL), checks not run and remaining device-only validation.
Save important decisions and next actions in a committed project handoff document when requested. Git is the shared continuity mechanism; do not promise cross-platform chat memory.
Never disclose secrets, deploy automatically, add subscriptions, silently enable community, upload logs externally, or install arbitrary hooks/MCP servers as part of this skill.
