use std::{
    fs::{File, OpenOptions},
    io,
    os::windows::io::AsRawHandle,
    ptr,
    time::Duration,
};

use crate::runtime::{
    ProcessError,
    process::{CapturedOutput, read_bounded},
    windows_security::PrivateDescriptor,
};
use tokio::{
    net::windows::named_pipe::{NamedPipeServer, ServerOptions},
    task::JoinHandle,
};
use windows_sys::Win32::{
    Foundation::{HANDLE, HANDLE_FLAG_INHERIT, SetHandleInformation},
    Security::SECURITY_ATTRIBUTES,
};

const PIPE_BUFFER_BYTES: u32 = 4096;
const OUTPUT_DRAIN_TIMEOUT: Duration = Duration::from_secs(1);

pub(super) struct Pipes {
    input: File,
    output: File,
    error: File,
    stdout: NamedPipeServer,
    stderr: NamedPipeServer,
}

impl Pipes {
    pub async fn new() -> io::Result<Self> {
        let (stdout, output) = channel().await?;
        let (stderr, error) = channel().await?;
        let input = File::open(r"\\.\NUL")?;
        for file in [&input, &output, &error] {
            if unsafe {
                SetHandleInformation(
                    file.as_raw_handle().cast(),
                    HANDLE_FLAG_INHERIT,
                    HANDLE_FLAG_INHERIT,
                )
            } == 0
            {
                return Err(io::Error::last_os_error());
            }
        }
        Ok(Self {
            input,
            output,
            error,
            stdout,
            stderr,
        })
    }
    pub fn handles(&self) -> [HANDLE; 3] {
        [
            self.input.as_raw_handle().cast(),
            self.output.as_raw_handle().cast(),
            self.error.as_raw_handle().cast(),
        ]
    }
    pub fn read(self, limit: usize) -> Readers {
        // Only the child retains the synchronous write ends after this move.
        Readers {
            stdout: tokio::spawn(read_bounded(self.stdout, limit)),
            stderr: tokio::spawn(read_bounded(self.stderr, limit)),
        }
    }
}

async fn channel() -> io::Result<(NamedPipeServer, File)> {
    let name = format!(r"\\.\pipe\kqode-lpac-{}", uuid::Uuid::new_v4());
    let server = {
        let descriptor = PrivateDescriptor::new()?;
        let mut attributes = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor.raw(),
            bInheritHandle: 0,
        };
        unsafe {
            ServerOptions::new()
                .access_inbound(true)
                .access_outbound(false)
                .first_pipe_instance(true)
                .reject_remote_clients(true)
                .max_instances(1)
                .in_buffer_size(PIPE_BUFFER_BYTES)
                .out_buffer_size(PIPE_BUFFER_BYTES)
                .create_with_security_attributes_raw(&name, ptr::from_mut(&mut attributes).cast())?
        }
    };
    // Stdout writers must be synchronous even though the receiving handle is overlapped.
    let writer = OpenOptions::new().write(true).open(&name)?;
    server.connect().await?;
    Ok((server, writer))
}

pub(super) struct Readers {
    stdout: JoinHandle<Result<CapturedOutput, ProcessError>>,
    stderr: JoinHandle<Result<CapturedOutput, ProcessError>>,
}
impl Readers {
    pub async fn finish(mut self) -> Result<(CapturedOutput, CapturedOutput), ProcessError> {
        let (out, err) = tokio::time::timeout(OUTPUT_DRAIN_TIMEOUT, async {
            tokio::join!(&mut self.stdout, &mut self.stderr)
        })
        .await
        .map_err(|_| ProcessError::OutputDrainTimeout("LPAC output streams"))?;
        let unwrap =
            |result: Result<Result<CapturedOutput, ProcessError>, tokio::task::JoinError>| {
                result.map_err(|error| ProcessError::Supervision(io::Error::other(error)))?
            };
        Ok((unwrap(out)?, unwrap(err)?))
    }
}
impl Drop for Readers {
    fn drop(&mut self) {
        self.stdout.abort();
        self.stderr.abort();
    }
}
