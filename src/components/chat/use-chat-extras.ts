"use client";

import { useMutation, useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import type { ComposerFile, ComposerMode } from "@/components/chat/chat-composer";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Uploaded = ComposerFile & { storageId?: Id<"_storage">; fileId?: Id<"sessionFiles"> };

function kindOf(file: File): ComposerFile["kind"] | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "text/csv" || /\.csv$/i.test(file.name)) return "csv";
  return null;
}

/**
 * What the chat box carries besides the text: mode, focused sources, links and files (uploaded to the
 * workspace's storage straight away, attached once there is a conversation), and Meta connect.
 */
export function useChatExtras(workspaceId: Id<"workspaces">, canEdit: boolean, ownerOnly: boolean) {
  const pathname = usePathname();
  const uploadUrl = useMutation(api.files.uploadUrl);
  const attach = useMutation(api.files.attach);
  const startConnect = useMutation(api.metaAds.startConnect);
  const meta = useQuery(api.metaAds.status, { workspaceId });
  const me = useQuery(api.settings.me, { workspaceId });
  // The workspace's default research quality (Settings → Agents) until this chat picks its own.
  const [chosenMode, setMode] = useState<ComposerMode | null>(null);
  const mode: ComposerMode = chosenMode ?? me?.defaultResearchMode ?? "thorough";
  const [sources, setSources] = useState<string[] | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [problem, setProblem] = useState("");

  const addFiles = (picked: File[]) => {
    for (const file of picked) {
      const kind = kindOf(file);
      if (!kind) {
        setProblem("Add images, PDFs or CSV spreadsheets.");
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        setProblem(`${file.name} is over 10 MB.`);
        continue;
      }
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`;
      setFiles((current) => [...current, { key, name: file.name, kind, status: "uploading" }]);
      void (async () => {
        try {
          const url = await uploadUrl({ workspaceId });
          const response = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "text/csv" }, body: file });
          const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
          setFiles((current) => current.map((row) => (row.key === key ? { ...row, storageId, status: "read" } : row)));
        } catch {
          setFiles((current) => current.map((row) => (row.key === key ? { ...row, status: "failed" } : row)));
        }
      })();
    }
  };

  /** Attaches the uploaded files to a conversation or a session; they are read there. */
  const attachTo = async (target: { intakeId?: Id<"intakes">; projectId?: Id<"researchProjects"> }) => {
    for (const file of files) {
      if (file.storageId) await attach({ workspaceId, storageId: file.storageId, name: file.name, ...target });
    }
  };

  const reset = () => {
    setLinks([]);
    setFiles([]);
    setProblem("");
  };

  return {
    mode,
    setMode,
    sources,
    setSources,
    links,
    files,
    problem,
    attachTo,
    reset,
    composer: {
      mode: { value: mode, onChange: setMode },
      sources: { value: sources, onChange: setSources },
      links: { value: links, onAdd: (url: string) => setLinks((current) => (current.includes(url) ? current : [...current, url].slice(0, 10))), onRemove: (url: string) => setLinks((current) => current.filter((row) => row !== url)) },
      files: canEdit ? { value: files, onAdd: addFiles, onRemove: (key: string) => setFiles((current) => current.filter((row) => row.key !== key)) } : undefined,
      connect: {
        canConnect: ownerOnly,
        metaConnected: Boolean(meta?.connection),
        onConnectMeta: () => {
          void startConnect({ workspaceId, returnOrigin: window.location.origin, returnPath: pathname }).then(
            ({ url }) => window.location.assign(url),
            () => setProblem("Could not start Facebook Login. Try again from Connections."),
          );
        },
      },
    },
  };
}
