---
name: kqode-blog-translate-en
description: Translate KQode Docusaurus docs from the default Chinese blog/docs tree into blog/i18n/en while preserving the docs structure, frontmatter IDs/slugs, image links, code blocks, tables, and technical terminology. Use when asked to translate blog docs, sync English locale docs, or update blog/i18n/en from blog/docs.
---

# KQode Blog Translate EN

Translate default Chinese docs into the English locale tree:

```text
blog/docs/... -> blog/i18n/en/docusaurus-plugin-content-docs/current/...
```

## Workflow

1. Run the helper from the repository root to see source/target pairs:

```bash
python .agents/skills/kqode-blog-translate-en/scripts/list_translation_targets.py
```

2. For each requested doc, create or update the matching file under `blog/i18n/en/docusaurus-plugin-content-docs/current/`.
3. Preserve directory structure and filenames exactly.
4. Translate prose, headings, image alt text, and table headers into natural English.
5. Preserve frontmatter keys that control routing, especially `id`, `slug`, and `sidebar_position`; translate only human-facing values such as `title`.
6. Preserve code blocks, commands, file paths, URLs, Markdown links, and image paths unless a path would break in the English locale.
7. Run `cargo xtask blog-build`.

## Translation style

- Use clear tutorial English, not literal word-for-word translation.
- Keep product terms stable: KQode, Rust, RustRover, Cargo, Rustup, Coding Agent, agent runtime, agent harness, TUI.
- Keep the default blog Chinese; never overwrite `blog/docs` with English text.
- If a Chinese doc references shared images under `blog/docs/images/...`, keep the same relative Markdown link in the English doc when the relative depth is the same. Adjust only when the preserved structure changes the relative path.
