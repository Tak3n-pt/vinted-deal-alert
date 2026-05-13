import React from "react";
import { tRisk } from "../format.js";

export function ScoreBadge({ score = 0 }) {
  const tone = score >= 88 ? "success" : score >= 82 ? "warning" : "secondary";
  return (
    <span className={`badge bg-${tone}-subtle text-${tone} rounded-4 px-2 py-1 lh-sm fs-2 fw-semibold`}>
      {score}
    </span>
  );
}

export function RiskBadge({ level }) {
  const tone =
    level === "reject" || level === "high" ? "danger" : level === "medium" ? "warning" : "success";
  return (
    <span className={`badge bg-${tone}-subtle text-${tone} rounded-4 px-2 py-1 lh-sm fs-2`}>
      {tRisk(level)}
    </span>
  );
}

export function StatusBadge({ tone = "secondary", children }) {
  return (
    <span className={`badge bg-${tone}-subtle text-${tone} rounded-4 px-2 py-1 lh-sm fs-2`}>
      {children}
    </span>
  );
}
