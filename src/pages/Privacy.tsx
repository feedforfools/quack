import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * Privacy page — `/privacy`
 *
 * Placeholder copy for now; final legal text arrives in Epic 5 (gate G3).
 */
export default function Privacy() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-fg">
        {t("privacy.title")}
      </h1>

      <p className="mt-6 text-fg-muted">{t("privacy.placeholder")}</p>

      <div className="mt-10">
        <Link
          to="/"
          className="text-sm text-accent underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded"
        >
          {t("common.backToHome")}
        </Link>
      </div>
    </main>
  );
}
