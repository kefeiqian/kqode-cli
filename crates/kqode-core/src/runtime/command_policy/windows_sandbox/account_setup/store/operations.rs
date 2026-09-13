use super::super::{
    DisabledSandboxAccounts, PrivateSandboxAccountJournal, SandboxAccountJournalInspection,
    SandboxAccountReconciliation, SandboxAccountSetupError as Error,
    guard::Guard,
    native::{NativeHost, NativeReader},
    reconciliation, workflow,
};
use super::{WindowsSandboxAccountStore, checked};
use crate::cancellation::CancellationToken;
use std::time::Duration;

impl WindowsSandboxAccountStore {
    /// Runs first-time disabled-account preparation within this validated store.
    ///
    /// Requires separately obtained administrator setup consent and an elevated,
    /// same-identity trusted helper. Does not elevate itself or provide that authorization.
    ///
    /// # Errors
    ///
    /// Propagates storage, native, elevation and cooperative-limit failures.
    /// The trusted host remains responsible for authenticating and obtaining setup consent.
    pub fn provision_disabled(
        &self,
        timeout: Duration,
        cancellation: &CancellationToken,
    ) -> Result<DisabledSandboxAccounts, Error> {
        let guard = Guard::new(timeout, cancellation)?;
        self.verify(&guard)?;
        let parent = checked("clone pinned store", self.root.try_clone())?;
        let mut journal = checked(
            "prepare account journal",
            PrivateSandboxAccountJournal::new(parent),
        )?;
        workflow::run_guarded(&self.plan, &mut NativeHost, &mut journal, &guard)
    }

    /// Reads recorded account state without modifying the store or SAM.
    ///
    /// # Errors
    ///
    /// Returns private storage, journal validation and cooperative-limit failures.
    pub fn inspect(
        &self,
        timeout: Duration,
        cancellation: &CancellationToken,
    ) -> Result<SandboxAccountJournalInspection, Error> {
        let guard = Guard::new(timeout, cancellation)?;
        self.verify(&guard)?;
        let result = checked(
            "inspect account journal",
            PrivateSandboxAccountJournal::inspect(&self.root, &self.plan),
        )?;
        guard.check()?;
        Ok(result)
    }

    /// Compares recorded and live account state without recovery mutations.
    ///
    /// # Errors
    ///
    /// Returns storage/journal/native failures, observed drift and cooperative-limit failures.
    pub fn reconcile(
        &self,
        timeout: Duration,
        cancellation: &CancellationToken,
    ) -> Result<SandboxAccountReconciliation, Error> {
        let guard = Guard::new(timeout, cancellation)?;
        self.verify(&guard)?;
        let journal = checked(
            "inspect account journal",
            PrivateSandboxAccountJournal::inspect(&self.root, &self.plan),
        )?;
        reconciliation::run(&self.plan, journal, &mut NativeReader, &guard)
    }
}
