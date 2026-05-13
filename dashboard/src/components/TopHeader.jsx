import React from "react";
import { useApp } from "../AppContext.jsx";

export default function TopHeader() {
  const { currentUser, status, deals, logout } = useApp();
  const sentToday = deals.filter((deal) => deal.sent).slice(0, 6);
  const initial = (currentUser?.username ?? "?").charAt(0).toUpperCase();
  const avatarUrl =
    currentUser?.avatar && currentUser?.discordId
      ? `https://cdn.discordapp.com/avatars/${currentUser.discordId}/${currentUser.avatar}.png?size=64`
      : null;

  return (
    <header className="app-header with-horizontal">
      <nav className="navbar navbar-expand-xl container-fluid">
        <ul className="navbar-nav gap-2 align-items-center">
          <li className="nav-item d-block d-xl-none">
            <a
              className="nav-link sidebartoggler ms-n3"
              id="sidebarCollapse"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                document.documentElement.classList.toggle("show-sidebar");
              }}
            >
              <iconify-icon icon="solar:hamburger-menu-line-duotone"></iconify-icon>
            </a>
          </li>
          <li className="nav-item d-none d-xl-block">
            <div className="brand-logo d-flex align-items-center justify-content-between">
              <a href="#" className="text-nowrap logo-img d-flex align-items-center gap-2" onClick={(e) => e.preventDefault()}>
                <b className="logo-icon">
                  <img src="/assets/images/logos/logo-light-icon.svg" alt="Bonoitec Flash" className="dark-logo" />
                  <img src="/assets/images/logos/logo-light-icon.svg" alt="Bonoitec Flash" className="light-logo" />
                </b>
                <span className="logo-text">
                  <strong className="text-white fs-5 ps-2">Bonoitec Flash</strong>
                </span>
              </a>
            </div>
          </li>
        </ul>

        <a
          className="navbar-toggler nav-icon-hover p-0 border-0 text-white"
          href="#"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
          aria-controls="navbarNav"
          aria-expanded="false"
          aria-label="Toggle navigation"
          onClick={(e) => e.preventDefault()}
        >
          <span className="p-2">
            <i className="ti ti-dots fs-7"></i>
          </span>
        </a>

        <div className="collapse navbar-collapse justify-content-end" id="navbarNav">
          <div className="d-flex align-items-center justify-content-between">
            <ul className="navbar-nav gap-2 flex-row ms-auto align-items-center justify-content-center">
              <li className="nav-item dropdown nav-icon-hover-bg rounded-circle">
                <a
                  className="nav-link position-relative"
                  href="#"
                  id="bellNotif"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                  onClick={(e) => e.preventDefault()}
                >
                  <iconify-icon icon="solar:bell-bing-line-duotone"></iconify-icon>
                  {sentToday.length ? (
                    <div className="notification bg-primary rounded-circle"></div>
                  ) : null}
                </a>
                <div
                  className="dropdown-menu dropdown-menu-end dropdown-menu-animate-up py-0"
                  aria-labelledby="bellNotif"
                  style={{ minWidth: "320px" }}
                >
                  <div className="d-flex align-items-center justify-content-between py-3 px-7">
                    <h5 className="mb-0 fs-5 fw-semibold">Alertes récentes</h5>
                    {sentToday.length ? (
                      <span className="badge bg-primary rounded-4 px-2 py-1 lh-sm">{sentToday.length} nouvelle{sentToday.length > 1 ? "s" : ""}</span>
                    ) : null}
                  </div>
                  <div className="message-body" style={{ maxHeight: "320px", overflowY: "auto" }}>
                    {sentToday.length === 0 ? (
                      <div className="text-center text-muted py-4 px-3 fs-3">Aucune alerte envoyée pour le moment.</div>
                    ) : (
                      sentToday.map((deal) => (
                        <a
                          key={deal.id}
                          href={deal.url}
                          target="_blank"
                          rel="noreferrer"
                          className="dropdown-item d-flex align-items-center gap-3 py-3 px-4"
                        >
                          <div className="bg-primary-subtle rounded-circle round-40 d-flex align-items-center justify-content-center">
                            <iconify-icon icon="solar:smartphone-2-line-duotone" class="text-primary fs-5"></iconify-icon>
                          </div>
                          <div className="flex-grow-1">
                            <h6 className="mb-0 fs-3 fw-semibold text-truncate" style={{ maxWidth: "200px" }}>
                              {deal.model ?? deal.title}
                            </h6>
                            <span className="fs-2 text-muted">
                              {Math.round((deal.discountPercent ?? 0) * 100)}% remise
                            </span>
                          </div>
                        </a>
                      ))
                    )}
                  </div>
                </div>
              </li>

              <li className="nav-item dropdown">
                <a
                  className="nav-link pe-0"
                  href="#"
                  id="drop1"
                  data-bs-toggle="dropdown"
                  aria-haspopup="true"
                  aria-expanded="false"
                  onClick={(e) => e.preventDefault()}
                >
                  <div className="d-flex align-items-center">
                    <div className="user-profile-img">
                      {avatarUrl ? (
                        <img src={avatarUrl} className="rounded-circle" width="35" height="35" alt={currentUser?.username ?? "user"} />
                      ) : (
                        <span
                          className="rounded-circle d-flex align-items-center justify-content-center text-white fw-semibold"
                          style={{ width: 35, height: 35, background: "rgba(255,255,255,0.2)" }}
                        >
                          {initial}
                        </span>
                      )}
                    </div>
                  </div>
                </a>
                <div
                  className="dropdown-menu dropdown-menu-end dropdown-menu-animate-up"
                  aria-labelledby="drop1"
                  style={{ minWidth: "280px" }}
                >
                  <div className="profile-dropdown position-relative" data-simplebar>
                    <div className="py-3 px-7 pb-0">
                      <h5 className="mb-0 fs-5 fw-semibold">Profil</h5>
                    </div>
                    <div className="d-flex align-items-center py-3 px-7 mb-2 gap-3">
                      {avatarUrl ? (
                        <img src={avatarUrl} className="rounded-circle" width="56" height="56" alt={currentUser?.username ?? "user"} />
                      ) : (
                        <span
                          className="rounded-circle d-flex align-items-center justify-content-center text-white fw-semibold fs-4 bg-primary"
                          style={{ width: 56, height: 56 }}
                        >
                          {initial}
                        </span>
                      )}
                      <div>
                        <h6 className="mb-0 fs-4">{currentUser?.username ?? "Utilisateur"}</h6>
                        <span className="d-flex align-items-center gap-2">
                          <span className={`badge bg-${planTone(currentUser?.plan)}-subtle text-${planTone(currentUser?.plan)} rounded-4 px-2 py-1 lh-sm`}>
                            {planLabel(currentUser?.plan)}
                          </span>
                          <span className="fs-2 text-muted d-flex align-items-center gap-1">
                            <iconify-icon icon="solar:shield-keyhole-line-duotone" class="fs-4 text-primary"></iconify-icon>
                            Discord
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="px-7 pb-3">
                      <div className="d-flex align-items-center gap-2 mb-2 fs-3 text-muted">
                        <iconify-icon icon="solar:wifi-router-line-duotone" class="fs-4"></iconify-icon>
                        <span>État du bot : <strong className="text-dark">{status?.paused ? "En pause" : status?.scanInFlight ? "Scan en cours" : "Actif"}</strong></span>
                      </div>
                    </div>
                    <div className="d-grid py-4 px-7 pt-2 border-top">
                      <button onClick={logout} className="btn btn-outline-primary">
                        <iconify-icon icon="solar:logout-2-line-duotone" class="me-2"></iconify-icon>
                        Déconnexion
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    </header>
  );
}

function planTone(plan) {
  if (plan === "admin") return "warning";
  if (plan === "pro") return "primary";
  return "secondary";
}

function planLabel(plan) {
  if (plan === "admin") return "Admin";
  if (plan === "pro") return "Pro";
  return "Gratuit";
}
