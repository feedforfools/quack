import { Outlet } from "react-router-dom";

/**
 * Root layout shell applied to every route.
 *
 * Feature pages use `<main>` for their content and manage their own layout.
 */
export function AppLayout() {
  return <Outlet />;
}
