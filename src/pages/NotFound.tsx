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
      <span className="text-6xl" aria-hidden="true">
        🦆
      </span>
      <h1 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-fg">
        {t("notFound.title")}
      </h1>
      <p className="mt-3 text-center text-fg-muted">{t("notFound.message")}</p>
      <Link
        to="/"
        className="mt-8 flex min-h-[48px] items-center justify-center rounded-full bg-accent px-7 font-bold text-accent-ink shadow-glow transition-all duration-200 hover:bg-accent-hover active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        {t("common.backToHome")}
      </Link>
    </main>
  );
}
