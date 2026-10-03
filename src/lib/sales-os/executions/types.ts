import type { DestinationKind, ExecutionType, MessageKind } from "@/lib/sales-os/catalog";

export type DestinationView = {
  id: string;
  kind: DestinationKind;
  label: string;
  accountLabel: string | null;
  active: boolean;
  createdAt: string;
};

export type RouteView = { messageKind: MessageKind; destinationId: string | null };

export type ExecutionToolResult = {
  kind: "execution";
  status: "succeeded" | "failed" | "blocked" | "rejected" | "permission" | "awaiting_approval";
  executionType: ExecutionType;
  destinationLabel: string | null;
  summary: string;
  preview: string | null;
  link: string | null;
  gateSatisfiedBy: "prior_configuration" | "in_conversation_approval" | null;
  approvedByName: string | null;
  error: string | null;
};

export type ExecutionPreview = {
  status: "awaiting_approval" | "approved" | "rejected" | "running" | "succeeded" | "failed";
  executionType: ExecutionType;
  plainSummary: string;
  preview: string;
  destinationLabel: string;
  gateReason: string;
  rejectionReason: string | null;
  decidedByName: string | null;
};

export type ExecutionRecordView = {
  id: string;
  conversationId: string;
  executionType: ExecutionType;
  plainSummary: string;
  destinationLabel: string;
  status: ExecutionPreview["status"];
  gateMode: string;
  gateSatisfiedBy: string | null;
  requestedByName: string;
  approvedByName: string | null;
  rejectedByName: string | null;
  rejectionReason: string | null;
  resultSummary: string | null;
  errorText: string | null;
  createdAt: string;
  finishedAt: string | null;
};
