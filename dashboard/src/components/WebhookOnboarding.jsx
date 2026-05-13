import React, { useState } from "react";
import { api, messageFromError } from "../api.js";

export default function WebhookOnboarding({ onSaved }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tested, setTested] = useState(false);

  async function saveAndTest() {
    setBusy(true);
    setError("");
    try {
      await api("/api/user/settings", { method: "PUT", body: { discordWebhookUrl: url.trim() } });
      await api("/api/user/webhook/test", { method: "POST" });
      setTested(true);
      await onSaved();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card border-0 mb-4 overflow-hidden" style={{ background: "linear-gradient(135deg, var(--bs-primary-bg-subtle), var(--bs-info-bg-subtle))" }}>
      <div className="card-body p-7">
        <div className="d-flex align-items-start gap-3 mb-3">
          <div className="bg-primary-subtle rounded-circle round-48 d-flex align-items-center justify-content-center flex-shrink-0">
            <iconify-icon icon="solar:plain-2-line-duotone" class="text-primary fs-5"></iconify-icon>
          </div>
          <div>
            <h5 className="mb-1 fw-semibold">Connecte ton webhook Discord pour recevoir tes alertes</h5>
            <p className="mb-0 fs-3 text-muted">
              Crée un webhook dans ton serveur Discord (Paramètres → Intégrations → Webhooks → Nouveau)
              et colle l'URL ici. On envoie un message test pour valider.
            </p>
          </div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <input
            type="url"
            className="form-control flex-grow-1"
            placeholder="https://discord.com/api/webhooks/…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={busy}
            autoFocus
            style={{ minWidth: "300px" }}
          />
          <button className="btn btn-primary" onClick={saveAndTest} disabled={busy || !url.trim()}>
            <iconify-icon icon="solar:check-circle-line-duotone" class="me-1"></iconify-icon>
            {busy ? "Test en cours…" : "Connecter et tester"}
          </button>
        </div>
        {error ? <div className="text-danger fs-2 mt-2">{error}</div> : null}
        {tested ? (
          <div className="text-success fs-2 mt-2 d-flex align-items-center gap-1">
            <iconify-icon icon="solar:check-circle-line-duotone" class="fs-4"></iconify-icon>
            Webhook validé. Tu peux ajouter tes recherches.
          </div>
        ) : null}
      </div>
    </div>
  );
}
