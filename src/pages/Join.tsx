import { useTranslation } from "react-i18next";

/**
 * Join page — `/join`
 * Full implementation lands in E2-T5. This skeleton satisfies routing.
 * TODO(E2-T5): Replace with code-input form and deep-link join path.
 */
export default function Join() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
      <h1 className="text-2xl font-semibold text-fg">{t("join.title")}</h1>
      <p className="mt-3 text-fg-muted">{t("common.comingSoon")}</p>
    </main>
  );
}
