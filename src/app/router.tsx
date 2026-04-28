import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./Layout";
import Home from "@/pages/Home";
import Create from "@/pages/Create";
import Join from "@/pages/Join";
import Privacy from "@/pages/Privacy";
import Room from "@/pages/Room";
import NotFound from "@/pages/NotFound";

/**
 * Application router.
 *
 * Route map:
 *   /           → Home    (name field, Create CTA, Join CTA)
 *   /create     → Create  (room-creation form)
 *   /join       → Join    (code-input form)
 *   /r/:code    → Room    (lobby + active round; host and player views)
 *   /privacy    → Privacy (placeholder; final copy in Epic 5 / G3)
 *   *           → NotFound (stale links, typos)
 *
 * All routes are wrapped by AppLayout which provides the global header
 * (language toggle). Additional providers (i18n, Supabase client, Zustand
 * stores) are layered around <AppRouter> in main.tsx.
 */
export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<Create />} />
          <Route path="/join" element={<Join />} />
          <Route path="/r/:code" element={<Room />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
