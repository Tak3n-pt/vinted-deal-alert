import React from "react";
import { useApp } from "../AppContext.jsx";

const NAV_ITEMS = [
  { id: "dashboard", label: "Tableau de bord", icon: "solar:screencast-2-linear" },
  { id: "analytics", label: "Statistiques", icon: "solar:chart-2-line-duotone" },
  { id: "deals", label: "Opportunités", icon: "solar:bell-bing-line-duotone" },
  { id: "searches", label: "Recherches", icon: "solar:magnifer-line-duotone" },
  { id: "rules", label: "Modèles & prix", icon: "solar:smartphone-2-line-duotone" },
  { id: "risks", label: "Filtres", icon: "solar:filter-line-duotone" },
  { id: "settings", label: "Paramètres", icon: "solar:settings-line-duotone" }
];

export default function HorizontalNav() {
  const { activeView, setActiveView } = useApp();
  return (
    <aside className="left-sidebar with-horizontal">
      <div>
        <nav id="sidebarnavh" className="sidebar-nav scroll-sidebar container-fluid">
          <ul id="sidebarnav">
            {NAV_ITEMS.map((item) => (
              <li className="sidebar-item" key={item.id}>
                <a
                  href="#"
                  className={`sidebar-link ${activeView === item.id ? "active" : ""}`}
                  onClick={(event) => {
                    event.preventDefault();
                    setActiveView(item.id);
                    document.documentElement.classList.remove("show-sidebar");
                  }}
                >
                  <iconify-icon icon={item.icon} class="aside-icon"></iconify-icon>
                  <span className="hide-menu">{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
