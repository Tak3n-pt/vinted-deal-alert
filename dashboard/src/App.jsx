import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  Euro,
  ExternalLink,
  Gauge,
  ListFilter,
  LockKeyhole,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  XCircle
} from "lucide-react";
import "./styles.css";

const tabs = [
  { id: "dashboard", label: "Tableau de bord", icon: Gauge },
  { id: "deals", label: "Opportunités", icon: Bell },
  { id: "searches", label: "Recherches", icon: Search },
  { id: "rules", label: "Règles & prix", icon: SlidersHorizontal },
  { id: "risks", label: "Risques", icon: Shield },
  { id: "settings", label: "Paramètres", icon: Settings }
];

const emptySearch = { enabled: true, query: "", url: "", limit: 10 };

function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [userSettings, setUserSettings] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [searches, setSearches] = useState([]);
  const [modelRules, setModelRules] = useState([]);
  const [riskRules, setRiskRules] = useState(null);
  const [deals, setDeals] = useState([]);
  const [scans, setScans] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api("/api/auth/me")
      .then((data) => {
        setAuthenticated(Boolean(data.authenticated));
        setCurrentUser(data.user ?? null);
      })
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (!authenticated) return undefined;
    refreshAll();
    const timer = setInterval(() => refreshLive(), 12000);
    return () => clearInterval(timer);
  }, [authenticated]);

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const [statusData, settingsData, userSettingsData, searchesData, modelRulesData, riskRulesData, dealsData, scansData, logsData] =
        await Promise.all([
          api("/api/status"),
          api("/api/settings"),
          api("/api/user/settings"),
          api("/api/searches"),
          api("/api/model-rules"),
          api("/api/risk-rules"),
          api("/api/deals?limit=160"),
          api("/api/scans?limit=50"),
          api("/api/logs?limit=100")
        ]);
      setStatus(statusData.status);
      setSettings(settingsData.settings);
      setUserSettings(userSettingsData.settings);
      setSearches(searchesData.searches);
      setModelRules(modelRulesData.modelRules);
      setRiskRules(riskRulesData.riskRules);
      setDeals(dealsData.deals);
      setScans(scansData.scans);
      setLogs(logsData.logs);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setLoading(false);
    }
  }

  async function refreshLive() {
    try {
      const [statusData, dealsData, scansData, logsData] = await Promise.all([
        api("/api/status"),
        api("/api/deals?limit=160"),
        api("/api/scans?limit=50"),
        api("/api/logs?limit=100")
      ]);
      setStatus(statusData.status);
      setDeals(dealsData.deals);
      setScans(scansData.scans);
      setLogs(logsData.logs);
    } catch {
      // Une action manuelle affichera l'erreur si le serveur reste indisponible.
    }
  }

  async function runAction(label, fn) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(label);
      await refreshAll();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
  }

  if (authenticated === null) {
    return <div className="boot">Chargement...</div>;
  }

  if (!authenticated) {
    return <Login onLogin={() => setAuthenticated(true)} />;
  }

  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const ActiveIcon = currentTab.icon;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Bot size={22} /></span>
          <div>
            <strong>Bonoitec Flash</strong>
            <span>{botStateLabel(status)}</span>
          </div>
        </div>

        {currentUser ? (
          <div className="user-card">
            {currentUser.avatar ? (
              <img
                className="user-avatar"
                src={`https://cdn.discordapp.com/avatars/${currentUser.discordId}/${currentUser.avatar}.png?size=64`}
                alt=""
              />
            ) : (
              <div className="user-avatar placeholder">
                {(currentUser.username ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="user-meta">
              <strong>{currentUser.username ?? "Utilisateur"}</strong>
              <span className={`plan-badge plan-${currentUser.plan}`}>
                {currentUser.plan === "admin" ? "Admin" : currentUser.plan === "pro" ? "Pro" : "Gratuit"}
              </span>
            </div>
          </div>
        ) : null}

        <nav aria-label="Navigation principale">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="side-status">
          <Badge tone={settings?.dryRun ? "warn" : "good"}>{settings?.dryRun ? "Simulation" : "Alertes réelles"}</Badge>
          <span>{settings?.providerType === "apify" ? "Apify" : "API générique"}</span>
        </div>

        <button className="sidebar-logout" onClick={logout}>
          <LogOut size={17} />
          <span>Déconnexion</span>
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow"><ActiveIcon size={16} /> {currentTab.label}</div>
            <h1>{pageTitle(activeTab)}</h1>
          </div>
          <div className="actions">
            <button className="icon-button" aria-label="Rafraîchir" title="Rafraîchir" onClick={refreshAll} disabled={loading}>
              <RefreshCcw size={18} />
            </button>
            <button className="primary" onClick={() => runAction("Scan lancé", () => api("/api/bot/scan-now", { method: "POST" }))} disabled={loading}>
              <Activity size={18} /> Scanner maintenant
            </button>
          </div>
        </header>

        {error ? <div className="alert error"><XCircle size={18} /> {error}</div> : null}
        {notice ? <div className="alert success"><CheckCircle2 size={18} /> {notice}</div> : null}

        {userSettings && !userSettings.discordWebhookConfigured ? (
          <WebhookOnboarding
            onSaved={async () => {
              await refreshAll();
              setNotice("Webhook Discord configuré. Tu peux maintenant lancer un scan.");
            }}
          />
        ) : null}

        {activeTab === "dashboard" ? (
          <DashboardPage
            status={status}
            settings={settings}
            searches={searches}
            modelRules={modelRules}
            deals={deals}
            scans={scans}
            logs={logs}
            onPause={() => runAction("Bot mis en pause", () => api("/api/bot/pause", { method: "POST" }))}
            onResume={() => runAction("Bot relancé", () => api("/api/bot/resume", { method: "POST" }))}
            onTestDiscord={() => runAction("Message Discord envoyé", () => api("/api/discord/test", { method: "POST" }))}
          />
        ) : null}
        {activeTab === "deals" ? <DealsPage deals={deals} /> : null}
        {activeTab === "searches" ? (
          <SearchesPage searches={searches} setSearches={setSearches} runAction={runAction} />
        ) : null}
        {activeTab === "rules" ? (
          <ModelRulesPage modelRules={modelRules} setModelRules={setModelRules} runAction={runAction} />
        ) : null}
        {activeTab === "risks" && riskRules ? (
          <RiskRulesPage riskRules={riskRules} setRiskRules={setRiskRules} runAction={runAction} />
        ) : null}
        {activeTab === "settings" && settings ? (
          <SettingsPage settings={settings} setSettings={setSettings} runAction={runAction} />
        ) : null}
      </main>
    </div>
  );
}

function WebhookOnboarding({ onSaved }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tested, setTested] = useState(false);

  async function saveAndTest() {
    setBusy(true);
    setError("");
    try {
      await api("/api/user/settings", {
        method: "PUT",
        body: { discordWebhookUrl: url.trim() }
      });
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
    <div className="onboarding-banner">
      <div className="onboarding-head">
        <Send size={20} />
        <div>
          <strong>Connecte ton Discord pour recevoir tes alertes</strong>
          <p>
            Crée un webhook dans ton serveur Discord (Paramètres → Intégrations →
            Webhooks → Nouveau) et colle l'URL ici. Tu recevras une notification
            test pour vérifier que ça marche.
          </p>
        </div>
      </div>
      <div className="onboarding-form">
        <input
          type="url"
          placeholder="https://discord.com/api/webhooks/…"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={busy}
          autoFocus
        />
        <button className="primary" onClick={saveAndTest} disabled={busy || !url.trim()}>
          <CheckCircle2 size={18} /> {busy ? "Test en cours…" : "Connecter et tester"}
        </button>
      </div>
      {error ? <div className="field-error">{error}</div> : null}
      {tested ? (
        <div className="onboarding-success">
          <CheckCircle2 size={16} /> Webhook validé. Tu peux ajouter tes recherches.
        </div>
      ) : null}
    </div>
  );
}

function Login({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const betaDenied = params.get("beta") === "denied";

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: { password } });
      onLogin();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setLoading(false);
    }
  }

  function goToDiscordOAuth() {
    window.location.href = "/api/auth/discord/start";
  }

  return (
    <main className="login-screen">
      <div className="login-panel">
        <div className="brand large">
          <span className="brand-mark"><Bot size={24} /></span>
          <div>
            <strong>Bonoitec Flash</strong>
            <span>Vinted deal alerts</span>
          </div>
        </div>
        {betaDenied ? (
          <div className="field-error">
            Ton compte Discord n'est pas encore sur la liste d'accès anticipé.
            Demande une invitation via le serveur Bonoitec.
          </div>
        ) : null}
        <button className="primary full discord-button" onClick={goToDiscordOAuth} type="button">
          <svg width="20" height="20" viewBox="0 0 71 55" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path fill="currentColor" d="M60.1 4.9A58.5 58.5 0 0 0 45.6.4a40.8 40.8 0 0 0-1.9 3.8 53.9 53.9 0 0 0-16.4 0A40.7 40.7 0 0 0 25.4.4a58.9 58.9 0 0 0-14.5 4.5C2.1 18.7-.6 32.1.8 45.3a59.1 59.1 0 0 0 17.7 8.9c1.4-1.9 2.7-3.9 3.8-6a37.9 37.9 0 0 1-6-2.9c.5-.4 1-.7 1.5-1.1a42 42 0 0 0 36.6 0c.5.4 1 .7 1.5 1.1a37.9 37.9 0 0 1-6 2.9c1.1 2.1 2.4 4.1 3.8 6a59 59 0 0 0 17.7-8.9c1.7-15.2-2.6-28.6-11.3-40.4ZM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2 0-3.9 2.8-7.2 6.4-7.2 3.6 0 6.5 3.3 6.4 7.2 0 4-2.9 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2 0-3.9 2.8-7.2 6.4-7.2 3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Z"/>
          </svg>
          Continuer avec Discord
        </button>
        <p className="login-hint">
          Authentification sécurisée. Nous lisons seulement ton identifiant
          Discord et ton email — rien d'autre.
        </p>
        {showPasswordForm ? (
          <form onSubmit={submit} className="login-fallback">
            <hr />
            <label>
              Mot de passe administrateur
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus
                autoComplete="current-password"
              />
            </label>
            {error ? <div className="field-error">{error}</div> : null}
            <button className="secondary full" disabled={loading || !password}>
              <Shield size={18} /> Connexion administrateur
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="link-button"
            onClick={() => setShowPasswordForm(true)}
          >
            <LockKeyhole size={14} /> Accès administrateur
          </button>
        )}
      </div>
    </main>
  );
}

