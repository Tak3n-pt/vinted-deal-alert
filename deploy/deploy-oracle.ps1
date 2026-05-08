param(
  [Parameter(Mandatory = $true)][string]$HostName,
  [string]$User = "ubuntu",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519",
  [string]$RemoteDir = "/opt/vinted-deal-alert",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$bundle = Join-Path $env:TEMP "vinted-deal-alert-dashboard.tar.gz"

Push-Location $root
try {
  npm run build

  if (Test-Path $bundle) {
    Remove-Item -LiteralPath $bundle -Force
  }

  tar `
    --exclude="./node_modules" `
    --exclude="./data/*.sqlite" `
    --exclude="./data/*.log" `
    --exclude="./.env" `
    -czf $bundle `
    package.json package-lock.json README.md .env.example src dashboard dist deploy tests tsconfig.json config.searches.example.json

  $target = "${User}@${HostName}"
  ssh -i $KeyPath $target "sudo mkdir -p '$RemoteDir' && sudo chown -R '$User:$User' '$RemoteDir'"
  scp -i $KeyPath $bundle "${target}:/tmp/vinted-deal-alert-dashboard.tar.gz"
  ssh -i $KeyPath $target "tar -xzf /tmp/vinted-deal-alert-dashboard.tar.gz -C '$RemoteDir' && chmod +x '$RemoteDir/deploy/oracle-remote-install.sh' && APP_DIR='$RemoteDir' PORT='$Port' '$RemoteDir/deploy/oracle-remote-install.sh'"
  ssh -i $KeyPath $target "systemctl --no-pager --full status vinted-dashboard"
}
finally {
  Pop-Location
}
