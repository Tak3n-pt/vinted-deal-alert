import React, { useMemo, useState } from "react";
import { useApp } from "../AppContext.jsx";
import { api } from "../api.js";
import { updateById, numberValue } from "../format.js";
import Empty from "../components/Empty.jsx";

const EMPTY_SEARCH = { enabled: true, query: "", url: "", limit: 10 };

export default function Searches() {
  const { searches, setSearches, runAction, loading } = useApp();
  const [draft, setDraft] = useState(EMPTY_SEARCH);
  const [showSwitchPrompt, setShowSwitchPrompt] = useState(false);

  const defaultsEnabled = useMemo(() => searches.some((s) => s.isDefault && s.enabled), [searches]);
  const customCount = useMemo(() => searches.filter((s) => !s.isDefault && s.enabled).length, [searches]);
  const enabledTotal = useMemo(() => searches.filter((s) => s.enabled).length, [searches]);

  async function saveSearch(search) {
    await runAction("Recherche sauvegardée", async () => {
      const saved = await api(`/api/searches/${search.id}`, { method: "PUT", body: search });
      setSearches((items) => items.map((item) => (item.id === search.id ? saved.search : item)));
    });
  }

  async function addSearch(event) {
    event.preventDefault();
    await runAction("Recherche ajoutée", async () => {
      const saved = await api("/api/searches", { method: "POST", body: draft });
      setSearches((items) => [...items, saved.search]);
      setDraft(EMPTY_SEARCH);
      if (defaultsEnabled) setShowSwitchPrompt(true);
    });
  }

  async function disableDefaults() {
    await runAction("Mode manuel activé", async () => {
      const result = await api("/api/searches/disable-defaults", { method: "POST" });
      setSearches(result.searches);
      setShowSwitchPrompt(false);
    });
  }

  return (
    <>
      <div className="font-weight-medium shadow-none position-relative overflow-hidden mb-7">
        <div className="card-body px-0">
          <h4 className="font-weight-medium mb-0">Recherches Vinted</h4>
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb">
              <li className="breadcrumb-item"><a className="text-muted text-decoration-none" href="#">Bonoitec Flash</a></li>
              <li className="breadcrumb-item text-muted" aria-current="page">Recherches</li>
            </ol>
          </nav>
        </div>
      </div>

      {searches.length > 0 && enabledTotal === 0 && (
        <div className="alert alert-danger d-flex align-items-start gap-2 mb-4" role="alert">
          <iconify-icon icon="solar:danger-triangle-line-duotone" class="fs-5 mt-1"></iconify-icon>
          <div>
            <strong>Aucune recherche active — vous ne recevrez aucune alerte.</strong>
            <div className="fs-3 text-muted mt-1">
              Toutes vos recherches sont désactivées. Réactivez-en au moins une avec l'interrupteur "Active", ou ajoutez-en une nouvelle ci-dessous.
            </div>
          </div>
        </div>
      )}

      {defaultsEnabled && customCount === 0 && (
        <div className="alert alert-info d-flex align-items-start gap-2 mb-4" role="status">
          <iconify-icon icon="solar:magic-stick-3-line-duotone" class="fs-5 mt-1"></iconify-icon>
          <div>
            <strong>Mode automatique activé.</strong>{" "}
            Bonoitec Flash surveille tous les téléphones premium (iPhone Pro, Galaxy Ultra, Pixel Pro, etc.) et vous alerte dès qu'une bonne affaire apparaît. Vous n'avez rien à configurer.
            <div className="fs-3 text-muted mt-1">
              Pour cibler des modèles précis, ajoutez vos propres recherches ci-dessous — le mode automatique peut alors être désactivé.
            </div>
          </div>
        </div>
      )}

      {defaultsEnabled && customCount > 0 && (
        <div className="alert alert-warning d-flex align-items-start gap-2 mb-4" role="status">
          <iconify-icon icon="solar:settings-line-duotone" class="fs-5 mt-1"></iconify-icon>
          <div className="flex-grow-1">
            <strong>Mode auto + manuel actif.</strong>{" "}
            Le bot surveille à la fois nos recherches par défaut et vos {customCount} recherche{customCount > 1 ? "s" : ""} personnalisée{customCount > 1 ? "s" : ""}. Cela ralentit la couverture de vos modèles préférés.
            <div className="mt-2">
              <button className="btn btn-sm btn-warning" onClick={disableDefaults} disabled={loading}>
                Désactiver le mode automatique
              </button>
            </div>
          </div>
        </div>
      )}

      {showSwitchPrompt && (
        <div className="alert alert-primary d-flex align-items-start gap-2 mb-4">
          <iconify-icon icon="solar:question-circle-line-duotone" class="fs-5 mt-1"></iconify-icon>
          <div className="flex-grow-1">
            <strong>Passer en mode manuel ?</strong>{" "}
            Vous venez d'ajouter une recherche personnalisée. Souhaitez-vous désactiver la surveillance automatique des téléphones premium pour vous concentrer sur vos propres recherches ?
            <div className="d-flex gap-2 mt-2">
              <button className="btn btn-sm btn-primary" onClick={disableDefaults} disabled={loading}>
                Oui, mode manuel
              </button>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowSwitchPrompt(false)} disabled={loading}>
                Non, garder les deux
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex align-items-center gap-2 mb-3">
            <iconify-icon icon="solar:add-circle-line-duotone" class="text-primary fs-5"></iconify-icon>
            <h5 className="card-title mb-0 fw-semibold">Ajouter une recherche</h5>
          </div>
          <form onSubmit={addSearch} className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label fs-3">Requête</label>
              <input
                className="form-control"
                value={draft.query}
                onChange={(event) => setDraft({ ...draft, query: event.target.value })}
                placeholder="iphone 15 pro 256go"
                required
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fs-3">URL filtrée Vinted</label>
              <input
                className="form-control"
                value={draft.url}
                onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                placeholder="https://www.vinted.fr/catalog?…"
              />
            </div>
            <div className="col-md-2">
              <label className="form-label fs-3">Limite</label>
              <input
                type="number"
                min="10"
                className="form-control"
                value={draft.limit}
                onChange={(event) => setDraft({ ...draft, limit: numberValue(event.target.value) })}
              />
            </div>
            <div className="col-md-2 d-flex flex-column gap-2">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="draftEnabled"
                  checked={draft.enabled}
                  onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
                />
                <label className="form-check-label fs-3" htmlFor="draftEnabled">Active</label>
              </div>
              <button type="submit" className="btn btn-primary d-flex align-items-center justify-content-center gap-1" disabled={loading || !draft.query.trim()}>
                <iconify-icon icon="solar:add-circle-line-duotone"></iconify-icon> Ajouter
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h5 className="card-title mb-0 fw-semibold">Recherches configurées</h5>
            <span className="fs-3 text-muted">{searches.length} au total</span>
          </div>
          {searches.length === 0 ? (
            <Empty text="Aucune recherche configurée" />
          ) : (
            <div className="table-responsive">
              <table className="table align-middle">
                <thead>
                  <tr className="text-uppercase fs-2 text-muted">
                    <th style={{ width: 80 }}>Active</th>
                    <th>Requête</th>
                    <th>URL</th>
                    <th style={{ width: 100 }}>Limite</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {searches.map((search) => (
                    <tr key={search.id}>
                      <td>
                        <div className="form-check form-switch">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            checked={search.enabled}
                            onChange={(event) => setSearches(updateById(searches, search.id, { enabled: event.target.checked }))}
                          />
                        </div>
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <input
                            className="form-control form-control-sm"
                            value={search.query}
                            onChange={(event) => setSearches(updateById(searches, search.id, { query: event.target.value }))}
                          />
                          {search.isDefault && (
                            <span className="badge bg-info-subtle text-info fs-2 px-2" title="Recherche du mode automatique">Auto</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <input
                          className="form-control form-control-sm"
                          value={search.url ?? ""}
                          onChange={(event) => setSearches(updateById(searches, search.id, { url: event.target.value }))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="10"
                          className="form-control form-control-sm"
                          value={search.limit}
                          onChange={(event) => setSearches(updateById(searches, search.id, { limit: numberValue(event.target.value) }))}
                        />
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm p-1 d-inline-flex"
                            title="Sauvegarder"
                            onClick={() => saveSearch(search)}
                          >
                            <iconify-icon icon="solar:diskette-line-duotone"></iconify-icon>
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm p-1 d-inline-flex"
                            title="Supprimer"
                            onClick={() => runAction("Recherche supprimée", () => api(`/api/searches/${search.id}`, { method: "DELETE" }))}
                          >
                            <iconify-icon icon="solar:trash-bin-trash-line-duotone"></iconify-icon>
                          </button>
                        </div>
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
