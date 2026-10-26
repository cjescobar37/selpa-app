$ErrorActionPreference = 'Stop'
$selpaApp = Join-Path $PSScriptRoot 'apps\web'
Set-Location -LiteralPath $selpaApp
& node (Join-Path $selpaApp 'scripts\dev-local.mjs')
exit $LASTEXITCODE
