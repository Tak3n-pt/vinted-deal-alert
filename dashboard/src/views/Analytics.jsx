import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext.jsx";
import { api, messageFromError } from "../api.js";
import { eur } from "../format.js";
import Empty from "../components/Empty.jsx";
import TimelineChart from "../components/TimelineChart.jsx";
import BarChart from "../components/BarChart.jsx";
import Donut from "../components/Donut.jsx";
import Sparkline from "../components/Sparkline.jsx";

const RANGES = [
  { value: 7, label: "7 j" },
  { value: 30, label: "30 j" },
  { value: 90, label: "90 j" }
];

export default function Analytics() {
  const { setError } = useApp();
  const [range, setRange] = useState(30);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await api(`/api/analytics?range=${range}`);
        if (!cancelled) setSnapshot(data.analytics);
      } catch (err) {
        if (!cancelled) setError(messageFromError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [range, setError]);

  if (!snapshot) {
    return (
      <div className="d-flex justify-content-center align-items-center py-7">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Chargement…</span>
        </div>
      </div>
    );
  }

  const s = snapshot.summary;
  const timelineDays = snapshot.timeline.map((row) => row.day);
  const timelineSent = snapshot.timeline.map((row) => row.sent);
  const timelineRejected = snapshot.timeline.map((row) => row.rejected);
  const sparkSent = timelineSent.slice(-14);

  return (
    <>
      {/* Breadcrumb + range selector */}
      <div className="font-weight-medium shadow-none position-relative overflow-hidden mb-7">
        <div className="card-body px-0">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <h4 className="font-weight-medium mb-0">Statistiques</h4>
              <nav aria-label="breadcrumb">
                <ol className="breadcrumb">
                  <li className="breadcrumb-item"><a className="text-muted text-decoration-none" href="#">Bonoitec Flash</a></li>
                  <li className="breadcrumb-item text-muted" aria-current="page">Analytics · {range} jours</li>
                </ol>
              </nav>
            </div>
            <div className="d-flex gap-2 align-items-center">
              {loading ? (
                <div className="spinner-border spinner-border-sm text-primary me-2" role="status" aria-hidden="true"></div>
              ) : null}
              <div className="btn-group" role="group">
                {RANGES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`btn ${range === opt.value ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setRange(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hero KPI row */}
      <div className="row">
        <div className="col-lg-5 col-md-12">
          <div className="card bonoitec-hero h-100 overflow-hidden">
            <div className="card-body p-7 position-relative">
              <div className="d-flex align-items-center gap-3 mb-2">
                <div className="hero-icon">
                  <iconify-icon icon="solar:wallet-money-line-duotone" style={{ fontSize: 36, color: "#fff" }}></iconify-icon>
                </div>
                <div>
                  <p className="mb-0 fs-3 opacity-75">Économies réalisées</p>
                  <h2 className="mb-0 text-white fw-bold" style={{ fontSize: "2.4rem" }}>{eur(s.moneySaved)}</h2>
                </div>
              </div>
              <p className="fs-3 opacity-75 mb-3">
                {s.totalAlerts} alerte{s.totalAlerts > 1 ? "s" : ""} envoyée{s.totalAlerts > 1 ? "s" : ""} · {s.totalDeals} opportunités analysées · score moyen {s.avgScore}
              </p>
              <div className="row g-2 mt-2">
                <MiniStat label="Remise moy." value={`${s.avgDiscountPct}%`} />
                <MiniStat label="Économie / alerte" value={eur(s.avgSavings)} />
              </div>
              {s.bestDeal ? (
                <a href={s.bestDeal.url} target="_blank" rel="noreferrer" className="d-inline-flex align-items-center gap-2 mt-3 text-white opacity-75 text-decoration-none">
                  <iconify-icon icon="solar:medal-star-circle-line-duotone"></iconify-icon>
                  Meilleure trouvaille : {s.bestDeal.model} à {eur(s.bestDeal.finalPrice)} (score {s.bestDeal.score})
                  <iconify-icon icon="solar:arrow-right-up-line-duotone"></iconify-icon>
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="col-lg-7 col-md-12">
          <div className="row">
            <div className="col-md-6 mb-4">
              <SnapshotCard
                icon="solar:bell-bing-line-duotone"
                label="Alertes envoyées"
                value={s.totalAlerts}
                color="primary"
                trend={sparkSent}
              />
            </div>
            <div className="col-md-6 mb-4">
              <SnapshotCard
                icon="solar:target-line-duotone"
                label="Taux d'alerte"
                value={`${alertRate(snapshot)}%`}
                sub={`${s.totalAlerts}/${s.totalDeals} opportunités`}
                color="secondary"
              />
            </div>
            <div className="col-md-6">
              <SnapshotCard
                icon="solar:star-circle-line-duotone"
                label="Score moyen"
                value={s.avgScore}
                sub="0–100"
                color="success"
              />
            </div>
            <div className="col-md-6">
              <SnapshotCard
                icon="solar:tag-price-line-duotone"
                label="Économie moy."
                value={eur(s.avgSavings)}
                sub={`${s.avgDiscountPct}% de remise`}
                color="info"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h5 className="card-title mb-0 fw-semibold">Activité dans le temps</h5>
              <span className="fs-3 text-muted">Alertes envoyées vs opportunités rejetées sur {range} jours</span>
            </div>
            <div className="d-flex gap-3 align-items-center">
              <span className="d-flex align-items-center gap-1 fs-3"><span className="bg-primary rounded-circle d-inline-block" style={{ width: 10, height: 10 }}></span> Envoyées</span>
              <span className="d-flex align-items-center gap-1 fs-3"><span className="bg-secondary rounded-circle d-inline-block" style={{ width: 10, height: 10 }}></span> Rejetées</span>
            </div>
          </div>
          {timelineSent.some((v) => v > 0) || timelineRejected.some((v) => v > 0) ? (
            <TimelineChart days={timelineDays} sent={timelineSent} rejected={timelineRejected} />
          ) : (
            <Empty text={`Pas encore d'activité sur les ${range} derniers jours`} />
          )}
        </div>
      </div>

      {/* Score distribution + Rejection reasons */}
      <div className="row">
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title mb-1 fw-semibold">Distribution des scores</h5>
              <span className="fs-3 text-muted d-block mb-3">Combien d'opportunités dans chaque tranche</span>
              {snapshot.scoreDistribution.some((b) => b.count > 0) ? (
                <BarChart
                  categories={snapshot.scoreDistribution.map((b) => b.bucket)}
                  data={snapshot.scoreDistribution.map((b) => b.count)}
                  color="#1e88e5"
                  height={280}
                />
              ) : (
                <Empty text="Aucun deal scoré dans la période" />
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title mb-1 fw-semibold">Raisons de rejet les plus fréquentes</h5>
              <span className="fs-3 text-muted d-block mb-3">Top 10 — utile pour calibrer les seuils</span>
              {snapshot.rejectionReasons.length > 0 ? (
                <BarChart
                  categories={snapshot.rejectionReasons.map((r) => truncate(r.reason, 28))}
                  data={snapshot.rejectionReasons.map((r) => r.count)}
                  color="#fc4b6c"
                  horizontal
                  height={Math.max(220, snapshot.rejectionReasons.length * 32)}
                />
              ) : (
                <Empty text="Aucun rejet dans la période 🎉" icon="solar:emoji-funny-circle-line-duotone" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Per-model + Per-family/generation donut */}
      <div className="row">
        <div className="col-lg-8">
          <div className="card h-100">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div>
                  <h5 className="card-title mb-0 fw-semibold">Performance par modèle</h5>
                  <span className="fs-3 text-muted">Top 8 — alertes, économies, score moyen</span>
                </div>
              </div>
              {snapshot.perModel.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr className="text-uppercase fs-2 text-muted">
                        <th>Modèle</th>
                        <th className="text-end">Opportunités</th>
                        <th className="text-end">Alertes</th>
                        <th className="text-end">Économies</th>
                        <th className="text-end">Score moy.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.perModel.map((m) => (
                        <tr key={m.model}>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <div className="bg-primary-subtle rounded-circle round-32 d-flex align-items-center justify-content-center">
                                <iconify-icon icon="solar:smartphone-2-line-duotone" class="text-primary"></iconify-icon>
                              </div>
                              <strong className="fs-3">{m.model}</strong>
                            </div>
                          </td>
                          <td className="text-end fs-3">{m.count}</td>
                          <td className="text-end"><span className="badge bg-primary-subtle text-primary rounded-4 px-2 py-1 fs-2">{m.sent}</span></td>
                          <td className="text-end fs-3 fw-semibold">{eur(m.totalSavings)}</td>
                          <td className="text-end">
                            <span className={`badge bg-${m.avgScore >= 85 ? "success" : m.avgScore >= 75 ? "warning" : "secondary"}-subtle text-${m.avgScore >= 85 ? "success" : m.avgScore >= 75 ? "warning" : "secondary"} rounded-4 px-2 py-1 fs-2`}>
                              {m.avgScore}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty text="Pas encore de données par modèle" />
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title mb-1 fw-semibold">Répartition par famille</h5>
              <span className="fs-3 text-muted d-block mb-3">iPhone / Galaxy / Pixel</span>
              {snapshot.perFamily.length > 0 ? (
                <>
                  <Donut
                    labels={snapshot.perFamily.map((f) => f.family)}
                    series={snapshot.perFamily.map((f) => f.count)}
                    colors={["#1e88e5", "#26c6da", "#fec90f", "#fc4b6c", "#5e35b1"]}
                    totalLabel="Annonces"
                    height={220}
                  />
                  <div className="mt-3">
                    {snapshot.perFamily.map((f, idx) => (
                      <div key={f.family} className="d-flex align-items-center justify-content-between fs-3 mb-1">
                        <span className="d-flex align-items-center gap-2">
                          <span className="rounded-circle d-inline-block" style={{ width: 10, height: 10, background: ["#1e88e5","#26c6da","#fec90f","#fc4b6c","#5e35b1"][idx % 5] }}></span>
                          {f.family}
                        </span>
                        <span className="text-muted">{f.count} <small>({f.sent} envoyées)</small></span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Empty text="Pas encore de données" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top sellers + Listing age + Country */}
      <div className="row">
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title mb-1 fw-semibold">Top vendeurs</h5>
              <span className="fs-3 text-muted d-block mb-3">Vendeurs avec le plus d'opportunités détectées</span>
              {snapshot.topSellers.length > 0 ? (
                <ul className="list-unstyled mb-0">
                  {snapshot.topSellers.slice(0, 7).map((seller) => (
                    <li key={seller.seller} className="d-flex align-items-center gap-3 mb-3 pb-2 border-bottom">
                      <div className="bg-info-subtle rounded-circle round-40 d-flex align-items-center justify-content-center text-info fw-bold">
                        {seller.seller.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-grow-1">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <h6 className="mb-0 fs-3 fw-semibold text-truncate" style={{ maxWidth: "200px" }}>{seller.seller}</h6>
                          <span className="badge bg-primary-subtle text-primary rounded-4 px-2 py-1 fs-2">{seller.sent} envoyées</span>
                        </div>
                        <div className="d-flex align-items-center gap-2 fs-2 text-muted">
                          <span>{seller.count} annonces</span>
                          <span>·</span>
                          <span>score moy. {seller.avgScore}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty text="Pas encore de vendeurs récurrents" />
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title mb-1 fw-semibold">Âge des annonces détectées</h5>
              <span className="fs-3 text-muted d-block mb-3">Quand le bot trouve-t-il les meilleurs deals ?</span>
              {snapshot.listingAge.some((b) => b.count > 0) ? (
                <BarChart
                  categories={snapshot.listingAge.map((b) => b.bucket)}
                  data={snapshot.listingAge.map((b) => b.count)}
                  color="#26c6da"
                  height={240}
                />
              ) : (
                <Empty text="Pas encore de données d'âge" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Country + Scan health */}
      <div className="row">
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title mb-1 fw-semibold">Pays des vendeurs</h5>
              <span className="fs-3 text-muted d-block mb-3">Distribution géographique des opportunités</span>
              {snapshot.sellerCountries.length > 0 ? (
                <div className="row g-2">
                  {snapshot.sellerCountries.slice(0, 8).map((c) => (
                    <div key={c.country} className="col-md-6">
                      <div className="d-flex align-items-center gap-2 p-2 bg-light rounded">
                        <div className="bg-warning-subtle rounded-circle round-32 d-flex align-items-center justify-content-center text-warning fw-bold fs-3">
                          {c.country.slice(0, 2)}
                        </div>
                        <div className="flex-grow-1">
                          <div className="fs-3 fw-semibold">{c.country}</div>
                          <div className="fs-2 text-muted">{c.count} annonces</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty text="Pas encore de données géographiques" icon="solar:map-line-duotone" />
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title mb-1 fw-semibold">Santé des scans</h5>
              <span className="fs-3 text-muted d-block mb-3">Taux de succès Apify sur la période</span>
              <div className="row g-2 mb-3">
                <HealthCell label="Réussis" value={snapshot.scanHealth.success} tone="success" icon="solar:check-circle-line-duotone" />
                <HealthCell label="Échoués" value={snapshot.scanHealth.failed} tone="danger" icon="solar:close-circle-line-duotone" />
                <HealthCell label="Sautés" value={snapshot.scanHealth.skipped} tone="secondary" icon="solar:skip-next-line-duotone" />
                <HealthCell label="En cours" value={snapshot.scanHealth.running} tone="info" icon="solar:refresh-line-duotone" />
              </div>
              {scanSuccessRate(snapshot.scanHealth) >= 95 ? (
                <div className="d-flex align-items-center gap-2 p-3 bg-success-subtle text-success rounded">
                  <iconify-icon icon="solar:medal-star-circle-line-duotone" class="fs-5"></iconify-icon>
                  <strong>Excellent — {scanSuccessRate(snapshot.scanHealth)}% de réussite</strong>
                </div>
              ) : scanSuccessRate(snapshot.scanHealth) >= 80 ? (
                <div className="d-flex align-items-center gap-2 p-3 bg-warning-subtle text-warning rounded">
                  <iconify-icon icon="solar:shield-warning-line-duotone" class="fs-5"></iconify-icon>
                  <strong>{scanSuccessRate(snapshot.scanHealth)}% de réussite — surveille Apify</strong>
                </div>
              ) : (
                <div className="d-flex align-items-center gap-2 p-3 bg-danger-subtle text-danger rounded">
                  <iconify-icon icon="solar:danger-triangle-line-duotone" class="fs-5"></iconify-icon>
                  <strong>Seulement {scanSuccessRate(snapshot.scanHealth)}% — problème côté source</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="text-end fs-2 text-muted mt-2 mb-0">
        Snapshot généré {new Date(snapshot.generatedAt).toLocaleString("fr-FR")}
      </p>
    </>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="col-6">
      <div className="px-3 py-2 rounded" style={{ background: "rgba(255,255,255,0.12)" }}>
        <span className="fs-2 text-white opacity-75 d-block">{label}</span>
        <strong className="text-white fs-4">{value}</strong>
      </div>
    </div>
  );
}

function SnapshotCard({ icon, label, value, sub, color, trend }) {
  return (
    <div className="card h-100">
      <div className="card-body p-6">
        <div className={`bg-${color}-subtle rounded-circle round-40 d-flex align-items-center justify-content-center mb-3`}>
          <iconify-icon icon={icon} class={`text-${color} fs-5`}></iconify-icon>
        </div>
        <p className="card-subtitle mb-1 fs-3 text-muted">{label}</p>
        <h4 className="card-title mb-1 fw-bold">{value}</h4>
        {sub ? <span className="fs-2 text-muted">{sub}</span> : null}
        {trend && trend.length ? (
          <div className="mt-2"><Sparkline data={trend} color={color} height={50} /></div>
        ) : null}
      </div>
    </div>
  );
}

function HealthCell({ label, value, tone, icon }) {
  return (
    <div className="col-6">
      <div className={`d-flex align-items-center gap-2 p-3 bg-${tone}-subtle rounded`}>
        <iconify-icon icon={icon} class={`text-${tone} fs-5`}></iconify-icon>
        <div>
          <div className={`fs-4 fw-bold text-${tone}`}>{value}</div>
          <div className="fs-2 text-muted">{label}</div>
        </div>
      </div>
    </div>
  );
}

function truncate(value, max) {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + "…";
}

function alertRate(snapshot) {
  if (!snapshot.summary.totalDeals) return 0;
  return Math.round((snapshot.summary.totalAlerts / snapshot.summary.totalDeals) * 100);
}

function scanSuccessRate(health) {
  const total = health.success + health.failed + health.skipped + health.running;
  if (!total) return 0;
  return Math.round((health.success / total) * 100);
}
