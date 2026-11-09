"use client";

import { ConvexError } from "convex/values";

import { Button } from "@/components/ui/button";
import { showError } from "@/lib/errors/show-error";

const CASES = {
  credits: new ConvexError({ code: "out_of_credits", message: "Your credit balance is empty. An owner can add credits in Billing to start new work." }),
  invalid: new ConvexError({ code: "invalid", message: "Say what you want to find out." }),
  masked: new Error("[CONVEX M(intake:create)] [Request ID: 36b3e7cc0ee3303f] Server Error"),
};

/** Each kind of error pop-up. The out-of-credits one stays until closed and offers Billing. */
export function ErrorPopupsStory() {
  return (
    <main className="mx-auto grid max-w-xl gap-3 p-8">
      <h1 className="font-heading text-xl text-foreground">Error pop-ups</h1>
      {(Object.keys(CASES) as (keyof typeof CASES)[]).map((key) => (
        <Button key={key} variant="outline" className="w-fit" onClick={() => showError(CASES[key], "That did not start.")}>
          Show {key}
        </Button>
      ))}
    </main>
  );
}
