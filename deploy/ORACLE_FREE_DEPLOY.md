# Oracle Always Free Deploy

Recommended hosting for this bot: one Oracle Always Free VM.

Why: the dashboard and scheduler run in one long-lived Node process, and the SQLite database needs persistent disk. PaaS free tiers that sleep or use ephemeral filesystems are not a good fit for the current architecture.

## What to create in Oracle

- Ubuntu VM, Always Free eligible.
- Public IPv4 address.
- Ingress rule for SSH `22`.
- Ingress rule for dashboard port `3000` while testing.
- Later, use HTTPS on `443` through Caddy/Nginx and set `DASHBOARD_COOKIE_SECURE=true`.

## Give Codex

- VM public IP.
- SSH username, usually `ubuntu`.
- SSH private key path on this machine, or add `C:\Users\3440\.ssh\id_ed25519.pub` to the VM.
- Dashboard admin password to use.
- Apify token.
- Discord webhook URL.
- Optional domain name for HTTPS.

## CLI deploy

```powershell
.\deploy\deploy-oracle.ps1 -HostName "VM_PUBLIC_IP" -User "ubuntu" -KeyPath "$env:USERPROFILE\.ssh\id_ed25519" -Port 3000
```

After first deploy, edit `/opt/vinted-deal-alert/.env` on the VM and restart:

```bash
sudo nano /opt/vinted-deal-alert/.env
sudo systemctl restart vinted-dashboard
sudo systemctl status vinted-dashboard
```
