import { redirect } from "next/navigation";

import { DEFAULT_APP_PATH } from "@/lib/navigation";

export default function AppIndexPage() {
  redirect(DEFAULT_APP_PATH);
}
