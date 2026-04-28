/**
 * i18next TypeScript type augmentation.
 *
 * Maps `CustomTypeOptions` to the English bundle shape so that `t()` calls
 * are type-checked against known keys at compile time.
 * See: https://www.i18next.com/overview/typescript
 */
import "i18next";
import type en from "./locales/en.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: typeof en;
    };
  }
}
