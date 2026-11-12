import { ChatLibrary } from "@/components/chat/chat-library";

export const metadata = { title: "Chats" };

/** Library > Chats: every chat started in this organization that you may see. */
export default function ChatsPage() {
  return <ChatLibrary />;
}
