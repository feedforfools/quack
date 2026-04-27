import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Dark mode is the MVP default; opt-in light mode is post-MVP.
document.documentElement.classList.add("dark");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
