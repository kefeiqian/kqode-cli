mod application;
mod package_diagnostics;

pub(crate) use application::initialize_application;
pub(crate) use package_diagnostics::run_requested_diagnostic;
