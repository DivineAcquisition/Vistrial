"use client";

import {
  ArrowUp,
  Check,
  ChevronDown,
  Compass,
  FileImage,
  FileSpreadsheet,
  FileText,
  Gauge,
  Link2,
  Loader,
  Paperclip,
  Plug,
  Plus,
  Settings2,
  X,
  Zap,
} from "@/components/icons";
import Link from "next/link";
import { useRef, useState } from "react";

import { VistrialMark } from "@/components/brand/vistrial-mark";
import { MetaLogo } from "@/components/connections/meta-logo";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "@/components/ui/menu";
import { ModelSwitch, type ModelSwitchProps } from "@/components/models/model-switch";
import { Textarea } from "@/components/ui/textarea";
import { useCredits } from "@/lib/credits";
import { cn } from "@/lib/utils";
import { SourceIcon } from "@/components/research/source-icon";

export type ComposerMode = "thorough" | "fast";
export type ComposerAgent = { slug: string; name: string; live: boolean };
export type ComposerFile = {
  key: string;
  name: string;
  kind: "image" | "pdf" | "csv";
  status: "uploading" | "reading" | "read" | "failed";
};

export const MODE_WORDS: Record<
  ComposerMode,
  { label: string; words: string; capCents: number }
> = {
  // capCents is what a research session may cost to run in this mode; the screen shows it as credits.
  thorough: {
    label: "Thorough",
    words: "Best research quality",
    capCents: 300,
  },
  fast: {
    label: "Fast",
    words: "Quicker, about half the cost",
    capCents: 150,
  },
};

export const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "web", label: "Web" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "metaAdLibrary", label: "Meta Ad Library" },
];

const FILE_ICON = {
  image: FileImage,
  pdf: FileText,
  csv: FileSpreadsheet,
} as const;

function chip(active = false) {
  return cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
    active
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-border bg-background text-muted-foreground hover:text-foreground",
  );
}

/**
 * The chat box used everywhere: who you are talking to, the quality mode, a + menu (files, links, where to
 * look, connect an integration), and send. It holds no data of its own; every choice is handed back.
 */
