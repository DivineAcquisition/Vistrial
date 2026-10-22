"use client";

import { EllipsisVertical, Plus } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export type CourseColor = "green" | "orange" | "red" | "blue" | "violet";

export interface CardData {
  id: string | number;
  colorClass: CourseColor;
  date: string;
  title: string;
  description: string;
  /** Width of the meter, e.g. "90%". */
  progressPercent: string;
  /** Figure shown under the bar. */
  progressValue: string;
  imgSrc1?: string;
  imgAlt1?: string;
  imgSrc2?: string;
  imgAlt2?: string;
  countdownText: string;
  /** Accessible name for the countdown control when it does more than its visible label. */
  countdownLabel?: string;
  /** Where the menu and add controls go. */
  href?: string;
  /** Where the countdown goes when it is a link. */
  countdownHref?: string;
  /** Accessible name for the card hit target. */
  selectLabel?: string;
}

interface CardProps {
  data: CardData;
  selected?: boolean;
  onSelect?: () => void;
  onCountdown?: () => void;
}

function progressWidth(value: string): string {
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) return trimmed;
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? `${amount}%` : "0%";
}

function progressNumber(value: string): number {
  const amount = Number.parseInt(progressWidth(value), 10);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.min(100, amount));
}

function Portrait({ src, alt }: { src: string; alt: string }) {
  return (
    // Fixed-size remote portraits. The optimizer is not configured for these hosts.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={30} height={30} />
  );
}

const EllipsisIcon = () => <EllipsisVertical aria-hidden className="size-6" />;
const AddIcon = () => <Plus aria-hidden className="size-4" />;

function ProgressMeter({ data }: { data: CardData }) {
  const percent = progressNumber(data.progressPercent);
  return (
    <div className="progress">
      <span>Progress</span>
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={data.progressValue}
        aria-label={`${data.title} progress`}
      />
      <span>{data.progressValue}</span>
    </div>
  );
}

function Card({ data, selected, onSelect, onCountdown }: CardProps) {
  const width = progressWidth(data.progressPercent);
  const openLabel = `Open ${data.title}`;

  return (
    <article
      className={cn("card", data.colorClass, selected && "is-selected")}
      style={{ "--course-progress": width } as CSSProperties}
    >
      {onSelect ? (
        <button
          type="button"
          className="card-hit"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={
            data.selectLabel ??
            `${selected ? "Showing" : "Show"} ${data.title}. ${data.description} Progress ${data.progressValue}.`
          }
        />
      ) : null}
      <div className="card-header">
        <div className="date">{data.date}</div>
        {data.href ? (
          <Link href={data.href} className="card-more" aria-label={`More about ${data.title}`}>
            <EllipsisIcon />
          </Link>
        ) : (
          <EllipsisIcon />
        )}
      </div>
      <div className="card-body">
        <h3>{data.title}</h3>
        <p title={data.description}>{data.description}</p>
        <ProgressMeter data={data} />
      </div>
      <div className="card-footer">
        <ul>
          {data.imgSrc1 ? (
            <li>
              <Portrait src={data.imgSrc1} alt={data.imgAlt1 || ""} />
            </li>
          ) : null}
          {data.imgSrc2 ? (
            <li>
              <Portrait src={data.imgSrc2} alt={data.imgAlt2 || ""} />
            </li>
          ) : null}
          <li>
            {data.href ? (
              <Link href={data.href} className="btn-add" aria-label={openLabel}>
                <AddIcon />
              </Link>
            ) : (
              <span className="btn-add" aria-hidden>
                <AddIcon />
              </span>
            )}
          </li>
        </ul>
        {onCountdown ? (
          <button type="button" className="btn-countdown" onClick={onCountdown} aria-label={data.countdownLabel ?? data.countdownText}>
            {data.countdownText}
          </button>
        ) : data.countdownHref ? (
          <Link href={data.countdownHref} className="btn-countdown" aria-label={data.countdownLabel ?? data.countdownText}>
            {data.countdownText}
          </Link>
        ) : (
          <span className="btn-countdown">{data.countdownText}</span>
        )}
      </div>
    </article>
  );
}

export default Card;
