import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Bell,
  Bot,
  CheckCircle2,
  ExternalLink,
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
  Trash2,
  XCircle
} from "lucide-react";
import "./styles.css";

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "deals", label: "Deals", icon: Bell },
  { id: "searches", label: "Recherches", icon: Search },
  { id: "rules", label: "Regles & Prix", icon: SlidersHorizontal },
  { id: "risks", label: "Risques", icon: Shield },
  { id: "settings", label: "Parametres", icon: Settings }
];

const emptySearch = { enabled: true, query: "", url: "", limit: 10 };

function App() {
  const [authenticated, setAuthenticated] = useState(null);
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
      .then((data) => setAuthenticated(Boolean(data.authenticated)))
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    refreshAll();
    const timer = setInterval(() => refreshLive(), 12000);
    return () => clearInterval(timer);
  }, [authenticated]);

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const [statusData, settingsData, searchesData, modelRulesData, riskRulesData, dealsData, scansData, logsData] =
        await Promise.all([
          api("/api/status"),
          api("/api/settings"),
          api("/api/searches"),
          api("/api/model-rules"),
          api("/api/risk-rules"),
          api("/api/deals?limit=120"),
          api("/api/scans?limit=40"),
          api("/api/logs?limit=80")
        ]);
      setStatus(statusData.status);
      setSettings(settingsData.settings);
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
        api("/api/deals?limit=120"),
        api("/api/scans?limit=40"),
        api("/api/logs?limit=80")
      ]);
      setStatus(statusData.status);
      setDeals(dealsData.deals);
      setScans(scansData.scans);
      setLogs(logsData.logs);
    } catch {
      // The next manual action will surface the error.
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
    return <div className="boot">Chargement</div>;
  }

  if (!authenticated) {
    return <Login onLogin={() => setAuthenticated(true)} />;
  }

  const ActiveIcon = tabs.find((tab) => tab.id === activeTab)?.icon ?? Activity;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Bot size={20} /></span>
          <div>
            <strong>Vinted Deal Alert</strong>
            <span>{status?.paused ? "Pause" : status?.scanInFlight ? "Scan en cours" : "Controle bot"}</span>
          </div>
        </div>
        <nav>
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
        <button className="sidebar-logout" onClick={logout}>
          <LogOut size={17} />
          <span>Logout</span>
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow"><ActiveIcon size={16} /> {tabs.find((tab) => tab.id === activeTab)?.label}</div>
            <h1>{pageTitle(activeTab)}</h1>
          </div>
          <div className="actions">
            <button className="icon-button" title="Rafraichir" onClick={refreshAll} disabled={loading}>
              <RefreshCcw size={18} />
            </button>
            <button className="primary" onClick={() => runAction("Scan lance", () => api("/api/bot/scan-now", { method: "POST" }))} disabled={loading}>
              <Activity size={18} /> Scan maintenant
            </button>
          </div>
        </header>

        {error ? <div className="alert error"><XCircle size={18} /> {error}</div> : null}
        {notice ? <div className="alert success"><CheckCircle2 size={18} /> {notice}</div> : null}

        {activeTab === "dashboard" ? (
          <DashboardPage
            status={status}
            settings={settings}
            deals={deals}
            scans={scans}
            logs={logs}
            onPause={() => runAction("Bot en pause", () => api("/api/bot/pause", { method: "POST" }))}
            onResume={() => runAction("Bot repris", () => api("/api/bot/resume", { method: "POST" }))}
            onTestDiscord={() => runAction("Test Discord envoye", () => api("/api/discord/test", { method: "POST" }))}
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

function Login({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand large">
          <span className="brand-mark"><Bot size={24} /></span>
          <div>
            <strong>Vinted Deal Alert</strong>
            <span>Admin</span>
          </div>
        </div>
        <label>
          Mot de passe
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
        </label>
        {error ? <div className="field-error">{error}</div> : null}
        <button className="primary full" disabled={loading || !password}>
          <Shield size={18} /> Connexion
        </button>
      </form>
    </main>
  );
}

function DashboardPage({ status, settings, deals, scans, logs, onPause, onResume, onTestDiscord }) {
  const lastScan = status?.lastScan;
  const best = status?.bestCandidate ?? deals[0];
  const sentCount = deals.filter((deal) => deal.sent).length;
  const alertableCount = deals.filter((deal) => deal.shouldAlert).length;

  return (
    <section className="stack">
      <div className="metric-grid">
        <Metric label="Etat bot" value={status?.paused ? "Pause" : status?.scanInFlight ? "Scan" : "Actif"} tone={status?.paused ? "warn" : "good"} />
        <Metric label="Dernier scan" value={lastScan ? `${lastScan.listings} annonces` : "Aucun"} sub={lastScan?.status ?? ""} />
        <Metric label="Alertes envoyees" value={sentCount} sub={`${alertableCount} alertables`} tone="accent" />
        <Metric label="Prochain scan" value={status?.nextScanAt ? timeShort(status.nextScanAt) : "-"} sub={`${settings?.pollIntervalSeconds ?? 0}s intervalle`} />
      </div>

      <div className="toolbar-row">
        <button className="secondary" onClick={status?.paused ? onResume : onPause}>
          {status?.paused ? <Play size={18} /> : <Pause size={18} />}
          {status?.paused ? "Reprendre bot" : "Pause bot"}
        </button>
        <button className="secondary" onClick={onTestDiscord}>
          <Send size={18} /> Tester Discord
        </button>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <PanelTitle title="Meilleur candidat" />
          {best ? <DealSummary deal={best} /> : <Empty text="Aucun candidat" />}
        </section>
        <section className="panel">
          <PanelTitle title="Derniers scans" />
          <ScansTable scans={scans.slice(0, 6)} compact />
        </section>
      </div>

      <section className="panel">
        <PanelTitle title="Logs recents" />
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
    if (filter === "reject") return deals.filter((deal) => deal.riskLevel === "reject" || deal.riskLevel === "high");
    return deals;
  }, [deals, filter]);

  return (
    <section className="panel">
      <div className="panel-head">
        <PanelTitle title="Produits scores" />
        <div className="segmented">
          {["all", "alert", "sent", "reject"].map((item) => (
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
    await runAction("Recherche sauvegardee", async () => {
      const saved = await api(`/api/searches/${search.id}`, { method: "PUT", body: search });
      setSearches((items) => items.map((item) => (item.id === search.id ? saved.search : item)));
    });
  }

  async function addSearch(event) {
    event.preventDefault();
    await runAction("Recherche ajoutee", async () => {
      const saved = await api("/api/searches", { method: "POST", body: draft });
      setSearches((items) => [...items, saved.search]);
      setDraft(emptySearch);
    });
  }

  return (
    <section className="stack">
      <form className="panel form-grid" onSubmit={addSearch}>
        <PanelTitle title="Ajouter une recherche" />
        <label>Requete<input value={draft.query} onChange={(event) => setDraft({ ...draft, query: event.target.value })} /></label>
        <label>URL filtree<input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>
        <label>Limite<input type="number" min="10" value={draft.limit} onChange={(event) => setDraft({ ...draft, limit: numberValue(event.target.value) })} /></label>
        <label className="checkbox"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /> Active</label>
        <button className="primary"><Plus size={18} /> Ajouter</button>
      </form>

      <section className="panel">
        <PanelTitle title="Recherches actives" />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Active</th><th>Requete</th><th>URL</th><th>Limite</th><th></th></tr></thead>
            <tbody>
              {searches.map((search) => (
                <tr key={search.id}>
                  <td><input type="checkbox" checked={search.enabled} onChange={(event) => setSearches(updateById(searches, search.id, { enabled: event.target.checked }))} /></td>
                  <td><input value={search.query} onChange={(event) => setSearches(updateById(searches, search.id, { query: event.target.value }))} /></td>
                  <td><input value={search.url ?? ""} onChange={(event) => setSearches(updateById(searches, search.id, { url: event.target.value }))} /></td>
                  <td><input className="tiny-input" type="number" min="10" value={search.limit} onChange={(event) => setSearches(updateById(searches, search.id, { limit: numberValue(event.target.value) }))} /></td>
                  <td className="row-actions">
                    <button className="icon-button" title="Sauvegarder" onClick={() => saveSearch(search)}><Save size={16} /></button>
                    <button className="icon-button danger" title="Supprimer" onClick={() => runAction("Recherche supprimee", () => api(`/api/searches/${search.id}`, { method: "DELETE" }))}><Trash2 size={16} /></button>
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
  return (
    <section className="panel">
      <div className="panel-head">
        <PanelTitle title="Prix et modeles" />
        <button className="primary" onClick={() => runAction("Regles sauvegardees", () => api("/api/model-rules", { method: "PUT", body: { modelRules } }))}>
          <Save size={18} /> Sauvegarder regles
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Actif</th><th>Modele</th><th>Stockages</th><th>Prix max</th><th>Score</th><th>Remise</th><th>Economie</th></tr></thead>
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
  return (
    <section className="panel form-grid risks">
      <PanelTitle title="Filtres de risque" />
      <label className="checkbox"><input type="checkbox" checked={riskRules.rejectHighRisks} onChange={(event) => setRiskRules({ ...riskRules, rejectHighRisks: event.target.checked })} /> Bloquer risques high</label>
      <label className="checkbox"><input type="checkbox" checked={riskRules.allowMissingImage} onChange={(event) => setRiskRules({ ...riskRules, allowMissingImage: event.target.checked })} /> Autoriser sans image</label>
      <label className="checkbox"><input type="checkbox" checked={riskRules.rejectNonOriginalScreen} onChange={(event) => setRiskRules({ ...riskRules, rejectNonOriginalScreen: event.target.checked })} /> Bloquer ecran non original</label>
      <label className="checkbox"><input type="checkbox" checked={riskRules.rejectScreenReplaced} onChange={(event) => setRiskRules({ ...riskRules, rejectScreenReplaced: event.target.checked })} /> Bloquer ecran remplace</label>
      <label className="checkbox"><input type="checkbox" checked={riskRules.rejectMissingInvoice} onChange={(event) => setRiskRules({ ...riskRules, rejectMissingInvoice: event.target.checked })} /> Bloquer sans facture</label>
      <label>Avis vendeur minimum<input type="number" min="0" value={riskRules.minSellerReviews} onChange={(event) => setRiskRules({ ...riskRules, minSellerReviews: numberValue(event.target.value) })} /></label>
      <label>Note vendeur minimum<input type="number" min="0" max="5" step="0.1" value={riskRules.minSellerRating} onChange={(event) => setRiskRules({ ...riskRules, minSellerRating: numberValue(event.target.value) })} /></label>
      <label>Batterie minimum %<input type="number" min="0" max="100" value={riskRules.minBatteryHealth} onChange={(event) => setRiskRules({ ...riskRules, minBatteryHealth: numberValue(event.target.value) })} /></label>
      <label>Pays acceptes<input value={(riskRules.allowedCountries ?? []).join(", ")} onChange={(event) => setRiskRules({ ...riskRules, allowedCountries: event.target.value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean) })} /></label>
      <div className="form-actions">
        <button className="primary" onClick={() => runAction("Risques sauvegardes", () => api("/api/risk-rules", { method: "PUT", body: riskRules }))}><Save size={18} /> Sauvegarder</button>
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
    await runAction("Parametres sauvegardes", () => api("/api/settings", { method: "PUT", body: payload }));
    setSecrets({ discordWebhookUrl: "", apifyToken: "", authorizedDataApiKey: "" });
  }

  return (
    <section className="panel form-grid settings-form">
      <PanelTitle title="Serveur et secrets" />
      <label>Provider
        <select value={settings.providerType} onChange={(event) => setSettings({ ...settings, providerType: event.target.value })}>
          <option value="apify">Apify</option>
          <option value="generic">Generic API</option>
        </select>
      </label>
      <label>Apify actor<input value={settings.apifyActorId} onChange={(event) => setSettings({ ...settings, apifyActorId: event.target.value })} /></label>
      <label>Generic API URL<input value={settings.authorizedDataApiUrl} onChange={(event) => setSettings({ ...settings, authorizedDataApiUrl: event.target.value })} /></label>
      <label>Intervalle scan<input type="number" value={settings.pollIntervalSeconds} onChange={(event) => setSettings({ ...settings, pollIntervalSeconds: numberValue(event.target.value) })} /></label>
      <label>Timeout provider<input type="number" value={settings.providerTimeoutSeconds} onChange={(event) => setSettings({ ...settings, providerTimeoutSeconds: numberValue(event.target.value) })} /></label>
      <label>Max produits<input type="number" value={settings.maxProductsPerScan} onChange={(event) => setSettings({ ...settings, maxProductsPerScan: numberValue(event.target.value) })} /></label>
      <label>Heartbeat<input type="number" value={settings.heartbeatEveryScans} onChange={(event) => setSettings({ ...settings, heartbeatEveryScans: numberValue(event.target.value) })} /></label>
      <label>Score minimum<input type="number" value={settings.minScore} onChange={(event) => setSettings({ ...settings, minScore: numberValue(event.target.value) })} /></label>
      <label>Remise minimum<input type="number" step="0.01" value={settings.minDiscount} onChange={(event) => setSettings({ ...settings, minDiscount: numberValue(event.target.value) })} /></label>
      <label>Economie minimum<input type="number" value={settings.minSavings} onChange={(event) => setSettings({ ...settings, minSavings: numberValue(event.target.value) })} /></label>
      <label className="checkbox"><input type="checkbox" checked={settings.runOnStart} onChange={(event) => setSettings({ ...settings, runOnStart: event.target.checked })} /> Scan au demarrage</label>
      <label className="checkbox"><input type="checkbox" checked={settings.dryRun} onChange={(event) => setSettings({ ...settings, dryRun: event.target.checked })} /> Dry-run</label>
      <label>Discord webhook <SecretState configured={settings.discordWebhookConfigured} /><input value={secrets.discordWebhookUrl} onChange={(event) => setSecrets({ ...secrets, discordWebhookUrl: event.target.value })} placeholder="write-only" /></label>
      <label>Apify token <SecretState configured={settings.apifyTokenConfigured} /><input value={secrets.apifyToken} onChange={(event) => setSecrets({ ...secrets, apifyToken: event.target.value })} placeholder="write-only" /></label>
      <label>Generic API key <SecretState configured={settings.authorizedDataApiKeyConfigured} /><input value={secrets.authorizedDataApiKey} onChange={(event) => setSecrets({ ...secrets, authorizedDataApiKey: event.target.value })} placeholder="write-only" /></label>
      <div className="form-actions">
        <button className="secondary" onClick={() => runAction("Defauts restaures", () => api("/api/settings/restore-defaults", { method: "POST" }))}><RotateCcw size={18} /> Restaurer defauts</button>
        <button className="primary" onClick={save}><Save size={18} /> Sauvegarder</button>
      </div>
    </section>
  );
}

function DealsTable({ deals }) {
  if (!deals.length) return <Empty text="Aucun deal" />;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Produit</th><th>Prix final</th><th>Benchmark</th><th>Remise</th><th>Score</th><th>Risque</th><th>Decision</th><th></th></tr></thead>
        <tbody>
          {deals.map((deal) => (
            <tr key={deal.id}>
              <td><div className="title-cell"><strong>{deal.model}{deal.storageGb ? ` ${deal.storageGb}GB` : ""}</strong><span>{deal.title}</span></div></td>
              <td className="num">{eur(deal.finalPrice)}</td>
              <td className="num">{eur(deal.benchmarkPrice)}</td>
              <td className="num">{Math.round(deal.discountPercent * 100)}%<span>{eur(deal.savings)}</span></td>
              <td><Score score={deal.score} /></td>
              <td><RiskBadge level={deal.riskLevel} /></td>
              <td>{deal.sent ? <Badge tone="good">envoye</Badge> : deal.shouldAlert ? <Badge tone="accent">alertable</Badge> : <Badge tone="muted">{deal.rejectionReasons?.[0] ?? "rejete"}</Badge>}</td>
              <td><a className="icon-link" href={deal.url} target="_blank" rel="noreferrer" title="Ouvrir"><ExternalLink size={16} /></a></td>
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
        <thead><tr><th>Status</th><th>Source</th><th>Annonces</th><th>Alertes</th>{compact ? null : <th>Debut</th>}</tr></thead>
        <tbody>
          {scans.map((scan) => (
            <tr key={scan.id}>
              <td><Badge tone={scan.status === "success" ? "good" : scan.status === "failed" ? "bad" : "muted"}>{scan.status}</Badge></td>
              <td>{scan.source}</td>
              <td className="num">{scan.listings}</td>
              <td className="num">{scan.sent}/{scan.alertable}</td>
              {compact ? null : <td>{dateShort(scan.startedAt)}</td>}
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
          <span>{log.level}</span>
          <p>{log.message}</p>
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
        <strong>{deal.model ?? "Modele inconnu"} {deal.storageGb ? `${deal.storageGb}GB` : ""}</strong>
        <span>{deal.title ?? deal.bestCandidate ?? "Candidat"}</span>
      </div>
      <div className="summary-line">
        <Score score={deal.score ?? 0} />
        <span>{deal.finalPrice ? eur(deal.finalPrice) : "-"}</span>
        <RiskBadge level={deal.riskLevel ?? "clean"} />
      </div>
      {deal.url ? <a href={deal.url} target="_blank" rel="noreferrer">Ouvrir Vinted <ExternalLink size={14} /></a> : null}
    </div>
  );
}

function Metric({ label, value, sub, tone = "neutral" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function PanelTitle({ title }) {
  return <h2>{title}</h2>;
}

function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

function Badge({ tone = "muted", children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function RiskBadge({ level }) {
  const tone = level === "reject" || level === "high" ? "bad" : level === "medium" ? "warn" : "good";
  return <Badge tone={tone}>{level}</Badge>;
}

function Score({ score }) {
  return <span className={`score ${score >= 88 ? "good" : score >= 82 ? "warn" : "muted"}`}>{score}</span>;
}

function SecretState({ configured }) {
  return <span className={`secret-state ${configured ? "yes" : "no"}`}>{configured ? "configure" : "vide"}</span>;
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
    dashboard: "Controle du bot",
    deals: "Historique des deals",
    searches: "Recherches Vinted",
    rules: "Seuils et modeles",
    risks: "Protection qualite",
    settings: "Configuration"
  }[tab];
}

function filterLabel(value) {
  return { all: "Tous", alert: "Alertables", sent: "Envoyes", reject: "Risques" }[value];
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
  return `${Math.round(Number(value) || 0)} EUR`;
}

function dateShort(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function timeShort(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";
}

function messageFromError(error) {
  return error instanceof Error ? error.message : String(error);
}

createRoot(document.getElementById("root")).render(<App />);
