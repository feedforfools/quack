import { useTranslation } from "react-i18next";

/**
 * Create page — `/create`
 * Full implementation lands in E2-T4. This skeleton satisfies routing.
 * TODO(E2-T4): Replace with room-creation form and server insert.
 */
export default function Create() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
      <h1 className="text-2xl font-semibold text-fg">{t("create.title")}</h1>
      <p className="mt-3 text-fg-muted">{t("common.comingSoon")}</p>
    </main>
  );
}
