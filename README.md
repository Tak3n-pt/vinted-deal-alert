# Vinted Deal Alert

Dashboard web et bot Discord pour repérer les bonnes opportunités Vinted.fr sur les smartphones haut de gamme récents.

Le projet garde volontairement une frontière de données autorisée. Il ne se connecte pas à Vinted, ne scrape pas directement Vinted, ne met pas d’articles en favori, ne contacte pas les vendeurs et n’achète rien automatiquement.

## Modèles surveillés

V1 couvre maintenant :

- iPhone 13 Pro / Pro Max à iPhone 17 Pro / Pro Max
- Samsung Galaxy S22+ / Ultra à Galaxy S26+ / Ultra
- Samsung Galaxy Z Fold / Flip 4 à Fold / Flip 7
- Google Pixel 9 Pro / Pro XL / Pro Fold
- Google Pixel 10 Pro / Pro XL / Pro Fold

Les modèles non Pro, les accessoires, les pièces détachées, les téléphones bloqués, les copies et les annonces trop risquées sont rejetés avant alerte.

## Installation locale

1. Installer les dépendances :

   ```powershell
   npm install
   ```

2. Copier `.env.example` vers `.env`, puis renseigner :

   - `PROVIDER_TYPE=apify`
   - `APIFY_TOKEN`
   - `APIFY_ACTOR_ID`
   - `DISCORD_WEBHOOK_URL`
   - `PROVIDER_TIMEOUT_SECONDS`
   - `MAX_PRODUCTS_PER_SCAN`
   - `HEARTBEAT_EVERY_SCANS`

   Pour Apify, `AUTHORIZED_DATA_API_URL` et `AUTHORIZED_DATA_API_KEY` ne sont pas utilisés.

3. Lancer un scan unique :

   ```powershell
   npm run once
   ```

4. Lancer le bot seul :

   ```powershell
   npm start
   ```

5. Lancer le dashboard avec le bot dans le même serveur :

   ```powershell
   npm run dashboard
   ```

   Le dashboard est disponible sur `http://localhost:3000`. Définir `DASHBOARD_ADMIN_PASSWORD` avant toute mise en ligne (le serveur refuse de démarrer en `NODE_ENV=production` sans). En HTTPS, laisser `DASHBOARD_COOKIE_SECURE=true`. Pour exposer le port autrement que sur loopback, définir `DASHBOARD_HOST` (ex. `0.0.0.0` derrière un reverse-proxy).

## Dashboard

Le dashboard permet de gérer :

- statut du bot, pause, reprise et scan manuel,
- recherches Vinted par requête ou URL filtrée,
- modèles activés, stockages, prix maximum et seuils,
- règles de risque vendeur/produit,
- paramètres Apify, Discord, dry-run et intervalle de scan,
- historique des scans, opportunités, rejets et logs.

Les secrets sont write-only : le frontend indique seulement si Discord, Apify ou l’API générique sont configurés.

## Provider autorisé

### Apify

Configuration par défaut :

```env
PROVIDER_TYPE=apify
APIFY_ACTOR_ID=epicscrapers~vinted-search-scraper
```

Le bot envoie une entrée de ce type :

```json
{
  "maxProducts": 10,
  "startUrls": [
    {
      "url": "https://www.vinted.fr/catalog?search_text=iphone+17+pro+256go&order=newest_first"
    }
  ]
}
```

### API générique

L’endpoint doit accepter un `POST` JSON :

```json
{
  "market": "FR",
  "query": "iphone 17 pro",
  "limit": 10,
  "sort": "newest"
}
```

Le service accepte les réponses sous forme de tableau direct ou sous des clés courantes comme `items`, `products`, `listings` ou `data`.

## Contrôle des coûts

Les recherches par défaut restent limitées à 10 requêtes de 10 produits, donc 100 produits maximum par scan avec `MAX_PRODUCTS_PER_SCAN=100`.

Le dashboard permet d’ajouter plus de recherches, mais si la somme des limites dépasse `MAX_PRODUCTS_PER_SCAN`, le bot refuse de démarrer. Augmenter cette limite seulement si le coût provider est maîtrisé.

## Logique de scoring

Pour chaque modèle, stockage et état, le bot compare le prix final à un benchmark. Quand l’historique récent est suffisant, il le mélange avec un prix de marché de secours. Les prix irréalistes sont ignorés pour éviter qu’une annonce cassée ou frauduleuse baisse le benchmark.

