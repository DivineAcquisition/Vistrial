"use client";

import { useMutation } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import type { ReviewActions } from "./types";

/** Approve, reject and request changes, with the existing asset mutations. */
export function useReviewActions(workspaceId: Id<"workspaces">): ReviewActions {
  const approve = useMutation(api.assets.approve);
  const reject = useMutation(api.assets.reject);
  const revise = useMutation(api.assets.requestRevision);
  return {
    approve: async (assetId) => {
      await approve({ workspaceId, assetId: assetId as Id<"assets"> });
    },
    reject: async (assetId, reason) => {
      await reject({ workspaceId, assetId: assetId as Id<"assets">, reason });
    },
    requestChanges: async (assetId, reason) => {
      await revise({ workspaceId, assetId: assetId as Id<"assets">, reason });
    },
  };
}
