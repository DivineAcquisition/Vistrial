import { redirect } from "next/navigation";

export default function RequestsRedirect() {
  redirect("/app/team/queue");
}
