import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { log } from "@/lib/log";

const STORAGE_KEY = "quack_device_id";

/**
 * Returns the stable UUID for this device.
 * On the first call ever, a new UUID is minted via `crypto.randomUUID()` and
 * saved to localStorage under `quack_device_id`. Subsequent calls (and page
 * reloads) read the stored value, guaranteeing the same identity is returned
 * for the lifetime of the browser profile.
 *
 * The UUID is NEVER logged at info level or above (device privacy constraint).
 *
 * On first mint only, a fire-and-forget `bump_metric('new_devices')` RPC is
 * sent to increment the anonymous daily counter.  No device UUID is included
 * in the call — the metric carries no identity.
 */
export function useDeviceId(): string {
  // Capture the mint-vs-reuse decision synchronously in the initializer so
  // it is available as stable state before any effect fires.  The side-effect
  // (the network ping) is intentionally NOT done here; it runs in the useEffect
  // below so that React's rules about pure initializers are respected.
  const [{ deviceId, isFreshMint }] = useState<{
    deviceId: string;
    isFreshMint: boolean;
  }>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      log.debug("useDeviceId: reusing existing device id");
      return { deviceId: stored, isFreshMint: false };
    }
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    log.debug("useDeviceId: minted new device id");
    return { deviceId: id, isFreshMint: true };
  });

  // Stable ref so the effect closure captures the flag without becoming a dep.
  const isFreshMintRef = useRef(isFreshMint);

  useEffect(() => {
    if (!isFreshMintRef.current) return;

    // Fire-and-forget: never throw, never block rendering, never delay the id.
    // The plain supabase singleton is used (no x-device-id header) because
    // this metric carries no identity — that is the entire privacy point.
    //
    // bump_metric is a new RPC added in migration 20260620000001.  The
    // generated types in src/lib/supabase/types.ts will not include it until
    // the founder applies the migration and regenerates types.  We cast through
    // `unknown` to bypass the type-check here; the call is fire-and-forget and
    // all errors are swallowed, so a runtime mismatch is safe.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void Promise.resolve((supabase.rpc as any)("bump_metric", { p_metric: "new_devices" }))
      .then((res: { error?: { message: string } | null }) => {
        if (res?.error) {
          // Log at debug only — a failed ping must never surface to the user.
          // (Device privacy constraint: do not log the device id itself.)
          log.debug("useDeviceId: bump_metric failed (ignored)", res.error.message);
        }
      })
      .catch((err: unknown) => {
        log.debug("useDeviceId: bump_metric threw (ignored)", String(err));
      });
  }, []); // empty deps: runs once on mount, which is exactly when a fresh mint occurs

  return deviceId;
}