export function ChatComposer({
  placeholder,
  onSubmit,
  disabled,
  footnote,
  size = "dock",
  agent,
  mode,
  model,
  sources,
  links,
  files,
  connect,
  autoFocus,
  initialText = "",
}: {
  placeholder: string;
  onSubmit: (text: string) => Promise<void>;
  disabled?: boolean;
  footnote?: React.ReactNode;
  size?: "hero" | "dock" | "compact";
  agent?: {
    value: string;
    options: ComposerAgent[];
    onChange?: (slug: string) => void;
    locked?: boolean;
  };
  mode?: {
    value: ComposerMode;
    onChange?: (mode: ComposerMode) => void;
    locked?: boolean;
  };
  /** The model switch: which model does the work this chat starts. Left out where no model can be chosen. */
  model?: ModelSwitchProps | null;
  sources?: {
    value: string[] | null;
    onChange: (value: string[] | null) => void;
  };
  links?: {
    value: string[];
    onAdd: (url: string) => void;
    onRemove: (url: string) => void;
  };
  files?: {
    value: ComposerFile[];
    onAdd: (files: File[]) => void;
    onRemove: (key: string) => void;
  };
  connect?: {
    canConnect: boolean;
    metaConnected: boolean;
    onConnectMeta: () => void;
  };
  autoFocus?: boolean;
  initialText?: string;
}) {
  const credits = useCredits();
  const [text, setText] = useState(initialText);
  const [sending, setSending] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const current = agent?.options.find((row) => row.slug === agent.value);
  const busy = disabled || sending;
  const uploading =
    files?.value.some((row) => row.status === "uploading") ?? false;

  const send = async () => {
    const value = text.trim();
    if (!value || busy || uploading) return;
    setSending(true);
    try {
      await onSubmit(value);
      setText("");
    } finally {
      setSending(false);
    }
  };

  const addLink = () => {
    const value = link.trim();
    if (!value || !links) return;
    links.onAdd(/^https?:\/\//.test(value) ? value : `https://${value}`);
    setLink("");
    setLinkOpen(false);
  };

  const focused =
    sources?.value && sources.value.length > 0 ? sources.value : null;

  return (
    <div className="grid gap-1.5">
      <div
        className={cn(
          "grid gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm transition-colors focus-within:border-primary/50",
          size === "hero" &&
            "p-3 shadow-[0_18px_50px_-30px_rgba(102,80,216,0.55)]",
        )}
      >
        {links?.value.length || files?.value.length ? (
          <div className="flex flex-wrap gap-1.5 px-1 pt-1">
            {files?.value.map((file) => {
              const Icon = FILE_ICON[file.kind];
              return (
                <span
                  key={file.key}
                  className="inline-flex max-w-56 items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-xs"
                >
                  {file.status === "uploading" || file.status === "reading" ? (
                    <Loader
                      aria-label={
                        file.status === "uploading" ? "Uploading" : "Reading"
                      }
                      className="size-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                    />
                  ) : (
                    <Icon
                      aria-hidden
                      className={cn(
                        "size-3.5 shrink-0",
                        file.status === "failed"
                          ? "text-destructive"
                          : "text-primary",
                      )}
                    />
                  )}
                  <span className="truncate">{file.name}</span>
                  {file.status === "failed" ? (
                    <span className="text-destructive">could not read</span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => files.onRemove(file.key)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              );
            })}
            {links?.value.map((url) => (
              <span
                key={url}
                className="inline-flex max-w-56 items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-xs"
              >
                <Link2 aria-hidden className="size-3.5 shrink-0 text-primary" />
                <span className="truncate">
                  {url.replace(/^https?:\/\//, "")}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${url}`}
                  onClick={() => links.onRemove(url)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <label className="sr-only" htmlFor={`composer-${size}`}>
          {placeholder}
        </label>
        <Textarea
          id={`composer-${size}`}
          rows={size === "hero" ? 3 : 1}
          autoFocus={autoFocus}
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={placeholder}
          className={cn(
            "min-h-10 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0",
            size === "hero" && "text-base",
          )}
        />

        {linkOpen && links ? (
          <form
            className="flex items-center gap-2 px-1"
            onSubmit={(event) => {
              event.preventDefault();
              addLink();
            }}
          >
            <label className="sr-only" htmlFor={`composer-link-${size}`}>
              Link
            </label>
            <input
              id={`composer-link-${size}`}
              autoFocus
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="Paste a competitor page, video or ad link"
              className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/50"
            />
            <Button type="submit" size="sm" variant="outline">
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setLinkOpen(false)}
            >
              Cancel
            </Button>
          </form>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          {links || files || sources || connect ? (
            <Menu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="Add"
                    className={cn(chip(), "w-8 justify-center px-0")}
                  />
                }
              >
                <Plus aria-hidden className="size-4" />
              </MenuTrigger>
              <MenuPopup align="start" className="min-w-60">
                {files ? (
                  <MenuItem onClick={() => fileInput.current?.click()}>
                    <Paperclip aria-hidden /> Add images, PDFs or CSVs
                  </MenuItem>
                ) : null}
                {links ? (
                  <MenuItem onClick={() => setLinkOpen(true)}>
                    <Link2 aria-hidden /> Add a link
                  </MenuItem>
                ) : null}
                {sources ? (
                  <MenuSub>
                    <MenuSubTrigger>
                      <Compass aria-hidden /> Where to look
                    </MenuSubTrigger>
                    <MenuSubPopup className="min-w-56">
                      <MenuCheckboxItem
                        checked={!focused}
                        onCheckedChange={() => sources.onChange(null)}
                      >
                        Everywhere (until it learns)
                      </MenuCheckboxItem>
                      <MenuSeparator />
                      <MenuGroup>
                        <MenuGroupLabel>Focus on</MenuGroupLabel>
                        {SOURCE_OPTIONS.map((option) => (
                          <MenuCheckboxItem
                            key={option.value}
                            checked={focused?.includes(option.value) ?? false}
                            onCheckedChange={(checked: boolean) => {
                              const base = focused ?? [];
                              const next = checked
                                ? [...base, option.value]
                                : base.filter(
                                    (value) => value !== option.value,
                                  );
                              sources.onChange(next.length ? next : null);
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <SourceIcon platform={option.value} size={14} />
                              {option.label}
                            </span>
                          </MenuCheckboxItem>
                        ))}
                      </MenuGroup>
                    </MenuSubPopup>
                  </MenuSub>
                ) : null}
                {connect ? (
                  <>
                    <MenuSeparator />
                    <MenuGroup>
                      <MenuGroupLabel>Connect an integration</MenuGroupLabel>
                      <MenuItem
                        disabled={!connect.canConnect || connect.metaConnected}
                        onClick={connect.onConnectMeta}
                      >
                        <MetaLogo className="h-3.5 w-4" /> Meta ads
                        <span className="ml-auto text-xs text-muted-foreground">
                          {connect.metaConnected
                            ? "Connected"
                            : connect.canConnect
                              ? "Connect"
                              : "Owner only"}
                        </span>
                      </MenuItem>
                      <MenuItem render={<Link href="/app/settings?section=data" />}>
                        <Settings2 aria-hidden /> Manage connections
                      </MenuItem>
                    </MenuGroup>
                  </>
                ) : null}
              </MenuPopup>
            </Menu>
          ) : null}

          {agent ? (
            <Menu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    disabled={agent.locked}
                    className={chip()}
                  />
                }
              >
                <VistrialMark size="xs" />
                <span className="max-w-36 truncate text-foreground">
                  {current?.name ?? "Agent"}
                </span>
                {agent.locked ? null : (
                  <ChevronDown aria-hidden className="size-3" />
                )}
              </MenuTrigger>
              <MenuPopup align="start" className="min-w-56">
                <MenuGroup>
                  <MenuGroupLabel>Talk to</MenuGroupLabel>
                  {agent.options.map((option) => (
                    <MenuItem
                      key={option.slug}
                      disabled={!option.live}
                      onClick={() => agent.onChange?.(option.slug)}
                    >
                      {option.slug === agent.value ? (
                        <Check aria-hidden />
                      ) : (
                        <span className="size-4" />
                      )}
                      {option.name}
                      {!option.live ? (
                        <span className="ml-auto text-xs text-muted-foreground">
                          Coming soon
                        </span>
                      ) : null}
                    </MenuItem>
                  ))}
                </MenuGroup>
              </MenuPopup>
            </Menu>
          ) : null}

          {mode ? (
            <Menu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    disabled={mode.locked}
                    className={chip(mode.value === "fast")}
                  />
                }
              >
                {mode.value === "fast" ? (
                  <Zap aria-hidden className="size-3.5" />
                ) : (
                  <Gauge aria-hidden className="size-3.5" />
                )}
                {MODE_WORDS[mode.value].label}
                {mode.locked ? null : (
                  <ChevronDown aria-hidden className="size-3" />
                )}
              </MenuTrigger>
              <MenuPopup align="start" className="min-w-64">
                <MenuGroup>
                  <MenuGroupLabel>Quality</MenuGroupLabel>
                  {(Object.keys(MODE_WORDS) as ComposerMode[]).map((key) => (
                    <MenuItem
                      key={key}
                      onClick={() => mode.onChange?.(key)}
                      className="items-start"
                    >
                      {key === mode.value ? (
                        <Check aria-hidden className="mt-0.5" />
                      ) : (
                        <span className="size-4" />
                      )}
                      <span className="grid gap-0.5">
                        <span className="flex items-baseline gap-2">
                          {MODE_WORDS[key].label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {MODE_WORDS[key].words} · research up to{" "}
                          {credits.cost(MODE_WORDS[key].capCents)}
                        </span>
                      </span>
                    </MenuItem>
                  ))}
                </MenuGroup>
              </MenuPopup>
            </Menu>
          ) : null}

          {model ? <ModelSwitch {...model} mode={mode?.value ?? model.mode} /> : null}

          {focused && sources ? (
            <button
              type="button"
              className={chip(true)}
              onClick={() => sources.onChange(null)}
              aria-label="Search everywhere instead"
            >
              {focused.length === 1 ? <SourceIcon platform={focused[0]} size={14} /> : <Compass aria-hidden className="size-3.5" />}
              <span className="max-w-40 truncate">
                {focused
                  .map(
                    (value) =>
                      SOURCE_OPTIONS.find((row) => row.value === value)
                        ?.label ?? value,
                  )
                  .join(", ")}
              </span>
              <X aria-hidden className="size-3" />
            </button>
          ) : null}

          {connect && !connect.metaConnected && connect.canConnect ? (
            <button
              type="button"
              className={cn(chip(), "hidden sm:inline-flex")}
              onClick={connect.onConnectMeta}
            >
              <Plug aria-hidden className="size-3.5" /> Connect Meta ads
            </button>
          ) : null}

          <Button
            type="button"
            size="icon"
            className="ml-auto"
            aria-label="Send"
            loading={sending}
            disabled={!text.trim() || busy || uploading}
            onClick={() => void send()}
          >
            <ArrowUp aria-hidden className="size-4" />
          </Button>
        </div>
        {files ? (
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/csv,.csv"
            onChange={(event) => {
              const picked = [...(event.target.files ?? [])];
              if (picked.length) files.onAdd(picked);
              event.target.value = "";
            }}
          />
        ) : null}
      </div>
      {footnote ? (
        <p className="px-1 text-[11px] text-muted-foreground">{footnote}</p>
      ) : null}
    </div>
  );
}
