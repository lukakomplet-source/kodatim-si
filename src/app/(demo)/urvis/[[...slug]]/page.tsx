import "@urvis/urvis.css";
import UrvisClientEntry from "./UrvisClientEntry";

/**
 * Clone of urvis.si, parked at kodatim.si/urvis until the client has their own
 * domain again. Wouter (the original app's own client-side router) handles
 * every sub-path under here — this file just needs to exist for each segment
 * depth Next might match. NOINDEX is inherited from the (demo) layout.
 */
export const metadata = { title: "URVIS Razlakiranje Kovin — predogled" };

export default function UrvisDemoPage() {
  return <UrvisClientEntry />;
}
