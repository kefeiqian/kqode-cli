use super::super::{
    attributes::Attributes,
    job::Job,
    native::{owned, verify_token},
    pipes::Pipes,
    transport::{command_line, conventional_path, environment_block},
};
use super::{
    psec_api::Environment,
    sbox_spec,
    support::{Fixture, TEST_TIMEOUT},
};
use crate::runtime::SandboxProfile;
use std::{io, os::windows::io::AsRawHandle, ptr, time::Duration};
use windows_sys::Win32::{
    Foundation::WAIT_OBJECT_0,
    System::Threading::{
        CREATE_NO_WINDOW, CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT, CreateProcessW,
        EXTENDED_STARTUPINFO_PRESENT, GetExitCodeProcess, PROCESS_INFORMATION, ResumeThread,
        STARTF_USESTDHANDLES, STARTUPINFOEXW, WaitForSingleObject,
    },
};

#[tokio::test]
#[ignore = "requires enabled PSEC 1.0; temporary fixture only, no production dispatch"]
async fn native_psec_additive_grants_require_explicit_source_denial() {
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
        SandboxProfile::WorkspaceWrite, TEST_TIMEOUT, 128);
    let context = command.context();
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
    let spec = sbox_spec::encode_psec(&[&root], &[&shell, &windows], &denied);
    let environment = Environment::create(&spec).unwrap();
    let pipes = Pipes::new().await.unwrap();
    let job = Job::new().unwrap();
    let handles = pipes.handles();
    let job_handle = job.raw();
    let mut attributes =
        Attributes::new(None, &job_handle, &handles, None, Some(&environment.handle)).unwrap();
    let mut startup = STARTUPINFOEXW::default();
    startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = handles[0];
    startup.StartupInfo.hStdOutput = handles[1];
    startup.StartupInfo.hStdError = handles[2];
    startup.lpAttributeList = attributes.raw();
    let executable = conventional_path(context.program()).unwrap();
    let cwd = conventional_path(context.cwd().as_os_str()).unwrap();
    let block = environment_block(context).unwrap();
    let mut arguments = command_line(context).unwrap();
    let mut information = PROCESS_INFORMATION::default();
    let created = unsafe {
        CreateProcessW(
            executable.as_ptr(),
            arguments.as_mut_ptr(),
            ptr::null(),
            ptr::null(),
            1,
            CREATE_SUSPENDED
                | CREATE_NO_WINDOW
                | CREATE_UNICODE_ENVIRONMENT
                | EXTENDED_STARTUPINFO_PRESENT,
            block.as_ptr().cast(),
            cwd.as_ptr(),
            &startup.StartupInfo,
            &mut information,
        )
    };
    assert_ne!(
        created,
        0,
        "PSEC launch failed: {}",
        io::Error::last_os_error()
    );
    let process = unsafe { owned(information.hProcess).unwrap() };
    let thread = unsafe { owned(information.hThread).unwrap() };
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
    assert!(finished.is_ok(), "PSEC script timed out");
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
        std::fs::read_to_string(fixture.source.join("input.txt")).unwrap(),
        if deny_source {
            "original"
        } else {
            "outside-mutation"
        }
    );
    assert_eq!(
        std::fs::read_to_string(command.snapshot.root().join("created.txt")).unwrap(),
        "copy"
    );
}
