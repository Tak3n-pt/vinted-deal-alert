import React from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "./AppContext.jsx";
import App from "./App.jsx";
import "./custom.css";

createRoot(document.getElementById("root")).render(
  <AppProvider>
    <App />
  </AppProvider>
);
