import { describe, expect, it } from "vitest";

import { embedShape, embedUrl } from "@/lib/research/embeds";

describe("official embeds", () => {
  it("builds each platform's own player from a safe id", () => {
    expect(embedUrl({ provider: "youtube", id: "dQw4w9WgXcQ" }, "video")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(embedUrl({ provider: "tiktok", id: "6718335390845095173" }, "short")).toBe("https://www.tiktok.com/player/v1/6718335390845095173");
    expect(embedUrl({ provider: "instagram", id: "Cabc123xyz" }, "reel")).toBe("https://www.instagram.com/reel/Cabc123xyz/embed/");
    expect(embedUrl({ provider: "instagram", id: "Cabc123xyz" }, "post")).toBe("https://www.instagram.com/p/Cabc123xyz/embed/");
  });

  it("refuses an id that could change the address", () => {
    expect(embedUrl({ provider: "youtube", id: "x/../../evil" }, "video")).toBeNull();
    expect(embedUrl({ provider: "youtube", id: "abc?autoplay=1" }, "video")).toBeNull();
    expect(embedUrl({ provider: "tiktok", id: "not-a-number" }, "short")).toBeNull();
  });

  it("gives short vertical video a tall frame", () => {
    expect(embedShape({ provider: "tiktok", id: "1" }, "short")).toContain("9/16");
    expect(embedShape({ provider: "youtube", id: "1" }, "video")).toBe("aspect-video");
  });
});
