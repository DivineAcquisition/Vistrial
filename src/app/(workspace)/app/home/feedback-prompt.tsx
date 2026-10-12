"use client";

import { useState, useTransition } from "react";

import { dismissFeedback, submitFeedback, type SetupResult } from "@/app/(workspace)/app/onboarding/setup-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { errorClass, helperClass, successClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

const RATINGS = [
  { value: 1, label: "Not well" },
  { value: 2, label: "So-so" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Good" },
  { value: 5, label: "Great" },
];

/** Day 7: one light, optional question. Asked once; "Not now" means not again. */
export function FeedbackPrompt() {
  const [pending, start] = useTransition();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<SetupResult | null>(null);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  if (result?.ok) {
    return (
      <Card className="p-5">
        <p role="status" className={successClass}>
          {result.message}
        </p>
      </Card>
    );
  }
  return (
    <Card className="gap-4 p-5">
      <div>
        <h2 className="font-heading text-base text-card-foreground">How is it going?</h2>
        <p className={helperClass}>Your first week with Vistrial. One question, and only if you have a moment.</p>
      </div>
      <fieldset>
        <legend className="sr-only">How is it going?</legend>
        <div className="flex flex-wrap gap-2">
          {RATINGS.map((item) => (
            <Button
              key={item.value}
              variant={rating === item.value ? "primary" : "secondary"}
              size="sm"
              aria-pressed={rating === item.value}
              onClick={() => setRating(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </fieldset>
      <Field label="Anything your team should know? (optional)" name="feedback" htmlFor="feedback">
        <Textarea id="feedback" rows={3} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} />
      </Field>
      <div className={cn("flex flex-wrap gap-2")}>
        <Button
          variant="primary"
          disabled={!rating}
          loading={pending}
          onClick={() => start(async () => setResult(await submitFeedback(rating ?? 3, comment)))}
        >
          Send
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            start(async () => {
              await dismissFeedback();
              setHidden(true);
            })
          }
        >
          Not now
        </Button>
      </div>
      {result && !result.ok ? (
        <p role="alert" className={errorClass}>
          {result.error}
        </p>
      ) : null}
    </Card>
  );
}
