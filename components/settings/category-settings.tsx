"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createCategoryAction,
  setCategoryActiveAction,
  setCrossClientWindowAction,
} from "@/lib/actions/territory";
import {
  btnPrimary,
  btnSecondary,
  btnSizeSm,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";
import type { ServiceCategory } from "@/types/database";

export function CategorySettings({
  categories,
  crossClientWindowDays,
}: {
  categories: ServiceCategory[];
  crossClientWindowDays: number;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [days, setDays] = useState(String(crossClientWindowDays));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className={helperClass}>
          Adding a category never changes existing client assignments. Conflict
          detection depends on these consistent values — never free text.
        </p>

        <ul className="divide-y divide-white/[0.05] rounded-xl border border-border">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="text-white">{category.name}</p>
                <p className="font-mono text-xs text-dim">{category.slug}</p>
              </div>
              <button
                type="button"
                className={`${btnSecondary} ${btnSizeSm}`}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await setCategoryActiveAction({
                      id: category.id,
                      active: !category.active,
                    });
                    if (!result.ok) toast.error(result.error);
                    else
                      toast.success(
                        category.active ? "Category deactivated." : "Category activated."
                      );
                  })
                }
              >
                {category.active ? "Deactivate" : "Activate"}
              </button>
            </li>
          ))}
        </ul>

        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            start(async () => {
              const result = await createCategoryAction({ name, slug });
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success("Category added.");
              setName("");
              setSlug("");
            });
          }}
        >
          <div>
            <label className={labelClass} htmlFor="cat-name">
              Name
            </label>
            <input
              id="cat-name"
              className={inputClass}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!slug) {
                  setSlug(
                    event.target.value
                      .toLowerCase()
                      .trim()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")
                  );
                }
              }}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="cat-slug">
              Slug
            </label>
            <input
              id="cat-slug"
              className={inputClass}
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              required
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className={`${btnPrimary} ${btnSizeSm}`}
            >
              Add
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Cross-client duplicate window
          </h3>
          <p className={helperClass}>
            Same phone or email at another client within this many days raises a
            flag. Neither lead is blocked.
          </p>
        </div>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            start(async () => {
              const result = await setCrossClientWindowAction({
                days: Number(days),
              });
              if (!result.ok) toast.error(result.error);
              else toast.success("Window saved.");
            });
          }}
        >
          <div>
            <label className={labelClass} htmlFor="xdup-days">
              Days
            </label>
            <input
              id="xdup-days"
              type="number"
              min={1}
              max={365}
              className={inputClass}
              value={days}
              onChange={(event) => setDays(event.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className={`${btnPrimary} ${btnSizeSm}`}
          >
            Save
          </button>
        </form>
      </section>
    </div>
  );
}
