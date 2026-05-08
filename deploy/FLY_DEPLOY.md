# Fly.io Deploy

Best non-Oracle choice for this bot: Fly.io.

Why: Fly Machines can run continuously and attach a persistent volume for `/data/deals.sqlite`. This matches the current architecture without rewriting SQLite to Postgres.

Important: Fly is not a reliable free production option for new accounts. The free trial is only for short testing, and persistent volumes are billable. Use this when you accept a small paid host.

## What Codex needs

- `flyctl auth login` completed on this machine, or a Fly access token.
- Fly app name, or approve the default `vinted-deal-alert-dashboard`.
- Region, default `cdg` for Paris.
- Dashboard admin password.
- `APIFY_TOKEN`.
- `DISCORD_WEBHOOK_URL`.

## Deploy

```powershell
.\deploy\deploy-fly.ps1 -AppName "vinted-deal-alert-dashboard" -Region "cdg"
```

The script creates:

- Fly app
- 1GB volume named `vinted_data`
- secrets
- production deploy

After deploy:

```powershell
flyctl status
flyctl logs
flyctl open
```
