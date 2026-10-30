$ErrorActionPreference = 'Stop'
$selpaApp = Join-Path $PSScriptRoot 'apps\web'

# Probe the same address and fixed port used by dev-local.mjs. Stop only our
# temporary listener; never terminate the process that already owns port 3000.
$selpaPortOccupied = $false
$selpaProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, 3000)
try {
    $selpaProbe.Start()
} catch [System.Net.Sockets.SocketException] {
    if ($_.Exception.SocketErrorCode -ne [System.Net.Sockets.SocketError]::AddressAlreadyInUse) { throw }
    $selpaPortOccupied = $true
} finally {
    $selpaProbe.Stop()
}

if ($selpaPortOccupied) {
    $selpaRuntime = $null
    try {
        $selpaRuntime = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/dev/local-runtime' -TimeoutSec 5
    } catch {
        # A different service, unavailable endpoint or timeout is a conflict,
        # not permission to replace the listener or select a different port.
    }

    $selpaBranch = ([string](& git -C $PSScriptRoot branch --show-current)).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar la rama del worktree.' }
    $selpaSha = ([string](& git -C $PSScriptRoot rev-parse HEAD)).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar el HEAD del worktree.' }
    $selpaSameApp = $false
    if ($selpaRuntime -and $selpaRuntime.app) {
        try {
            $selpaSameApp = [System.StringComparer]::OrdinalIgnoreCase.Equals(
                [System.IO.Path]::GetFullPath([string]$selpaRuntime.app).TrimEnd([char]92),
                [System.IO.Path]::GetFullPath($selpaApp).TrimEnd([char]92)
            )
        } catch { $selpaSameApp = $false }
    }

    if ($selpaSameApp -and $selpaRuntime.mode -eq 'development' -and
        $selpaRuntime.branch -ceq $selpaBranch -and $selpaRuntime.sha -eq $selpaSha) {
        Write-Host 'SELPA ya está ejecutándose correctamente'
        Write-Host 'http://10.4.21.30:3000/'
        exit 0
    }

    Write-Warning 'Conflicto: el puerto 3000 está ocupado por otra instancia o no se pudo verificar su identidad.'
    Write-Host "Worktree esperado: $selpaApp"
    Write-Host "Rama esperada: $selpaBranch · HEAD: $selpaSha"
    if ($selpaRuntime) {
        Write-Host "Instancia detectada: $($selpaRuntime.app)"
        Write-Host "Rama: $($selpaRuntime.branch) · SHA: $($selpaRuntime.sha) · Modo: $($selpaRuntime.mode)"
    }
    try {
        Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -Unique |
            ForEach-Object { Write-Host "PID que escucha en 3000: $_" }
    } catch { }
    Write-Host 'No se cerraron procesos ni se intentó iniciar otra instancia. El puerto sigue siendo 3000.'
    exit 1
}

Set-Location -LiteralPath $selpaApp
& node (Join-Path $selpaApp 'scripts\dev-local.mjs')
exit $LASTEXITCODE
