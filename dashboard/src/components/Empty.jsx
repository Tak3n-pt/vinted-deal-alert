import React from "react";

export default function Empty({ text, icon = "solar:inbox-line-duotone" }) {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center py-7 text-center text-muted">
      <iconify-icon icon={icon} class="fs-2 mb-2 text-secondary"></iconify-icon>
      <p className="mb-0 fs-3">{text}</p>
    </div>
  );
}
