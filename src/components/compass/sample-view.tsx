"use client";

import { CompassChatProvider } from "@/components/compass/chat";
import { CompassThread } from "@/components/compass/thread";
import { CompassWelcome } from "@/components/compass/welcome";
import { TooltipProvider } from "@/components/ui/tooltip";
import { compassSample, type CompassSampleState } from "@/lib/compass/samples";

/** One Compass state from sample data, at the given width. Nothing is ever sent. */
export function CompassSampleView({ state, width }: { state: CompassSampleState; width: string }) {
  const sample = compassSample(state);
  return (
    <TooltipProvider>
      <div className="h-[560px] overflow-hidden rounded-xl border border-border" style={{ width, maxWidth: "100%" }}>
        <CompassChatProvider
          key={`${state}-${width}`}
          chatKey={`sample-${state}-${width}`}
          conversationId={null}
          initialMessages={sample.messages}
          origin="page"
          context={{ kind: "none" }}
          readOnly={sample.readOnly}
          sample
          sampleError={sample.error}
        >
          <CompassThread
            compact={width !== "100%"}
            autoFocus={false}
            welcome={
              <CompassWelcome
                starters={[
                  { question: "Which hot leads need a reply today?" },
                  { question: "How did response times look this week?" },
                  { question: "What are the most common objections this month?" },
                ]}
                pins={[]}
              />
            }
          />
        </CompassChatProvider>
      </div>
    </TooltipProvider>
  );
}
