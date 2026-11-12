#requires -Version 7.0
param(
    [ValidateRange(1024, 65535)][int]$ServerPort = 49886,
    [ValidateRange(1024, 65535)][int]$DaemonPort = 49887
)
$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'bb.ps1'
$data = Join-Path ([IO.Path]::GetTempPath()) ('bb-windows-smoke-' + [Guid]::NewGuid().ToString('N'))
$common = @{ DataDir = $data; ServerPort = $ServerPort; DaemonPort = $DaemonPort }
function Get-ListenerId([int]$Port) {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($listeners.Count -ne 1) { throw "Expected one listener at port $Port, found $($listeners.Count)." }
    return $listeners[0]
}
function Wait-NewListener([int]$Port, [int]$Previous) {
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        try { $current = Get-ListenerId $Port; if ($current -ne $Previous) { return $current } } catch { }
        Start-Sleep -Milliseconds 500
    }
    throw "Port $Port did not recover."
}
function Get-ListenerRuntime([int]$Port) {
    $id = Get-ListenerId $Port
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$id"
    if (-not $process) { throw "Listener process $id on port $Port exited before verification." }
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ParentProcessId)"
    if (-not $parent -or $parent.CommandLine -notlike '*runtime.mjs*') { throw "Listener $id on port $Port is not a direct child of the isolated test runtime." }
    return $id
}
function Wait-DaemonConnected([int]$Attempts = 240) {
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        try {
            $status = Invoke-RestMethod -Uri "http://127.0.0.1:$DaemonPort/status" -TimeoutSec 2
            if ($status.connected) { return }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    throw "Host daemon did not report a server connection."
}
try {
    $starters = @()
    for ($index = 0; $index -lt 3; $index++) {
        $arguments = @('-NoProfile', '-File', ('"' + $launcher + '"'), '-Action', 'Start', '-DataDir', ('"' + $data + '"'), '-ServerPort', $ServerPort, '-DaemonPort', $DaemonPort)
        $starters += Start-Process -FilePath (Join-Path $PSHOME 'pwsh.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru
    }
    foreach ($starter in $starters) {
        if (-not $starter.WaitForExit(90000) -or $starter.ExitCode -ne 0) { throw 'Concurrent startup failed.' }
        $starter.Dispose()
    }
    Wait-DaemonConnected
    $serverId = Get-ListenerRuntime $ServerPort
    Stop-Process -Id $serverId
    $serverId = Wait-NewListener $ServerPort $serverId
    [void](Get-ListenerRuntime $ServerPort)
    Wait-DaemonConnected
    Write-Output "server crash recovery passed ($serverId)."
    $daemonId = Get-ListenerRuntime $DaemonPort
    Stop-Process -Id $daemonId
    $daemonId = Wait-NewListener $DaemonPort $daemonId
    [void](Get-ListenerRuntime $DaemonPort)
    Wait-DaemonConnected
    Write-Output "host-daemon crash recovery passed ($daemonId)."
    $runtimePid = (Get-CimInstance Win32_Process -Filter "ProcessId=$serverId").ParentProcessId
    Stop-Process -Id $runtimePid
    $serverId = Wait-NewListener $ServerPort $serverId
    $daemonId = Wait-NewListener $DaemonPort $daemonId
    [void](Get-ListenerRuntime $ServerPort)
    [void](Get-ListenerRuntime $DaemonPort)
    Wait-DaemonConnected
    Write-Output "runtime crash recovery passed ($runtimePid)."
    & $launcher -Action Stop @common
    if ($LASTEXITCODE -ne 0) { throw 'Stop failed.' }
    foreach ($port in @($ServerPort, $DaemonPort)) {
        if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "Port $port remains occupied after stop." }
    }
    & $launcher -Action Start @common
    if ($LASTEXITCODE -ne 0) { throw 'Restart failed.' }
    [void](Get-ListenerRuntime $ServerPort)
    [void](Get-ListenerRuntime $DaemonPort)
    Write-Output 'PASS: concurrent start, service crashes, runtime crash, stop, restart.'
} finally {
    & $launcher -Action Stop @common
    Write-Output "Isolated test evidence: $data"
}
