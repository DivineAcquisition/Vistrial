import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Mark = {
  label: string;
  bg: string;
  svg: ReactNode;
};

function Icon({ children, fill = "currentColor" }: { children: ReactNode; fill?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="68%" height="68%" aria-hidden fill={fill}>
      {children}
    </svg>
  );
}

const MARKS: Record<string, Mark> = {
  gohighlevel: {
    label: "GoHighLevel",
    bg: "#F5C400",
    svg: (
      <Icon fill="#fff">
        <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v6A3.5 3.5 0 0 1 15.5 16H11l-3.2 3.2c-.6.6-1.8.2-1.8-.7V16A3.5 3.5 0 0 1 5 12.5v-6z" />
        <path d="M9.2 8.2 13.6 10 9.2 11.8V8.2z" fill="#1a1400" />
      </Icon>
    ),
  },
  leadconnector: {
    label: "GoHighLevel",
    bg: "#F5C400",
    svg: (
      <Icon fill="#fff">
        <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v6A3.5 3.5 0 0 1 15.5 16H11l-3.2 3.2c-.6.6-1.8.2-1.8-.7V16A3.5 3.5 0 0 1 5 12.5v-6z" />
        <path d="M9.2 8.2 13.6 10 9.2 11.8V8.2z" fill="#1a1400" />
      </Icon>
    ),
  },
  google_calendar: {
    label: "Google Calendar",
    bg: "#fff",
    svg: (
      <Icon fill="#1a73e8">
        <path d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5 4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z" />
      </Icon>
    ),
  },
  fathom: {
    label: "Fathom",
    bg: "#071018",
    svg: (
      <svg viewBox="0 0 24 24" width="70%" height="70%" aria-hidden>
        <rect x="3" y="4.5" width="18" height="3.4" rx="1.7" fill="#22D3EE" />
        <rect x="3" y="10.3" width="14" height="3.4" rx="1.7" fill="#22D3EE" />
        <rect x="3" y="16.1" width="9" height="3.4" rx="1.7" fill="#5EEAD4" />
      </svg>
    ),
  },
  fireflies: {
    label: "Fireflies",
    bg: "#1a1024",
    svg: (
      <svg viewBox="0 0 24 24" width="72%" height="72%" aria-hidden>
        <path d="M4 4h7.2v7.2H4z" fill="#C026D3" />
        <path d="M12.2 4H20a4 4 0 0 1 0 7.2h-7.8z" fill="#E11D48" />
        <path d="M4 12.2h7.2V20H4z" fill="#DB2777" />
        <path d="M12.2 12.2H20V20h-7.8z" fill="#F472B6" />
      </svg>
    ),
  },
  airtable: {
    label: "Airtable",
    bg: "#fff",
    svg: (
      <Icon fill="#18BFFF">
        <path d="M11.992 1.966c-.434 0-.87.086-1.28.257L1.779 5.917c-.503.208-.49.908.012 1.116l8.982 3.558a3.266 3.266 0 0 0 2.454 0l8.982-3.558c.503-.196.503-.908.012-1.116l-8.957-3.694a3.255 3.255 0 0 0-1.272-.257zM23.4 8.056a.589.589 0 0 0-.222.045l-10.012 3.877a.612.612 0 0 0-.38.564v8.896a.6.6 0 0 0 .821.552L23.62 18.1a.583.583 0 0 0 .38-.551V8.653a.6.6 0 0 0-.6-.596zM.676 8.095a.644.644 0 0 0-.48.19C.086 8.396 0 8.53 0 8.69v8.355c0 .442.515.737.908.54l6.27-3.006.307-.147 2.969-1.436c.466-.22.43-.908-.061-1.092L.883 8.138a.57.57 0 0 0-.207-.044z" />
      </Icon>
    ),
  },
  hubspot: {
    label: "HubSpot",
    bg: "#fff",
    svg: (
      <Icon fill="#FF7A59">
        <path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.193v.067a2.196 2.196 0 001.252 1.973l.013.006v2.852a6.22 6.22 0 00-2.969 1.31l.012-.01-7.828-6.095A2.497 2.497 0 104.3 4.656l-.012.006 7.697 5.991a6.176 6.176 0 00-1.038 3.446c0 1.343.425 2.588 1.147 3.607l-.013-.02-2.342 2.343a1.968 1.968 0 00-.58-.095h-.002a2.033 2.033 0 102.033 2.033 1.978 1.978 0 00-.1-.595l.005.014 2.317-2.317a6.247 6.247 0 104.782-11.134l-.036-.005zm-.964 9.378a3.206 3.206 0 113.215-3.207v.002a3.206 3.206 0 01-3.207 3.207z" />
      </Icon>
    ),
  },
  salesforce: {
    label: "Salesforce",
    bg: "#fff",
    svg: (
      <Icon fill="#00A1E0">
        <path d="M9.2 16.8c-1.7 0-3.2-.8-4.1-2.1A4.3 4.3 0 0 1 2 13.2c-2.3 0-4.1-1.8-4.1-4 0-1.8 1.2-3.3 2.8-3.8A4.6 4.6 0 0 1 5.2 2.2c1.6 0 3 .8 3.8 2.1.6-.3 1.3-.4 2-.4 2.4 0 4.4 1.8 4.7 4.1a3.7 3.7 0 0 1 2.5 3.5c0 2-1.7 3.7-3.8 3.7H9.2z" transform="translate(2 2) scale(0.82)" />
      </Icon>
    ),
  },
  outlook: {
    label: "Outlook Calendar",
    bg: "#0F6CBD",
    svg: (
      <svg viewBox="0 0 24 24" width="70%" height="70%" aria-hidden>
        <rect x="3" y="6" width="18" height="12" rx="2" fill="#fff" />
        <path d="M4 7.5 12 13l8-5.5" fill="none" stroke="#0F6CBD" strokeWidth="1.6" />
      </svg>
    ),
  },
};

export function ToolMark({
  id,
  size = 28,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const mark = MARKS[id];
  if (!mark) return null;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md", className)}
      style={{ width: size, height: size, background: mark.bg }}
      aria-hidden
    >
      {mark.svg}
    </span>
  );
}

export function hasToolMark(id: string): boolean {
  return id in MARKS;
}
