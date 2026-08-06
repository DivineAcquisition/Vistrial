"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  closePortalUserAction,
  createShareLinkAction,
  inviteClientUserAction,
  revokeShareLinkAction,
  spreadAdSpendAction,
  upsertAdSpendAction,
} from "@/lib/actions/portal";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import {
  btnPrimary,
  btnSecondary,
  btnSizeSm,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";
import type { AdSpend, Campaign, ClientUser, ShareLink, ShareLinkView } from "@/types/database";

type ShareRow = ShareLink & { views: ShareLinkView[] | null };

export function PortalPanel({
  clientId,
  users,
  links,
  spend,
  campaigns,
}: {
  clientId: string;
  users: ClientUser[];
  links: ShareRow[];
  spend: AdSpend[];
  campaigns: Campaign[];
}) {
  return (
    <div className="space-y-10">
      <InviteSection clientId={clientId} users={users} />
      <AdSpendSection clientId={clientId} spend={spend} campaigns={campaigns} />
      <ShareSection clientId={clientId} links={links} />
    </div>
  );
}

function InviteSection({
  clientId,
  users,
}: {
  clientId: string;
  users: ClientUser[];
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white">Portal accounts</h3>
        <p className={helperClass}>
          Invite-only. There is no public signup. An authenticated user with no
          portal row is treated as an administrator.
        </p>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            const result = await inviteClientUserAction({
              client_id: clientId,
              name,
              email,
            });
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success(`Invitation sent to ${result.data.email}.`);
            setName("");
            setEmail("");
          });
        }}
      >
        <div>
          <label className={labelClass} htmlFor="invite-name">
            Name
          </label>
          <input
            id="invite-name"
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="invite-email">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            className={inputClass}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className={`${btnPrimary} ${btnSizeSm}`}
          >
            {pending ? "Sending…" : "Invite"}
          </button>
        </div>
      </form>

      {users.length === 0 ? (
        <p className="text-sm text-dim">No portal users yet.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05] rounded-xl border border-border">
          {users.map((user) => (
            <li
              key={user.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="text-white">
                  {user.name}{" "}
                  <span className="text-dim">· {user.email}</span>
                </p>
                <p className="text-xs text-dim">
                  {user.status}
                  {user.accepted_at
                    ? ` · accepted ${formatDateTime(user.accepted_at)}`
                    : ` · invited ${formatDateTime(user.invited_at)}`}
                </p>
              </div>
              {user.status !== "closed" ? (
                <button
                  type="button"
                  className={`${btnSecondary} ${btnSizeSm}`}
                  onClick={() =>
                    start(async () => {
                      const result = await closePortalUserAction({ id: user.id });
                      if (!result.ok) toast.error(result.error);
                      else toast.success("Portal access closed.");
                    })
                  }
                >
                  Close access
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AdSpendSection({
  clientId,
  spend,
  campaigns,
}: {
  clientId: string;
  spend: AdSpend[];
  campaigns: Campaign[];
}) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"day" | "range">("day");
  const [spendDate, setSpendDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [amount, setAmount] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [note, setNote] = useState("");

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white">Ad spend</h3>
        <p className={helperClass}>
          A day with no row is unknown, not zero. Re-entering a day replaces the
          amount. Spread a total across a range when the platform only reports a
          period.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className={`${mode === "day" ? btnPrimary : btnSecondary} ${btnSizeSm}`}
          onClick={() => setMode("day")}
        >
          One day
        </button>
        <button
          type="button"
          className={`${mode === "range" ? btnPrimary : btnSecondary} ${btnSizeSm}`}
          onClick={() => setMode("range")}
        >
          Spread range
        </button>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            const result =
              mode === "day"
                ? await upsertAdSpendAction({
                    client_id: clientId,
                    spend_date: spendDate,
                    amount: Number(amount),
                    campaign_id: campaignId || null,
                    note,
                  })
                : await spreadAdSpendAction({
                    client_id: clientId,
                    start: startDate,
                    end: endDate,
                    total: Number(amount),
                    campaign_id: campaignId || null,
                    note,
                  });
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success("Ad spend saved.");
            setAmount("");
            setNote("");
          });
        }}
      >
        {mode === "day" ? (
          <div>
            <label className={labelClass} htmlFor="spend-date">
              Date
            </label>
            <input
              id="spend-date"
              type="date"
              className={inputClass}
              value={spendDate}
              onChange={(event) => setSpendDate(event.target.value)}
              required
            />
          </div>
        ) : (
          <>
            <div>
              <label className={labelClass} htmlFor="spend-start">
                From
              </label>
              <input
                id="spend-start"
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="spend-end">
                To
              </label>
              <input
                id="spend-end"
                type="date"
                className={inputClass}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </div>
          </>
        )}
        <div>
          <label className={labelClass} htmlFor="spend-amount">
            {mode === "day" ? "Amount" : "Total to spread"}
          </label>
          <input
            id="spend-amount"
            type="number"
            min="0"
            step="0.01"
            className={inputClass}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="spend-campaign">
            Campaign (optional)
          </label>
          <select
            id="spend-campaign"
            className={inputClass}
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
          >
            <option value="">Client total for the day</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="spend-note">
            Note
          </label>
          <input
            id="spend-note"
            className={inputClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <div>
          <button
            type="submit"
            disabled={pending}
            className={`${btnPrimary} ${btnSizeSm}`}
          >
            {pending ? "Saving…" : "Save spend"}
          </button>
        </div>
      </form>

      {spend.length === 0 ? (
        <p className="text-sm text-dim">No spend entered yet.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05] rounded-xl border border-border">
          {spend.slice(0, 30).map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="text-white">{formatDay(row.spend_date)}</p>
                <p className="text-xs text-dim">
                  {row.entered_by_label ?? "Unknown"}
                  {row.note ? ` · ${row.note}` : null}
                </p>
              </div>
              <p className="tabular-nums text-white">{formatMoney(row.amount)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ShareSection({
  clientId,
  links,
}: {
  clientId: string;
  links: ShareRow[];
}) {
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("14");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white">Share links</h3>
        <p className={helperClass}>
          Time-limited, revocable, view-only. The raw token is shown once when
          the link is created.
        </p>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-[1fr_8rem_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            const result = await createShareLinkAction({
              client_id: clientId,
              label,
              days: Number(days),
            });
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            setCreatedUrl(result.data.url);
            toast.success("Share link created.");
            setLabel("");
          });
        }}
      >
        <div>
          <label className={labelClass} htmlFor="share-label">
            Label
          </label>
          <input
            id="share-label"
            className={inputClass}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="share-days">
            Days
          </label>
          <input
            id="share-days"
            type="number"
            min={1}
            max={90}
            className={inputClass}
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className={`${btnPrimary} ${btnSizeSm}`}
          >
            {pending ? "Creating…" : "Create link"}
          </button>
        </div>
      </form>

      {createdUrl ? (
        <p className="break-all rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 font-mono text-xs text-brand-200">
          {createdUrl}
        </p>
      ) : null}

      {links.length === 0 ? (
        <p className="text-sm text-dim">No share links yet.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05] rounded-xl border border-border">
          {links.map((link) => {
            const views = link.views?.length ?? 0;
            const revoked = link.revoked_at !== null;
            const expired = Date.parse(link.expires_at) <= Date.now();
            return (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="text-white">{link.label || "Untitled link"}</p>
                  <p className="text-xs text-dim">
                    {revoked
                      ? `Revoked ${formatDateTime(link.revoked_at!)}`
                      : expired
                        ? `Expired ${formatDateTime(link.expires_at)}`
                        : `Expires ${formatDateTime(link.expires_at)}`}
                    {` · ${views} view${views === 1 ? "" : "s"}`}
                  </p>
                </div>
                {!revoked && !expired ? (
                  <button
                    type="button"
                    className={`${btnSecondary} ${btnSizeSm}`}
                    onClick={() =>
                      start(async () => {
                        const result = await revokeShareLinkAction({ id: link.id });
                        if (!result.ok) toast.error(result.error);
                        else toast.success("Share link revoked.");
                      })
                    }
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
