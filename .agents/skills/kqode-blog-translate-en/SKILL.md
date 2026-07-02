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
7. If the translated docs include a category folder with `_category_.json`, add or update Docusaurus sidebar/category translation keys in `blog/i18n/en/docusaurus-plugin-content-docs/current.json`; localized `_category_.json` alone does not translate generated-index category labels.
8. Run `cargo xtask blog-build`.
9. For local validation, remember `cargo xtask blog-serve` serves only the default locale and `cargo xtask blog-serve-en` serves only English. Use `curl.exe -s http://127.0.0.1:3000/KQode/en/...` to verify the live English dev server after restarting it.

## Translation style

- Use clear tutorial English, not literal word-for-word translation.
- Keep product terms stable: KQode, Rust, RustRover, Cargo, Rustup, Coding Agent, agent runtime, agent harness, TUI.
- When editing Chinese source docs as part of translation prep or sync, keep spaces on both sides of English words, acronyms, and product names when adjacent to Chinese characters.
- Keep the default blog Chinese; never overwrite `blog/docs` with English text.
- If a Chinese doc references shared images under `blog/docs/images/...`, keep the same relative Markdown link in the English doc when the relative depth is the same. Adjust only when the preserved structure changes the relative path.

## Docusaurus category translations

- Translate sidebar/generated-index category labels through `blog/i18n/en/docusaurus-plugin-content-docs/current.json`.
- Generate missing keys with `Set-Location blog; node .\node_modules\@docusaurus\core\bin\docusaurus.mjs write-translations --locale en`, then keep only the relevant docs keys if extra theme scaffolding is created.
- Example keys:

```json
{
  "sidebar.docs.category.U1-研发脚手架": {
    "message": "U1 Development Scaffolding",
    "description": "The label for category 'U1-研发脚手架' in sidebar 'docs'"
  },
  "sidebar.docs.category.U1-研发脚手架.link.generated-index.description": {
    "message": "Rust project, Ink TUI, xtask automation, and summary for KQode U1.",
    "description": "The generated-index page description for category 'U1-研发脚手架' in sidebar 'docs'"
  }
}
```

- If category links should avoid Chinese URL slugs, set `link.slug` in both default and English `_category_.json` files, for example `"/category/u1-development-scaffolding"`.
