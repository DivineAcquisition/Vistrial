import { ForceDarkTheme } from "@/components/app/theme-toggle";

export const dynamic = "force-dynamic";

/** The auth desk is always dark, whatever theme the workspace is set to. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-svh bg-background text-foreground">
      <ForceDarkTheme />
      {children}
    </div>
  );
}
