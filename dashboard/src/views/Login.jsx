import React, { useState } from "react";
import { api, messageFromError } from "../api.js";
import { useApp } from "../AppContext.jsx";

export default function Login() {
  const { setAuthenticated } = useApp();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const betaDenied = params.get("beta") === "denied";

  function goToDiscord() {
    window.location.href = "/api/auth/discord/start";
  }

  async function submitPassword(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: { password } });
      setAuthenticated(true);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="preview-page-wrapper min-vh-100 bg-light d-flex align-items-center">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-md-8 col-lg-6 col-xl-5">
            <div className="card mb-0 overflow-hidden shadow-lg">
              <div className="card-body p-9">
                <div className="text-center mb-5">
                  <a href="#" className="text-nowrap d-inline-flex align-items-center gap-2 mb-3" onClick={(e) => e.preventDefault()}>
                    <img src="/assets/images/logos/logo-icon.svg" alt="Bonoitec Flash" width="32" height="32" />
                    <span className="fs-4 fw-semibold text-dark">Bonoitec Flash</span>
                  </a>
                  <p className="fs-3 text-muted mb-0">Connecte-toi pour accéder à ton dashboard</p>
                </div>

                {betaDenied ? (
                  <div className="alert alert-warning d-flex align-items-start gap-2 mb-4" role="alert">
                    <iconify-icon icon="solar:lock-keyhole-line-duotone" class="fs-4 mt-1"></iconify-icon>
                    <div>
                      Ton compte Discord n'est pas encore sur la liste d'accès anticipé.
                      Demande une invitation via le serveur Bonoitec.
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  className="btn btn-primary w-100 py-3 fs-3 d-flex align-items-center justify-content-center gap-2"
                  onClick={goToDiscord}
                  style={{ background: "#5865F2", borderColor: "#5865F2" }}
                >
                  <svg width="20" height="20" viewBox="0 0 71 55" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M60.1 4.9A58.5 58.5 0 0 0 45.6.4a40.8 40.8 0 0 0-1.9 3.8 53.9 53.9 0 0 0-16.4 0A40.7 40.7 0 0 0 25.4.4a58.9 58.9 0 0 0-14.5 4.5C2.1 18.7-.6 32.1.8 45.3a59.1 59.1 0 0 0 17.7 8.9c1.4-1.9 2.7-3.9 3.8-6a37.9 37.9 0 0 1-6-2.9c.5-.4 1-.7 1.5-1.1a42 42 0 0 0 36.6 0c.5.4 1 .7 1.5 1.1a37.9 37.9 0 0 1-6 2.9c1.1 2.1 2.4 4.1 3.8 6a59 59 0 0 0 17.7-8.9c1.7-15.2-2.6-28.6-11.3-40.4ZM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2 0-3.9 2.8-7.2 6.4-7.2 3.6 0 6.5 3.3 6.4 7.2 0 4-2.9 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2 0-3.9 2.8-7.2 6.4-7.2 3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Z"
                    />
                  </svg>
                  Continuer avec Discord
                </button>
                <p className="fs-2 text-muted mt-3 mb-0 text-center">
                  Authentification sécurisée. Nous lisons seulement ton identifiant Discord et ton email.
                </p>

                {showAdminForm ? (
                  <form onSubmit={submitPassword} className="mt-4 pt-4 border-top">
                    <label className="form-label fs-3">Mot de passe administrateur</label>
                    <input
                      type="password"
                      className="form-control mb-2"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                    />
                    {error ? <div className="text-danger fs-2 mb-2">{error}</div> : null}
                    <button type="submit" className="btn btn-outline-primary w-100" disabled={loading || !password}>
                      <iconify-icon icon="solar:shield-keyhole-line-duotone" class="me-2"></iconify-icon>
                      Connexion administrateur
                    </button>
                  </form>
                ) : (
                  <div className="text-center mt-4">
                    <button
                      type="button"
                      className="btn btn-link fs-2 text-muted text-decoration-none p-0"
                      onClick={() => setShowAdminForm(true)}
                    >
                      <iconify-icon icon="solar:key-square-line-duotone" class="me-1"></iconify-icon>
                      Accès administrateur
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
