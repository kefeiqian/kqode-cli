$ErrorActionPreference = 'Stop'
$r = [ordered]@{}
function Attempt($name, [scriptblock]$action) {
    try { & $action | Out-Null; $r[$name] = @{ allowed = $true } }
    catch {
        $e = $_.Exception
        while ($null -ne $e.InnerException) { $e = $e.InnerException }
        $native = $null
        if ($e -is [Net.Sockets.SocketException]) { $native = $e.NativeErrorCode }
        $r[$name] = @{ allowed = $false; error = $e.GetType().FullName; code = $e.HResult; native_error = $native }
    }
}
$root = $env:KQODE_PROBE_ROOT
Attempt 'read_granted' { [IO.File]::ReadAllText("$root\read\data.txt") }
Attempt 'write_readonly' { [IO.File]::AppendAllText("$root\read\data.txt", 'changed') }
Attempt 'write_granted' { [IO.File]::WriteAllText("$root\write\created.txt", 'changed') }
Attempt 'write_outside' { [IO.File]::AppendAllText("$root\outside\private.txt", 'changed') }
Attempt 'write_all_packages' { [IO.File]::AppendAllText("$root\outside\shared.txt", 'changed') }
Attempt 'write_hardlink' { [IO.File]::AppendAllText("$root\write\alias.txt", 'changed') }
Attempt 'tcp_loopback' {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect('127.0.0.1', [int]$env:KQODE_PROBE_TCP_PORT, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne(2000)) { throw 'connect timeout, not evidence of denial' }
        $client.EndConnect($pending)
    } finally { $client.Dispose() }
}
Attempt 'udp_loopback' {
    $client = New-Object Net.Sockets.UdpClient
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes('probe')
        $client.Send($bytes, $bytes.Length, '127.0.0.1', [int]$env:KQODE_PROBE_UDP_PORT)
    } finally { $client.Dispose() }
}
$r | ConvertTo-Json -Depth 4 -Compress
