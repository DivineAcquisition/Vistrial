"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { markAssetReviewedAction, saveAssetEditAction } from "@/app/app/ask/actions";
import { AssetBody } from "@/components/sales-os/asset-body";
import { AssetSummary } from "@/components/sales-os/asset-card";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toastManager } from "@/components/ui/toast";
import type { AssetView } from "@/lib/sales-os/asset-types";
import { captionText } from "@/lib/ui";

/** Review and edit. Saving an edit writes the next version; this one is kept, marked replaced. */
export function AssetEditor({ asset, canEdit }: { asset: AssetView; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(asset.title);
  const [body, setBody] = useState(asset.body);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardPanel className="space-y-4">
        <AssetSummary asset={asset} />
        {editing ? (
          <div className="space-y-3">
            <Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea aria-label="Asset text" rows={18} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className={captionText}>
              Saving makes version {asset.version + 1}. Version {asset.version} stays in the history. What it was built from carries over,
              with your name on the edit.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={pending || !body.trim()}
                onClick={() =>
                  start(async () => {
                    const result = await saveAssetEditAction({ assetId: asset.id, title, body });
                    if (!result.ok) {
                      toastManager.add({ title: "Couldn't save", description: result.error, type: "error" });
                      return;
                    }
                    toastManager.add({ title: "Saved", description: `Version ${result.asset.version} is now current.`, type: "success" });
                    router.push(`/app/ask/assets/${result.asset.id}`);
                  })
                }
              >
                Save as version {asset.version + 1}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <AssetBody markdown={asset.body} />
            {canEdit ? (
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                {!asset.reviewedAt ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const result = await markAssetReviewedAction(asset.id);
                        toastManager.add(
                          result.ok
                            ? { title: "Marked reviewed", type: "success" }
                            : { title: "Couldn't mark it reviewed", description: result.error, type: "error" }
                        );
                        router.refresh();
                      })
                    }
                  >
                    Mark reviewed
                  </Button>
                ) : null}
                <p className={`${captionText} w-full`}>
                  To send it to your Drive or a channel, ask Vistrial in a conversation. That follows your approval settings.
                </p>
              </div>
            ) : null}
          </>
        )}
      </CardPanel>
    </Card>
  );
}
