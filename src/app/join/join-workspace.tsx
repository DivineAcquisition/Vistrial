"use client";

import { Authenticated, Unauthenticated, useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useConvexReady } from "@/components/providers/convex-ready";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { describeError } from "@/lib/errors/user-error";
import { api } from "../../../convex/_generated/api";

/** Where an invite link lands: sign in with the invited email, then join the workspace in one click. */
export function JoinWorkspace() {
  const ready = useConvexReady();
  const token = useSearchParams().get("token") ?? "";
  const back = `/join?token=${encodeURIComponent(token)}`;
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-md content-center gap-4 px-4 py-10">
      <Panel className="grid gap-4 p-6">
        <h1 className="font-heading text-xl text-foreground">Join a Vistrial workspace</h1>
        {!token ? (
          <p className="text-sm text-muted-foreground">This link is missing its invite. Ask the owner to send it again.</p>
        ) : !ready ? (
          <p className="text-sm text-muted-foreground">Sign-in is not available here.</p>
        ) : (
          <>
            <Unauthenticated>
              <p className="text-sm text-muted-foreground">Sign in, or create an account, with the email the invite was sent to.</p>
              <div className="flex flex-wrap gap-2">
                <Button render={<a href={`/sign-in?redirect_url=${encodeURIComponent(back)}`} />}>Sign in</Button>
                <Button variant="outline" render={<a href={`/sign-up?redirect_url=${encodeURIComponent(back)}`} />}>
                  Create an account
                </Button>
              </div>
            </Unauthenticated>
            <Authenticated>
              <Accept token={token} />
            </Authenticated>
          </>
        )}
      </Panel>
    </main>
  );
}

function Accept({ token }: { token: string }) {
  const accept = useMutation(api.workspace.acceptInvite);
  const router = useRouter();
  const [problem, setProblem] = useState("");
  const [working, setWorking] = useState(false);
  return (
    <>
      <p className="text-sm text-muted-foreground">You were invited to an organization. Joining gives you the role the owner chose.</p>
      <Button
        loading={working}
        loadingLabel="Joining"
        onClick={async () => {
          setWorking(true);
          setProblem("");
          try {
            await accept({ token });
            router.replace("/app");
          } catch (error) {
            setProblem(describeError(error, "That invite did not work.").message);
            setWorking(false);
          }
        }}
      >
        Join workspace
      </Button>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </>
  );
}
