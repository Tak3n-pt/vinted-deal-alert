import React from "react";

export default function BlankLayout({ children }) {
  return (
    <div className="preview-page-wrapper min-vh-100 bg-light d-flex align-items-center">
      <div className="container py-5">{children}</div>
    </div>
  );
}
