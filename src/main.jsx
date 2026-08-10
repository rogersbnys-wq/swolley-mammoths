import React from "react";
import { createRoot } from "react-dom/client";
import SwolleyMammoths from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SwolleyMammoths />
  </React.StrictMode>
);

/* Register the offline shell. Dev is skipped so hot reload isn't fighting a cache. */
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((err) => console.warn("offline mode unavailable", err));
  });
}
