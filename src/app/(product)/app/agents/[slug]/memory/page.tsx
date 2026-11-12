import { redirect } from "next/navigation";

/** Memory belongs to the organization, not one agent: it moved to Settings. Old links land there. */
export default function AgentMemory() {
  redirect("/app/settings?section=memory");
}
