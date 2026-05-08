param(
  [string]$AppName = "vinted-deal-alert-dashboard",
  [string]$Region = "cdg",
  [string]$VolumeName = "vinted_data",
  [int]$VolumeSizeGb = 1
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $root
try {
  flyctl auth whoami | Out-Host

  if ($AppName -ne "vinted-deal-alert-dashboard") {
    (Get-Content -LiteralPath "fly.toml") `
      -replace 'app = "vinted-deal-alert-dashboard"', "app = `"$AppName`"" `
      -replace 'primary_region = "cdg"', "primary_region = `"$Region`"" |
      Set-Content -LiteralPath "fly.toml"
  }

  flyctl apps create $AppName --org personal 2>$null || $true
  flyctl volumes create $VolumeName --region $Region --size $VolumeSizeGb --yes

  $adminPassword = Read-Host "Dashboard admin password"
  $apifyToken = Read-Host "APIFY_TOKEN"
  $discordWebhook = Read-Host "DISCORD_WEBHOOK_URL"

  flyctl secrets set `
    DASHBOARD_ADMIN_PASSWORD="$adminPassword" `
    APIFY_TOKEN="$apifyToken" `
    DISCORD_WEBHOOK_URL="$discordWebhook"

  flyctl deploy --remote-only
  flyctl status
  flyctl open
}
finally {
  Pop-Location
}
