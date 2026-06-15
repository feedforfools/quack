import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "./Layout";
import Home from "@/pages/Home";

/**
 * Route-level code splitting (E6-T6).
 *
 * Only Home is statically imported so the landing screen paints immediately.
 * Every other route — most importantly the large Room screen and its
 * voting / game-mode features — is a lazily-loaded chunk pulled in on
 * navigation. This keeps first-load JS under the 200 KB gzipped budget
 * (Constraint #8) by keeping non-landing code off the critical path.
 */
const Create = lazy(() => import("@/pages/Create"));
const Join = lazy(() => import("@/pages/Join"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Room = lazy(() => import("@/pages/Room"));
const NotFound = lazy(() => import("@/pages/NotFound"));
// Dev-only sandbox: the conditional keeps it (and its chunk) out of
// production builds entirely.
const Playground = import.meta.env.DEV
  ? lazy(() => import("@/pages/Playground"))
  : null;

/** Lightweight, glance-safe fallback shown while a route chunk loads. */
function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-bg"
      role="status"
      aria-live="polite"
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
        aria-hidden
      />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}

/**
 * Application router.
 *
 * Route map:
 *   /           → Home    (name field, Create CTA, Join CTA)
 *   /create     → Create  (room-creation form)
 *   /join       → Join    (code-input form)
 *   /r/:code    → Room    (lobby + active round; host and player views)
 *   /privacy    → Privacy (placeholder; final copy in Epic 5 / G3)
 *   /dev        → Playground (dev-only UI component sandbox)
 *   *           → NotFound (stale links, typos)
 *
 * All routes are wrapped by AppLayout which provides the global header
 * (language toggle). Additional providers (i18n, Supabase client, Zustand
 * stores) are layered around <AppRouter> in main.tsx.
 */
export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<Create />} />
            <Route path="/join" element={<Join />} />
            <Route path="/r/:code" element={<Room />} />
            <Route path="/privacy" element={<Privacy />} />
            {Playground && <Route path="/dev" element={<Playground />} />}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
