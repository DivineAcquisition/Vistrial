"use client";

import { TaskBoardView, type BoardActions, type Column } from "@/components/tasks/task-board";
import { Step2Frame } from "../step2/frame";
import { storyBoard, storyNotes } from "./fixtures";

const nothing = async () => undefined;
const ACTIONS: BoardActions = { decide: nothing, edit: nothing, propose: nothing, reopen: nothing, markDone: nothing, recordOutcome: nothing, addNote: nothing, setNoteDone: nothing, removeNote: nothing };

/** The Tasks board with an agency's week on it. */
export function TasksStory({ state, theme, column, dialog }: { state: string; theme: string; column: string | null; dialog: string | null }) {
  const role = state === "viewer" ? "viewer" : state === "member" ? "member" : "owner";
  return (
    <Step2Frame theme={theme} role={role} path="/app/tasks" state={state === "empty" ? "empty" : "busy"}>
      <TaskBoardView
        board={storyBoard(state)}
        notes={storyNotes(state)}
        scopeLabel="your organization itself"
        actions={ACTIONS}
        initialColumn={(column as Column | null) ?? undefined}
        initialDialog={(dialog as "propose" | "edit" | "skip" | "note" | null) ?? undefined}
      />
    </Step2Frame>
  );
}
