import { Outlet } from "react-router-dom";
import { LanguageToggle } from "@/components/LanguageToggle";

/**
 * Root layout shell applied to every route.
 *
 * Renders a thin fixed header containing the language toggle (top-right).
 * Feature pages use `<main>` for their content and manage their own layout.
 *
 * TODO(E5-T4): Visual polish pass — add branding/logo, finalise header design.
 */
export function AppLayout() {
  return (
    <>
      <header className="fixed right-4 top-4 z-10">
        <LanguageToggle />
      </header>
      <Outlet />
    </>
  );
}
