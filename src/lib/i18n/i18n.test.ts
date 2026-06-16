/**
 * i18n unit tests — E1-T8
 *
 * Verifies that:
 * - Both EN and IT locale bundles contain the expected top-level namespaces.
 * - Key values are non-empty strings (no missing translations left as empty).
 * - Locale switching via i18n.changeLanguage() updates t() output.
 */
import i18n from "./config";

// Ensure i18n is initialised before any test runs.
beforeAll(async () => {
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  // Reset to English so tests are isolated.
  await i18n.changeLanguage("en");
});

describe("EN locale", () => {
  it("provides home.tagline", () => {
    expect(i18n.t("home.tagline")).toBeTruthy();
  });

  it("provides home CTA labels", () => {
    expect(i18n.t("home.createRoom")).toBeTruthy();
    expect(i18n.t("home.joinRoom")).toBeTruthy();
  });

  it("provides identity prompt keys", () => {
    expect(i18n.t("identity.prompt.title")).toBeTruthy();
    expect(i18n.t("identity.prompt.cta")).toBeTruthy();
  });

  it("provides notFound keys", () => {
    expect(i18n.t("notFound.title")).toBeTruthy();
    expect(i18n.t("notFound.message")).toBeTruthy();
  });

  it("provides privacy keys", () => {
    expect(i18n.t("privacy.title")).toBeTruthy();
    expect(i18n.t("privacy.intro")).toBeTruthy();
    expect(i18n.t("privacy.deletionBody")).toBeTruthy();
    expect(i18n.t("privacy.neverAccounts")).toBeTruthy();
    expect(i18n.t("privacy.closing")).toBeTruthy();
  });

  it("provides common.backToHome", () => {
    expect(i18n.t("common.backToHome")).toBeTruthy();
  });
});

describe("IT locale", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("it");
  });

  it("provides home.tagline in Italian", () => {
    expect(i18n.t("home.tagline")).toBeTruthy();
    // Italian tagline differs from English
    expect(i18n.t("home.tagline")).not.toBe("Spot the cialtrone.");
  });

  it("provides home CTA labels in Italian", () => {
    expect(i18n.t("home.createRoom")).toBeTruthy();
    expect(i18n.t("home.joinRoom")).toBeTruthy();
  });

  it("provides identity prompt keys in Italian", () => {
    expect(i18n.t("identity.prompt.title")).toBeTruthy();
    expect(i18n.t("identity.prompt.cta")).toBeTruthy();
    // Should differ from English
    expect(i18n.t("identity.prompt.title")).not.toBe("What's your name?");
  });

  it("provides notFound keys in Italian", () => {
    expect(i18n.t("notFound.title")).toBeTruthy();
    expect(i18n.t("notFound.message")).toBeTruthy();
  });

  it("provides privacy keys in Italian", () => {
    expect(i18n.t("privacy.title")).toBeTruthy();
    expect(i18n.t("privacy.intro")).toBeTruthy();
    // Should differ from English
    expect(i18n.t("privacy.intro")).not.toBe(
      "Quack is built to forget you. No account, no email, no tracking — you play, you laugh, and within an hour of finishing, your room and everything in it is gone for good.",
    );
  });
});

describe("language switching", () => {
  it("switches from EN to IT and back", async () => {
    await i18n.changeLanguage("en");
    const enTagline = i18n.t("home.tagline");

    await i18n.changeLanguage("it");
    const itTagline = i18n.t("home.tagline");

    expect(enTagline).not.toBe(itTagline);

    await i18n.changeLanguage("en");
    expect(i18n.t("home.tagline")).toBe(enTagline);
  });

  it("falls back to EN for an unknown locale", async () => {
    await i18n.changeLanguage("en");
    const enTagline = i18n.t("home.tagline");

    await i18n.changeLanguage("fr");
    // i18next fallbackLng kicks in — should match EN value
    expect(i18n.t("home.tagline")).toBe(enTagline);
  });
});
