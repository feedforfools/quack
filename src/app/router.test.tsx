/**
 * Routing smoke tests — E1-T8
 *
 * Uses MemoryRouter to mount each route and asserts that the correct
 * page-level heading (or landmark) is rendered. This is intentionally
 * shallow — deep feature behaviour is covered by feature-level tests.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n/config";
import { AppLayout } from "./Layout";
import Home from "@/pages/Home";
import Create from "@/pages/Create";
import Join from "@/pages/Join";
import Privacy from "@/pages/Privacy";
import NotFound from "@/pages/NotFound";

// Ensure i18n is in a known state (English) before rendering.
beforeAll(async () => {
  await i18n.changeLanguage("en");
});

/**
 * Render a single route inside MemoryRouter + AppLayout using the same
 * nested-route structure as the real AppRouter.
 */
function renderRoute(path: string, routePath: string, element: React.ReactNode) {
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path={routePath} element={element} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("routing smoke", () => {
  it("/ renders the Quack heading", () => {
    renderRoute("/", "/", <Home />);
    expect(
      screen.getByRole("heading", { name: "Quack" }),
    ).toBeInTheDocument();
  });

  it("/create renders the Create heading", () => {
    renderRoute("/create", "/create", <Create />);
    expect(
      screen.getByRole("heading", { name: i18n.t("create.title") }),
    ).toBeInTheDocument();
  });

  it("/join renders the Join heading", () => {
    renderRoute("/join", "/join", <Join />);
    expect(
      screen.getByRole("heading", { name: i18n.t("join.title") }),
    ).toBeInTheDocument();
  });

  it("/privacy renders the Privacy heading", () => {
    renderRoute("/privacy", "/privacy", <Privacy />);
    expect(
      screen.getByRole("heading", { name: i18n.t("privacy.title") }),
    ).toBeInTheDocument();
  });

  it("unknown path with NotFound renders not-found heading", () => {
    renderRoute("/does-not-exist", "/does-not-exist", <NotFound />);
    expect(
      screen.getByRole("heading", { name: i18n.t("notFound.title") }),
    ).toBeInTheDocument();
  });
});