Le prix utilisé est :

- le prix total provider quand disponible,
- sinon le prix article plus frais connus,
- sinon une estimation du coût final avec frais acheteur et livraison.

Une alerte est envoyée seulement si :

- le score minimum est atteint,
- la remise et l’économie estimée sont suffisantes,
- le modèle et le stockage sont activés,
- le prix final respecte le maximum défini,
- aucun risque bloquant n’est détecté.

Les signaux bloquants incluent notamment iCloud/compte bloqué, pièces détachées, écran cassé, prix irréaliste, image manquante selon règle, vendeur trop faible, vendeur trop récent, pays incohérent, doublon photo, batterie trop faible, écran non original ou facture manquante selon règle.

Chaque annonce est alertée une seule fois. Elle peut être re-alertée uniquement si le prix baisse d’au moins 10 %.

## Sécurité du dashboard

Le serveur `dashboardServer` applique :

- En-têtes `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy` minimal.
- Cookie de session `HttpOnly`, `SameSite=Lax`, `Secure` automatique en production.
- Limitation des tentatives de login (8 essais par 15 min par IP) et des écritures
  (30 par 10 s par IP).
- Refus de démarrer en `NODE_ENV=production` sans `DASHBOARD_ADMIN_PASSWORD`,
  ou avec un mot de passe trivial (`admin`).
- Liaison par défaut à `127.0.0.1` en local. Pour exposer le port directement,
  définir `DASHBOARD_HOST=0.0.0.0`. En production, on suppose un proxy / Cloudflare
  Access en frontal.

Recommandé en plus en ligne :

- Cloudflare Access (gratuit jusqu’à 50 utilisateurs) ou un tunnel Tailscale pour
  ne jamais exposer le dashboard publiquement.
- Allowlist d’IP côté reverse-proxy si Cloudflare Access n’est pas une option.

## Mode multi-utilisateur (Discord OAuth)

Depuis V0.2, le dashboard supporte plusieurs utilisateurs connectés via OAuth
Discord, chacun avec ses propres recherches, règles, et webhook Discord.

### Création de l’application Discord

1. Aller sur https://discord.com/developers/applications, créer une nouvelle
   application.
2. Onglet **OAuth2** → **General** → ajouter le redirect URI :
   `https://app.bonoitec.com/api/auth/discord/callback` (ou la base URL de ton
   déploiement).
3. Copier `CLIENT_ID` et `CLIENT_SECRET`.
4. Aucune permission de bot n’est nécessaire — seules les scopes `identify` et
   `email` sont demandées au login.

### Variables d’environnement

```env
# OAuth Discord
DISCORD_OAUTH_CLIENT_ID=...
DISCORD_OAUTH_CLIENT_SECRET=...
DISCORD_OAUTH_REDIRECT_URI=https://app.bonoitec.com/api/auth/discord/callback

# URL publique (sert aussi à fixer le domaine cookie en production)
PUBLIC_BASE_URL=https://app.bonoitec.com

# Liste d'accès anticipé (Discord snowflake IDs séparés par virgules).
# Vide = tout le monde peut se connecter. Les utilisateurs plan='admin'
# bypassent ce filtre.
BETA_DISCORD_IDS=123456789012345678,234567890123456789

# Clé de chiffrement pour les webhooks Discord par utilisateur (32 octets base64).
# Générer avec : node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
DASHBOARD_ENCRYPTION_KEY=...

# Connexion par mot de passe — désactivée par défaut en production (OAuth est
# la voie principale). Mettre à "1" pour conserver un accès secours.
LEGACY_PASSWORD_LOGIN=
```

### Domaine personnalisé sur Render

1. Render → service → **Settings** → **Custom Domains** → ajouter
   `app.bonoitec.com`.
2. Render renvoie un CNAME (typiquement `vinted-deal-alert-dashboard.onrender.com`).
3. Côté DNS (Vercel ou autre), créer un enregistrement CNAME `app` pointant vers
   la cible Render. Le SSL Let’s Encrypt est provisionné automatiquement, ~10 min.
4. Mettre à jour le redirect URI Discord pour pointer vers le nouveau domaine.

### Utilisateurs et plans

- **`admin`** (id = 1, seedé automatiquement) : accès aux paramètres globaux,
  scan manuel, pause/reprise. Peut utiliser `DISCORD_WEBHOOK_URL` du `.env` si
  pas de webhook personnel configuré dans le dashboard.
