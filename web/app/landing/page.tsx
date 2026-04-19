import { redirect } from "next/navigation";

/** Legacy URL: `/landing` now resolves to the marketing home at `/`. */
export default function LegacyLandingRedirect() {
  redirect("/");
}
