import { redirect } from "next/navigation";

/** Meta is managed once, in the workspace's Connections. */
export default function AgentMetaConnection() {
  redirect("/app/connections/meta");
}
