import { useState } from "react";
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
 */
export function useDeviceId(): string {
  const [deviceId] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      log.debug("useDeviceId: reusing existing device id");
      return stored;
    }
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    log.debug("useDeviceId: minted new device id");
    return id;
  });

  return deviceId;
}
