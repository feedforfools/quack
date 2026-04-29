import { useState, useRef, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDeviceId, useDisplayName, DisplayNamePrompt } from "@/features/identity";
import { useJoinRoom, normaliseCode, ROOM_CODE_LENGTH } from "@/features/room";
import { Button, Input } from "@/components";

/**
 * Join page — `/join`
 *
 * Flow:
 *  1. If no display name, show DisplayNamePrompt.
 *  2. Player enters a 6-character room code (case-insensitive, tolerates hyphens/spaces).
 *  3. On submit: normalise, call useJoinRoom, navigate to `/r/:code`.
 */
export default function Join() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const deviceId = useDeviceId();
  const { displayName, hasDisplayName, setDisplayName } = useDisplayName();
  const { joinRoom, loading, error } = useJoinRoom();

  const [rawCode, setRawCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hasDisplayName) inputRef.current?.focus();
  }, [hasDisplayName]);

  if (!hasDisplayName) {
    return (
      <DisplayNamePrompt
        onConfirm={setDisplayName}
        initialName={displayName ?? ""}
      />
    );
  }

  const normalised = normaliseCode(rawCode);
  const isReady = normalised.length === ROOM_CODE_LENGTH;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isReady || !deviceId || !displayName) return;
    const code = await joinRoom({ deviceId, displayName, code: rawCode });
    if (code) {
      void navigate(`/r/${code}`);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
      <h1 className="text-2xl font-semibold text-fg">{t("join.title")}</h1>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="mt-8 flex w-full flex-col gap-4"
        noValidate
      >
        <Input
          ref={inputRef}
          label={t("join.codeLabel")}
          placeholder={t("join.codePlaceholder")}
          value={rawCode}
          onChange={(e) => setRawCode(e.target.value)}
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={ROOM_CODE_LENGTH * 2}
          error={error ? t("join.errorNotFound") : undefined}
          className="font-mono text-xl tracking-widest text-center uppercase"
          disabled={loading}
        />

        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={loading}
          disabled={!isReady}
        >
          {t("join.cta")}
        </Button>
      </form>
    </main>
  );
}

