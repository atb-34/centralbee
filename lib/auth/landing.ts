import "server-only";

import { canAny, type Viewer } from "@/lib/auth/viewer";
import { NAV_SECTIONS } from "@/lib/navigation";

/**
 * Where a user lands after signing in.
 *
 * Not a fixed path: a role that cannot open Günlük would otherwise be sent
 * straight from the login form to the permission-denied screen. The first
 * navigation entry the viewer is actually allowed to open is the right answer,
 * and it stays right as roles are reconfigured later.
 *
 * `/settings` is the floor — it carries no permission requirement, so every
 * signed-in user has somewhere to go.
 */
export function getLandingPath(viewer: Viewer): string {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (!item.anyOf || canAny(viewer, item.anyOf)) return item.href;
    }
  }
  return "/settings";
}
