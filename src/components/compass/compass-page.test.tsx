import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CompassPage } from "@/components/compass/compass-page";

describe("Compass page render", () => {
  it("renders the empty conversation without throwing", () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    const html = renderToString(
      <CompassPage
        rows={[]}
        initial={{ conversationId: null, messages: [], legacy: false, context: { kind: "none" } }}
        starters={[{ question: "Which hot leads have not been contacted?" }]}
        pins={[]}
        staffNote={null}
        prefill={null}
      />,
    );
    console.error = original;
    expect(errors.join("\n")).not.toContain("getSnapshot should be cached");
    expect(html).toContain("Ask about your leads");
  });
});
