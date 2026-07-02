---
name: kqode-blog-migrate-image
description: Migrate images referenced by one KQode Docusaurus blog doc into an article-specific folder under blog/docs/images with meaningful filenames, then update Markdown links. Use when a blog doc references IDE-created root images like img.png, img_1.png, img1.png, or other loose screenshots in blog/docs.
---

# KQode Blog Migrate Image

Move one doc's local images out of `blog/docs/` root into an article-specific folder:

```text
blog/docs/images/<stable-english-topic-slug>/
```

## Workflow

1. Accept a single doc path from the user, usually under `blog/docs/`.
2. Read the doc and view every referenced local image before migrating.
3. Make alt text descriptive if it is generic, because the helper derives meaningful filenames from alt text.
4. Run the helper from the repository root:

```bash
python .agents/skills/kqode-blog-migrate-image/scripts/migrate_images.py blog/docs/<doc>.md
```

5. Review the changed Markdown links and moved image names.
6. Run `cargo xtask blog-build`.

## Rules

- Only migrate images referenced by the requested doc.
- Do not migrate remote URLs, absolute paths, anchors, or images already under `images/`.
- Prefer English slug filenames, even when the article is Chinese.
- Preserve or improve Chinese alt text with spaces on both sides of English words, acronyms, and product names when adjacent to Chinese characters, for example `RustRover 欢迎页` and `Rust XTask 自动化`.
- Keep the image folder name as a stable English kebab-case topic slug, with numeric prefixes stripped and translated titles avoided. Example: `02-创建Rust项目.md` -> `images/create-rust-project/`.
- If the helper produces an awkward filename because the alt text is poor, improve the alt text first and rerun, or rename that image manually and update the link.
