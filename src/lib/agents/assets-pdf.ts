import { documentPdf } from "@/lib/reporting/pdf";

export async function agentAssetPdf(args: {
  title: string;
  orgName: string;
  generatedAt: string;
  version: number;
  dataBasis: string;
  sampleSize: number;
  body: string;
  verbatimFlagged: boolean;
}): Promise<Uint8Array> {
  return documentPdf({
    title: args.title,
    subtitle: args.orgName,
    stampParts: [
      args.orgName,
      `Version ${args.version}`,
      args.generatedAt.slice(0, 10),
      `Built from ${args.sampleSize} ${args.sampleSize === 1 ? "record" : "records"}`,
    ],
    summaryTitle: "What this was built from",
    summary: `${args.dataBasis} Sample size: ${args.sampleSize}.`,
    sections: [
      { title: "The work", lines: args.body.split("\n").filter(Boolean) },
      {
        title: "Prospect language",
        lines: [
          args.verbatimFlagged
            ? "Verbatim prospect language is flagged. These are real people's words from calls they did not know would be analyzed."
            : "Review verbatim prospect language before this leaves Vistrial.",
        ],
      },
    ],
  });
}
