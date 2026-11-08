import { redirect } from "next/navigation";

/** Connections belong to the workspace, not an agent. */
export default function AgentConnections() {
  redirect("/app/connections");
}
