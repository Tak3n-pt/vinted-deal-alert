import React from "react";
import { useApp } from "../AppContext.jsx";
import { eur, botStateLabel, dateTimeShort, timeShort } from "../format.js";
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

const PROFILE_IMGS = [
  "https://bootstrapdemos.wrappixel.com/materialpro/dist/assets/images/profile/user-2.jpg",
  "https://bootstrapdemos.wrappixel.com/materialpro/dist/assets/images/profile/user-9.jpg",
  "https://bootstrapdemos.wrappixel.com/materialpro/dist/assets/images/profile/user-3.jpg",
  "https://bootstrapdemos.wrappixel.com/materialpro/dist/assets/images/profile/user-10.jpg",
];

export default function Dashboard() {
  const { currentUser, deals, scans, searches, status, usage, apifyUsage } = useApp();

  const avatarUrl   = discordAvatar(currentUser?.discordId, currentUser?.avatar);
  const displayName = currentUser?.username ?? "Chasseur";
  const planLabel   = currentUser?.plan === "admin" ? "Admin" : currentUser?.plan ?? "Free";

  const now          = Date.now();
  const dealsCount   = deals.length;
  const alertsCount  = deals.filter((d) => d.sent).length;
  const pendingCount = deals.filter((d) => d.shouldAlert && !d.sent).length;
  const scansCount   = scans.length;
  const itemsTotal   = scans.reduce((s, r) => s + (r.listings ?? 0), 0);
  const itemsFmt     = itemsTotal >= 1000 ? (itemsTotal / 1000).toFixed(1) + "k" : String(itemsTotal);
  const avgScore     = deals.length ? Math.round(deals.reduce((s, d) => s + (d.score ?? 0), 0) / deals.length) : 0;
  const alertRate    = deals.length ? Math.round((alertsCount / deals.length) * 100) : 0;
  const botLabel     = botStateLabel(status);
  const nextScanFmt  = status?.nextScanAt ? timeShort(status.nextScanAt) : "--:--";
  const lastScanFmt  = status?.lastScan?.startedAt ? dateTimeShort(status.lastScan.startedAt) : "-";
  const best         = status?.bestCandidate;
  const quotaTotal   = usage?.total ?? currentUser?.dailyApifyQuota ?? 0;
  const quotaUsed    = usage?.used ?? 0;
  const quotaPct     = quotaTotal > 0 ? Math.min(100, Math.round((quotaUsed / quotaTotal) * 100)) : 0;
  const apifyUsd     = apifyUsage?.totalUsageUsd ?? 0;
  const latestApify  = apifyUsage?.actors?.map((actor) => actor.latestRunAt).filter(Boolean).sort().at(-1);

  const scoreHigh = deals.filter((d) => (d.score ?? 0) >= 80).length;
  const scoreMid  = deals.filter((d) => (d.score ?? 0) >= 60 && (d.score ?? 0) < 80).length;
  const scoreLow  = deals.filter((d) => (d.score ?? 0) < 60).length;

  const sparkDeals = Array.from({ length: 8 }, (_, i) => {
    const ageStart = (7 - i) * 3600000;
    const ageEnd   = (8 - i) * 3600000;
    return deals.filter((d) => {
      const age = now - new Date(d.createdAt ?? 0).getTime();
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
    const age = (now - new Date(d.createdAt ?? 0).getTime()) / 3600000;
    if (age >= 0 && age < 24) dealCounts[23 - Math.min(23, Math.floor(age))]++;
  });
  const SCRAPING_SERIES = [
    { name: "Items scannés", data: scanCounts },
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
              <h4 className="font-weight-medium mb-0">Vue d&apos;ensemble</h4>
              <nav aria-label="breadcrumb">
                <ol className="breadcrumb">
                  <li className="breadcrumb-item">
                    <a className="text-muted text-decoration-none" href="" onClick={(e) => e.preventDefault()}>Home</a>
                  </li>
                  <li className="breadcrumb-item text-muted" aria-current="page">Vue d&apos;ensemble</li>
                </ol>
              </nav>
            </div>
            <div>
              <div className="d-sm-flex d-none gap-3 no-block justify-content-end align-items-center">
                <div className="d-flex gap-2">
                  <div className="">
                    <small>Ce mois-ci</small>
                    <h4 className="text-primary mb-0">{dealsCount} deals</h4>
                  </div>
                  <div className="">
                    <div className="breadbar"><Breadbar color="primary" /></div>
                  </div>
                </div>
                <div className="d-flex gap-2">
                  <div className="">
                    <small>Mois dernier</small>
                    <h4 className="text-secondary mb-0">{alertsCount} alertes</h4>
                  </div>
                  <div className="">
                    <div className="breadbar2"><Breadbar color="secondary" /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-lg-4 col-md-6">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <p className="card-subtitle mb-0">Quota Apify aujourd&apos;hui</p>
                <span className="badge bg-primary-subtle text-primary">{quotaPct}%</span>
              </div>
              <h4 className="card-title mb-2">{quotaUsed} / {quotaTotal || "-"}</h4>
              <div className="progress" style={{ height: 6 }}>
                <div className="progress-bar" style={{ width: `${quotaPct}%` }}></div>
              </div>
              <small className="text-muted d-block mt-2">Reset {usage?.resetAt ? timeShort(usage.resetAt) : "-"}</small>
            </div>
          </div>
        </div>
        <div className="col-lg-4 col-md-6">
          <div className="card">
            <div className="card-body">
              <p className="card-subtitle">Scan bot</p>
              <h4 className="card-title mb-1">{botLabel}</h4>
              <div className="d-flex justify-content-between fs-3 text-muted">
                <span>Dernier: {lastScanFmt}</span>
                <span>Prochain: {nextScanFmt}</span>
              </div>
            </div>
          </div>
        </div>
        {currentUser?.id === 1 ? (
          <div className="col-lg-4 col-md-12">
            <div className="card">
              <div className="card-body">
                <p className="card-subtitle">Crédit Apify du mois</p>
                <h4 className="card-title mb-1">${apifyUsd.toFixed(4)}</h4>
                <div className="d-flex justify-content-between fs-3 text-muted">
                  <span>Paid actors: ${(apifyUsage?.paidActorUsd ?? 0).toFixed(4)}</span>
                  <span>Dernier run: {latestApify ? dateTimeShort(latestApify) : "-"}</span>
                </div>
                {apifyUsage?.error ? <small className="text-danger d-block mt-2">{apifyUsage.error}</small> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="row">
        {/* First column */}
        <div className="col-lg-5">
          <div className="row">
            <div className="col-md-6">
              <div className="card">
                <div className="card-body p-9">
                  <p className="card-subtitle">Deals Trouv&eacute;s</p>
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
                    <h6 className="text-white">Articles Scann&eacute;s</h6>
                    <h2 className="mb-0 text-white fs-10">{itemsFmt || "0"}</h2>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="card upgrade-plan">
            <div className="card-body position-relative z-1">
              <p className="text-white">Bot actif en ce moment.</p>
              <h3 className="text-white fw-semibold">Bonoitec Flash</h3>
              <div className="hstack gap-9 my-9 pb-2">
                <div className="hstack gap-2">
                  <div className="round-36 bg-white bg-opacity-20 rounded-circle hstack justify-content-center">
                    <i className="ti ti-user fs-5 text-white"></i>
                  </div>
                  <div>
                    <p className="mb-0 fs-2 text-white text-opacity-60">Recherches</p>
                    <h6 className="mb-0 fs-2 text-white fw-semibold">{searches.length} actives</h6>
                  </div>
                </div>
                <div className="hstack gap-2">
                  <div className="round-36 bg-white bg-opacity-20 rounded-circle hstack justify-content-center">
                    <i className="ti ti-circles-relation fs-5 text-white"></i>
                  </div>
                  <div>
                    <p className="mb-0 fs-2 text-white text-opacity-60">Prochain scan</p>
                    <h6 className="mb-0 fs-2 text-white fw-semibold">{nextScanFmt}</h6>
                  </div>
                </div>
              </div>
              <a href="javascript:void(0)" className="btn btn-primary bg-white bg-opacity-20 border-0">{botLabel}</a>
            </div>
          </div>
        </div>

        {/* Second column */}
        <div className="col-lg-4">
          <div className="card material-pro-bg shadow-none">
            <div className="card-body p-4">
              <div className="hstack gap-6">
                <div className="round-60 bg-primary-subtle rounded-circle hstack justify-content-center flex-shrink-0">
                  <iconify-icon icon="solar:smartphone-rotate-landscape-bold" class="fs-6 text-primary"></iconify-icon>
                </div>
                <div>
                  {best ? (
                    <>
                      <h4 className="mb-1 card-title text-dark">{best.model ?? best.title}</h4>
                      <p className="card-subtitle mb-1">{best.riskLevel ?? "—"} &bull; {displayName}</p>
                      <div className="d-flex align-items-center gap-2">
                        <span className="fw-bold text-primary fs-5">{eur(best.finalPrice)}</span>
                        <span className="badge bg-success-subtle text-success rounded-pill fs-2">Score {best.score ?? "—"}/100</span>
                      </div>
                      <a href={best.url ?? "#"} target="_blank" rel="noreferrer" className="fs-2 text-muted mt-1 d-inline-block">Voir sur Vinted &rarr;</a>
                    </>
                  ) : (
                    <>
                      <h4 className="mb-1 card-title text-dark">Meilleur Deal du Jour</h4>
                      <p className="card-subtitle mb-1">Aucun deal trouv&eacute;</p>
                      <div className="d-flex align-items-center gap-2">
                        <span className="fw-bold text-primary fs-5">— €</span>
                        <span className="badge bg-secondary-subtle text-secondary rounded-pill fs-2">Score —/100</span>
                      </div>
                      <a href="javascript:void(0)" className="fs-2 text-muted mt-1 d-inline-block">En attente &rarr;</a>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Third column */}
        <div className="col-lg-3">
          <div className="card">
            <div className="card-body p-9">
              <h3 className="card-title mb-9">M&eacute;triques Rapides</h3>
              <div className="hstack justify-content-between gap-6 py-6 border-bottom">
                <h6 className="mb-0">Recherches actives</h6>
                <div className="hstack gap-6">
                  <iconify-icon icon="solar:arrow-right-up-linear" class="fs-6 text-secondary"></iconify-icon>
                  <h6 className="mb-0">{searches.length} actives</h6>
                </div>
              </div>
              <div className="hstack justify-content-between gap-6 py-6 border-bottom">
                <h6 className="mb-0">Score moyen</h6>
                <div className="hstack gap-6">
                  <iconify-icon icon="solar:arrow-right-up-linear" class="fs-6 text-danger"></iconify-icon>
                  <h6 className="mb-0">{avgScore}/100</h6>
                </div>
              </div>
              <div className="hstack justify-content-between gap-6 py-6 border-bottom">
                <h6 className="mb-0">Alertes Discord</h6>
                <div className="hstack gap-6">
                  <iconify-icon icon="solar:arrow-left-down-linear" class="fs-6 text-secondary"></iconify-icon>
                  <h6 className="mb-0">{alertsCount} <span className="text-body">/{dealsCount}</span></h6>
                </div>
              </div>
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="card-body bg-purple p-9">
              <h3 className="card-title mb-2 fs-6 text-white">Deals en Attente</h3>
              <p className="card-subtitle text-white pb-2">{pendingCount} &agrave; examiner</p>
              <div className="hstack justify-content-between mt-5">
                <ul className="hstack mb-0">
                  {recentDeals.slice(0, 2).map((d, i) => {
                    const brand = brandFromTitle(d.title) ?? brandFromTitle(d.model ?? "");
                    const info  = brand ? BRAND_MAP[brand] : null;
                    return (
                      <li key={d.id ?? i} className={i > 0 ? "ms-n2" : ""}>
                        <a href="javascript:void(0)">
                          {info ? (
                            <div className={`${info.bg} rounded-circle border border-2 border-purple d-flex align-items-center justify-content-center`} style={{ width: 40, height: 40 }}>
                              <img src={`https://cdn.simpleicons.org/${info.slug}/ffffff`} alt={brand} width="20" height="20" />
                            </div>
                          ) : (
                            <img src={PROFILE_IMGS[i]} className="rounded-circle border border-2 border-purple" width="40" height="40" alt="" />
                          )}
                        </a>
                      </li>
                    );
                  })}
                  {recentDeals.length === 0 && (
                    <li>
                      <a href="javascript:void(0)">
                        <img src={PROFILE_IMGS[0]} className="rounded-circle border border-2 border-purple" width="40" height="40" alt="" />
                      </a>
                    </li>
                  )}
                  <li className="ms-n2">
                    <a href="javascript:void(0)" className="text-bg-dark fs-2 rounded-circle border border-2 border-purple d-flex align-items-center justify-content-center round-40">
                      +{Math.max(0, pendingCount - 2)}
                    </a>
                  </li>
                </ul>
                <div className="hstack justify-content-center rounded-circle text-bg-warning round-40">
                  <iconify-icon icon="solar:arrow-right-up-linear" class="fs-6 text-white"></iconify-icon>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Newsletter Campaign */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center flex-wrap mb-9">
                <div>
                  <h4 className="card-title">Activit&eacute; de Scraping</h4>
                  <p className="card-subtitle">Items scann&eacute;s vs Deals trouv&eacute;s par heure</p>
                </div>
                <div className="ms-auto align-self-center">
                  <ul className="d-flex align-items-center gap-3 mb-0">
                    <li className="d-flex">
                      <div className="text-primary d-flex align-items-center gap-2 fs-3">
                        <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Items scann&eacute;s
                      </div>
                    </li>
                    <li className="d-flex">
                      <div className="text-secondary d-flex align-items-center gap-2 fs-3">
                        <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Deals trouv&eacute;s
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="me-n4 me-rtl-n4">
                <div id="newsletter-campaign">
                  <AreaChart categories={chartHours} series={SCRAPING_SERIES} height={267} />
                </div>
              </div>
              <div className="row text-center">
                <div className="col-lg-4 col-md-4 mt-4">
                  <h2 className="mb-0">{scansCount}</h2>
                  <small className="fs-3 text-muted">Total scann&eacute;s</small>
                </div>
                <div className="col-lg-4 col-md-4 mt-4">
                  <h2 className="mb-0">{itemsFmt || "0"}</h2>
                  <small className="fs-3 text-muted">Mail Items scann&eacute;s</small>
                </div>
                <div className="col-lg-4 col-md-4 mt-4">
                  <h2 className="mb-0">{alertRate}%</h2>
                  <small className="fs-3 text-muted">Taux de r&eacute;ussite</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* My Contacts → Top Vendeurs */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-body pb-0">
              <h4 className="card-title">Top Vendeurs</h4>
              <p className="card-subtitle mb-0">Derniers deals d&eacute;tect&eacute;s</p>
            </div>
            <div className="message-box contact-box position-relative mt-3">
              <div className="message-widget contact-widget position-relative">
                {recentDeals.length === 0 ? (
                  <a href="javascript:void(0)" className="py-4 hstack px-7 gap-3">
                    <div className="user-img position-relative">
                      <img src={PROFILE_IMGS[0]} alt="user" className="rounded-circle w-100" />
                      <span className="profile-status pull-right d-inline-block position-absolute text-bg-secondary rounded-circle"></span>
                    </div>
                    <div className="v-middle d-md-flex align-items-center w-100">
                      <div className="text-truncate">
                        <h5 className="mb-1 text-dark font-weight-medium">Aucun deal</h5>
                        <span className="text-muted fs-3">En attente de scan</span>
                      </div>
                    </div>
                  </a>
                ) : (
                  recentDeals.map((d, i) => {
                    const dotClass  = i === 0 ? "text-bg-secondary" : "text-bg-light-indigo";
                    const rowClass  = i < 2 ? "py-4 hstack px-7 gap-3" : "py-4 pb-7 hstack px-7 gap-8";
                    return (
                      <a href={d.url ?? "javascript:void(0)"} target={d.url ? "_blank" : undefined} rel="noreferrer" className={rowClass} key={d.id ?? i}>
                        <div className="user-img position-relative">
                          <img src={PROFILE_IMGS[i % 4]} alt="user" className="rounded-circle w-100" />
                          <span className={`profile-status pull-right d-inline-block position-absolute ${dotClass} rounded-circle`}></span>
                        </div>
                        <div className="v-middle d-md-flex align-items-center w-100">
                          <div className="text-truncate">
                            <h5 className="mb-1 text-dark font-weight-medium">{d.model ?? d.title}</h5>
                            <span className="text-muted fs-3">{eur(d.finalPrice)}</span>
                          </div>
                          <div className="ms-auto d-flex button-group gap-1">
                            <button type="button" className="btn btn-sm bg-danger-subtle text-danger round-sm rounded-pill m-0">
                              <i data-feather="video" className="feather-sm"></i>
                            </button>
                            <button type="button" className="btn btn-sm bg-primary-subtle text-primary round-sm rounded-pill m-0">
                              <i data-feather="phone-incoming" className="feather-sm"></i>
                            </button>
                          </div>
                        </div>
                      </a>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Current Visitors → Origine des Vendeurs */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-body">
              <h4 className="card-title">Origine des Vendeurs</h4>
              <p className="card-subtitle">Different Devices Used to Visit</p>
              <div className="my-3 h-280" id="usa"></div>
              <div className="text-center">
                <ul className="list-inline mb-0 hstack justify-content-center">
                  <li className="list-inline-item px-2 me-0">
                    <div className="text-secondary d-flex align-items-center gap-2 fs-3">
                      <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Valley
                    </div>
                  </li>
                  <li className="list-inline-item px-2 me-0">
                    <div className="text-primary d-flex align-items-center gap-2 fs-3">
                      <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>New York
                    </div>
                  </li>
                  <li className="list-inline-item px-2 me-0">
                    <div className="text-danger d-flex align-items-center gap-2 fs-3">
                      <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Kansas
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Projects of the Month → Derniers Deals Trouvés */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-body pb-3">
              <div className="d-md-flex no-block">
                <h4 className="card-title">Derniers Deals Trouv&eacute;s</h4>
                <div className="ms-auto">
                  <select className="form-select rounded-pill fw-medium" defaultValue="today">
                    <option value="today">Aujourd&apos;hui</option>
                    <option value="1">7 derniers jours</option>
                    <option value="2">Ce mois-ci</option>
                    <option value="3">30 derniers jours</option>
                  </select>
                </div>
              </div>
              <div className="month-table">
                <div className="table-responsive mt-3">
                  <table className="table align-middle mb-0 no-wrap">
                    <thead>
                      <tr>
                        <th className="border-0 ps-0">Mod&egrave;le</th>
                        <th className="border-0">Vendeur</th>
                        <th className="border-0">Score</th>
                        <th className="border-0 text-end">Prix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentDeals.length === 0 ? (
                        <tr><td colSpan={4} className="text-muted text-center py-4 fs-3">Aucun deal analys&eacute;</td></tr>
                      ) : (
                        recentDeals.map((d, i) => {
                          const brand      = brandFromTitle(d.title) ?? brandFromTitle(d.model ?? "");
                          const info       = brand ? BRAND_MAP[brand] : null;
                          const score      = d.score ?? 0;
                          const scoreColor = score >= 80 ? "success" : score >= 60 ? "primary" : score >= 60 ? "info" : "warning";
                          const isLast     = i === recentDeals.length - 1;
                          return (
                            <tr key={d.id ?? i}>
                              <td className={`ps-0${isLast ? " border-bottom-0" : ""}`}>
                                <div className="hstack gap-3">
                                  <span className={`round-48 rounded-circle flex-shrink-0 hstack justify-content-center align-items-center ${info?.bg ?? "bg-dark"}`}>
                                    {info ? (
                                      <img src={`https://cdn.simpleicons.org/${info.slug}/ffffff`} alt={brand} width="22" height="22" />
                                    ) : (
                                      <iconify-icon icon="solar:smartphone-2-line-duotone" class="text-white fs-5"></iconify-icon>
                                    )}
                                  </span>
                                  <div>
                                    <h5 className="mb-1">{d.model ?? d.title}</h5>
                                    <p className="mb-0 fs-3 text-muted">{d.riskLevel ?? "—"}</p>
                                  </div>
                                </div>
                              </td>
                              <td className={isLast ? "border-bottom-0" : ""}>
                                <p className="mb-0">{d.storageGb ? `${d.storageGb} Go` : "—"}</p>
                                <span className="fs-2 text-muted">{d.createdAt ? timeShort(d.createdAt) : "—"}</span>
                              </td>
                              <td className={isLast ? "border-bottom-0" : ""}>
                                <span className={`badge bg-${scoreColor}-subtle text-${scoreColor} fw-semibold`}>{score} / 100</span>
                              </td>
                              <td className={`text-end${isLast ? " border-bottom-0" : ""}`}>
                                <p className="mb-0 fw-semibold">{eur(d.finalPrice)}</p>
                              </td>
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
        </div>

        {/* Our Visitors → Répartition par Marque */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-body">
              <h4 className="card-title">R&eacute;partition par Marque</h4>
              <p className="card-subtitle">Different Devices Used to Visit</p>
            </div>
            <div id="our-visitors">
              <OurVisitorsDonut
                series={[scoreHigh, scoreMid, scoreLow]}
                labels={["Mobile", "Desktop", "Tablet"]}
              />
            </div>
            <div className="card-body d-flex align-items-center justify-content-center border-top mt-3">
              <ul className="list-inline mb-0 hstack justify-content-center">
                <li className="list-inline-item px-2 me-0">
                  <div className="text-primary d-flex align-items-center gap-2 fs-3">
                    <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Mobile
                  </div>
                </li>
                <li className="list-inline-item px-2 me-0">
                  <div className="text-purple d-flex align-items-center gap-2 fs-3">
                    <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Desktop
                  </div>
                </li>
                <li className="list-inline-item px-2 me-0">
                  <div className="text-secondary d-flex align-items-center gap-2 fs-3">
                    <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Tablet
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bandwidth usage + Download count */}
        <div className="col-lg-4">
          <div className="card w-100 overflow-hidden">
            <div className="card-body bg-purple">
              <div className="hstack gap-6 mb-7">
                <div className="bg-black bg-opacity-10 round-48 rounded-circle d-flex align-items-center justify-content-center">
                  <iconify-icon icon="solar:server-square-linear" class="fs-7 icon-center text-white"></iconify-icon>
                </div>
                <div>
                  <h4 className="card-title text-white">Couverture Recherches</h4>
                  <p className="card-subtitle text-white opacity-70">Surveillance en cours</p>
                </div>
              </div>
              <div className="row align-items-center">
                <div className="col-6">
                  <h2 className="mb-0 text-white text-nowrap">{searches.length} / 10</h2>
                </div>
                <div className="col-6">
                  <div id="bandwidth-usage"><MiniLineChart /></div>
                </div>
              </div>
            </div>
          </div>
          <div className="card w-100 overflow-hidden">
            <div className="card-body bg-secondary">
              <div className="hstack gap-6 mb-7">
                <div className="bg-white bg-opacity-20 round-48 rounded-circle d-flex align-items-center justify-content-center">
                  <iconify-icon icon="solar:chart-2-linear" class="fs-7 icon-center text-white"></iconify-icon>
                </div>
                <div>
                  <h3 className="card-title text-white">Deals Aujourd&apos;hui</h3>
                  <h6 className="card-subtitle text-white opacity-70">Total cumul&eacute;</h6>
                </div>
              </div>
              <div className="row align-items-center">
                <div className="col-5">
                  <h2 className="mb-0 text-white text-nowrap">{dealsCount}</h2>
                </div>
                <div className="col-7">
                  <div id="download-count"><MiniBarChart /></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Profile card */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-body p-2">
              <img className="card-img-top w-100 profile-bg-height rounded overflow-hidden" src="/assets/images/backgrounds/profile-bg.jpg" height="111" alt="" />
              <div className="card-body little-profile text-center p-9">
                <div className="pro-img">
                  <img src={avatarUrl} alt="user" className="rounded-circle shadow-sm" width="112" />
                </div>
                <h3 className="mb-1">{displayName}</h3>
                <p className="fs-3">Chasseur de Deals &bull; {planLabel}</p>
                <a href={`https://discord.com/users/${currentUser?.discordId ?? ""}`} target="_blank" rel="noreferrer" className="waves-effect waves-dark btn btn-primary btn-md btn-rounded mb-4">Discord</a>
                <div className="row gx-lg-4 text-center pt-9 justify-content-center border-top">
                  <div className="col-4">
                    <h3 className="mb-0">{dealsCount}</h3>
                    <small className="text-muted fs-3">Deals trouv&eacute;s</small>
                  </div>
                  <div className="col-4">
                    <h3 className="mb-0">{scansCount}</h3>
                    <small className="text-muted fs-3">Scans</small>
                  </div>
                  <div className="col-4">
                    <h3 className="mb-0">{alertsCount}</h3>
                    <small className="text-muted fs-3">Alertes Discord</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
