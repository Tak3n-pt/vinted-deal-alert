import React from "react";
import { useApp } from "../AppContext.jsx";
import { api } from "../api.js";
import { numberValue, optionalNumber } from "../format.js";
import TagEditor from "../components/TagEditor.jsx";

export default function RiskRules() {
  const { riskRules, setRiskRules, runAction, loading } = useApp();
  if (!riskRules) return null;

  function patch(next) {
    setRiskRules({ ...riskRules, ...next });
  }

  function save() {
    runAction("Filtres sauvegardés", () => api("/api/risk-rules", { method: "PUT", body: riskRules }));
  }

  return (
    <>
      <div className="font-weight-medium shadow-none position-relative overflow-hidden mb-7">
        <div className="card-body px-0">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <h4 className="font-weight-medium mb-0">Filtres & protection qualité</h4>
              <nav aria-label="breadcrumb">
                <ol className="breadcrumb">
                  <li className="breadcrumb-item"><a className="text-muted text-decoration-none" href="#">Bonoitec Flash</a></li>
                  <li className="breadcrumb-item text-muted" aria-current="page">Filtres</li>
                </ol>
              </nav>
            </div>
            <button className="btn btn-primary d-flex align-items-center gap-1" onClick={save} disabled={loading}>
              <iconify-icon icon="solar:diskette-line-duotone"></iconify-icon>
              Sauvegarder
            </button>
          </div>
        </div>
      </div>

      {/* Row 1 — Quality gates (existing) */}
      <div className="row">
        <div className="col-lg-6">
          <SectionCard icon="solar:shield-warning-line-duotone" tone="danger" title="Catégories bloquantes">
            {[
              ["rejectHighRisks", "Bloquer toutes les annonces à risque élevé"],
              ["allowMissingImage", "Autoriser les annonces sans image"],
              ["rejectNonOriginalScreen", "Bloquer écran non original"],
              ["rejectScreenReplaced", "Bloquer écran remplacé"],
              ["rejectMissingInvoice", "Bloquer sans facture"]
            ].map(([key, label]) => (
              <ToggleRow
                key={key}
                id={`rr-${key}`}
                label={label}
                checked={Boolean(riskRules[key])}
                onChange={(v) => patch({ [key]: v })}
              />
            ))}
          </SectionCard>
        </div>

        <div className="col-lg-6">
          <SectionCard icon="solar:user-check-rounded-line-duotone" tone="primary" title="Confiance vendeur">
            <div className="row g-3">
              <Field label="Avis vendeur min." col="col-md-6">
                <input
                  type="number"
                  min="0"
                  className="form-control"
                  value={riskRules.minSellerReviews ?? 0}
                  onChange={(e) => patch({ minSellerReviews: numberValue(e.target.value) })}
                />
              </Field>
              <Field label="Note vendeur min." col="col-md-6">
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  className="form-control"
                  value={riskRules.minSellerRating ?? 0}
                  onChange={(e) => patch({ minSellerRating: numberValue(e.target.value) })}
                />
              </Field>
              <Field label="Articles min. en vente" col="col-md-6">
                <input
                  type="number"
                  min="0"
                  className="form-control"
                  value={riskRules.minSellerItems ?? 0}
                  onChange={(e) => patch({ minSellerItems: numberValue(e.target.value) })}
                />
                <small className="fs-2 text-muted">Évite les vendeurs inactifs ; 0 = sans limite</small>
              </Field>
              <div className="col-md-6 d-flex align-items-end">
                <ToggleRow
                  id="rr-vintedpro"
                  label="Exclure les comptes Vinted Pro / business"
                  checked={Boolean(riskRules.excludeVintedPro)}
                  onChange={(v) => patch({ excludeVintedPro: v })}
                />
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Row 2 — Seller block/allow lists */}
      <div className="row">
        <div className="col-lg-6">
          <SectionCard icon="solar:user-block-rounded-line-duotone" tone="danger" title="Liste noire vendeurs" subtitle="Annonces de ces vendeurs jamais alertées">
            <TagEditor
              tags={riskRules.sellerBlocklist ?? []}
              onChange={(value) => patch({ sellerBlocklist: value })}
              placeholder="Ajouter un nom d'utilisateur Vinted…"
              tone="danger"
              maxTags={100}
            />
            <small className="fs-2 text-muted d-block mt-2">
              Respecte la casse côté Vinted. Appuie sur Entrée ou virgule pour ajouter.
            </small>
          </SectionCard>
        </div>
        <div className="col-lg-6">
          <SectionCard icon="solar:user-heart-rounded-line-duotone" tone="success" title="Vendeurs de confiance" subtitle="Bonus de score pour ces vendeurs">
            <TagEditor
              tags={riskRules.sellerAllowlist ?? []}
              onChange={(value) => patch({ sellerAllowlist: value })}
              placeholder="Ajouter un vendeur favori…"
              tone="success"
              maxTags={100}
            />
            <small className="fs-2 text-muted d-block mt-2">
              Les annonces de ces vendeurs passent les seuils plus facilement.
            </small>
          </SectionCard>
        </div>
      </div>

      {/* Row 3 — Listing freshness & competition */}
      <div className="row">
        <div className="col-lg-6">
          <SectionCard icon="solar:clock-circle-line-duotone" tone="info" title="Fraîcheur et concurrence" subtitle="Filtre les annonces selon leur âge et popularité">
            <div className="row g-3">
              <Field label="Annonces de moins de (heures)" col="col-md-6">
                <input
                  type="number"
                  min="0"
                  className="form-control"
                  value={riskRules.maxListingAgeHours ?? 0}
                  onChange={(e) => patch({ maxListingAgeHours: numberValue(e.target.value) })}
                  placeholder="0 = pas de limite"
                />
                <small className="fs-2 text-muted">Idéal : 6 h pour ne pas rater les ventes flash</small>
              </Field>
              <Field label="Favoris max." col="col-md-6">
                <input
                  type="number"
                  min="0"
                  className="form-control"
                  value={riskRules.maxFavoriteCount ?? 0}
                  onChange={(e) => patch({ maxFavoriteCount: numberValue(e.target.value) })}
                  placeholder="0 = pas de limite"
                />
                <small className="fs-2 text-muted">Évite les deals déjà vus par tout le monde</small>
              </Field>
            </div>
          </SectionCard>
        </div>

        <div className="col-lg-6">
          <SectionCard icon="solar:battery-charge-line-duotone" tone="success" title="Plage batterie acceptable" subtitle="Tu peux fixer un minimum ET un maximum">
            <div className="row g-3">
              <Field label="Batterie min. (%)" col="col-md-6">
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="form-control"
                  value={riskRules.minBatteryHealth ?? 0}
                  onChange={(e) => patch({ minBatteryHealth: numberValue(e.target.value) })}
                />
              </Field>
              <Field label="Batterie max. (%)" col="col-md-6">
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="form-control"
                  value={riskRules.maxBatteryHealth ?? ""}
                  onChange={(e) => patch({ maxBatteryHealth: optionalNumber(e.target.value) })}
                  placeholder="Vide = pas de plafond"
                />
                <small className="fs-2 text-muted">Utile pour filtrer les claims irréalistes (&gt;100%)</small>
              </Field>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Row 4 — Country + Colors */}
      <div className="row">
        <div className="col-lg-6">
          <SectionCard icon="solar:map-line-duotone" tone="warning" title="Pays autorisés" subtitle="Codes ISO 2-lettres séparés par virgule (vide = tous)">
            <input
              className="form-control"
              value={(riskRules.allowedCountries ?? []).join(", ")}
              onChange={(e) => patch({
                allowedCountries: e.target.value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean)
              })}
              placeholder="FR, BE, ES, IT"
            />
            {(riskRules.allowedCountries ?? []).length > 0 ? (
              <div className="mt-2 d-flex flex-wrap gap-1">
                {riskRules.allowedCountries.map((country) => (
                  <span key={country} className="badge bg-warning-subtle text-warning rounded-4 px-2 py-1 fs-2">{country}</span>
                ))}
              </div>
            ) : null}
          </SectionCard>
        </div>

        <div className="col-lg-6">
          <SectionCard icon="solar:palette-line-duotone" tone="secondary" title="Couleurs / variantes acceptées" subtitle="Liste vide = toutes les couleurs">
            <TagEditor
              tags={riskRules.colorAllowlist ?? []}
              onChange={(value) => patch({ colorAllowlist: value })}
              placeholder="Titanium, Noir Sidéral, Bleu…"
              tone="secondary"
              maxTags={30}
            />
            <small className="fs-2 text-muted d-block mt-2">
              Match insensible à la casse dans le titre ou la description.
            </small>
          </SectionCard>
        </div>
      </div>

      {/* Row 5 — Keywords (existing) */}
      <SectionCard icon="solar:filter-line-duotone" tone="primary" title="Mots-clés à exclure" subtitle="Une correspondance dans le titre ou la description bloque l'annonce">
        <div className="row g-3">
          <div className="col-md-8">
            <TagEditor
              tags={riskRules.customExcludeKeywords ?? []}
              onChange={(value) => patch({ customExcludeKeywords: value })}
              placeholder="reconditionne, refurbished, réservé…"
              tone="primary"
              maxTags={50}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label fs-3">Sévérité</label>
            <select
              className="form-select"
              value={riskRules.customExcludeSeverity ?? "reject"}
              onChange={(e) => patch({ customExcludeSeverity: e.target.value })}
            >
              <option value="reject">Bloquante</option>
              <option value="high">Élevée</option>
              <option value="medium">Moyenne</option>
            </select>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

function SectionCard({ icon, tone, title, subtitle, children }) {
  return (
    <div className="card mb-4 h-100">
      <div className="card-body">
        <div className="d-flex align-items-start gap-3 mb-3">
          <div className={`bg-${tone}-subtle rounded-circle round-40 d-flex align-items-center justify-content-center flex-shrink-0`}>
            <iconify-icon icon={icon} class={`text-${tone} fs-5`}></iconify-icon>
          </div>
          <div>
            <h5 className="card-title mb-0 fw-semibold">{title}</h5>
            {subtitle ? <span className="fs-3 text-muted">{subtitle}</span> : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function ToggleRow({ id, label, checked, onChange }) {
  return (
    <div className="form-check form-switch mb-2">
      <input
        className="form-check-input"
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label className="form-check-label fs-3" htmlFor={id}>{label}</label>
    </div>
  );
}

function Field({ label, col = "col-12", children }) {
  return (
    <div className={col}>
      <label className="form-label fs-3">{label}</label>
      {children}
    </div>
  );
}
