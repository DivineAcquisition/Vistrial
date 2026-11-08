import { redirect } from "next/navigation";

/** Results files are managed once, in the workspace's Connections. */
export default function AgentResultsFiles() {
  redirect("/app/connections/results");
}
