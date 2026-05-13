// Locale-aware formatters and label translators shared across views.
// Extracted verbatim from the previous App.jsx so behavior matches.

export function eur(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export function dateTimeShort(value) {
  return value ? new Date(value).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
}

export function timeShort(value) {
  return value ? new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "-";
}

export function duration(seconds) {
  if (!seconds) return "-";
  if (seconds >= 86400) return `${Math.round(seconds / 86400)} j`;
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds} s`;
}

export function botStateLabel(status) {
  if (!status) return "Connexion";
  if (status.scanInFlight) return "Scan en cours";
  if (status.paused) return "En pause";
  return "Actif";
}

export function tStatus(value) {
  return { running: "en cours", success: "réussi", failed: "échec", skipped: "ignoré" }[value] ?? value;
}

export function tSource(value) {
  return { manual: "manuel", startup: "démarrage", scheduled: "planifié" }[value] ?? value;
}

export function tRisk(value) {
  return { clean: "propre", low: "faible", medium: "moyen", high: "élevé", reject: "bloqué" }[value] ?? value;
}

export function tLogLevel(value) {
  return { info: "info", warn: "alerte", error: "erreur" }[value] ?? value;
}

export function translateReason(reason) {
  return String(reason)
    .replace("disabled in dashboard rules", "désactivé dans les règles")
    .replace("storage is not enabled for", "stockage non activé pour")
    .replace("final price above dashboard max", "prix final au-dessus du maximum")
    .replace("blocked risk:", "risque bloquant :")
    .replace("score below", "score inférieur à")
    .replace("discount below", "remise inférieure à")
    .replace("savings below", "économie inférieure à")
    .replace("below logical market floor", "prix inférieur au plancher logique")
    .replace("seller has no feedback", "vendeur sans avis")
    .replace("seller history too weak for discount", "historique vendeur trop faible pour cette remise")
    .replace("seller account is very new", "compte vendeur très récent")
    .replace("seller account is new for this discount", "compte vendeur récent pour cette remise")
    .replace("seller country differs from item country", "pays vendeur différent du pays de l'article")
    .replace("description too short", "description trop courte")
    .replace("missing image", "image absente")
    .replace("unrealistic phone price", "prix téléphone irréaliste")
    .replace("accessory only", "accessoire uniquement")
    .replace("rejected", "rejeté");
}

export function translateLog(message) {
  return String(message)
    .replace("Dashboard settings updated", "Paramètres du dashboard mis à jour")
    .replace("Dashboard rules restored to defaults", "Règles restaurées par défaut")
    .replace("Search created:", "Recherche créée :")
    .replace("Search updated:", "Recherche mise à jour :")
    .replace("Search deleted:", "Recherche supprimée :")
    .replace("Model rules updated", "Règles des modèles mises à jour")
    .replace("Risk rules updated", "Règles de risque mises à jour")
    .replace("Bot paused from dashboard", "Bot mis en pause depuis le dashboard")
    .replace("Bot resumed from dashboard", "Bot relancé depuis le dashboard")
    .replace("Discord test message sent", "Message de test Discord envoyé")
    .replace(/Scan success: (\d+) listings, (\d+) alerts sent/, "Scan réussi : $1 annonces, $2 alertes envoyées")
    .replace(/Scan failed: (\d+) listings, (\d+) alerts sent/, "Scan échoué : $1 annonces, $2 alertes envoyées")
    .replace(/Plafond par scan atteint \((\d+)\)\..*/, "Plafond par scan atteint ($1) — alertes restantes différées")
    .replace(/Plafond journalier atteint \((\d+)\)\..*/, "Plafond journalier atteint ($1) — alertes restantes différées")
    .replace(/Heures calmes : alerte (.+) reportée\..*/, "Heures calmes : alerte « $1 » reportée");
}

export function filterLabel(value) {
  return { all: "Tous", alert: "Alertables", sent: "Envoyés", risk: "Risques" }[value];
}

export function pageTitle(view) {
  return {
    dashboard: "Tableau de bord",
    deals: "Historique des opportunités",
    searches: "Recherches Vinted",
    rules: "Modèles, stockages et prix",
    risks: "Protection qualité",
    settings: "Paramètres"
  }[view];
}

export function updateById(items, id, patch) {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function updateByModel(items, model, patch) {
  return items.map((item) => (item.model === model ? cleanEmpty({ ...item, ...patch }) : item));
}

function cleanEmpty(value) {
  const next = { ...value };
  for (const key of ["maxFinalPrice", "minScore", "minDiscount", "minSavings"]) {
    if (next[key] === "") delete next[key];
  }
  return next;
}

export function parseList(value) {
  return value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0);
}

export function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function optionalNumber(value) {
  if (String(value).trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
