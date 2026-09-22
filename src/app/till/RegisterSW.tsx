"use client";

import { useEffect } from "react";

/** Registers the service worker so the till shell loads with no network. */
export default function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline shell is a bonus, not a requirement */
    });
  }, []);
  return null;
}
