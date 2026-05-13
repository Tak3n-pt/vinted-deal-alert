import React from "react";
import { useApp } from "./AppContext.jsx";
import HorizontalLayout from "./layouts/HorizontalLayout.jsx";
import Login from "./views/Login.jsx";
import Dashboard from "./views/Dashboard.jsx";
import Analytics from "./views/Analytics.jsx";
import Deals from "./views/Deals.jsx";
import Searches from "./views/Searches.jsx";
import ModelRules from "./views/ModelRules.jsx";
import RiskRules from "./views/RiskRules.jsx";
import Settings from "./views/Settings.jsx";

const VIEWS = {
  dashboard: Dashboard,
  analytics: Analytics,
  deals: Deals,
  searches: Searches,
  rules: ModelRules,
  risks: RiskRules,
  settings: Settings
};

export default function App() {
  const { authenticated, activeView } = useApp();

  if (authenticated === null) {
    return (
      <div className="preview-page-wrapper min-vh-100 bg-light d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Chargement…</span>
          </div>
          <p className="mt-3 fs-3 text-muted">Chargement…</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <Login />;
  }

  const View = VIEWS[activeView] ?? Dashboard;
  return (
    <HorizontalLayout>
      <View />
    </HorizontalLayout>
  );
}
