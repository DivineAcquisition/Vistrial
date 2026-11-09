import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { describeError, readUserError } from "@/lib/errors/user-error";

describe("errors shown to people", () => {
  it("reads the code and message a server sends as ConvexError data", () => {
    const problem = new ConvexError({ code: "out_of_credits", message: "Your credit balance is empty." });
    expect(readUserError(problem)).toEqual({ code: "out_of_credits", message: "Your credit balance is empty." });
    expect(describeError(problem, "fallback")).toEqual({ code: "out_of_credits", message: "Your credit balance is empty." });
  });

  it("treats an unknown code as invalid, but keeps the message", () => {
    expect(readUserError(new ConvexError({ code: "weird", message: "Pick one." }))).toEqual({ code: "invalid", message: "Pick one." });
  });

  it("never shows production's masked text, a request id, or a stack", () => {
    const masked = new Error("[CONVEX M(intake:create)] [Request ID: 36b3e7cc0ee3303f] Server Error");
    expect(describeError(masked, "That did not start.")).toEqual({ code: "unexpected", message: "That did not start." });
    expect(describeError("boom", "That did not start.").message).toBe("That did not start.");
  });

  it("keeps a plain error's first line in development", () => {
    const local = new Error("[CONVEX M(x:y)] [Request ID: 1] Server Error Uncaught Error: Name the workspace.\n    at handler (x.ts:1)");
    expect(describeError(local, "fallback")).toEqual({ code: "unexpected", message: "Name the workspace." });
  });
});