- **`pro`** : pas de limite quotidienne basse (à câbler manuellement via SQL ou
  via une route admin à venir).
- **`free`** (par défaut) : 30 produits/jour via `daily_apify_quota`. Modifiable
  par utilisateur.

### Quota Apify

Chaque utilisateur a un compteur quotidien `usage_log.products_fetched`. Si la
somme du jour atteint `users.daily_apify_quota`, le bot saute ses scans jusqu’au
lendemain. Le compteur se remet à zéro à minuit (jour calendaire UTC côté DB).

### Endpoint santé

`GET /healthz` retourne `{ ok: true }` — utile pour les sondes UptimeRobot ou
Render health checks.

## Déploiement

### Render + Neon (recommandé sans carte bancaire)

- Build command : `npm ci && npm run build`
- Start command : `npm run serve`
- Variables : `NODE_ENV=production`, `DASHBOARD_COOKIE_SECURE=true`,
  `DATABASE_URL=<connexion Neon>`, `DASHBOARD_ADMIN_PASSWORD=<phrase de passe forte>`,
  plus les variables OAuth ci-dessus si tu veux le mode multi-utilisateur.

Quand `DATABASE_URL` est présent, le dashboard, l’historique et les alertes
envoyées utilisent Postgres. Sans `DATABASE_URL`, le projet utilise SQLite local.

### Fly.io (SQLite + volume persistant)

Voir `deploy/FLY_DEPLOY.md`. Points clés :

- Volume Fly attaché à `/data` (déjà câblé via `DATABASE_PATH=/data/deals.sqlite`).
- `fly secrets set DASHBOARD_ADMIN_PASSWORD=... DISCORD_WEBHOOK_URL=... APIFY_TOKEN=...`.
- SQLite tourne en mode WAL (`pragma journal_mode = WAL`), ce qui rend la
  cohabitation lecture / écriture sans contention.

### VPS Docker (Hetzner CX22, Oracle Ampere, etc.)

```bash
docker build -t vinted-deal-alert .
docker volume create vinted-data
docker run -d --name vinted-deal-alert \
  --restart=always \
  -p 127.0.0.1:3000:3000 \
  -v vinted-data:/data \
  -e NODE_ENV=production \
  -e DASHBOARD_ADMIN_PASSWORD='<phrase forte>' \
  -e DISCORD_WEBHOOK_URL='https://discord.com/api/webhooks/...' \
  -e APIFY_TOKEN='...' \
  -e DASHBOARD_COOKIE_SECURE=true \
  vinted-deal-alert
```

Mettre Caddy / nginx en frontal pour le HTTPS et l’authentification supplémentaire.
`--restart=always` redémarre le bot après reboot ou crash. Pour la persistance
SQLite, conserver le volume `vinted-data`.

### systemd (sans Docker)

Sur une machine Linux :

```
[Unit]
Description=Vinted Deal Alert
After=network-online.target

[Service]
WorkingDirectory=/opt/vinted-deal-alert
ExecStart=/usr/bin/npm run serve
Environment=NODE_ENV=production
Environment=DATABASE_PATH=/var/lib/vinted-deal-alert/deals.sqlite
Environment=DASHBOARD_ADMIN_PASSWORD=...
Environment=DISCORD_WEBHOOK_URL=...
Environment=APIFY_TOKEN=...
Restart=always
RestartSec=5
User=vinted

[Install]
WantedBy=multi-user.target
```

`systemctl enable --now vinted-deal-alert` puis surveiller via `journalctl -u`.

### Choix backend

| Cas d’usage | Recommandation |
| --- | --- |
| Démo gratuite, peu de trafic | Render + Neon (Postgres free tier) |
| Auto-hébergé, < 5 €/mois | VPS 1 vCPU 1 GB + Docker + SQLite WAL |
| Latence faible côté FR | Fly.io région `cdg`, SQLite + volume |
| Données sensibles / corp | Tailscale + serveur interne, SQLite |

Pour tous les cas, le bot tourne en continu : pas de cron externe nécessaire,
le scan suivant est planifié à la fin du précédent (`pollIntervalSeconds`).

## Scripts

```powershell
npm run once
npm start
npm run dashboard
npm run sample
npm test
npm run check
npm run build
```
