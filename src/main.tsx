import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import { ToastProvider } from "@/components/Toast";
import { i18n } from "@/lib/i18n";
import "./index.css";

// Initialise theme from localStorage; dark is the brand default.
// Falls back to dark when no preference is saved.
document.documentElement.classList.toggle(
  "dark",
  localStorage.getItem("theme") !== "light",
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nextProvider>
  </React.StrictMode>,
);
