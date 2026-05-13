import React from "react";
import { useApp } from "../AppContext.jsx";
import { eur, botStateLabel, timeShort } from "../format.js";
import { RiskBadge } from "../components/ScoreBadge.jsx";
import Sparkline from "../components/Sparkline.jsx";
import Breadbar from "../components/Breadbar.jsx";
import AreaChart from "../components/AreaChart.jsx";
import OurVisitorsDonut from "../components/OurVisitorsDonut.jsx";
import MiniLineChart from "../components/MiniLineChart.jsx";
import MiniBarChart from "../components/MiniBarChart.jsx";

function discordAvatar(discordId, hash) {
  if (discordId && hash) return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.png?size=128`;
  return "/assets/images/profile/user-1.jpg";
}

const BRAND_MAP = {
  apple:    { slug: "apple",    bg: "bg-dark"    },
  samsung:  { slug: "samsung",  bg: "bg-primary" },
  google:   { slug: "google",   bg: "bg-info"    },
  oneplus:  { slug: "oneplus",  bg: "bg-danger"  },
  xiaomi:   { slug: "xiaomi",   bg: "bg-warning" },
  sony:     { slug: "sony",     bg: "bg-dark"    },
  motorola: { slug: "motorola", bg: "bg-danger"  },
  nokia:    { slug: "nokia",    bg: "bg-primary" },
  huawei:   { slug: "huawei",   bg: "bg-danger"  },
  oppo:     { slug: "oppo",     bg: "bg-success" },
};

function brandFromTitle(text = "") {
  const t = text.toLowerCase();
  if (t.includes("iphone") || t.includes("apple"))                       return "apple";
  if (t.includes("samsung") || t.includes("galaxy"))                     return "samsung";
  if (t.includes("pixel") || t.includes("google"))                       return "google";
  if (t.includes("oneplus") || t.includes("one plus"))                   return "oneplus";
  if (t.includes("xiaomi") || t.includes("redmi") || t.includes("poco")) return "xiaomi";
  if (t.includes("sony") || t.includes("xperia"))                        return "sony";
  if (t.includes("motorola") || t.includes("moto "))                     return "motorola";
  if (t.includes("nokia"))                                                return "nokia";
  if (t.includes("huawei"))                                               return "huawei";
  if (t.includes("oppo"))                                                 return "oppo";
  return null;
}

export default function Dashboard() {
  const { currentUser, deals, scans, searches, status } = useApp();

  const avatarUrl   = discordAvatar(currentUser?.discordId, currentUser?.avatar);
  const displayName = currentUser?.username ?? "Chasseur";
  const planLabel   = currentUser?.plan === "admin" ? "Admin" : currentUser?.plan ?? "Free";

  const now          = Date.now();
  const dealsCount   = deals.length;
  const alertsCount  = deals.filter((d) => d.sent).length;
  const pendingCount = deals.filter((d) => d.shouldAlert && !d.sent).length;
  const scansCount   = scans.length;
  const itemsTotal   = scans.reduce((s, r) => s + (r.itemsFound ?? 0), 0);
  const itemsFmt     = itemsTotal >= 1000 ? (itemsTotal / 1000).toFixed(1) + "k" : String(itemsTotal);
  const avgScore     = deals.length ? Math.round(deals.reduce((s, d) => s + (d.score ?? 0), 0) / deals.length) : 0;
  const alertRate    = deals.length ? Math.round((alertsCount / deals.length) * 100) : 0;
  const botLabel     = botStateLabel(status);
  const nextScanFmt  = status?.nextScanAt ? timeShort(status.nextScanAt) : "--:--";
  const best         = status?.bestCandidate;

  const scoreHigh = deals.filter((d) => (d.score ?? 0) >= 80).length;
  const scoreMid  = deals.filter((d) => (d.score ?? 0) >= 60 && (d.score ?? 0) < 80).length;
  const scoreLow  = deals.filter((d) => (d.score ?? 0) < 60).length;

  const sparkDeals = Array.from({ length: 8 }, (_, i) => {
    const ageStart = (7 - i) * 3600000;
    const ageEnd   = (8 - i) * 3600000;
    return deals.filter((d) => {
      const age = now - new Date(d.seenAt ?? d.createdAt ?? 0).getTime();
      return age >= ageStart && age < ageEnd;
    }).length;
  });

  const chartHours = Array.from({ length: 24 }, (_, i) => {
    const h = new Date(now - (23 - i) * 3600000);
    return `${h.getHours()}h`;
  });
  const scanCounts = Array(24).fill(0);
  scans.forEach((s) => {
    const age = (now - new Date(s.startedAt).getTime()) / 3600000;
    if (age >= 0 && age < 24) scanCounts[23 - Math.min(23, Math.floor(age))]++;
  });
  const dealCounts = Array(24).fill(0);
  deals.forEach((d) => {
    const age = (now - new Date(d.seenAt ?? d.createdAt ?? 0).getTime()) / 3600000;
    if (age >= 0 && age < 24) dealCounts[23 - Math.min(23, Math.floor(age))]++;
  });
  const SCRAPING_SERIES = [
    { name: "Scans",         data: scanCounts },
    { name: "Deals trouvés", data: dealCounts }
  ];

  const recentDeals = deals.slice(0, 4);

  return (
    <>
      {/* Breadcrumb */}
      <div className="font-weight-medium shadow-none position-relative overflow-hidden mb-7">
        <div className="card-body px-0">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h4 className="font-weight-medium mb-0">Vue d'ensemble</h4>
              <nav aria-label="breadcrumb">
                <ol className="breadcrumb">
                  <li className="breadcrumb-item"><a className="text-muted text-decoration-none" href="#" onClick={(e) => e.preventDefault()}>Bonoitec Flash</a></li>
                  <li className="breadcrumb-item text-muted" aria-current="page">Vue d'ensemble</li>
                </ol>
              </nav>
            </div>
            <div>
              <div className="d-sm-flex d-none gap-3 no-block justify-content-end align-items-center">
                <div className="d-flex gap-2 align-items-center">
                  <div>
                    <small>Deals trouvés</small>
                    <h4 className="text-primary mb-0">{dealsCount}</h4>
                  </div>
                  <div className="breadbar"><Breadbar color="primary" /></div>
                </div>
                <div className="d-flex gap-2 align-items-center">
                  <div>
                    <small>Alertes envoyées</small>
                    <h4 className="text-secondary mb-0">{alertsCount}</h4>
                  </div>
                  <div className="breadbar2"><Breadbar color="secondary" /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        {/* Deals Trouvés + Articles Scannés + Statut du Bot */}
        <div className="col-lg-5">
          <div className="row">
            <div className="col-md-6">
              <div className="card">
                <div className="card-body p-9">
                  <p className="card-subtitle">Deals Trouvés</p>
                  <h4 className="card-title mb-1">{dealsCount}</h4>
                  <div id="online-revenue">
                    <Sparkline data={sparkDeals.some(Boolean) ? sparkDeals : [0, 1, 0, 1, 0, 0, 1, 0]} color="secondary" height={64} />
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="card overflow-hidden">
                <div className="card-body bg-secondary text-center">
                  <div className="my-2">
                    <h6 className="text-white">Articles Scannés</h6>
                    <h2 className="mb-0 text-white" style={{ fontSize: "2.2rem" }}>{itemsFmt || "0"}</h2>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="card bonoitec-upgrade-plan">
            <div className="card-body position-relative z-1 p-7">
              <p className="text-white mb-1 opacity-75">Surveillance Vinted en temps réel.</p>
              <h3 className="text-white fw-semibold mb-0">Statut du Bot</h3>
              <div className="d-flex gap-9 my-4 pb-2">
                <div className="d-flex align-items-center gap-2">
                  <div className="round-36 bg-white bg-opacity-25 rounded-circle d-flex align-items-center justify-content-center">
                    <iconify-icon icon="solar:magnifer-line-duotone" class="fs-5 text-white"></iconify-icon>
                  </div>
                  <div>
                    <p className="mb-0 fs-2 text-white text-opacity-75">Recherches</p>
                    <h6 className="mb-0 fs-2 text-white fw-semibold">{searches.length} actives</h6>
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <div className="round-36 bg-white bg-opacity-25 rounded-circle d-flex align-items-center justify-content-center">
                    <iconify-icon icon="solar:graph-up-line-duotone" class="fs-5 text-white"></iconify-icon>
                  </div>
                  <div>
                    <p className="mb-0 fs-2 text-white text-opacity-75">Prochain scan</p>
                    <h6 className="mb-0 fs-2 text-white fw-semibold">{nextScanFmt}</h6>
                  </div>
                </div>
              </div>
              <span className="btn btn-primary bg-white bg-opacity-25 border-0 text-white">{botLabel}</span>
            </div>
          </div>
        </div>

        {/* Meilleur Deal du Jour */}
        <div className="col-lg-4">
          <div className="card bonoitec-materialpro-bg shadow-none h-100">
            <div className="card-body p-4 d-flex align-items-center justify-content-center h-100">
              <div className="d-flex align-items-center gap-3">
                <button type="button" className="btn p-0 round-60 bg-white rounded-circle d-flex align-items-center justify-content-center" style={{ width: 60, height: 60 }}>
                  <iconify-icon icon="solar:star-bold" class="fs-6 text-dark"></iconify-icon>
                </button>
                <div>
                  {best ? (
                    <>
                      <h4 className="mb-2 card-title text-dark">{best.model ?? best.title ?? "Meilleur Deal"}</h4>
                      <p className="card-subtitle">{eur(best.finalPrice)} &bull; Score {best.score ?? "—"}/100</p>
                    </>
                  ) : (
                    <>
                      <h4 className="mb-2 card-title text-dark">Meilleur Deal du Jour</h4>
                      <p className="card-subtitle">Aucun deal trouvé aujourd'hui</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Métriques Rapides + Deals en Attente */}
        <div className="col-lg-3">
          <div className="card">
            <div className="card-body p-7">
              <h3 className="card-title mb-3">Métriques Rapides</h3>
              <div className="d-flex justify-content-between align-items-center gap-6 py-3 border-bottom">
                <h6 className="mb-0">Score moyen</h6>
                <div className="d-flex align-items-center gap-2">
                  <iconify-icon icon="solar:arrow-right-up-linear" class="fs-6 text-secondary"></iconify-icon>
                  <h6 className="mb-0">{avgScore}</h6>
                </div>
              </div>
              <div className="d-flex justify-content-between align-items-center gap-6 py-3 border-bottom">
                <h6 className="mb-0">Taux d'alerte</h6>
                <div className="d-flex align-items-center gap-2">
                  <iconify-icon icon="solar:arrow-right-up-linear" class="fs-6 text-danger"></iconify-icon>
                  <h6 className="mb-0">{alertRate}%</h6>
                </div>
              </div>
              <div className="d-flex justify-content-between align-items-center gap-6 py-3">
                <h6 className="mb-0">Recherches actives</h6>
                <div className="d-flex align-items-center gap-2">
                  <iconify-icon icon="solar:arrow-left-down-linear" class="fs-6 text-secondary"></iconify-icon>
                  <h6 className="mb-0">{searches.length} <span className="text-muted">/{scansCount}</span></h6>
                </div>
              </div>
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="card-body bonoitec-bg-purple p-7">
              <h3 className="card-title mb-2 text-white">Deals en Attente</h3>
              <p className="card-subtitle text-white opacity-75 pb-2">{pendingCount} non envoyés</p>
              <div className="d-flex justify-content-between align-items-center mt-3">
                <ul className="d-flex list-unstyled mb-0">
                  {recentDeals.slice(0, 2).map((d, i) => {
                    const brand = brandFromTitle(d.title) ?? brandFromTitle(d.model ?? "");
                    const info  = brand ? BRAND_MAP[brand] : null;
                    return (
                      <li key={d.id ?? i} style={i > 0 ? { marginLeft: -8 } : {}}>
                        {info ? (
                          <div className={`${info.bg} rounded-circle border border-2 d-flex align-items-center justify-content-center`} style={{ width: 40, height: 40, borderColor: "#5e35b1" }}>
                            <img src={`https://cdn.simpleicons.org/${info.slug}/ffffff`} alt={brand} width="20" height="20" />
                          </div>
                        ) : (
                          <img src="/assets/images/profile/user-2.jpg" className="rounded-circle border border-2" width="40" height="40" alt="" style={{ borderColor: "#5e35b1" }} />
                        )}
                      </li>
                    );
                  })}
                  {recentDeals.length === 0 && (
                    <li>
                      <img src="/assets/images/profile/user-2.jpg" className="rounded-circle border border-2" width="40" height="40" alt="" style={{ borderColor: "#5e35b1" }} />
                    </li>
                  )}
                  <li style={{ marginLeft: -8 }}>
                    <span className="bg-dark text-white fs-2 rounded-circle border border-2 d-flex align-items-center justify-content-center" style={{ width: 40, height: 40, borderColor: "#5e35b1" }}>
                      +{Math.max(0, pendingCount - 2)}
                    </span>
                  </li>
                </ul>
                <div className="d-flex align-items-center justify-content-center rounded-circle bg-warning" style={{ width: 40, height: 40 }}>
                  <iconify-icon icon="solar:arrow-right-up-linear" class="fs-6 text-white"></iconify-icon>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Activité de Scraping */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center flex-wrap mb-4">
                <div>
                  <h4 className="card-title">Activité de Scraping</h4>
                  <p className="card-subtitle mb-0">Deals et scans des dernières 24h</p>
                </div>
                <div className="ms-auto align-self-center">
                  <ul className="d-flex align-items-center gap-3 mb-0 list-unstyled">
                    <li className="d-flex">
                      <div className="text-primary d-flex align-items-center gap-2 fs-3">
                        <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Scans
                      </div>
                    </li>
                    <li className="d-flex">
                      <div className="text-secondary d-flex align-items-center gap-2 fs-3">
                        <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Deals trouvés
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
              <div id="newsletter-campaign">
                <AreaChart categories={chartHours} series={SCRAPING_SERIES} height={267} />
              </div>
              <div className="row text-center">
                <div className="col-lg-4 col-md-4 mt-4">
                  <h2 className="mb-0">{scansCount}</h2>
                  <small className="fs-3 text-muted">Scans effectués</small>
                </div>
                <div className="col-lg-4 col-md-4 mt-4">
                  <h2 className="mb-0">{itemsFmt || "0"}</h2>
                  <small className="fs-3 text-muted">Articles vus</small>
                </div>
                <div className="col-lg-4 col-md-4 mt-4">
                  <h2 className="mb-0">{dealsCount}</h2>
                  <small className="fs-3 text-muted">Deals trouvés</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Derniers Deals */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-body pb-0">
              <h4 className="card-title">Derniers Deals</h4>
              <p className="card-subtitle mb-0">4 derniers candidats détectés</p>
            </div>
            <div className="mt-3">
              {recentDeals.length === 0 ? (
                <p className="px-7 py-3 text-muted fs-3">Aucun deal détecté pour l'instant.</p>
              ) : (
                recentDeals.map((d, i) => {
                  const brand = brandFromTitle(d.title) ?? brandFromTitle(d.model ?? "");
                  const info  = brand ? BRAND_MAP[brand] : null;
                  const score = d.score ?? 0;
                  const dotColor = score >= 80 ? "#26c6da" : score >= 60 ? "#fec90f" : "#fc4b6c";
                  return (
                    <a href={d.url ?? "#"} target={d.url ? "_blank" : undefined} rel="noreferrer" className="py-3 d-flex px-7 gap-3 text-decoration-none align-items-center" key={d.id ?? i}>
                      <div className="position-relative flex-shrink-0">
                        {info ? (
                          <div className={`${info.bg} rounded-circle d-flex align-items-center justify-content-center`} style={{ width: 50, height: 50 }}>
                            <img src={`https://cdn.simpleicons.org/${info.slug}/ffffff`} alt={brand} width="25" height="25" />
                          </div>
                        ) : (
                          <div className="bg-primary-subtle rounded-circle d-flex align-items-center justify-content-center" style={{ width: 50, height: 50 }}>
                            <iconify-icon icon="solar:smartphone-2-line-duotone" class="text-primary fs-5"></iconify-icon>
                          </div>
                        )}
                        <span className="d-inline-block position-absolute rounded-circle" style={{ background: dotColor, width: 12, height: 12, bottom: 0, right: 0, border: "2px solid #fff" }}></span>
                      </div>
                      <div className="d-flex align-items-center w-100">
                        <div className="text-truncate flex-grow-1">
                          <h5 className="mb-1 text-dark fw-medium">{d.model ?? d.title}</h5>
                          <span className="text-muted fs-3">{eur(d.finalPrice)}</span>
                        </div>
                        <div className="d-flex gap-1 ms-auto">
                          <span className="btn btn-sm bg-primary-subtle text-primary rounded-pill d-inline-flex align-items-center justify-content-center" style={{ width: 32, height: 32, fontSize: 11 }}>
                            {d.score ?? "—"}
                          </span>
                        </div>
                      </div>
                    </a>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Répartition des Scores (SVG) */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-body">
              <h4 className="card-title">Répartition des Scores</h4>
              <p className="card-subtitle">Distribution des scores par tranche</p>
              <div className="d-flex align-items-center justify-content-center my-3" style={{ height: 240 }}>
                <ScoreViz high={scoreHigh} mid={scoreMid} low={scoreLow} />
              </div>
              <div className="text-center">
                <ul className="list-inline mb-0 d-inline-flex justify-content-center">
                  <li className="list-inline-item px-2 me-0">
                    <div className="text-secondary d-flex align-items-center gap-2 fs-3">
                      <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Score ≥80
                    </div>
                  </li>
                  <li className="list-inline-item px-2 me-0">
                    <div className="text-primary d-flex align-items-center gap-2 fs-3">
                      <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Score 60-79
                    </div>
                  </li>
                  <li className="list-inline-item px-2 me-0">
                    <div className="text-danger d-flex align-items-center gap-2 fs-3">
                      <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Score &lt;60
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Derniers Deals Analysés */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-body pb-3">
              <div className="d-md-flex">
                <h4 className="card-title">Derniers Deals Analysés</h4>
                <div className="ms-auto">
                  <select className="form-select rounded-pill fw-medium" defaultValue="24h">
                    <option value="24h">24 dernières heures</option>
                    <option value="7d">7 derniers jours</option>
                    <option value="all">Tous</option>
                  </select>
                </div>
              </div>
              <div className="table-responsive mt-3">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th className="border-0 ps-0">Produit</th>
                      <th className="border-0">Modèle</th>
                      <th className="border-0">Risque</th>
                      <th className="border-0 text-end">Prix final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDeals.length === 0 ? (
                      <tr><td colSpan={4} className="text-muted text-center py-4 fs-3">Aucun deal analysé</td></tr>
                    ) : (
                      recentDeals.map((d, i) => {
                        const brand = brandFromTitle(d.title) ?? brandFromTitle(d.model ?? "");
                        const info  = brand ? BRAND_MAP[brand] : null;
                        return (
                          <tr key={d.id ?? i}>
                            <td className="ps-0">
                              <div className="d-flex align-items-center gap-3">
                                <span className={`${info?.bg ?? "bg-primary-subtle"} rounded-circle overflow-hidden flex-shrink-0 d-inline-flex align-items-center justify-content-center`} style={{ width: 48, height: 48 }}>
                                  {info ? (
                                    <img src={`https://cdn.simpleicons.org/${info.slug}/ffffff`} alt={brand} width="24" height="24" />
                                  ) : (
                                    <iconify-icon icon="solar:smartphone-2-line-duotone" class="text-primary fs-5"></iconify-icon>
                                  )}
                                </span>
                                <div>
                                  <h5 className="mb-1">{d.model ?? d.title}</h5>
                                  <p className="mb-0 fs-3 text-muted text-truncate" style={{ maxWidth: 160 }}>{d.title}</p>
                                </div>
                              </div>
                            </td>
                            <td><p className="mb-0">{d.model ?? "—"}{d.storageGb ? ` ${d.storageGb} Go` : ""}</p></td>
                            <td><RiskBadge level={d.riskLevel ?? "clean"} /></td>
                            <td className="text-end"><p className="mb-0 fs-3">{eur(d.finalPrice)}</p></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Scores des Deals donut */}
        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-body">
              <h4 className="card-title">Scores des Deals</h4>
              <p className="card-subtitle">Répartition des scores</p>
              <div id="our-visitors" className="mt-3">
                <OurVisitorsDonut
                  series={[scoreHigh, scoreMid, scoreLow]}
                  labels={["Score ≥80", "Score 60-79", "Score <60"]}
                />
              </div>
            </div>
            <div className="card-body d-flex align-items-center justify-content-center border-top mt-3">
              <ul className="list-inline mb-0 d-inline-flex justify-content-center">
                <li className="list-inline-item px-2 me-0">
                  <div className="text-primary d-flex align-items-center gap-2 fs-3">
                    <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>≥80
                  </div>
                </li>
                <li className="list-inline-item px-2 me-0">
                  <div className="text-purple d-flex align-items-center gap-2 fs-3" style={{ color: "#5e35b1" }}>
                    <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>60-79
                  </div>
                </li>
                <li className="list-inline-item px-2 me-0">
                  <div className="text-secondary d-flex align-items-center gap-2 fs-3">
                    <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>&lt;60
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Recherches actives + Alertes envoyées */}
        <div className="col-lg-4">
          <div className="card w-100 overflow-hidden">
            <div className="card-body bonoitec-bg-purple">
              <div className="d-flex align-items-center gap-3 mb-4">
                <div className="bg-black bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48 }}>
                  <iconify-icon icon="solar:magnifer-linear" class="fs-7 text-white"></iconify-icon>
                </div>
                <div>
                  <h4 className="card-title text-white">Recherches actives</h4>
                  <p className="card-subtitle text-white opacity-70 mb-0">Surveillance en cours</p>
                </div>
              </div>
              <div className="row align-items-center">
                <div className="col-6"><h2 className="mb-0 text-white text-nowrap">{searches.length}</h2></div>
                <div className="col-6"><MiniLineChart /></div>
              </div>
            </div>
          </div>
          <div className="card w-100 overflow-hidden">
            <div className="card-body bg-secondary">
              <div className="d-flex align-items-center gap-3 mb-4">
                <div className="bg-white bg-opacity-25 rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48 }}>
                  <iconify-icon icon="solar:bell-linear" class="fs-7 text-white"></iconify-icon>
                </div>
                <div>
                  <h3 className="card-title text-white">Alertes envoyées</h3>
                  <h6 className="card-subtitle text-white opacity-70 mb-0">Total cumulé</h6>
                </div>
              </div>
              <div className="row align-items-center">
                <div className="col-5"><h2 className="mb-0 text-white text-nowrap">{alertsCount}</h2></div>
                <div className="col-7"><MiniBarChart /></div>
              </div>
            </div>
          </div>
        </div>

        {/* Profile card */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-body p-2">
              <img className="card-img-top w-100 rounded overflow-hidden" src="/assets/images/backgrounds/profile-bg.jpg" style={{ height: 111, objectFit: "cover" }} alt="cover" />
              <div className="text-center p-7" style={{ marginTop: -56 }}>
                <img src={avatarUrl} alt="avatar" className="rounded-circle shadow-sm border border-3 border-white" width="112" height="112" />
                <h3 className="mb-1 mt-3">{displayName}</h3>
                <p className="fs-3 text-muted">Chasseur de Deals &bull; {planLabel}</p>
                <a href={`https://discord.com/users/${currentUser?.discordId ?? ""}`} target="_blank" rel="noreferrer" className="btn btn-primary btn-rounded mb-4">Discord</a>
                <div className="row gx-lg-4 text-center pt-7 justify-content-center border-top">
                  <div className="col-4"><h3 className="mb-0">{dealsCount}</h3><small className="text-muted fs-3">Deals trouvés</small></div>
                  <div className="col-4"><h3 className="mb-0">{scansCount}</h3><small className="text-muted fs-3">Scans</small></div>
                  <div className="col-4"><h3 className="mb-0">{alertsCount}</h3><small className="text-muted fs-3">Alertes Discord</small></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ScoreViz({ high = 0, mid = 0, low = 0 }) {
  const total = high + mid + low || 1;
  const rHigh = Math.max(5, Math.round((high / total) * 20));
  const rMid  = Math.max(5, Math.round((mid  / total) * 20));
  const rLow  = Math.max(5, Math.round((low  / total) * 20));
  return (
    <svg viewBox="0 0 320 200" width="100%" height="100%" style={{ maxHeight: 220 }} aria-label="Score distribution">
      <defs>
        <filter id="bonoitec-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <path d="M40 90 L80 60 L130 50 L180 55 L220 50 L260 65 L290 95 L280 130 L260 145 L220 155 L180 150 L140 145 L100 150 L60 135 Z" fill="#c9d6de" stroke="#a9b8c2" strokeWidth="1.5" opacity="0.7" />
      <g>
        <circle cx="60"  cy="120" r={rHigh + 8} fill="#26c6da" opacity="0.3" filter="url(#bonoitec-glow)" />
        <circle cx="60"  cy="120" r={rHigh} fill="#26c6da" />
        <text x="60"  y="148" textAnchor="middle" fontSize="10" fill="#888">{high}</text>
        <circle cx="170" cy="115" r={rMid  + 8} fill="#1e88e5" opacity="0.3" filter="url(#bonoitec-glow)" />
        <circle cx="170" cy="115" r={rMid} fill="#1e88e5" />
        <text x="170" y="143" textAnchor="middle" fontSize="10" fill="#888">{mid}</text>
        <circle cx="265" cy="85"  r={rLow  + 8} fill="#fc4b6c" opacity="0.3" filter="url(#bonoitec-glow)" />
        <circle cx="265" cy="85"  r={rLow} fill="#fc4b6c" />
        <text x="265" y="113" textAnchor="middle" fontSize="10" fill="#888">{low}</text>
      </g>
    </svg>
  );
}
