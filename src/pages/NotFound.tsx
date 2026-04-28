import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * NotFound page — catch-all `*` route.
 * Shown when no other route matches. A friendly dead-end with a home CTA.
 */
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
      <h1 className="text-3xl font-bold text-fg">{t("notFound.title")}</h1>
      <p className="mt-3 text-fg-muted">{t("notFound.message")}</p>
      <Link
        to="/"
        className="mt-6 rounded-xl bg-accent px-6 py-3 font-semibold text-black min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        {t("common.backToHome")}
      </Link>
    </main>
  );
}
