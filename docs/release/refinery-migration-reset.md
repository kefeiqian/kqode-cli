# Refinery migration reset note

When upgrading from a pre-`refinery` KQode build, the first backend startup may
refuse the old `~/.kqode/kqode.db` index instead of auto-baselining it.

If the backend prints a `KQODE_STORE_FATAL:` message for a pre-refinery schema,
exit KQode, delete all three local index files, and restart:

```text
~/.kqode/kqode.db
~/.kqode/kqode.db-wal
~/.kqode/kqode.db-shm
```

The SQLite DB is a rebuildable index over JSONL session truth and contains no API
keys. Provider settings and active model selection may need to be re-entered.
