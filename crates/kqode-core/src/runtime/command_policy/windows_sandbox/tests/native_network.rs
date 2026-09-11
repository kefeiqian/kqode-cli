use super::support::{Fixture, TEST_TIMEOUT};
use crate::{
    cancellation::CancellationToken,
    runtime::{
        PowerShell, ProcessOutput, ProcessSupervisor, SandboxProfile, WindowsSandboxBackend,
    },
};
use serde::Deserialize;
use std::{
    fs, io,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, TcpListener, UdpSocket},
    time::Duration,
};

const SOCKET_ACCESS_DENIED: i32 = 10013;
const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$ip = [Net.IPAddress]::Parse('__ADDRESS__')
$results = [ordered]@{ pid = $PID; tcp = 0; udp = 0 }
$tcp = $null
$udp = $null
try {
    try {
        $tcp = [Net.Sockets.Socket]::new($ip.AddressFamily, [Net.Sockets.SocketType]::Stream, [Net.Sockets.ProtocolType]::Tcp)
        if (-not $tcp.ConnectAsync($ip, __TCP__).Wait(3000)) { throw 'TCP probe deadline exceeded' }
    } catch {
        $e = $_.Exception.GetBaseException()
        if ($e -isnot [Net.Sockets.SocketException]) { throw }
        $results.tcp = $e.NativeErrorCode
    }
    try {
        $udp = [Net.Sockets.Socket]::new($ip.AddressFamily, [Net.Sockets.SocketType]::Dgram, [Net.Sockets.ProtocolType]::Udp)
        $bytes = [Text.Encoding]::UTF8.GetBytes('probe')
        [void]$udp.SendTo($bytes, [Net.IPEndPoint]::new($ip, __UDP__))
    } catch {
        $e = $_.Exception.GetBaseException()
        if ($e -isnot [Net.Sockets.SocketException]) { throw }
        $results.udp = $e.NativeErrorCode
    }
} finally { if ($tcp) { $tcp.Dispose() }; if ($udp) { $udp.Dispose() } }
Write-Output ($results | ConvertTo-Json -Compress)
"#;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Observation {
    parent: u32,
    probe: Probe,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Probe {
    pid: u32,
    tcp: i32,
    udp: i32,
}

fn decode(output: &ProcessOutput) -> Observation {
    assert_eq!(output.exit_code, Some(0), "{output:?}");
    assert!(
        !output.timed_out && !output.cancelled && !output.truncated,
        "{output:?}"
    );
    serde_json::from_str(&output.stdout).expect("complete network observations")
}

#[tokio::test]
#[ignore = "requires Windows LPAC, PowerShell 7 and IPv4/IPv6 loopback; local listeners only"]
async fn native_lpac_dual_stack_loopback_denial_includes_descendants_and_receiver_controls() {
    let fixture = Fixture::new();
    let backend = WindowsSandboxBackend::new(1, 100).unwrap();
    let shell = PowerShell::resolve(None).unwrap();
    let supervisor = ProcessSupervisor::new(&fixture.source, 1).unwrap();
    for address in [
        IpAddr::V4(Ipv4Addr::LOCALHOST),
        IpAddr::V6(Ipv6Addr::LOCALHOST),
    ] {
        for child in [false, true] {
            for isolated in [false, true] {
                let tcp = TcpListener::bind((address, 0)).unwrap();
                let udp = UdpSocket::bind((address, 0)).unwrap();
                tcp.set_nonblocking(true).unwrap();
                udp.set_nonblocking(true).unwrap();
                let script = SCRIPT
                    .replace("__ADDRESS__", &address.to_string())
                    .replace("__TCP__", &tcp.local_addr().unwrap().port().to_string())
                    .replace("__UDP__", &udp.local_addr().unwrap().port().to_string());
                fs::write(fixture.source.join("network.ps1"), &script).unwrap();
                let invocation = if child {
                    "$file = [IO.Path]::GetFullPath('network.ps1'); $data = & ([Environment]::ProcessPath) -NoProfile -NonInteractive -File $file; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }".to_owned()
                } else {
                    format!("$data = & {{ {script} }}")
                };
                let command = format!(
                    "{invocation}; [Console]::Write((@{{parent=$PID; probe=($data | ConvertFrom-Json)}} | ConvertTo-Json -Compress))"
                );
                let observation = if isolated {
                    let result = backend
                        .run_diagnostic(
                            fixture.command(
                                &command,
                                SandboxProfile::WorkspaceWrite,
                                TEST_TIMEOUT,
                                1024,
                            ),
                            CancellationToken::default(),
                        )
                        .await
                        .unwrap();
                    let observation = decode(result.execution.output());
                    let (_, snapshot) = result.execution.into_parts();
                    snapshot.close().unwrap();
                    observation
                } else {
                    let request = shell.prepare(&command, TEST_TIMEOUT, 1024).unwrap();
                    decode(
                        &supervisor
                            .run(request, CancellationToken::default())
                            .await
                            .unwrap(),
                    )
                };
                assert_eq!(
                    observation.parent != observation.probe.pid,
                    child,
                    "{observation:?}"
                );
                assert_eq!(
                    observation.probe.tcp,
                    if isolated { SOCKET_ACCESS_DENIED } else { 0 },
                    "{observation:?}"
                );
                assert!(
                    [0, SOCKET_ACCESS_DENIED].contains(&observation.probe.udp),
                    "{observation:?}"
                );
                if !isolated {
                    assert_eq!(observation.probe.udp, 0, "{observation:?}");
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
                match tcp.accept() {
                    Ok(_) => assert!(!isolated, "LPAC TCP reached receiver"),
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        assert!(isolated, "TCP positive control did not arrive")
                    }
                    Err(error) => panic!("TCP receiver failed: {error}"),
                }
                let mut bytes = [0; 16];
                match udp.recv(&mut bytes) {
                    Ok(length) => {
                        assert_eq!(&bytes[..length], b"probe");
                        assert!(!isolated, "LPAC UDP reached receiver");
                    }
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        assert!(isolated, "UDP positive control did not arrive")
                    }
                    Err(error) => panic!("UDP receiver failed: {error}"),
                }
            }
        }
    }
}
