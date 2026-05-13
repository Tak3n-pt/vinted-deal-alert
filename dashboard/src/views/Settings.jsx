import React, { useState } from "react";
import { useApp } from "../AppContext.jsx";
import { api } from "../api.js";
import { numberValue } from "../format.js";

export default function Settings() {
  const { settings, setSettings, runAction, loading } = useApp();
  const [secrets, setSecrets] = useState({ discordWebhookUrl: "", apifyToken: "", authorizedDataApiKey: "" });

  if (!settings) return null;

  const reAlertPercent = Math.round((settings.reAlertDropPercent ?? 0.10) * 100);

  async function save() {
    const payload = { ...settings };
    for (const [key, value] of Object.entries(secrets)) {
      if (value.trim()) payload[key] = value.trim();
    }
    await runAction("Paramètres sauvegardés", () => api("/api/settings", { method: "PUT", body: payload }));
    setSecrets({ discordWebhookUrl: "", apifyToken: "", authorizedDataApiKey: "" });
  }

  return (
    <>
      <div className="font-weight-medium shadow-none position-relative overflow-hidden mb-7">
        <div className="card-body px-0">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <h4 className="font-weight-medium mb-0">Paramètres</h4>
              <nav aria-label="breadcrumb">
                <ol className="breadcrumb">
                  <li className="breadcrumb-item"><a className="text-muted text-decoration-none" href="#">Bonoitec Flash</a></li>
                  <li className="breadcrumb-item text-muted" aria-current="page">Configuration</li>
                </ol>
              </nav>
            </div>
            <div className="d-flex gap-2">
              <button
                className="btn btn-outline-secondary d-flex align-items-center gap-1"
                disabled={loading}
                onClick={() => runAction("Défauts restaurés", () => api("/api/settings/restore-defaults", { method: "POST" }))}
              >
                <iconify-icon icon="solar:restart-line-duotone"></iconify-icon>
                Restaurer les défauts
              </button>
              <button className="btn btn-primary d-flex align-items-center gap-1" disabled={loading} onClick={save}>
                <iconify-icon icon="solar:diskette-line-duotone"></iconify-icon>
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-lg-6">
          <SettingsCard icon="solar:database-line-duotone" tone="primary" title="Source de données">
            <Field label="Source de données">
              <select className="form-select" value={settings.providerType} onChange={(e) => setSettings({ ...settings, providerType: e.target.value })}>
                <option value="apify">Apify</option>
                <option value="generic">API générique</option>
              </select>
            </Field>
            <Field label="Acteur Apify">
              <input className="form-control" value={settings.apifyActorId ?? ""} onChange={(e) => setSettings({ ...settings, apifyActorId: e.target.value })} />
            </Field>
            <Field label="URL API générique">
              <input className="form-control" value={settings.authorizedDataApiUrl ?? ""} onChange={(e) => setSettings({ ...settings, authorizedDataApiUrl: e.target.value })} />
            </Field>
          </SettingsCard>
        </div>

        <div className="col-lg-6">
          <SettingsCard icon="solar:clock-circle-line-duotone" tone="info" title="Cadence et limites">
            <div className="row g-2">
              <Field label="Intervalle (s)" col="col-6">
                <input type="number" min="60" className="form-control" value={settings.pollIntervalSeconds} onChange={(e) => setSettings({ ...settings, pollIntervalSeconds: numberValue(e.target.value) })} />
              </Field>
              <Field label="Délai source (s)" col="col-6">
                <input type="number" min="5" className="form-control" value={settings.providerTimeoutSeconds} onChange={(e) => setSettings({ ...settings, providerTimeoutSeconds: numberValue(e.target.value) })} />
              </Field>
              <Field label="Produits max / scan" col="col-6">
                <input type="number" min="1" className="form-control" value={settings.maxProductsPerScan} onChange={(e) => setSettings({ ...settings, maxProductsPerScan: numberValue(e.target.value) })} />
              </Field>
              <Field label="Heartbeat / N scans" col="col-6">
                <input type="number" min="0" className="form-control" value={settings.heartbeatEveryScans} onChange={(e) => setSettings({ ...settings, heartbeatEveryScans: numberValue(e.target.value) })} />
              </Field>
            </div>
          </SettingsCard>
        </div>

        <div className="col-lg-6">
          <SettingsCard icon="solar:slider-vertical-minimalistic-line-duotone" tone="success" title="Seuils d'alerte">
            <div className="row g-2">
              <Field label="Score min." col="col-6">
                <input type="number" min="0" max="100" className="form-control" value={settings.minScore} onChange={(e) => setSettings({ ...settings, minScore: numberValue(e.target.value) })} />
              </Field>
              <Field label="Remise min. (0-1)" col="col-6">
                <input type="number" min="0" max="1" step="0.01" className="form-control" value={settings.minDiscount} onChange={(e) => setSettings({ ...settings, minDiscount: numberValue(e.target.value) })} />
              </Field>
              <Field label="Économie min. (€)" col="col-6">
                <input type="number" min="0" className="form-control" value={settings.minSavings} onChange={(e) => setSettings({ ...settings, minSavings: numberValue(e.target.value) })} />
              </Field>
              <div className="col-6">
                <label className="form-label fs-3">Re-alerte après baisse de</label>
                <div className="d-flex align-items-center gap-2">
                  <input
                    type="range"
                    className="form-range"
                    min="1"
                    max="50"
                    value={reAlertPercent}
                    onChange={(e) => setSettings({ ...settings, reAlertDropPercent: Math.min(0.95, Math.max(0.01, Number(e.target.value) / 100)) })}
                  />
                  <span className="badge bg-primary-subtle text-primary rounded-4 px-2 py-1 fs-2">{reAlertPercent}%</span>
                </div>
              </div>
            </div>
          </SettingsCard>
        </div>

        <div className="col-lg-6">
          <SettingsCard icon="solar:bell-bing-line-duotone" tone="warning" title="Notifications et heures calmes">
            <div className="form-check form-switch mb-3">
              <input
                className="form-check-input"
                type="checkbox"
                id="quietHours"
                checked={Boolean(settings.quietHoursEnabled)}
                onChange={(e) => setSettings({ ...settings, quietHoursEnabled: e.target.checked })}
              />
              <label className="form-check-label fs-3" htmlFor="quietHours">Activer les heures calmes</label>
            </div>
            <div className="row g-2">
              <Field label="Début" col="col-6">
                <input
                  type="time"
                  className="form-control"
                  value={settings.quietHoursStart ?? "23:00"}
                  disabled={!settings.quietHoursEnabled}
                  onChange={(e) => setSettings({ ...settings, quietHoursStart: e.target.value })}
                />
              </Field>
              <Field label="Fin" col="col-6">
                <input
                  type="time"
                  className="form-control"
                  value={settings.quietHoursEnd ?? "08:00"}
                  disabled={!settings.quietHoursEnabled}
                  onChange={(e) => setSettings({ ...settings, quietHoursEnd: e.target.value })}
                />
              </Field>
              <Field label="Plafond / scan" col="col-6">
                <input type="number" min="0" className="form-control" value={settings.maxAlertsPerScan ?? 0} onChange={(e) => setSettings({ ...settings, maxAlertsPerScan: numberValue(e.target.value) })} />
              </Field>
              <Field label="Plafond / 24 h" col="col-6">
                <input type="number" min="0" className="form-control" value={settings.maxAlertsPerDay ?? 0} onChange={(e) => setSettings({ ...settings, maxAlertsPerDay: numberValue(e.target.value) })} />
              </Field>
            </div>
          </SettingsCard>
        </div>

        <div className="col-lg-6">
          <SettingsCard icon="solar:bug-minimalistic-line-duotone" tone="secondary" title="Modes">
            <div className="form-check form-switch mb-2">
              <input
                className="form-check-input"
                type="checkbox"
                id="runOnStart"
                checked={Boolean(settings.runOnStart)}
                onChange={(e) => setSettings({ ...settings, runOnStart: e.target.checked })}
              />
              <label className="form-check-label fs-3" htmlFor="runOnStart">Scan au démarrage</label>
            </div>
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                id="dryRun"
                checked={Boolean(settings.dryRun)}
                onChange={(e) => setSettings({ ...settings, dryRun: e.target.checked })}
              />
              <label className="form-check-label fs-3" htmlFor="dryRun">
                Mode simulation
                <span className="fs-2 text-muted d-block">(les alertes ne partent pas sur Discord)</span>
              </label>
            </div>
          </SettingsCard>
        </div>

        <div className="col-lg-6">
          <SettingsCard icon="solar:key-square-line-duotone" tone="danger" title="Secrets (écriture seule)">
            <SecretField
              label="Webhook Discord"
              configured={settings.discordWebhookConfigured}
              value={secrets.discordWebhookUrl}
              onChange={(v) => setSecrets({ ...secrets, discordWebhookUrl: v })}
            />
            <SecretField
              label="Token Apify"
              configured={settings.apifyTokenConfigured}
              value={secrets.apifyToken}
              onChange={(v) => setSecrets({ ...secrets, apifyToken: v })}
            />
            <SecretField
              label="Clé API générique"
              configured={settings.authorizedDataApiKeyConfigured}
              value={secrets.authorizedDataApiKey}
              onChange={(v) => setSecrets({ ...secrets, authorizedDataApiKey: v })}
            />
          </SettingsCard>
        </div>
      </div>
    </>
  );
}

function SettingsCard({ icon, tone, title, children }) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <div className="d-flex align-items-center gap-2 mb-3">
          <div className={`bg-${tone}-subtle rounded-circle round-40 d-flex align-items-center justify-content-center`}>
            <iconify-icon icon={icon} class={`text-${tone} fs-5`}></iconify-icon>
          </div>
          <h5 className="card-title mb-0 fw-semibold">{title}</h5>
        </div>
        {children}
      </div>
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

function SecretField({ label, configured, value, onChange }) {
  return (
    <div className="mb-3">
      <div className="d-flex align-items-center justify-content-between mb-1">
        <label className="form-label fs-3 mb-0">{label}</label>
        <span className={`badge bg-${configured ? "success" : "secondary"}-subtle text-${configured ? "success" : "secondary"} rounded-4 px-2 py-1 fs-2`}>
          {configured ? "configuré" : "vide"}
        </span>
      </div>
      <input
        type="text"
        className="form-control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="remplacement uniquement (laisser vide pour conserver)"
      />
    </div>
  );
}
