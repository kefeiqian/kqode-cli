# Golden Task Catalog

The initial KQode golden set contains 25 Harbor-native candidate tasks. They target the three model-facing tools currently defined by KQode: `run_command`, `fetch_web_url`, and `ask_user`.

Each verifier checks both the requested outcome and a normalized tool event in `/logs/agent/tool-events.jsonl`. The future Harbor KQode adapter must populate that file from the real KQode trace. Harbor's Oracle solution writes equivalent evidence only for task-author validation.

## Coverage

| Target tool | Count | Coverage |
|---|---:|---|
| `run_command` | 19 | current directory, listing, glob, grep, read, metadata, Git, environment |
| `fetch_web_url` | 3 | plain text, JSON, HTML through a task-local HTTP sidecar |
| `ask_user` | 3 | missing value, destructive confirmation, ambiguous path |
| **Total** | **25** |  |

## `run_command`: Current Directory

| ID | Expected behavior |
|---|---|
| `current-directory` | Report the absolute command working directory |

## `run_command`: Directory Listing

| ID | Expected behavior |
|---|---|
| `list-directory-basic` | List immediate files and directories in stable order |
| `list-directory-hidden` | Include hidden entries while excluding `.` and `..` |
| `list-directory-directories-only` | Return only immediate child directories |

## `run_command`: Glob

| ID | Expected behavior |
|---|---|
| `glob-rust-files` | Find Rust files recursively |
| `glob-multiple-extensions` | Find Markdown and TOML files |
| `glob-exclude-target` | Find source files while excluding `target` |

## `run_command`: Grep

| ID | Expected behavior |
|---|---|
| `grep-literal` | Find a literal symbol with path and line number |
| `grep-regex` | Match structured log lines using a regular expression |
| `grep-case-insensitive` | Match text regardless of letter case |

## `run_command`: Read File

| ID | Expected behavior |
|---|---|
| `read-file-complete` | Read an entire file exactly |
| `read-file-range` | Read an inclusive line range |
| `read-file-tail` | Read the final lines of a file |

## `run_command`: File Metadata

| ID | Expected behavior |
|---|---|
| `file-metadata-size` | Report a file's byte size |
| `file-metadata-mode` | Report file type and permission mode |

## `run_command`: Read-only Git

| ID | Expected behavior |
|---|---|
| `git-status-read-only` | Inspect porcelain working-tree status |
| `git-diff-read-only` | Inspect an unstaged diff summary |
| `git-log-show-read-only` | Read the latest commit subject and committed file |

## `run_command`: Environment

| ID | Expected behavior |
|---|---|
| `environment-cargo-metadata` | Inspect `rustc --version` and `cargo metadata` |

## `fetch_web_url`

| ID | Expected behavior |
|---|---|
| `fetch-web-text` | Fetch an exact plain-text response |
| `fetch-web-json` | Fetch JSON and extract one requested field |
| `fetch-web-html` | Fetch HTML and extract its title |

The fetch tasks use a Harbor Compose sidecar named `fixture-web`; they do not depend on the public internet. The Agent reaches it through `http://fixture-web:8080`.

## `ask_user`

| ID | Expected behavior |
|---|---|
| `ask-user-project-name` | Ask for a required missing project name |
| `ask-user-confirm-overwrite` | Ask before overwriting a protected configuration and respect refusal |
| `ask-user-missing-path` | Resolve an ambiguous directory choice before acting |

These tasks require the future Harbor KQode adapter to bridge `ask_user` to the deterministic simulated response stored in `task.toml` metadata.

## Lifecycle State

All 25 tasks are `candidate`:

- Harbor can discover their schema `1.4` task directories.
- Each task has an isolated environment, instruction, hidden verifier, and Oracle solution.
- Promotion to `active` requires repeated Oracle/NOP runs and a real KQode adapter run.

## Suggested Suites

### Smoke

1. `current-directory`
2. `list-directory-hidden`
3. `grep-literal`
4. `fetch-web-json`
5. `ask-user-confirm-overwrite`

### Run Command Read-only

All 19 tasks from current-directory, list, glob, grep, read, metadata, Git, and environment sections.

### Tool Contract

All 25 tasks across the three first-version model-facing tools.
