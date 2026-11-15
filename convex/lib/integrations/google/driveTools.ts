/**
 * Read tools over the files a customer picked in Google Drive, for an agent's work that already uses tools.
 * Built from the files granted to that agent and passed to the model as client tools: `list_picked_files`
 * names them, and `read_picked_file` returns one file's text a piece at a time. Read-only, and limited to
 * what the agent was given; nothing here calls Google.
 */

import type { ClientTool } from "../../toolRouter";
import { KIND_WORD, pieceOf } from "./drive";

export type AgentFile = { id: string; name: string; kind: string; words: number; text: string };

export function driveTools(files: AgentFile[]): ClientTool[] {
  if (!files.length) return [];
  const byId = new Map(files.map((file) => [file.id, file]));
  return [
    {
      name: "list_picked_files",
      description:
        "Lists the files the business picked from its Google Drive for you to read: sales docs, scripts, call notes. Returns each file's id, name, kind and length. These are the business's own words.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => JSON.stringify(files.map((file) => ({ id: file.id, name: file.name, kind: KIND_WORD[file.kind] ?? "File", words: file.words }))),
    },
    {
      name: "read_picked_file",
      description:
        "Reads the text of one file the business picked, by its id from list_picked_files. Long files come in pieces: pass `start` from the previous answer's `next` to read on. Quote it as the business's own document.",
      inputSchema: { type: "object", properties: { id: { type: "string" }, start: { type: "number" } }, required: ["id"], additionalProperties: false },
      run: async (input) => {
        const args = (input ?? {}) as { id?: unknown; start?: unknown };
        const file = typeof args.id === "string" ? byId.get(args.id) : undefined;
        if (!file) throw new Error("No such file.");
        const { piece, next } = pieceOf(file.text, typeof args.start === "number" ? args.start : 0);
        return JSON.stringify({ name: file.name, text: piece, next });
      },
    },
  ];
}
