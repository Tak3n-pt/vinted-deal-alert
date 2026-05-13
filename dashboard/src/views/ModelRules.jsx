import React from "react";
import { useApp } from "../AppContext.jsx";
import { api } from "../api.js";
import { updateByModel, parseList, optionalNumber } from "../format.js";
import Empty from "../components/Empty.jsx";

export default function ModelRules() {
  const { modelRules, setModelRules, runAction, loading } = useApp();
  const enabledCount = modelRules.filter((rule) => rule.enabled).length;

  return (
    <>
      <div className="font-weight-medium shadow-none position-relative overflow-hidden mb-7">
        <div className="card-body px-0">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <h4 className="font-weight-medium mb-0">Modèles, stockages et prix</h4>
              <nav aria-label="breadcrumb">
                <ol className="breadcrumb">
                  <li className="breadcrumb-item"><a className="text-muted text-decoration-none" href="#">Bonoitec Flash</a></li>
                  <li className="breadcrumb-item text-muted" aria-current="page">Règles par modèle</li>
                </ol>
              </nav>
            </div>
            <button
              className="btn btn-primary d-flex align-items-center gap-1"
              disabled={loading}
              onClick={() => runAction("Règles sauvegardées", () => api("/api/model-rules", { method: "PUT", body: { modelRules } }))}
            >
              <iconify-icon icon="solar:diskette-line-duotone"></iconify-icon>
              Sauvegarder
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h5 className="card-title mb-0 fw-semibold">Règles par modèle</h5>
            <span className="badge bg-primary-subtle text-primary rounded-4 px-2 py-1 fs-2">
              {enabledCount}/{modelRules.length} actifs
            </span>
          </div>
          {modelRules.length === 0 ? (
            <Empty text="Aucune règle configurée" />
          ) : (
            <div className="table-responsive">
              <table className="table align-middle">
                <thead>
                  <tr className="text-uppercase fs-2 text-muted">
                    <th style={{ width: 70 }}>Actif</th>
                    <th>Modèle</th>
                    <th>Stockages</th>
                    <th>Prix max</th>
                    <th>Score min.</th>
                    <th>Remise min.</th>
                    <th>Économie min.</th>
                  </tr>
                </thead>
                <tbody>
                  {modelRules.map((rule) => (
                    <tr key={rule.model}>
                      <td>
                        <div className="form-check form-switch">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(event) => setModelRules(updateByModel(modelRules, rule.model, { enabled: event.target.checked }))}
                          />
                        </div>
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <iconify-icon icon="solar:smartphone-2-line-duotone" class="text-primary fs-5"></iconify-icon>
                          <strong className="fs-3">{rule.model}</strong>
                        </div>
                      </td>
                      <td>
                        <input
                          className="form-control form-control-sm"
                          value={(rule.storagesGb ?? []).join(", ")}
                          onChange={(event) => setModelRules(updateByModel(modelRules, rule.model, { storagesGb: parseList(event.target.value) }))}
                          placeholder="128, 256, 512"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          value={rule.maxFinalPrice ?? ""}
                          onChange={(event) => setModelRules(updateByModel(modelRules, rule.model, { maxFinalPrice: optionalNumber(event.target.value) }))}
                          placeholder="€"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          value={rule.minScore ?? ""}
                          onChange={(event) => setModelRules(updateByModel(modelRules, rule.model, { minScore: optionalNumber(event.target.value) }))}
                          placeholder="0–100"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm"
                          value={rule.minDiscount ?? ""}
                          onChange={(event) => setModelRules(updateByModel(modelRules, rule.model, { minDiscount: optionalNumber(event.target.value) }))}
                          placeholder="0–1"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          value={rule.minSavings ?? ""}
                          onChange={(event) => setModelRules(updateByModel(modelRules, rule.model, { minSavings: optionalNumber(event.target.value) }))}
                          placeholder="€"
                        />
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
