import React from "react";
import Sparkline from "./Sparkline.jsx";

/**
 * MaterialPro KPI card.
 *
 * - variant="outline" (default): white card, soft tinted icon square, dark
 *   text. Mirrors the demo's "Online Revenue" card.
 * - variant="filled":           full-color gradient background, light text.
 *   Mirrors the demo's signature "$12.5m On Expense" card.
 */
export default function StatCard({ label, value, sub, color = "primary", sparklineData, icon, variant = "outline" }) {
  const filled = variant === "filled";
  const cardClass = filled
    ? `card overflow-hidden text-white border-0 bonoitec-grad-${color}`
    : "card overflow-hidden";
  const labelClass = filled ? "card-subtitle mb-1 fs-3 text-white opacity-75" : "card-subtitle mb-1 fs-3 text-muted";
  const subClass = filled ? "fs-2 text-white opacity-75 d-block mb-2" : "fs-2 text-muted d-block mb-2";
  const titleClass = filled ? "card-title mb-1 fw-bold text-white" : "card-title mb-1 fw-semibold";

  return (
    <div className={cardClass}>
      <div className="card-body p-9 position-relative">
        {icon ? (
          filled ? (
            <div
              className="rounded-circle round-40 d-flex align-items-center justify-content-center mb-3"
              style={{ background: "rgba(255,255,255,0.18)" }}
            >
              <iconify-icon icon={icon} class="text-white fs-5"></iconify-icon>
            </div>
          ) : (
            <div className={`bg-${color}-subtle rounded-circle round-40 d-flex align-items-center justify-content-center mb-3`}>
              <iconify-icon icon={icon} class={`text-${color} fs-5`}></iconify-icon>
            </div>
          )
        ) : null}
        <p className={labelClass}>{label}</p>
        <h4 className={titleClass}>{value}</h4>
        {sub ? <span className={subClass}>{sub}</span> : null}
        {sparklineData && sparklineData.length ? (
          <Sparkline data={sparklineData} color={filled ? "white" : color} variant={filled ? "onColor" : "solid"} />
        ) : null}
      </div>
    </div>
  );
}
