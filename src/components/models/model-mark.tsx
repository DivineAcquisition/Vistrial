import { cn } from "@/lib/utils";

/**
 * The three model companies' own marks, as the files they publish them (public/model-logos, unmodified),
 * used only to say which model did a piece of work, always beside the model's name.
 */
export type ModelFamily = "claude" | "gpt" | "gemini";
export type ModelMarkData = { family: ModelFamily; name: string };

const FILES: Record<ModelFamily, { light: string; dark?: string; maker: string }> = {
  claude: { light: "/model-logos/claude.svg", maker: "Claude, by Anthropic" },
  // OpenAI publishes its mark in black for light backgrounds and in white for dark ones.
  gpt: { light: "/model-logos/openai.svg", dark: "/model-logos/openai-dark.svg", maker: "GPT, by OpenAI" },
  gemini: { light: "/model-logos/gemini.svg", maker: "Gemini, by Google" },
};

/** The mark alone. Decorative when a name sits beside it (the default); pass `labelled` when it stands alone. */
export function ModelLogo({ family, className, labelled = false }: { family: ModelFamily; className?: string; labelled?: boolean }) {
  const file = FILES[family];
  const alt = labelled ? file.maker : "";
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a small local SVG, drawn as published */}
      <img src={file.light} alt={alt} aria-hidden={labelled ? undefined : true} className={cn("size-3.5 shrink-0", file.dark && "dark:hidden", className)} />
      {file.dark ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small local SVG, drawn as published
        <img src={file.dark} alt={alt} aria-hidden={labelled ? undefined : true} className={cn("hidden size-3.5 shrink-0 dark:block", className)} />
      ) : null}
    </>
  );
}

/**
 * Which model did this, as its mark and plain name. Renders nothing when no model was recorded, so work
 * from before models were recorded shows no mark rather than a guess.
 */
export function ModelMark({ model, className, prefix }: { model: ModelMarkData | null | undefined; className?: string; prefix?: string }) {
  if (!model) return null;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)} title={`Made with ${model.name}`}>
      <ModelLogo family={model.family} />
      <span className="truncate">
        {prefix ? <span className="sr-only sm:not-sr-only">{prefix} </span> : <span className="sr-only">Made with </span>}
        {model.name}
      </span>
    </span>
  );
}
