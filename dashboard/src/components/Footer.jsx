import React from "react";

export default function Footer() {
  return (
    <div className="py-6 px-6 text-center">
      <p className="mb-0 fs-3">
        Bonoitec — Flash deals on Vinted ·
        <span className="text-primary ms-1">© {new Date().getFullYear()}</span>
      </p>
    </div>
  );
}