function DashboardPage({ status, settings, searches, modelRules, deals, scans, logs, onPause, onResume, onTestDiscord }) {
  const lastScan = status?.lastScan;
  const best = status?.bestCandidate ?? deals[0];
  const sentCount = deals.filter((deal) => deal.sent).length;
  const alertableCount = deals.filter((deal) => deal.shouldAlert).length;
  const activeSearches = searches.filter((search) => search.enabled).length;
  const enabledModels = modelRules.filter((rule) => rule.enabled).length;

  return (
    <section className="stack">
      <div className="metric-grid">
        <Metric icon={Bot} label="État du bot" value={botStateLabel(status)} sub={settings?.dryRun ? "Simulation active" : "Alertes Discord actives"} tone={status?.paused ? "warn" : "good"} />
        <Metric icon={Clock3} label="Dernier scan" value={lastScan ? `${lastScan.listings} annonces` : "Aucun"} sub={lastScan ? tStatus(lastScan.status) : "En attente"} />
        <Metric icon={Bell} label="Alertes" value={sentCount} sub={`${alertableCount} opportunités alertables`} tone="accent" />
        <Metric icon={Smartphone} label="Couverture" value={`${enabledModels} modèles`} sub={`${activeSearches} recherches actives`} />
      </div>

      <div className="control-strip">
        <div>
          <span>Prochain scan</span>
          <strong>{status?.nextScanAt ? dateTimeShort(status.nextScanAt) : "Non planifié"}</strong>
        </div>
        <div>
          <span>Intervalle</span>
          <strong>{duration(settings?.pollIntervalSeconds ?? 0)}</strong>
        </div>
        <div>
          <span>Heures calmes</span>
          <strong>{settings?.quietHoursEnabled ? `${settings.quietHoursStart}–${settings.quietHoursEnd}` : "Désactivées"}</strong>
        </div>
        <div>
          <span>Plafond / 24 h</span>
          <strong>{settings?.maxAlertsPerDay > 0 ? `${settings.maxAlertsPerDay} alertes` : "Sans limite"}</strong>
        </div>
        <div className="toolbar-row">
          <button className="secondary" onClick={status?.paused ? onResume : onPause}>
            {status?.paused ? <Play size={18} /> : <Pause size={18} />}
            {status?.paused ? "Reprendre" : "Mettre en pause"}
          </button>
          <button className="secondary" onClick={onTestDiscord}>
            <Send size={18} /> Tester Discord
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <PanelTitle icon={Euro} title="Meilleure opportunité" />
          {best ? <DealSummary deal={best} /> : <Empty text="Aucune opportunité détectée" />}
        </section>
        <section className="panel">
          <PanelTitle icon={Activity} title="Derniers scans" />
          <ScansTable scans={scans.slice(0, 6)} compact />
        </section>
      </div>

      <section className="panel">
        <PanelTitle icon={Database} title="Journal récent" />
        <LogsTable logs={logs.slice(0, 8)} />
      </section>
    </section>
  );
}

