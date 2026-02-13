import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Persist token from URL so API requests can send it (before any fetch runs)
const TOKEN_KEY = "spatialxgene_token";
const params = new URLSearchParams(window.location.search);
const tokenFromUrl = params.get("token");
if (tokenFromUrl !== null && tokenFromUrl !== "") {
  sessionStorage.setItem(TOKEN_KEY, tokenFromUrl);
  const paramsCopy = new URLSearchParams(window.location.search);
  paramsCopy.delete("token");
  const newSearch = paramsCopy.toString();
  const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
  window.history.replaceState({}, "", newUrl);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
