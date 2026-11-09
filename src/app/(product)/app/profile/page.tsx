import { redirect } from "next/navigation";

/** Moved into Settings. Old links land on the same place there. */
export default function Moved() {
  redirect("/app/settings?section=business");
}
