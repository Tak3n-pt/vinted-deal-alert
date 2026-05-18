import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, messageFromError } from "./api.js";

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export function AppProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [userSettings, setUserSettings] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");

  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [searches, setSearches] = useState([]);
  const [modelRules, setModelRules] = useState([]);
  const [riskRules, setRiskRules] = useState(null);
  const [deals, setDeals] = useState([]);
  const [scans, setScans] = useState([]);
  const [logs, setLogs] = useState([]);
  const [usage, setUsage] = useState(null);
  const [apifyUsage, setApifyUsage] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Bootstrap session
  useEffect(() => {
    api("/api/auth/me")
      .then((data) => {
        setAuthenticated(Boolean(data.authenticated));
        setCurrentUser(data.user ?? null);
      })
      .catch(() => setAuthenticated(false));
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statusData, settingsData, userSettingsData, searchesData, modelRulesData, riskRulesData, dealsData, scansData, logsData, usageData, apifyUsageData] =
        await Promise.all([
          api("/api/status"),
          api("/api/settings"),
          api("/api/user/settings"),
          api("/api/searches"),
          api("/api/model-rules"),
          api("/api/risk-rules"),
          api("/api/deals?limit=160"),
          api("/api/scans?limit=50"),
          api("/api/logs?limit=100"),
          api("/api/usage"),
          currentUser?.id === 1
            ? api("/api/admin/apify-usage").catch((err) => ({
                apifyUsage: { configured: false, totalUsageUsd: 0, paidActorUsd: 0, datasetReads: 0, cycleStart: null, cycleEnd: null, actors: [], error: messageFromError(err) }
              }))
            : Promise.resolve({ apifyUsage: null })
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
      setUsage(usageData);
      setApifyUsage(apifyUsageData.apifyUsage);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  const refreshLive = useCallback(async () => {
    try {
      const [statusData, dealsData, scansData, logsData, usageData] = await Promise.all([
        api("/api/status"),
        api("/api/deals?limit=160"),
        api("/api/scans?limit=50"),
        api("/api/logs?limit=100"),
        api("/api/usage")
      ]);
      setStatus(statusData.status);
      setDeals(dealsData.deals);
      setScans(scansData.scans);
      setLogs(logsData.logs);
      setUsage(usageData);
    } catch {
      // A subsequent manual action will surface the error if the server stays down.
    }
  }, []);

  const runAction = useCallback(
    async (label, fn) => {
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
    },
    [refreshAll]
  );

  // Polling — every 12 s once authenticated.
  useEffect(() => {
    if (!authenticated) return undefined;
    refreshAll();
    const timer = setInterval(() => refreshLive(), 12000);
    return () => clearInterval(timer);
  }, [authenticated, refreshAll, refreshLive]);

  // Auto-dismiss notices after 4 s so the toast doesn't linger.
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      setAuthenticated(false);
      setCurrentUser(null);
    }
  }, []);

  const value = {
    authenticated,
    setAuthenticated,
    currentUser,
    userSettings,
    activeView,
    setActiveView,
    status,
    settings,
    setSettings,
    searches,
    setSearches,
    modelRules,
    setModelRules,
    riskRules,
    setRiskRules,
    deals,
    scans,
    logs,
    usage,
    apifyUsage,
    loading,
    error,
    setError,
    notice,
    setNotice,
    refreshAll,
    refreshLive,
    runAction,
    logout
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
