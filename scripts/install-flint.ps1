<#
.SYNOPSIS
  Provisions the flint:40b model for SHODAN's merged neural link.

.DESCRIPTION
  SHODAN ships merged: the flint:40b local LLM is her default conversational and monologue voice,
  with CORTEX underneath as her soul and instant fallback. The model weights are ~23 GB and cannot
  be shipped in a repository, so this script supplies them on the user's own machine:

    1. Checks that Ollama is installed (https://ollama.com/download) and reachable.
    2. Pulls the flint:40b model (`ollama pull flint:40b`).
    3. Adds the SHODAN page origins to OLLAMA_ORIGINS so the browser is allowed to reach Ollama
       (the bundled K-Meleon-R pane uses https://kmr.shodan; the hosted site uses your domain).

  Everything stays on this computer; WHITE ICE only ever contacts loopback.

.PARAMETER Model
  Model tag to pull. Defaults to flint:40b.

.PARAMETER Origins
  Extra browser origins to allow in OLLAMA_ORIGINS. The SHODAN origins are always included.
#>
[CmdletBinding()]
param(
    [string]$Model = 'flint:40b',
    [string[]]$Origins = @()
)

$ErrorActionPreference = 'Stop'
$ShodanOrigins = @('https://kmr.shodan', 'https://www.imortalimp.nl')

function Find-Ollama {
    $cmd = Get-Command ollama -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $guess = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    if (Test-Path $guess) { return $guess }
    return $null
}

$ollama = Find-Ollama
if (-not $ollama) {
    Write-Warning 'Ollama was not found. Install it from https://ollama.com/download and run this script again.'
    exit 1
}
Write-Host "Using Ollama at $ollama"

# Allow the SHODAN browser origins to reach the local Ollama server (persist for the user).
$wanted = ($ShodanOrigins + $Origins) | Where-Object { $_ } | Select-Object -Unique
$current = [Environment]::GetEnvironmentVariable('OLLAMA_ORIGINS', 'User')
$set = @()
if ($current) { $set = $current.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ } }
$added = @()
foreach ($o in $wanted) { if ($set -notcontains $o) { $set += $o; $added += $o } }
if ($added.Count -gt 0) {
    [Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', ($set -join ','), 'User')
    Write-Host ("Added to OLLAMA_ORIGINS: {0}" -f ($added -join ', '))
    Write-Host 'Restart Ollama (and any open terminals) so the new OLLAMA_ORIGINS takes effect.'
} else {
    Write-Host 'OLLAMA_ORIGINS already includes the SHODAN origins.'
}

# Pull the model (idempotent: Ollama skips layers it already has).
Write-Host "Pulling $Model - this is a large download the first time..."
& $ollama pull $Model
if ($LASTEXITCODE -ne 0) { throw "ollama pull $Model failed with exit code $LASTEXITCODE" }

Write-Host ""
Write-Host "flint is ready. In SHODAN, GENERATION ENGINE = NEURAL LINK and MODEL = $Model are the defaults."
Write-Host "Endpoint stays http://localhost:11434/v1 (Ollama, loopback only)."
