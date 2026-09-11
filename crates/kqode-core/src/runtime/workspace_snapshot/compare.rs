use std::cmp::Ordering;

use super::{SnapshotChange, SnapshotError, budget::Budget, changes::Inventory};

/// Merges ordered inventories without allocating an unbounded union of paths.
pub(super) fn compare(
    baseline: &Inventory,
    current: &Inventory,
    budget: &Budget<'_>,
) -> Result<Vec<SnapshotChange>, SnapshotError> {
    let mut before = baseline.iter().peekable();
    let mut after = current.iter().peekable();
    let mut changes = Vec::new();
    let mut entries = 0;
    while before.peek().is_some() || after.peek().is_some() {
        budget.check()?;
        if entries >= budget.limits.max_entries {
            return Err(SnapshotError::LimitExceeded("max_entries"));
        }
        entries += 1;
        let order = match (before.peek(), after.peek()) {
            (Some((left, _)), Some((right, _))) => left.cmp(right),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => unreachable!(),
        };
        match order {
            Ordering::Less => {
                let (path, entry) = before.next().unwrap();
                changes.push(SnapshotChange::Deleted {
                    path: path.clone(),
                    entry: *entry,
                });
            }
            Ordering::Greater => {
                let (path, entry) = after.next().unwrap();
                changes.push(SnapshotChange::Added {
                    path: path.clone(),
                    entry: *entry,
                });
            }
            Ordering::Equal => {
                let (path, old) = before.next().unwrap();
                let (_, new) = after.next().unwrap();
                if old != new {
                    changes.push(SnapshotChange::Modified {
                        path: path.clone(),
                        before: *old,
                        after: *new,
                    });
                }
            }
        }
    }
    Ok(changes)
}
