import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import { ToastProvider } from "@/components/Toast";
import { i18n } from "@/lib/i18n";
import "./index.css";

// Dark mode is the MVP default; opt-in light mode is post-MVP.
document.documentElement.classList.add("dark");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nextProvider>
  </React.StrictMode>,
);
