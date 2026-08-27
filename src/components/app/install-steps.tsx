import { INSTALL_PLATFORMS, INSTALL_WHY } from "@/lib/mobile/install-copy";
import { Kbd } from "@/components/ui/kbd";
import { helperClass } from "@/lib/ui";

function stepWithKeys(platform: string, step: string) {
  if (platform === "iPhone" && step.startsWith("Tap Share")) {
    return (
      <>
        Tap <Kbd>Share</Kbd>, then Add to Home Screen.
      </>
    );
  }
  if (platform === "Android" && step.startsWith("Tap the menu")) {
    return (
      <>
        Tap the menu, then <Kbd>Install app</Kbd> or Add to Home Screen.
      </>
    );
  }
  return step;
}

export function InstallSteps({ why = true }: { why?: boolean }) {
  return (
    <div className="space-y-3">
      {why ? <p className={helperClass}>{INSTALL_WHY}</p> : null}
      <ol className="list-decimal space-y-3 pl-5 text-sm">
        {INSTALL_PLATFORMS.map((item) => (
          <li key={item.platform}>
            <p className="font-medium text-[var(--da-text-primary)] text-white">{item.platform}</p>
            <ol className="mt-1 list-disc space-y-1 pl-4 text-[var(--da-text-secondary)] text-silver">
              {item.steps.map((step) => (
                <li key={step}>{stepWithKeys(item.platform, step)}</li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
