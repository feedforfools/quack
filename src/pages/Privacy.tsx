import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * Privacy page — `/privacy`
 *
 * Plain-language privacy notice (E6-T4 / release gate G3). Reflects the real
 * implemented model: localStorage-only identity, no accounts, no tracking, and
 * a 1-hour inactivity purge of all room data (see migration
 * 20260501000003_room_ttl_purge.sql). All copy flows through i18next.
 */
export default function Privacy() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight text-fg">
        {t("privacy.title")}
      </h1>

      <p className="mt-6 text-lg leading-relaxed text-fg">
        {t("privacy.intro")}
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-fg">
          {t("privacy.deviceTitle")}
        </h2>
        <p className="mt-2 leading-relaxed text-fg-muted">
          {t("privacy.deviceBody")}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold text-fg">
          {t("privacy.serverTitle")}
        </h2>
        <p className="mt-2 leading-relaxed text-fg-muted">
          {t("privacy.serverBody")}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold text-fg">
          {t("privacy.deletionTitle")}
        </h2>
        <p className="mt-2 leading-relaxed text-fg-muted">
          {t("privacy.deletionBody")}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold text-fg">
          {t("privacy.neverTitle")}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed text-fg-muted">
          <li>{t("privacy.neverAccounts")}</li>
          <li>{t("privacy.neverTracking")}</li>
          <li>{t("privacy.neverCookies")}</li>
          <li>{t("privacy.neverSelling")}</li>
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold text-fg">
          {t("privacy.hostingTitle")}
        </h2>
        <p className="mt-2 leading-relaxed text-fg-muted">
          {t("privacy.hostingBody")}
        </p>
      </section>

      <p className="mt-8 leading-relaxed text-fg-muted">
        {t("privacy.closing")}
      </p>

      <div className="mt-10">
        <Link
          to="/"
          className="rounded text-sm font-semibold text-accent underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {t("common.backToHome")}
        </Link>
      </div>
    </main>
  );
}
