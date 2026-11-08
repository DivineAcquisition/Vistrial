import { AgentFrame } from "@/components/agents/agent-frame";

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return <AgentFrame>{children}</AgentFrame>;
}
