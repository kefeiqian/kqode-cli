use std::{
    collections::BTreeMap,
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use uuid::Uuid;

use super::{ProcessRequest, ProcessSupervisor, WorkspaceError, WorkspacePolicy};
use crate::cancellation::CancellationToken;

struct TestDirectory {
    path: PathBuf,
}

impl TestDirectory {
    fn new(label: &str) -> Self {
        let path = std::env::temp_dir().join(format!("kqode-{label}-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self { path }
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[test]
fn rejects_working_directories_outside_the_workspace() {
    let workspace = TestDirectory::new("workspace");
    let outside = TestDirectory::new("outside");
    let policy = WorkspacePolicy::new(&workspace.path).unwrap();

    let error = policy.resolve_cwd(Some(&outside.path)).unwrap_err();

    assert!(matches!(error, WorkspaceError::OutsideWorkspace { .. }));
}

#[test]
fn rejects_linked_directories_that_escape_the_workspace() {
    let workspace = TestDirectory::new("workspace-link");
    let outside = TestDirectory::new("outside-link");
    let link = workspace.path.join("escape");
    create_directory_link(&outside.path, &link);
    let policy = WorkspacePolicy::new(&workspace.path).unwrap();

    let error = policy.resolve_cwd(Some(Path::new("escape"))).unwrap_err();

    assert!(matches!(error, WorkspaceError::OutsideWorkspace { .. }));
}

#[tokio::test]
async fn captures_nonzero_exit_and_separate_streams() {
    let workspace = TestDirectory::new("process-output");
    let supervisor = ProcessSupervisor::new(&workspace.path, 1).unwrap();

    let output = supervisor
        .run(fixture_request("output"), CancellationToken::default())
        .await
        .unwrap();

    assert_eq!(output.exit_code, Some(7), "{output:?}");
    assert!(output.stdout.contains("out"), "{output:?}");
    assert!(output.stderr.contains("err"), "{output:?}");
    assert!(!output.timed_out);
    assert!(!output.cancelled);
}

#[tokio::test]
async fn resolves_relative_working_directories_inside_the_workspace() {
    let workspace = TestDirectory::new("process-cwd");
    let nested = workspace.path.join("nested");
    fs::create_dir(&nested).unwrap();
    let supervisor = ProcessSupervisor::new(&workspace.path, 1).unwrap();
    let marker = workspace.path.join("cwd");
    let mut request = fixture_request("cwd");
    request.cwd = Some(PathBuf::from("nested"));
    request.environment.insert(
        "KQODE_PROCESS_MARKER".to_owned(),
        marker.display().to_string(),
    );

    supervisor
        .run(request, CancellationToken::default())
        .await
        .unwrap();

    assert_eq!(
        PathBuf::from(fs::read_to_string(marker).unwrap())
            .canonicalize()
            .unwrap(),
        nested.canonicalize().unwrap()
    );
}

#[tokio::test]
async fn removes_secret_environment_variables() {
    let workspace = TestDirectory::new("process-environment");
    let supervisor = ProcessSupervisor::new(&workspace.path, 1).unwrap();
    let mut request = fixture_request("environment");
    request
        .environment
        .insert("KQODE_VISIBLE".to_owned(), "visible".to_owned());
    request
        .environment
        .insert("KQODE_TEST_SECRET".to_owned(), "hidden".to_owned());

    let output = supervisor
        .run(request, CancellationToken::default())
        .await
        .unwrap();

    assert!(output.stdout.contains("visible|"), "{output:?}");
    assert!(!output.stdout.contains("hidden"), "{output:?}");
}

#[tokio::test]
async fn truncates_continuous_stdout_and_stderr() {
    let workspace = TestDirectory::new("process-truncation");
    let supervisor = ProcessSupervisor::new(&workspace.path, 1).unwrap();
    let mut request = fixture_request("truncate");
    request.max_output_bytes = 32;

    let output = supervisor
        .run(request, CancellationToken::default())
        .await
        .unwrap();

    assert_eq!(output.stdout.len(), 32, "{output:?}");
    assert_eq!(output.stderr.len(), 32, "{output:?}");
    assert!(output.omitted_bytes >= 336, "{output:?}");
    assert!(output.truncated);
}

#[tokio::test]
async fn timeout_terminates_descendant_processes() {
    let workspace = TestDirectory::new("process-tree");
    let marker = workspace.path.join("descendant-finished");
    let ready = workspace.path.join("descendant-ready");
    let supervisor = ProcessSupervisor::new(&workspace.path, 1).unwrap();
    let mut request = fixture_request("descendant");
    request.environment.insert(
        "KQODE_PROCESS_MARKER".to_owned(),
        marker.display().to_string(),
    );
    request.environment.insert(
        "KQODE_PROCESS_READY".to_owned(),
        ready.display().to_string(),
    );
    request.timeout = Duration::from_millis(150);

    let output = supervisor
        .run(request, CancellationToken::default())
        .await
        .unwrap();

    assert!(output.timed_out, "{output:?}");
    std::thread::sleep(Duration::from_millis(900));
    assert!(!marker.exists());
}

#[tokio::test]
async fn dropping_the_run_future_terminates_descendant_processes() {
    let workspace = TestDirectory::new("process-drop");
    let marker = workspace.path.join("descendant-finished");
    let ready = workspace.path.join("descendant-ready");
    let supervisor = ProcessSupervisor::new(&workspace.path, 1).unwrap();
    let mut request = fixture_request("descendant");
    request.environment.insert(
        "KQODE_PROCESS_MARKER".to_owned(),
        marker.display().to_string(),
    );
    request.environment.insert(
        "KQODE_PROCESS_READY".to_owned(),
        ready.display().to_string(),
    );
    request.timeout = Duration::from_secs(30);
    let task =
        tokio::spawn(async move { supervisor.run(request, CancellationToken::default()).await });
    wait_for_file(&ready).await;

    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    tokio::time::sleep(Duration::from_millis(900)).await;
    assert!(!marker.exists());
}

#[tokio::test]
async fn cancellation_terminates_the_process() {
    let workspace = TestDirectory::new("process-cancellation");
    let supervisor = ProcessSupervisor::new(&workspace.path, 1).unwrap();
    let cancellation = CancellationToken::default();
    let cancel = cancellation.clone();
    let request = fixture_request("sleep");
    let task = tokio::spawn(async move { supervisor.run(request, cancellation).await });
    tokio::time::sleep(Duration::from_millis(100)).await;
    cancel.cancel();

    let output = task.await.unwrap().unwrap();

    assert!(output.cancelled, "{output:?}");
    assert!(!output.timed_out);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn bounds_concurrent_processes_per_supervisor() {
    let workspace = TestDirectory::new("process-concurrency");
    let first_started = workspace.path.join("first-started");
    let second_started = workspace.path.join("second-started");
    let supervisor = ProcessSupervisor::new(&workspace.path, 1).unwrap();
    let mut first_request = fixture_request("hold");
    first_request.environment.insert(
        "KQODE_PROCESS_MARKER".to_owned(),
        first_started.display().to_string(),
    );
    let first_supervisor = supervisor.clone();
    let first = tokio::spawn(async move {
        first_supervisor
            .run(first_request, CancellationToken::default())
            .await
    });
    wait_for_file(&first_started).await;

    let mut second_request = fixture_request("mark-now");
    second_request.environment.insert(
        "KQODE_PROCESS_MARKER".to_owned(),
        second_started.display().to_string(),
    );
    let second = tokio::spawn(async move {
        supervisor
            .run(second_request, CancellationToken::default())
            .await
    });
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert!(!second_started.exists());

    first.await.unwrap().unwrap();
    second.await.unwrap().unwrap();
    assert!(second_started.exists());
}

fn fixture_request(mode: &str) -> ProcessRequest {
    ProcessRequest {
        program: std::env::current_exe().unwrap().into_os_string(),
        arguments: vec![
            OsString::from("--exact"),
            OsString::from("runtime::process::tests::process_fixture"),
            OsString::from("--nocapture"),
        ],
        cwd: None,
        environment: BTreeMap::from([("KQODE_PROCESS_MODE".to_owned(), mode.to_owned())]),
        timeout: Duration::from_secs(5),
        max_output_bytes: 1024,
    }
}

#[test]
fn process_fixture() {
    match std::env::var("KQODE_PROCESS_MODE").as_deref() {
        Ok("output") => {
            print!("out");
            eprint!("err");
            std::process::exit(7);
        }
        Ok("environment") => {
            print!(
                "{}|{}",
                std::env::var("KQODE_VISIBLE").unwrap_or_default(),
                std::env::var("KQODE_TEST_SECRET").unwrap_or_default()
            );
        }
        Ok("truncate") => {
            print!("{}", "a".repeat(200));
            eprint!("{}", "b".repeat(200));
        }
        Ok("sleep") => std::thread::sleep(Duration::from_secs(30)),
        Ok("cwd") => {
            fs::write(
                std::env::var("KQODE_PROCESS_MARKER").unwrap(),
                std::env::current_dir().unwrap().display().to_string(),
            )
            .unwrap();
        }
        Ok("hold") => {
            fs::write(std::env::var("KQODE_PROCESS_MARKER").unwrap(), "started").unwrap();
            std::thread::sleep(Duration::from_millis(500));
        }
        Ok("mark-now") => {
            fs::write(std::env::var("KQODE_PROCESS_MARKER").unwrap(), "started").unwrap();
        }
        Ok("descendant") => {
            let marker = std::env::var("KQODE_PROCESS_MARKER").unwrap();
            let mut descendant = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "runtime::process::tests::process_fixture",
                    "--nocapture",
                ])
                .env("KQODE_PROCESS_MODE", "write-marker")
                .env("KQODE_PROCESS_MARKER", marker)
                .spawn()
                .unwrap();
            std::thread::spawn(move || {
                let _ = descendant.wait();
            });
            fs::write(std::env::var("KQODE_PROCESS_READY").unwrap(), "ready").unwrap();
            loop {
                println!("tick");
                std::thread::sleep(Duration::from_millis(5));
            }
        }
        Ok("write-marker") => {
            std::thread::sleep(Duration::from_millis(600));
            fs::write(std::env::var("KQODE_PROCESS_MARKER").unwrap(), "child").unwrap();
        }
        _ => {}
    }
}

async fn wait_for_file(path: &Path) {
    tokio::time::timeout(Duration::from_secs(5), async {
        while !path.exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
}

#[cfg(windows)]
fn create_directory_link(target: &Path, link: &Path) {
    let status = std::process::Command::new("cmd.exe")
        .args(["/D", "/C", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .status()
        .unwrap();
    assert!(status.success());
}

#[cfg(unix)]
fn create_directory_link(target: &Path, link: &Path) {
    std::os::unix::fs::symlink(target, link).unwrap();
}
