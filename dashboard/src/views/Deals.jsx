import React, { useMemo, useState } from "react";
import { useApp } from "../AppContext.jsx";
import { eur, filterLabel, translateReason } from "../format.js";
import { ScoreBadge, RiskBadge, StatusBadge } from "../components/ScoreBadge.jsx";
import Empty from "../components/Empty.jsx";

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
  if (t.includes("iphone") || t.includes("apple"))              return "apple";
  if (t.includes("samsung") || t.includes("galaxy"))            return "samsung";
  if (t.includes("pixel") || t.includes("google"))              return "google";
  if (t.includes("oneplus") || t.includes("one plus"))          return "oneplus";
  if (t.includes("xiaomi") || t.includes("redmi") || t.includes("poco")) return "xiaomi";
  if (t.includes("sony") || t.includes("xperia"))               return "sony";
  if (t.includes("motorola") || t.includes("moto "))            return "motorola";
  if (t.includes("nokia"))                                       return "nokia";
  if (t.includes("huawei"))                                      return "huawei";
  if (t.includes("oppo"))                                        return "oppo";
  return null;
}

function BrandIcon({ title = "", model = "" }) {
  const brand = brandFromTitle(title) ?? brandFromTitle(model);
  const info = brand ? BRAND_MAP[brand] : null;
  if (info) {
    return (
      <div className={`${info.bg} rounded-circle round-40 d-flex align-items-center justify-content-center flex-shrink-0`}>
        <img src={`https://cdn.simpleicons.org/${info.slug}/ffffff`} alt={brand} width="20" height="20" />
      </div>
    );
  }
  return (
    <div className="bg-primary-subtle rounded-circle round-40 d-flex align-items-center justify-content-center flex-shrink-0">
      <iconify-icon icon="solar:smartphone-2-line-duotone" class="text-primary fs-5"></iconify-icon>
    </div>
  );
}

export default function Deals() {
  const { deals } = useApp();
  const [filter, setFilter] = useState("all");
  const filtered = useMemo(() => {
    if (filter === "alert") return deals.filter((deal) => deal.shouldAlert);
    if (filter === "sent") return deals.filter((deal) => deal.sent);
    if (filter === "risk") return deals.filter((deal) => deal.riskLevel === "reject" || deal.riskLevel === "high");
    return deals;
  }, [deals, filter]);

  return (
    <>
      <div className="font-weight-medium shadow-none position-relative overflow-hidden mb-7">
        <div className="card-body px-0">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <h4 className="font-weight-medium mb-0">Historique des opportunités</h4>
              <nav aria-label="breadcrumb">
                <ol className="breadcrumb">
                  <li className="breadcrumb-item"><a className="text-muted text-decoration-none" href="#">Bonoitec Flash</a></li>
                  <li className="breadcrumb-item text-muted" aria-current="page">Opportunités</li>
                </ol>
              </nav>
            </div>
            <div className="btn-group" role="group">
              {["all", "alert", "sent", "risk"].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`btn ${filter === item ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => setFilter(item)}
                >
                  {filterLabel(item)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h5 className="card-title mb-0 fw-semibold">Produits analysés</h5>
            <span className="fs-3 text-muted">{filtered.length} {filtered.length > 1 ? "résultats" : "résultat"}</span>
          </div>
          {filtered.length === 0 ? (
            <Empty text="Aucune opportunité dans cette catégorie" />
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead>
                  <tr className="text-uppercase fs-2 text-muted">
                    <th>Produit</th>
                    <th>Prix final</th>
                    <th>Référence</th>
                    <th>Remise</th>
                    <th>Score</th>
                    <th>Risque</th>
                    <th>Décision</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((deal) => (
                    <tr key={deal.id}>
                      <td>
                        <div className="d-flex align-items-center gap-3">
                          <BrandIcon title={deal.title} model={deal.model} />
                          <div>
                            <h6 className="mb-0 fs-3 fw-semibold">{deal.model}{deal.storageGb ? ` ${deal.storageGb} Go` : ""}</h6>
                            <span className="fs-2 text-muted text-truncate d-inline-block" style={{ maxWidth: "280px" }}>{deal.title}</span>
                          </div>
                        </div>
                      </td>
                      <td><strong>{eur(deal.finalPrice)}</strong></td>
                      <td className="text-muted fs-3">{eur(deal.benchmarkPrice)}</td>
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
    </>
  );
}
