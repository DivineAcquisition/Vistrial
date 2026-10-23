import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { bodyText } from "@/lib/ui";

import { clearSetupDone, markSetupDone, setupIsDone } from "./actions";

const steps = [
  { title: "Connect your tools", detail: "Email and calendar first. Nothing is connected." },
  { title: "Pick which agents to turn on", detail: "All six are off. Turning one on comes later." },
  { title: "Go live", detail: "No agent runs, and nothing is sent." },
];

export default async function DecisionsPage() {
  const done = await setupIsDone();

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6">
      <PageHeader
        eyebrow={done ? "Today" : "First sign-in"}
        title={done ? "Decisions" : "Set up the workspace"}
        description={
          done
            ? "Nothing waiting. Here is your day."
            : "Connect your tools, choose agents, then go live. Nothing runs until you do."
        }
      />
      {done ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
          <Panel className="p-6">
            <h2 className="font-heading text-base text-card-foreground">Waiting on you</h2>
            <p className={`${bodyText} mt-3`}>Nothing waiting. Compass suggests calling these 3 warm leads today.</p>
            <form action={clearSetupDone} className="mt-6">
              <Button type="submit" variant="ghost">
                Show the setup path
              </Button>
            </form>
          </Panel>
          <div className="grid gap-4">
            <Panel className="p-6">
              <h2 className="font-heading text-base text-card-foreground">Due now</h2>
              <p className={`${bodyText} mt-3`}>Nothing due.</p>
            </Panel>
            <Panel className="p-6">
              <h2 className="font-heading text-base text-card-foreground">Work next</h2>
              <p className={`${bodyText} mt-3`}>Nothing queued.</p>
            </Panel>
          </div>
        </div>
      ) : (
        <Panel className="p-6">
          <ol className="grid gap-5">
            {steps.map((step, index) => (
              <li key={step.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-medium text-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-card-foreground">{step.title}</p>
                  <p className={`${bodyText} mt-1`}>{step.detail}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Not connected</p>
                </div>
              </li>
            ))}
          </ol>
          <form action={markSetupDone} className="mt-8">
            <Button type="submit">Mark setup done</Button>
            <p className={`${bodyText} mt-3`}>
              Sign-in comes next. This switch is saved on this browser until a workspace exists.
            </p>
          </form>
        </Panel>
      )}
    </div>
  );
}