function DealsPage({ deals }) {
  const [filter, setFilter] = useState("all");
  const filtered = useMemo(() => {
    if (filter === "alert") return deals.filter((deal) => deal.shouldAlert);
    if (filter === "sent") return deals.filter((deal) => deal.sent);
    if (filter === "risk") return deals.filter((deal) => deal.riskLevel === "reject" || deal.riskLevel === "high");
    return deals;
  }, [deals, filter]);

  return (
    <section className="panel">
      <div className="panel-head">
        <PanelTitle icon={ListFilter} title="Produits analysés" />
        <div className="segmented">
          {["all", "alert", "sent", "risk"].map((item) => (
            <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{filterLabel(item)}</button>
          ))}
        </div>
      </div>
      <DealsTable deals={filtered} />
    </section>
  );
}

function SearchesPage({ searches, setSearches, runAction }) {
  const [draft, setDraft] = useState(emptySearch);

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
      setDraft(emptySearch);
    });
  }

  return (
    <section className="stack">
      <form className="panel form-grid search-form" onSubmit={addSearch}>
        <PanelTitle icon={Plus} title="Ajouter une recherche" />
        <label>Requête<input value={draft.query} onChange={(event) => setDraft({ ...draft, query: event.target.value })} /></label>
        <label>URL filtrée Vinted<input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>
        <label>Limite<input type="number" min="10" value={draft.limit} onChange={(event) => setDraft({ ...draft, limit: numberValue(event.target.value) })} /></label>
        <label className="checkbox"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /> Active</label>
        <button className="primary"><Plus size={18} /> Ajouter</button>
      </form>

      <section className="panel">
        <PanelTitle icon={Search} title="Recherches configurées" />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Active</th><th>Requête</th><th>URL</th><th>Limite</th><th>Actions</th></tr></thead>
            <tbody>
              {searches.map((search) => (
                <tr key={search.id}>
                  <td><input type="checkbox" checked={search.enabled} onChange={(event) => setSearches(updateById(searches, search.id, { enabled: event.target.checked }))} /></td>
                  <td><input value={search.query} onChange={(event) => setSearches(updateById(searches, search.id, { query: event.target.value }))} /></td>
                  <td><input value={search.url ?? ""} onChange={(event) => setSearches(updateById(searches, search.id, { url: event.target.value }))} /></td>
                  <td><input className="tiny-input" type="number" min="10" value={search.limit} onChange={(event) => setSearches(updateById(searches, search.id, { limit: numberValue(event.target.value) }))} /></td>
                  <td className="row-actions">
                    <button className="icon-button" aria-label="Sauvegarder la recherche" title="Sauvegarder" onClick={() => saveSearch(search)}><Save size={16} /></button>
                    <button className="icon-button danger" aria-label="Supprimer la recherche" title="Supprimer" onClick={() => runAction("Recherche supprimée", () => api(`/api/searches/${search.id}`, { method: "DELETE" }))}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function ModelRulesPage({ modelRules, setModelRules, runAction }) {
  const enabled = modelRules.filter((rule) => rule.enabled).length;

  return (
    <section className="panel">
      <div className="panel-head">
        <PanelTitle icon={Smartphone} title={`Règles par modèle (${enabled}/${modelRules.length})`} />
        <button className="primary" onClick={() => runAction("Règles sauvegardées", () => api("/api/model-rules", { method: "PUT", body: { modelRules } }))}>
          <Save size={18} /> Sauvegarder
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Actif</th><th>Modèle</th><th>Stockages</th><th>Prix max</th><th>Score min.</th><th>Remise min.</th><th>Économie min.</th></tr></thead>
          <tbody>
            {modelRules.map((rule) => (
              <tr key={rule.model}>
                <td><input type="checkbox" checked={rule.enabled} onChange={(event) => setModelRules(updateByModel(modelRules, rule.model, { enabled: event.target.checked }))} /></td>
                <td className="strong">{rule.model}</td>
                <td><input value={(rule.storagesGb ?? []).join(", ")} onChange={(event) => setModelRules(updateByModel(modelRules, rule.model, { storagesGb: parseList(event.target.value) }))} /></td>
                <td><input className="tiny-input" type="number" value={rule.maxFinalPrice ?? ""} onChange={(event) => setModelRules(updateByModel(modelRules, rule.model, { maxFinalPrice: optionalNumber(event.target.value) }))} /></td>
                <td><input className="tiny-input" type="number" value={rule.minScore ?? ""} onChange={(event) => setModelRules(updateByModel(modelRules, rule.model, { minScore: optionalNumber(event.target.value) }))} /></td>
                <td><input className="tiny-input" type="number" step="0.01" value={rule.minDiscount ?? ""} onChange={(event) => setModelRules(updateByModel(modelRules, rule.model, { minDiscount: optionalNumber(event.target.value) }))} /></td>
                <td><input className="tiny-input" type="number" value={rule.minSavings ?? ""} onChange={(event) => setModelRules(updateByModel(modelRules, rule.model, { minSavings: optionalNumber(event.target.value) }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RiskRulesPage({ riskRules, setRiskRules, runAction }) {
  const keywords = riskRules.customExcludeKeywords ?? [];
  const severity = riskRules.customExcludeSeverity ?? "reject";

  function setKeywords(value) {
    const tokens = value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    // Deduplicate while preserving the order the user typed.
    const seen = new Set();
    const unique = [];
    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      unique.push(token);
    }
    setRiskRules({ ...riskRules, customExcludeKeywords: unique.slice(0, 50) });
  }

  return (
    <section className="panel form-grid risks">
      <PanelTitle icon={AlertTriangle} title="Filtres de risque" />

      <h3 className="form-section"><Shield size={13} /> Catégories bloquantes</h3>
      <label className="checkbox"><input type="checkbox" checked={riskRules.rejectHighRisks} onChange={(event) => setRiskRules({ ...riskRules, rejectHighRisks: event.target.checked })} /> Bloquer les risques élevés</label>
      <label className="checkbox"><input type="checkbox" checked={riskRules.allowMissingImage} onChange={(event) => setRiskRules({ ...riskRules, allowMissingImage: event.target.checked })} /> Autoriser sans image</label>
      <label className="checkbox"><input type="checkbox" checked={riskRules.rejectNonOriginalScreen} onChange={(event) => setRiskRules({ ...riskRules, rejectNonOriginalScreen: event.target.checked })} /> Bloquer écran non original</label>
      <label className="checkbox"><input type="checkbox" checked={riskRules.rejectScreenReplaced} onChange={(event) => setRiskRules({ ...riskRules, rejectScreenReplaced: event.target.checked })} /> Bloquer écran remplacé</label>
      <label className="checkbox"><input type="checkbox" checked={riskRules.rejectMissingInvoice} onChange={(event) => setRiskRules({ ...riskRules, rejectMissingInvoice: event.target.checked })} /> Bloquer sans facture</label>

      <h3 className="form-section"><Smartphone size={13} /> Vendeur et appareil</h3>
      <label>Avis vendeur minimum<input type="number" min="0" value={riskRules.minSellerReviews} onChange={(event) => setRiskRules({ ...riskRules, minSellerReviews: numberValue(event.target.value) })} /></label>
      <label>Note vendeur minimum<input type="number" min="0" max="5" step="0.1" value={riskRules.minSellerRating} onChange={(event) => setRiskRules({ ...riskRules, minSellerRating: numberValue(event.target.value) })} /></label>
      <label>Batterie minimum (%)<input type="number" min="0" max="100" value={riskRules.minBatteryHealth} onChange={(event) => setRiskRules({ ...riskRules, minBatteryHealth: numberValue(event.target.value) })} /></label>
      <label>Pays acceptés<input value={(riskRules.allowedCountries ?? []).join(", ")} onChange={(event) => setRiskRules({ ...riskRules, allowedCountries: event.target.value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean) })} placeholder="FR, BE, ES" /></label>

      <h3 className="form-section"><ListFilter size={13} /> Mots-clés exclus</h3>
      <label className="form-row-full">
        Mots-clés à exclure (séparés par virgule)
        <input
          value={keywords.join(", ")}
          onChange={(event) => setKeywords(event.target.value)}
          placeholder="ex. reconditionne, refurbished, reservé"
        />
        {keywords.length > 0 ? (
          <span className="tag-list">
            {keywords.map((keyword) => (
              <span className="tag" key={keyword}>{keyword}</span>
            ))}
          </span>
        ) : null}
      </label>
      <label>
        Sévérité
        <select
          value={severity}
          onChange={(event) => setRiskRules({ ...riskRules, customExcludeSeverity: event.target.value })}
        >
          <option value="reject">Bloquante</option>
          <option value="high">Élevée</option>
          <option value="medium">Moyenne</option>
        </select>
      </label>
      <p className="form-help">
        Une correspondance dans le titre ou la description marque l&apos;annonce avec la sévérité choisie.
        Sévérité « bloquante » empêche toute alerte ; « élevée » dépend de la case « Bloquer les risques élevés ».
      </p>

      <div className="form-actions form-row-full">
        <button className="primary" type="button" onClick={() => runAction("Risques sauvegardés", () => api("/api/risk-rules", { method: "PUT", body: riskRules }))}><Save size={18} /> Sauvegarder</button>
      </div>
    </section>
  );
}

function SettingsPage({ settings, setSettings, runAction }) {
  const [secrets, setSecrets] = useState({ discordWebhookUrl: "", apifyToken: "", authorizedDataApiKey: "" });

  async function save() {
    const payload = { ...settings };
    for (const [key, value] of Object.entries(secrets)) {
      if (value.trim()) payload[key] = value.trim();
    }
    await runAction("Paramètres sauvegardés", () => api("/api/settings", { method: "PUT", body: payload }));
    setSecrets({ discordWebhookUrl: "", apifyToken: "", authorizedDataApiKey: "" });
  }

  // Re-alert threshold is stored as a 0-1 fraction; the slider edits a 1-95 %
  // integer to keep typing simple and align with the server's clamp range.
  const reAlertPercent = Math.round((settings.reAlertDropPercent ?? 0.10) * 100);

  return (
    <section className="panel form-grid settings-form">
      <PanelTitle icon={Settings} title="Configuration serveur" />

      <h3 className="form-section"><Database size={13} /> Source de données</h3>
      <label>Source de données
        <select value={settings.providerType} onChange={(event) => setSettings({ ...settings, providerType: event.target.value })}>
          <option value="apify">Apify</option>
          <option value="generic">API générique</option>
        </select>
      </label>
      <label>Acteur Apify<input value={settings.apifyActorId} onChange={(event) => setSettings({ ...settings, apifyActorId: event.target.value })} /></label>
      <label>URL API générique<input value={settings.authorizedDataApiUrl} onChange={(event) => setSettings({ ...settings, authorizedDataApiUrl: event.target.value })} /></label>

      <h3 className="form-section"><Clock3 size={13} /> Cadence et limites</h3>
      <label>Intervalle de scan (s)<input type="number" min="60" value={settings.pollIntervalSeconds} onChange={(event) => setSettings({ ...settings, pollIntervalSeconds: numberValue(event.target.value) })} /></label>
      <label>Délai source (s)<input type="number" min="5" value={settings.providerTimeoutSeconds} onChange={(event) => setSettings({ ...settings, providerTimeoutSeconds: numberValue(event.target.value) })} /></label>
      <label>Produits max / scan<input type="number" min="1" value={settings.maxProductsPerScan} onChange={(event) => setSettings({ ...settings, maxProductsPerScan: numberValue(event.target.value) })} /></label>
      <label>Heartbeat tous les N scans<input type="number" min="0" value={settings.heartbeatEveryScans} onChange={(event) => setSettings({ ...settings, heartbeatEveryScans: numberValue(event.target.value) })} /></label>

      <h3 className="form-section"><SlidersHorizontal size={13} /> Seuils d&apos;alerte</h3>
      <label>Score minimum<input type="number" min="0" max="100" value={settings.minScore} onChange={(event) => setSettings({ ...settings, minScore: numberValue(event.target.value) })} /></label>
      <label>Remise minimum (0-1)<input type="number" min="0" max="1" step="0.01" value={settings.minDiscount} onChange={(event) => setSettings({ ...settings, minDiscount: numberValue(event.target.value) })} /></label>
      <label>Économie minimum (€)<input type="number" min="0" value={settings.minSavings} onChange={(event) => setSettings({ ...settings, minSavings: numberValue(event.target.value) })} /></label>
      <label className="range-with-value">
        Re-alerte après baisse de
        <span className="range-row">
          <input
            type="range"
            min="1"
            max="50"
            value={reAlertPercent}
            onChange={(event) => setSettings({ ...settings, reAlertDropPercent: Math.min(0.95, Math.max(0.01, Number(event.target.value) / 100)) })}
          />
          <span className="range-value">{reAlertPercent}%</span>
        </span>
      </label>

      <h3 className="form-section"><Bell size={13} /> Notifications et heures calmes</h3>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={Boolean(settings.quietHoursEnabled)}
          onChange={(event) => setSettings({ ...settings, quietHoursEnabled: event.target.checked })}
        />
        Activer les heures calmes
      </label>
      <label>
        Heures calmes (début / fin)
        <span className="time-pair">
          <input
            type="time"
            value={settings.quietHoursStart ?? "23:00"}
            disabled={!settings.quietHoursEnabled}
            onChange={(event) => setSettings({ ...settings, quietHoursStart: event.target.value })}
          />
          <input
            type="time"
            value={settings.quietHoursEnd ?? "08:00"}
            disabled={!settings.quietHoursEnabled}
            onChange={(event) => setSettings({ ...settings, quietHoursEnd: event.target.value })}
          />
        </span>
      </label>
      <label>
        Plafond alertes / scan
        <input
          type="number"
          min="0"
          value={settings.maxAlertsPerScan ?? 0}
          onChange={(event) => setSettings({ ...settings, maxAlertsPerScan: numberValue(event.target.value) })}
        />
      </label>
      <label>
        Plafond alertes / 24 h
        <input
          type="number"
          min="0"
          value={settings.maxAlertsPerDay ?? 0}
          onChange={(event) => setSettings({ ...settings, maxAlertsPerDay: numberValue(event.target.value) })}
        />
      </label>
      <p className="form-help">
        Pendant les heures calmes les annonces restent enregistrées et visibles dans le tableau, mais aucun message Discord n&apos;est envoyé.
        Les plafonds protègent contre les emballements (0 = sans limite). Le plafond /24 h est calculé sur les annonces uniques alertées.
      </p>

      <h3 className="form-section"><Bot size={13} /> Modes</h3>
      <label className="checkbox"><input type="checkbox" checked={settings.runOnStart} onChange={(event) => setSettings({ ...settings, runOnStart: event.target.checked })} /> Scan au démarrage</label>
      <label className="checkbox"><input type="checkbox" checked={settings.dryRun} onChange={(event) => setSettings({ ...settings, dryRun: event.target.checked })} /> Mode simulation</label>

      <h3 className="form-section"><LockKeyhole size={13} /> Secrets (écriture seule)</h3>
      <label>Webhook Discord <SecretState configured={settings.discordWebhookConfigured} /><input value={secrets.discordWebhookUrl} onChange={(event) => setSecrets({ ...secrets, discordWebhookUrl: event.target.value })} placeholder="remplacement uniquement" /></label>
      <label>Token Apify <SecretState configured={settings.apifyTokenConfigured} /><input value={secrets.apifyToken} onChange={(event) => setSecrets({ ...secrets, apifyToken: event.target.value })} placeholder="remplacement uniquement" /></label>
      <label>Clé API générique <SecretState configured={settings.authorizedDataApiKeyConfigured} /><input value={secrets.authorizedDataApiKey} onChange={(event) => setSecrets({ ...secrets, authorizedDataApiKey: event.target.value })} placeholder="remplacement uniquement" /></label>

      <div className="form-actions form-row-full">
        <button className="secondary" type="button" onClick={() => runAction("Défauts restaurés", () => api("/api/settings/restore-defaults", { method: "POST" }))}><RotateCcw size={18} /> Restaurer les défauts</button>
        <button className="primary" type="button" onClick={save}><Save size={18} /> Sauvegarder</button>
      </div>
    </section>
  );
}

function DealsTable({ deals }) {
  if (!deals.length) return <Empty text="Aucune opportunité" />;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Produit</th><th>Prix final</th><th>Référence</th><th>Remise</th><th>Score</th><th>Risque</th><th>Décision</th><th>Lien</th></tr></thead>
        <tbody>
          {deals.map((deal) => (
            <tr key={deal.id}>
              <td><div className="title-cell"><strong>{deal.model}{deal.storageGb ? ` ${deal.storageGb} Go` : ""}</strong><span>{deal.title}</span></div></td>
              <td className="num">{eur(deal.finalPrice)}</td>
              <td className="num">{eur(deal.benchmarkPrice)}</td>
              <td className="num">{Math.round(deal.discountPercent * 100)}%<span>{eur(deal.savings)}</span></td>
              <td><Score score={deal.score} /></td>
              <td><RiskBadge level={deal.riskLevel} /></td>
              <td>{deal.sent ? <Badge tone="good">envoyé</Badge> : deal.shouldAlert ? <Badge tone="accent">alertable</Badge> : <Badge tone="muted">{translateReason(deal.rejectionReasons?.[0] ?? "rejeté")}</Badge>}</td>
              <td><a className="icon-link" href={deal.url} target="_blank" rel="noreferrer" title="Ouvrir Vinted"><ExternalLink size={16} /></a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScansTable({ scans, compact }) {
  if (!scans.length) return <Empty text="Aucun scan" />;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Statut</th><th>Source</th><th>Annonces</th><th>Alertes</th>{compact ? null : <th>Début</th>}</tr></thead>
        <tbody>
          {scans.map((scan) => (
            <tr key={scan.id}>
              <td><Badge tone={scan.status === "success" ? "good" : scan.status === "failed" ? "bad" : "muted"}>{tStatus(scan.status)}</Badge></td>
              <td>{tSource(scan.source)}</td>
              <td className="num">{scan.listings}</td>
              <td className="num">{scan.sent}/{scan.alertable}</td>
              {compact ? null : <td>{dateTimeShort(scan.startedAt)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogsTable({ logs }) {
  if (!logs.length) return <Empty text="Aucun log" />;
  return (
    <div className="log-list">
      {logs.map((log) => (
        <div className={`log-row ${log.level}`} key={log.id}>
          <span>{tLogLevel(log.level)}</span>
          <p>{translateLog(log.message)}</p>
          <time>{timeShort(log.createdAt)}</time>
        </div>
      ))}
    </div>
  );
}

function DealSummary({ deal }) {
  return (
    <div className="deal-summary">
      <div>
        <strong>{deal.model ?? "Modèle inconnu"} {deal.storageGb ? `${deal.storageGb} Go` : ""}</strong>
        <span>{deal.title ?? deal.bestCandidate ?? "Candidat"}</span>
      </div>
      <div className="summary-line">
        <Score score={deal.score ?? 0} />
        <span>{deal.finalPrice ? eur(deal.finalPrice) : "-"}</span>
        <RiskBadge level={deal.riskLevel ?? "clean"} />
      </div>
      {deal.url ? <a href={deal.url} target="_blank" rel="noreferrer">Ouvrir sur Vinted <ExternalLink size={14} /></a> : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value, sub, tone = "neutral" }) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-icon"><Icon size={18} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function PanelTitle({ icon: Icon, title }) {
  return <h2>{Icon ? <Icon size={17} /> : null}{title}</h2>;
}

function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

function Badge({ tone = "muted", children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function RiskBadge({ level }) {
  const tone = level === "reject" || level === "high" ? "bad" : level === "medium" ? "warn" : "good";
  return <Badge tone={tone}>{tRisk(level)}</Badge>;
}

function Score({ score }) {
  return <span className={`score ${score >= 88 ? "good" : score >= 82 ? "warn" : "muted"}`}>{score}</span>;
}

function SecretState({ configured }) {
  return <span className={`secret-state ${configured ? "yes" : "no"}`}>{configured ? "configuré" : "vide"}</span>;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function pageTitle(tab) {
  return {
    dashboard: "Contrôle du bot",
    deals: "Historique des opportunités",
    searches: "Recherches Vinted",
    rules: "Modèles, stockages et prix",
    risks: "Protection qualité",
    settings: "Paramètres"
  }[tab];
}

function filterLabel(value) {
  return { all: "Tous", alert: "Alertables", sent: "Envoyés", risk: "Risques" }[value];
}

function botStateLabel(status) {
  if (!status) return "Connexion";
  if (status.scanInFlight) return "Scan en cours";
  if (status.paused) return "En pause";
  return "Actif";
}

function tStatus(value) {
  return { running: "en cours", success: "réussi", failed: "échec", skipped: "ignoré" }[value] ?? value;
}

function tSource(value) {
  return { manual: "manuel", startup: "démarrage", scheduled: "planifié" }[value] ?? value;
}

function tRisk(value) {
  return { clean: "propre", low: "faible", medium: "moyen", high: "élevé", reject: "bloqué" }[value] ?? value;
}

function tLogLevel(value) {
  return { info: "info", warn: "alerte", error: "erreur" }[value] ?? value;
}

function translateReason(reason) {
  return String(reason)
    .replace("disabled in dashboard rules", "désactivé dans les règles")
    .replace("storage is not enabled for", "stockage non activé pour")
    .replace("final price above dashboard max", "prix final au-dessus du maximum")
    .replace("blocked risk:", "risque bloquant :")
    .replace("score below", "score inférieur à")
    .replace("discount below", "remise inférieure à")
    .replace("savings below", "économie inférieure à")
    .replace("below logical market floor", "prix inférieur au plancher logique")
    .replace("seller has no feedback", "vendeur sans avis")
    .replace("seller history too weak for discount", "historique vendeur trop faible pour cette remise")
    .replace("seller account is very new", "compte vendeur très récent")
    .replace("seller account is new for this discount", "compte vendeur récent pour cette remise")
    .replace("seller country differs from item country", "pays vendeur différent du pays de l'article")
    .replace("description too short", "description trop courte")
    .replace("missing image", "image absente")
    .replace("unrealistic phone price", "prix téléphone irréaliste")
    .replace("accessory only", "accessoire uniquement")
    .replace("rejected", "rejeté");
}

function translateLog(message) {
  return String(message)
    .replace("Dashboard settings updated", "Paramètres du dashboard mis à jour")
    .replace("Dashboard rules restored to defaults", "Règles restaurées par défaut")
    .replace("Search created:", "Recherche créée :")
    .replace("Search updated:", "Recherche mise à jour :")
    .replace("Search deleted:", "Recherche supprimée :")
    .replace("Model rules updated", "Règles des modèles mises à jour")
    .replace("Risk rules updated", "Règles de risque mises à jour")
    .replace("Bot paused from dashboard", "Bot mis en pause depuis le dashboard")
    .replace("Bot resumed from dashboard", "Bot relancé depuis le dashboard")
    .replace("Discord test message sent", "Message de test Discord envoyé")
    .replace(/Scan success: (\d+) listings, (\d+) alerts sent/, "Scan réussi : $1 annonces, $2 alertes envoyées")
    .replace(/Scan failed: (\d+) listings, (\d+) alerts sent/, "Scan échoué : $1 annonces, $2 alertes envoyées")
    // Caps & quiet hours messages emitted by runScan / botController.
    .replace(/Plafond par scan atteint \((\d+)\)\..*/, "Plafond par scan atteint ($1) — alertes restantes différées")
    .replace(/Plafond journalier atteint \((\d+)\)\..*/, "Plafond journalier atteint ($1) — alertes restantes différées")
    .replace(/Heures calmes : alerte (.+) reportée\..*/, "Heures calmes : alerte « $1 » reportée");
}

function updateById(items, id, patch) {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function updateByModel(items, model, patch) {
  return items.map((item) => (item.model === model ? cleanEmpty({ ...item, ...patch }) : item));
}

function cleanEmpty(value) {
  const next = { ...value };
  for (const key of ["maxFinalPrice", "minScore", "minDiscount", "minSavings"]) {
    if (next[key] === "") delete next[key];
  }
  return next;
}

function parseList(value) {
  return value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function optionalNumber(value) {
  if (String(value).trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function eur(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function dateTimeShort(value) {
  return value ? new Date(value).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
}

function timeShort(value) {
  return value ? new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "-";
}

function duration(seconds) {
  if (!seconds) return "-";
  if (seconds >= 86400) return `${Math.round(seconds / 86400)} j`;
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds} s`;
}

function messageFromError(error) {
  return error instanceof Error ? error.message : String(error);
}

createRoot(document.getElementById("root")).render(<App />);
