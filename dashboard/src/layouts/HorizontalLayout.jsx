import React from "react";
import { useApp } from "../AppContext.jsx";
import TopHeader from "../components/TopHeader.jsx";
import HorizontalNav from "../components/HorizontalNav.jsx";
import Footer from "../components/Footer.jsx";

export default function HorizontalLayout({ children }) {
  const { error, notice, setError, setNotice } = useApp();
  return (
    <div id="main-wrapper">
      <div className="page-wrapper">
        <TopHeader />
        <HorizontalNav />
        <div className="body-wrapper">
          <div className="container-fluid">
            {error ? (
              <div className="alert alert-danger d-flex align-items-center gap-2 mb-4" role="alert">
                <iconify-icon icon="solar:danger-triangle-line-duotone" class="fs-4"></iconify-icon>
                <div className="flex-grow-1">{error}</div>
                <button
                  type="button"
                  className="btn-close ms-2"
                  aria-label="Fermer"
                  onClick={() => setError("")}
                ></button>
              </div>
            ) : null}
            {notice ? (
              <div className="alert alert-success d-flex align-items-center gap-2 mb-4" role="alert">
                <iconify-icon icon="solar:check-circle-line-duotone" class="fs-4"></iconify-icon>
                <div className="flex-grow-1">{notice}</div>
                <button
                  type="button"
                  className="btn-close ms-2"
                  aria-label="Fermer"
                  onClick={() => setNotice("")}
                ></button>
              </div>
            ) : null}
            {children}
            <Footer />
          </div>
        </div>
      </div>
    </div>
  );
}
