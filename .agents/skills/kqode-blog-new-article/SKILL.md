---
name: kqode-blog-new-article
description: Create a new KQode Docusaurus blog article under blog/docs with the next or explicitly requested numeric order, frontmatter title, and stable English image-folder slug. Use when asked to add or start a new blog article, create the next article after the current latest doc, insert an article at a specified position such as 1.5 or 2.5, or scaffold article image folders and links.
---

# KQode Blog New Article

Create a new Chinese blog doc in `blog/docs/` and keep its ordering, frontmatter, and image assets consistent with `blog/AGENTS.md`.

## Workflow

1. Read `blog/AGENTS.md` before creating the article.
2. Determine the article title. If the user did not provide one, ask for it.
3. Determine the order:
   - If the user provided an order like `4`, `04`, `1.5`, or `2.5`, pass it with `--order`.
   - If no order is provided, omit `--order`; the helper uses the next whole number after the largest existing numeric prefix.
4. Choose a stable English kebab-case image slug from the article topic, without numeric ordering prefixes or translated Chinese titles. If it is not obvious, ask the user.
5. Run the helper from the repository root:

```bash
python .agents/skills/kqode-blog-new-article/scripts/new_article.py "创建前端TUI项目" --slug create-frontend-tui-project
python .agents/skills/kqode-blog-new-article/scripts/new_article.py "插入的新文章" --order 1.5 --slug inserted-topic
```

6. Fill in the article body after the helper creates the Markdown file.
7. Put any article images under `blog/docs/images/<slug>/` and link them as `images/<slug>/<filename>`.
8. Run `cargo xtask blog-build` after changing docs, and verify new articles appear at their requested sidebar position.

## Rules

- Keep the default article language Chinese under `blog/docs/`.
- Keep the doc filename ordered, for example `04-新文章.md` or `01.5-插入的新文章.md`.
- Keep every article's frontmatter with `sidebar_position` matching the display order, for example `sidebar_position: 4` or `sidebar_position: 1.5`.
- Keep the frontmatter title human-facing, for example `title: 4. 新文章` or `title: 1.5. 插入的新文章`.
- Do not rely on filename prefixes alone for sidebar order, because Docusaurus may not sort decimal prefixes between surrounding integer docs by filename alone.
- Do not put numeric ordering prefixes or Chinese titles in image folder names.
- Do not overwrite an existing doc; choose a different order or title when there is a collision.
