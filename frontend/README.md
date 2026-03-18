## CLAUDE.md Best Practices Reference (Nick Babich / UX Planet)

### What CLAUDE.md is

A markdown file read at the start of every Claude Code conversation. It's an onboarding guide for AI — not documentation for humans. Claude treats it as trusted instructions. Place it in the repo root (or sub-directory for monorepos; Claude reads all of them, most-specific wins).

### The 10 sections to include

1. **Project overview** — what the product is, who it's for, what it optimizes for, key business/UX constraints. A few paragraphs max. Avoid: history lessons, generic values, marketing copy.

2. **Tech stack** — explicit list: framework, language, styling system, component library, state management, testing, build tooling, backend/data layer. Also state what NOT to use. Be specific — "React 19 + Vite" not "React stack".

3. **Architecture** — major directories, responsibilities of each area, data flow, separation of concerns, where new code goes. Focus on decision rules, not just folder names. Add "where new things go" subsection. Note where API keys are stored.

4. **Coding conventions** — naming, component patterns, typing standards, file size limits, import conventions, error handling, comments policy, async patterns. Use clear rules, not vague preferences. Make them actionable enough that Claude can follow them without judgment calls.

5. **UI and design system rules** — visual style, spacing philosophy, typography, interaction patterns, responsiveness, accessibility expectations, component usage rules. For frontend projects, this section is gold.

6. **Content and copy guidance** — tone (concise vs detailed, technical vs plain), sentence length, headline style, forbidden patterns. Include examples. Most valuable for marketing/landing page projects.

7. **Testing and quality bar** — what tests to add, when tests are required, lint/typecheck expectations, definition of "done". Prevents Claude from skipping tests or declaring work complete prematurely.

8. **File and component placement rules** — where to create new files, when to edit vs create, when to create abstractions, naming patterns. Prevents repo drift and duplicate components.

9. **Safe-change rules** — files or areas Claude should not modify casually. Reduces "technically correct but wrong" changes in mature codebases.

10. **Specific commands** — exact runnable bash commands for dev, test, build, lint. Only include commands that are real and tested.

### Meta-principles

- **Target under 200 lines.** Instruction-following quality drops as count increases; beyond ~150–200 instructions Claude starts ignoring them. For every line ask: "would removing this cause a mistake?" If not, cut it.
- **Use file references, not code copies.** Point to `src/foo.ts:42` instead of pasting snippets that go stale.
- **Be specific, not vague.** "Use named exports" not "write clean code."
- **Don't ask Claude to do a linter's job.** Use deterministic tools for formatting/style enforcement.
- **Don't duplicate what's in the code.** CLAUDE.md is a map, not a copy of your codebase.
