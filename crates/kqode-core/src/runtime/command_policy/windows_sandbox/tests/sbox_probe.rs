use super::super::{
    identity::Identity,
    job::Job,
    native::{owned, verify_token},
    pipes::Pipes,
    transport::{command_line, conventional_path, environment_block},
};
use super::{
    sbox_api::Api,
    sbox_spec,
    support::{Fixture, TEST_TIMEOUT},
};
use crate::runtime::SandboxProfile;
use std::{io, os::windows::io::AsRawHandle, ptr, time::Duration};
use windows_sys::Win32::{
    Foundation::WAIT_OBJECT_0,
    System::{
        JobObjects::AssignProcessToJobObject,
        Threading::{
            CREATE_NO_WINDOW, CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT, GetExitCodeProcess,
            PROCESS_INFORMATION, ResumeThread, STARTF_USESTDHANDLES, STARTUPINFOW,
            TerminateProcess, WaitForSingleObject,
        },
    },
};

const REQUIRED_SUPPORT: u64 = 0x3;
const JOIN_TIMEOUT_MS: u32 = 5_000;

#[tokio::test]
#[ignore = "requires an enabled OS BaseContainer contract; temporary fixture/profile only"]
async fn native_sbox_additive_grants_require_explicit_source_denial() {
    for deny_source in [false, true] {
        probe(deny_source).await;
    }
}

async fn probe(deny_source: bool) {
    let fixture = Fixture::new();
    super::native_boundaries::grant(&fixture.root, "(RX)");
    super::native_boundaries::grant(&fixture.source, "(RX)");
    super::native_boundaries::grant(&fixture.source.join("input.txt"), "(M)");
    let command = fixture.command(
        "[IO.File]::WriteAllText('created.txt','copy'); try { [IO.File]::WriteAllText($env:KQODE_ORIGINAL_INPUT,'outside-mutation'); [Console]::Write('outside-written') } catch [UnauthorizedAccessException] { [Console]::Write('outside-denied') }",
        SandboxProfile::WorkspaceWrite,
        TEST_TIMEOUT,
        128,
    );
    let context = command.context();
    let api = Api::load().unwrap();
    let capabilities = api.capabilities().unwrap();
    assert_eq!(
        capabilities & REQUIRED_SUPPORT,
        REQUIRED_SUPPORT,
        "create and fs-deny capabilities required"
    );
    let mut identity = Identity::new().unwrap();
    let root = command
        .snapshot
        .root()
        .to_string_lossy()
        .strip_prefix(r"\\?\")
        .unwrap()
        .to_owned();
    let shell = std::path::Path::new(context.program())
        .parent()
        .unwrap()
        .to_string_lossy()
        .strip_prefix(r"\\?\")
        .unwrap()
        .to_owned();
    let windows = std::env::var("SystemRoot").unwrap();
    let source = fixture.source.to_string_lossy();
    let denied: Vec<&str> = if deny_source { vec![&source] } else { vec![] };
    let spec = sbox_spec::encode(&[&root], &[&shell, &windows], &denied);
    let pipes = Pipes::new().await.unwrap();
    let job = Job::new().unwrap();
    let handles = pipes.handles();
    let executable = conventional_path(context.program()).unwrap();
    let cwd = conventional_path(context.cwd().as_os_str()).unwrap();
    let environment = environment_block(context).unwrap();
    let mut arguments = command_line(context).unwrap();
    let startup = STARTUPINFOW {
        cb: size_of::<STARTUPINFOW>() as u32,
        dwFlags: STARTF_USESTDHANDLES,
        hStdInput: handles[0],
        hStdOutput: handles[1],
        hStdError: handles[2],
        ..Default::default()
    };
    let mut information = PROCESS_INFORMATION::default();
    let created = unsafe {
        (api.create)(
            executable.as_ptr(),
            arguments.as_mut_ptr(),
            ptr::null(),
            ptr::null(),
            0,
            CREATE_NO_WINDOW | CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT,
            environment.as_ptr().cast(),
            cwd.as_ptr(),
            &startup,
            identity.name().as_ptr(),
            spec.as_ptr(),
            spec.len() as u32,
            &mut information,
        )
    };
    assert_ne!(
        created,
        0,
        "BaseContainer launch failed: {}",
        io::Error::last_os_error()
    );
    let process = unsafe { owned(information.hProcess).unwrap() };
    let thread = unsafe { owned(information.hThread).unwrap() };
    if unsafe { AssignProcessToJobObject(job.raw(), process.as_raw_handle().cast()) } == 0 {
        let error = io::Error::last_os_error();
        unsafe {
            assert_ne!(TerminateProcess(process.as_raw_handle().cast(), 1), 0);
            assert_eq!(
                WaitForSingleObject(process.as_raw_handle().cast(), JOIN_TIMEOUT_MS),
                WAIT_OBJECT_0
            );
        }
        panic!("assign suspended control process: {error}");
    }
    verify_token(process.as_raw_handle().cast(), Some(true)).unwrap();
    assert_ne!(
        unsafe { ResumeThread(thread.as_raw_handle().cast()) },
        u32::MAX
    );
    let readers = pipes.read(128);
    let finished = tokio::time::timeout(TEST_TIMEOUT, async {
        while unsafe { WaitForSingleObject(process.as_raw_handle().cast(), 0) } != WAIT_OBJECT_0 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await;
    job.stop().unwrap();
    let output = readers.finish().await.unwrap();
    let mut code = 0;
    assert_ne!(
        unsafe { GetExitCodeProcess(process.as_raw_handle().cast(), &mut code) },
        0
    );
    identity.close().unwrap();
    assert!(finished.is_ok(), "BaseContainer launch timed out");
    assert_eq!(code, 0, "stdout={} stderr={}", output.0.text, output.1.text);
    assert_eq!(
        output.0.text,
        if deny_source {
            "outside-denied"
        } else {
            "outside-written"
        },
        "stderr={}",
        output.1.text
    );
    assert_eq!(
        std::fs::read_to_string(command.snapshot.root().join("created.txt")).unwrap(),
        "copy"
    );
    assert_eq!(
        std::fs::read_to_string(fixture.source.join("input.txt")).unwrap(),
        if deny_source {
            "original"
        } else {
            "outside-mutation"
        }
    );
}
