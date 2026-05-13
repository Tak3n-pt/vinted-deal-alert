import React, { useMemo } from "react";
import { useApp } from "../AppContext.jsx";
import { api } from "../api.js";
import { eur, dateTimeShort, duration, botStateLabel, tStatus, tSource, translateReason, timeShort } from "../format.js";
import StatCard from "../components/StatCard.jsx";
import AreaChart from "../components/AreaChart.jsx";
import Donut from "../components/Donut.jsx";
import ActivityTimeline from "../components/ActivityTimeline.jsx";
import { ScoreBadge, RiskBadge, StatusBadge } from "../components/ScoreBadge.jsx";
import Empty from "../components/Empty.jsx";
import WebhookOnboarding from "../components/WebhookOnboarding.jsx";

export default function Dashboard() {
  const {
    status,
    settings,
    searches,
    modelRules,
    deals,
    scans,
    logs,
    userSettings,
    currentUser,
    runAction,
    refreshAll,
    loading
  } = useApp();

  const metrics = useMemo(() => buildMetrics(scans, deals), [scans, deals]);
  const distribution = useMemo(() => buildScoreDistribution(deals), [deals]);
  const hourly = useMemo(() => buildHourlyChart(scans), [scans]);
  const topSearches = useMemo(() => buildTopSearches(searches, scans), [searches, scans]);

  const activeSearches = searches.filter((s) => s.enabled).length;
  const enabledModels = modelRules.filter((r) => r.enabled).length;
  const sentToday = deals.filter((d) => d.sent).length;
  const alertable = deals.filter((d) => d.shouldAlert).length;
  const recentDeals = deals.slice(0, 8);

  return (
    <>
      {/* --- Breadcrumb --- */}
      <div className="font-weight-medium shadow-none position-relative overflow-hidden mb-7">
        <div className="card-body px-0">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <h4 className="font-weight-medium mb-0">Tableau de bord</h4>
              <nav aria-label="breadcrumb">
                <ol className="breadcrumb">
                  <li className="breadcrumb-item"><a className="text-muted text-decoration-none" href="#">Bonoitec Flash</a></li>
                  <li className="breadcrumb-item text-muted" aria-current="page">Tableau de bord</li>
                </ol>
              </nav>
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <button
                className="btn btn-outline-secondary d-flex align-items-center gap-1"
                onClick={refreshAll}
                disabled={loading}
              >
                <iconify-icon icon="solar:refresh-line-duotone"></iconify-icon>
                Actualiser
              </button>
              <button
                className="btn btn-primary d-flex align-items-center gap-1"
                onClick={() => runAction("Scan lancé", () => api("/api/bot/scan-now", { method: "POST" }))}
                disabled={loading}
              >
                <iconify-icon icon="solar:rocket-line-duotone"></iconify-icon>
                Scanner maintenant
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* --- Webhook onboarding --- */}
      {userSettings && !userSettings.discordWebhookConfigured ? (
        <WebhookOnboarding onSaved={() => refreshAll()} />
      ) : null}

      {/* --- Hero + KPI grid --- */}
      <div className="row">
        {/* Hero welcome (col-lg-5): mimics MP's "Upgrade Plan" promo card */}
        <div className="col-lg-5 col-md-12">
          <div className="card bonoitec-hero h-100">
            <div className="card-body p-7 d-flex flex-column h-100 position-relative">
              <div className="d-flex align-items-center gap-3 mb-3">
                <div className="hero-icon">
                  <iconify-icon icon="solar:rocket-line-duotone" style={{ fontSize: 36, color: "#fff" }}></iconify-icon>
                </div>
                <div>
                  <p className="mb-0 fs-3 opacity-75">Bonjour {currentUser?.username ? currentUser.username : "👋"}</p>
                  <h4 className="mb-0 text-white fw-bold">Bonoitec Flash veille pour toi</h4>
                </div>
              </div>
              <p className="fs-3 opacity-75 mb-4">
                {sentToday} alerte{sentToday > 1 ? "s" : ""} envoyée{sentToday > 1 ? "s" : ""} aujourd'hui · {metrics.totalListings.toLocaleString("fr-FR")} annonces analysées · {activeSearches} recherches actives
              </p>
              <div className="d-flex gap-2 mt-auto flex-wrap">
                <button
                  className="btn btn-light d-flex align-items-center gap-1 fw-semibold"
                  onClick={() => runAction("Scan lancé", () => api("/api/bot/scan-now", { method: "POST" }))}
                  disabled={loading}
                >
                  <iconify-icon icon="solar:play-line-duotone"></iconify-icon>
                  Scanner maintenant
                </button>
                <button
                  className="btn btn-outline-light d-flex align-items-center gap-1"
                  onClick={() =>
                    runAction(
                      status?.paused ? "Bot relancé" : "Bot mis en pause",
                      () => api(status?.paused ? "/api/bot/resume" : "/api/bot/pause", { method: "POST" })
                    )
                  }
                  disabled={loading}
                >
                  <iconify-icon icon={status?.paused ? "solar:play-line-duotone" : "solar:pause-line-duotone"}></iconify-icon>
                  {status?.paused ? "Reprendre" : "Mettre en pause"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 2×2 KPI grid (col-lg-7): mimics MP's 4-up KPI tiles */}
        <div className="col-lg-7 col-md-12">
          <div className="row">
            <div className="col-md-6 mb-4">
              <StatCard
                label="Alertes envoyées"
                value={sentToday}
                sub={`${alertable} opportunités alertables`}
                color="primary"
                variant="filled"
                icon="solar:bell-bing-line-duotone"
                sparklineData={metrics.sentHistory}
              />
            </div>
            <div className="col-md-6 mb-4">
              <StatCard
                label="État du bot"
                value={botStateLabel(status)}
                sub={settings?.dryRun ? "Simulation active" : "Alertes Discord actives"}
                color={status?.paused ? "warning" : "success"}
                icon="solar:wifi-router-line-duotone"
                sparklineData={metrics.scanHistory}
              />
            </div>
            <div className="col-md-6">
              <StatCard
                label="Annonces (24 h)"
                value={metrics.totalListings.toLocaleString("fr-FR")}
                sub={`${metrics.scanCount} scans · moy ${metrics.avgListings}/scan`}
                color="secondary"
                variant="filled"
                icon="solar:eye-scan-line-duotone"
                sparklineData={metrics.listingsHistory}
              />
            </div>
            <div className="col-md-6">
              <StatCard
                label="Couverture"
                value={`${enabledModels} modèles`}
                sub={`${activeSearches} recherches actives`}
                color="info"
                icon="solar:smartphone-2-line-duotone"
              />
            </div>
          </div>
        </div>
      </div>

      {/* --- Control strip --- */}
      <div className="card overflow-hidden mb-4">
        <div className="card-body p-4">
          <div className="row g-3 align-items-center">
            <div className="col-lg col-md-6 col-6">
              <span className="fs-2 text-muted d-block">Prochain scan</span>
              <strong className="fs-4">{status?.nextScanAt ? dateTimeShort(status.nextScanAt) : "Non planifié"}</strong>
            </div>
            <div className="col-lg col-md-6 col-6">
              <span className="fs-2 text-muted d-block">Intervalle</span>
              <strong className="fs-4">{duration(settings?.pollIntervalSeconds ?? 0)}</strong>
            </div>
            <div className="col-lg col-md-6 col-6">
              <span className="fs-2 text-muted d-block">Heures calmes</span>
              <strong className="fs-4">{settings?.quietHoursEnabled ? `${settings.quietHoursStart}–${settings.quietHoursEnd}` : "Désactivées"}</strong>
            </div>
            <div className="col-lg col-md-6 col-6">
              <span className="fs-2 text-muted d-block">Plafond / 24 h</span>
              <strong className="fs-4">{settings?.maxAlertsPerDay > 0 ? `${settings.maxAlertsPerDay} alertes` : "Sans limite"}</strong>
            </div>
            <div className="col-lg-auto col-12 d-flex gap-2 justify-content-end">
              <button
                className="btn btn-outline-primary d-flex align-items-center gap-1"
                onClick={() =>
                  runAction(
                    status?.paused ? "Bot relancé" : "Bot mis en pause",
                    () => api(status?.paused ? "/api/bot/resume" : "/api/bot/pause", { method: "POST" })
                  )
                }
                disabled={loading}
              >
                <iconify-icon icon={status?.paused ? "solar:play-line-duotone" : "solar:pause-line-duotone"}></iconify-icon>
                {status?.paused ? "Reprendre" : "Mettre en pause"}
              </button>
              <button
                className="btn btn-outline-secondary d-flex align-items-center gap-1"
                onClick={() => runAction("Message Discord envoyé", () => api("/api/discord/test", { method: "POST" }))}
                disabled={loading}
              >
                <iconify-icon icon="solar:plain-2-line-duotone"></iconify-icon>
                Tester Discord
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* --- Charts row --- */}
      <div className="row">
        <div className="col-lg-8">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div>
                  <h5 className="card-title mb-0 fw-semibold">Activité du bot</h5>
                  <span className="fs-3 text-muted">Annonces & alertes sur les dernières 24 heures</span>
                </div>
                <div className="d-flex align-items-center gap-3">
                  <span className="d-flex align-items-center gap-1 fs-3"><span className="bg-primary rounded-circle d-inline-block" style={{ width: 8, height: 8 }}></span> Annonces</span>
                  <span className="d-flex align-items-center gap-1 fs-3"><span className="bg-secondary rounded-circle d-inline-block" style={{ width: 8, height: 8 }}></span> Alertes</span>
                </div>
              </div>
              {hourly.series[0].data.some((v) => v > 0) ? (
                <AreaChart categories={hourly.categories} series={hourly.series} />
              ) : (
                <Empty text="Aucun scan dans les dernières 24 heures" />
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title mb-1 fw-semibold">Score des opportunités</h5>
              <span className="fs-3 text-muted d-block mb-3">Répartition par tranche de score</span>
              {distribution.total > 0 ? (
                <>
                  <Donut
                    labels={["Excellent (≥88)", "Bon (82–87)", "Limite (<82)"]}
                    series={[distribution.good, distribution.medium, distribution.low]}
                    colors={["var(--bs-primary)", "var(--bs-secondary)", "var(--bs-warning)"]}
                    totalLabel="Opportunités"
                  />
                  <div className="mt-3">
                    <DistRow label="Excellent (≥88)" count={distribution.good} total={distribution.total} tone="primary" />
                    <DistRow label="Bon (82–87)" count={distribution.medium} total={distribution.total} tone="secondary" />
                    <DistRow label="Limite (<82)" count={distribution.low} total={distribution.total} tone="warning" />
                  </div>
                </>
              ) : (
                <Empty text="Pas encore d'opportunités scorées" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- Recent deals + top searches --- */}
      <div className="row">
        <div className="col-lg-8">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h5 className="card-title mb-0 fw-semibold">Dernières opportunités</h5>
                <span className="fs-3 text-muted">{recentDeals.length} dernières</span>
              </div>
              {recentDeals.length === 0 ? (
                <Empty text="Aucune opportunité encore détectée" />
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle">
                    <thead>
                      <tr className="text-uppercase fs-2 text-muted">
                        <th>Produit</th>
                        <th>Prix final</th>
                        <th>Remise</th>
                        <th>Score</th>
                        <th>Risque</th>
                        <th>Statut</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentDeals.map((deal) => (
                        <tr key={deal.id}>
                          <td>
                            <div className="d-flex align-items-center gap-3">
                              <div className="bg-primary-subtle rounded-circle round-40 d-flex align-items-center justify-content-center">
                                <iconify-icon icon="solar:smartphone-2-line-duotone" class="text-primary fs-5"></iconify-icon>
                              </div>
                              <div>
                                <h6 className="mb-0 fs-3 fw-semibold">
                                  {deal.model ?? "Modèle inconnu"}{deal.storageGb ? ` ${deal.storageGb} Go` : ""}
                                </h6>
                                <span className="fs-2 text-muted text-truncate d-inline-block" style={{ maxWidth: "240px" }}>{deal.title}</span>
                              </div>
                            </div>
                          </td>
                          <td><strong>{eur(deal.finalPrice)}</strong></td>
                          <td>
                            <span className="fw-semibold">{Math.round((deal.discountPercent ?? 0) * 100)}%</span>
                            <span className="fs-2 text-muted ms-1">{eur(deal.savings ?? 0)}</span>
                          </td>
                          <td><ScoreBadge score={deal.score ?? 0} /></td>
                          <td><RiskBadge level={deal.riskLevel ?? "clean"} /></td>
                          <td>
                            {deal.sent ? (
                              <StatusBadge tone="success">envoyé</StatusBadge>
                            ) : deal.shouldAlert ? (
                              <StatusBadge tone="primary">alertable</StatusBadge>
                            ) : (
                              <StatusBadge tone="secondary">{translateReason(deal.rejectionReasons?.[0] ?? "rejeté")}</StatusBadge>
                            )}
                          </td>
                          <td className="text-end">
                            <a href={deal.url} target="_blank" rel="noreferrer" className="btn btn-outline-primary btn-sm p-1 d-inline-flex align-items-center" title="Ouvrir sur Vinted">
                              <iconify-icon icon="solar:arrow-right-up-line-duotone"></iconify-icon>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title mb-1 fw-semibold">Recherches actives</h5>
              <span className="fs-3 text-muted d-block mb-3">Top par activité récente</span>
              {topSearches.length === 0 ? (
                <Empty text="Aucune recherche active" />
              ) : (
                <ul className="list-unstyled mb-0">
                  {topSearches.map((search) => (
                    <li key={search.id} className="d-flex align-items-center gap-3 mb-4 pb-3 border-bottom">
                      <div className="bg-info-subtle rounded-circle round-40 d-flex align-items-center justify-content-center flex-shrink-0">
                        <iconify-icon icon="solar:magnifer-line-duotone" class="text-info fs-5"></iconify-icon>
                      </div>
                      <div className="flex-grow-1">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <h6 className="mb-0 fs-3 fw-semibold text-truncate" style={{ maxWidth: "160px" }}>{search.query}</h6>
                          <span className="fs-2 text-muted">{search.limit}/scan</span>
                        </div>
                        <div className="progress" style={{ height: 6 }}>
                          <div
                            className={`progress-bar bg-${search.enabled ? "primary" : "secondary"}`}
                            role="progressbar"
                            style={{ width: `${search.enabled ? 80 : 20}%` }}
                          ></div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- Scans + Activity timeline --- */}
      <div className="row">
        <div className="col-lg-6">
          <div className="card">
            <div className="card-body">
              <h5 className="card-title mb-1 fw-semibold">Derniers scans</h5>
              <span className="fs-3 text-muted d-block mb-3">Résultats des dernières exécutions</span>
              {scans.length === 0 ? (
                <Empty text="Aucun scan" />
              ) : (
                <div className="table-responsive">
                  <table className="table align-middle mb-0">
                    <thead>
                      <tr className="text-uppercase fs-2 text-muted">
                        <th>Statut</th>
                        <th>Source</th>
                        <th>Annonces</th>
                        <th>Alertes</th>
                        <th>Début</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scans.slice(0, 6).map((scan) => (
                        <tr key={scan.id}>
                          <td>
                            <StatusBadge tone={scan.status === "success" ? "success" : scan.status === "failed" ? "danger" : "secondary"}>
                              {tStatus(scan.status)}
                            </StatusBadge>
                          </td>
                          <td className="fs-3">{tSource(scan.source)}</td>
                          <td className="fs-3 fw-semibold">{scan.listings}</td>
                          <td className="fs-3"><span className="text-primary fw-semibold">{scan.sent}</span><span className="text-muted">/{scan.alertable}</span></td>
                          <td className="fs-3 text-muted">{dateTimeShort(scan.startedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card">
            <div className="card-body">
              <h5 className="card-title mb-1 fw-semibold">Activité récente</h5>
              <span className="fs-3 text-muted d-block mb-3">Derniers événements du bot</span>
              <ActivityTimeline logs={logs.slice(0, 8)} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DistRow({ label, count, total, tone }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="d-flex align-items-center justify-content-between mb-2 fs-3">
      <span className="d-flex align-items-center gap-2">
        <span className={`bg-${tone} rounded-circle d-inline-block`} style={{ width: 10, height: 10 }}></span>
        {label}
      </span>
      <span className="text-muted">{count} <small>({pct}%)</small></span>
    </div>
  );
}

function buildMetrics(scans, deals) {
  const now = Date.now();
  const cutoff = now - 24 * 3600 * 1000;
  const recent = scans.filter((scan) => scan.startedAt && new Date(scan.startedAt).getTime() >= cutoff);
  const totalListings = recent.reduce((sum, scan) => sum + (scan.listings ?? 0), 0);
  const scanCount = recent.length;
  const avgListings = scanCount > 0 ? Math.round(totalListings / scanCount) : 0;

  // Build sparkline buckets over the last 8 hours, oldest → newest
  const buckets = new Array(8).fill(0);
  const sentBuckets = new Array(8).fill(0);
  const scanBuckets = new Array(8).fill(0);
  const bucketSize = 3600 * 1000; // 1h
  const startBucket = now - 8 * bucketSize;
  for (const scan of scans) {
    if (!scan.startedAt) continue;
    const t = new Date(scan.startedAt).getTime();
    const idx = Math.floor((t - startBucket) / bucketSize);
    if (idx < 0 || idx >= 8) continue;
    buckets[idx] += scan.listings ?? 0;
    sentBuckets[idx] += scan.sent ?? 0;
    scanBuckets[idx] += 1;
  }
  return {
    totalListings,
    scanCount,
    avgListings,
    listingsHistory: buckets,
    sentHistory: sentBuckets,
    scanHistory: scanBuckets
  };
}

function buildScoreDistribution(deals) {
  let good = 0;
  let medium = 0;
  let low = 0;
  for (const deal of deals) {
    const score = deal.score ?? 0;
    if (score >= 88) good += 1;
    else if (score >= 82) medium += 1;
    else low += 1;
  }
  return { good, medium, low, total: good + medium + low };
}

function buildHourlyChart(scans) {
  const now = Date.now();
  const buckets = 12;
  const bucketSize = 2 * 3600 * 1000; // 2h
  const start = now - buckets * bucketSize;
  const listings = new Array(buckets).fill(0);
  const sent = new Array(buckets).fill(0);
  const categories = [];
  for (let i = 0; i < buckets; i += 1) {
    const t = new Date(start + i * bucketSize);
    categories.push(t.toLocaleTimeString("fr-FR", { hour: "2-digit" }) + "h");
  }
  for (const scan of scans) {
    if (!scan.startedAt) continue;
    const t = new Date(scan.startedAt).getTime();
    const idx = Math.floor((t - start) / bucketSize);
    if (idx < 0 || idx >= buckets) continue;
    listings[idx] += scan.listings ?? 0;
    sent[idx] += scan.sent ?? 0;
  }
  return {
    categories,
    series: [
      { name: "Annonces", data: listings },
      { name: "Alertes", data: sent }
    ]
  };
}

function buildTopSearches(searches, scans) {
  return [...(searches ?? [])]
    .sort((a, b) => (b.enabled === a.enabled ? (b.limit ?? 0) - (a.limit ?? 0) : b.enabled - a.enabled))
    .slice(0, 5);
}
