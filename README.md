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

   Le dashboard est disponible sur `http://localhost:3000`. Définir `DASHBOARD_ADMIN_PASSWORD` avant toute mise en ligne. En HTTPS, laisser `DASHBOARD_COOKIE_SECURE=true`.

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

## Déploiement Render + Neon

Configuration recommandée pour une v1 sans carte bancaire :

- Build command : `npm ci && npm run build`
- Start command : `npm run serve`
- Variables : `NODE_ENV=production`, `DASHBOARD_COOKIE_SECURE=true`, `DATABASE_URL=<connexion Neon>`

Quand `DATABASE_URL` est présent, le dashboard, l’historique et les alertes envoyées utilisent Postgres. Sans `DATABASE_URL`, le projet utilise SQLite localement.

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
