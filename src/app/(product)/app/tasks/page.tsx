import { TaskBoard } from "@/components/tasks/task-board";

export const metadata = { title: "Tasks" };

/** The Tasks board: work agents propose and people approve. */
export default function TasksPage() {
  return <TaskBoard />;
}
