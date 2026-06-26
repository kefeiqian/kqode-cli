# KQode agent instructions

## Plan document review checkboxes

When creating or updating Markdown plan documents under `docs/plans/`, keep the top `#` document title clean and do not add a review checkbox to it.

If review tracking is requested for plan sections, add an Obsidian-clickable callout directly under each real section heading:

```md
## Section Title
> [!todo] Section review
> - [ ] Reviewed this section
```

Preserve existing checked state when rewriting review controls. Avoid inline heading checkboxes and standalone `- [ ] Reviewed` items under sections, because Obsidian renders them as list review items rather than section review controls.

If a `##` section is only a container for reviewed `###` subsections, omit the parent review callout and track review state on the subsections instead. Keep a parent review callout only when the parent section has standalone reviewable content separate from its subsections.

When changing content in a reviewed section, reset that section's review checkbox to unchecked. If the changed content belongs to a subsection, reset the nearest subsection review checkbox rather than a parent container that intentionally has no review callout.

## File size guideline

Across the project, prefer focused source files that stay at or below roughly 200 lines. Split modules/components/helpers before a file grows beyond that size unless there is a clear, review-documented reason to keep it larger.

## Constants and enums

Avoid hard-coded protocol names, event names, status strings, and non-obvious numeric literals. Define shared enums or named constants for these values so Rust and TypeScript protocol code stays searchable and consistent.

## Commit workflow

Implement plan work one commit-sized unit at a time. After each commit, run code review on the completed unit, then pause for user review and wait for explicit consent before starting the next commit.
