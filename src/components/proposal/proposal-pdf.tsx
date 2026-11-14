import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { ProposalPageData } from "./proposal-public";

// Titles and names break between words, never inside one.
Font.registerHyphenationCallback((word) => [word]);

const INK = "#16151f";
const MUTED = "#6b6a78";
const LINE = "#e6e3f5";

const styles = StyleSheet.create({
  page: { paddingTop: 52, paddingBottom: 60, paddingHorizontal: 52, fontSize: 10.5, color: INK, fontFamily: "Helvetica", lineHeight: 1.5 },
  business: { fontSize: 9, letterSpacing: 1.6, textTransform: "uppercase", color: MUTED },
  title: { fontSize: 24, fontFamily: "Helvetica-Bold", lineHeight: 1.2, marginTop: 8, marginBottom: 14 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 6 },
  muted: { color: MUTED },
  card: { borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 14, marginTop: 14 },
  price: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 10 },
  item: { flexDirection: "row", gap: 6, marginBottom: 3 },
  bullet: { width: 12, color: MUTED },
  footer: { position: "absolute", bottom: 28, left: 52, right: 52, fontSize: 8, color: MUTED },
});

function List({ items, numbered = false }: { items: string[]; numbered?: boolean }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={`${i}-${item}`} style={styles.item} wrap={false}>
          <Text style={styles.bullet}>{numbered ? `${i + 1}.` : "•"}</Text>
          <Text style={{ flex: 1 }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** The proposal as a PDF, in the business's name. Made in the lead's browser from the page they opened. */
export function ProposalPdf({ proposal }: { proposal: ProposalPageData }) {
  return (
    <Document title={proposal.title} author={proposal.business}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.business}>{proposal.business}</Text>
        <Text style={styles.title}>{proposal.title}</Text>
        <Text>{proposal.intro}</Text>
        {proposal.needs.length ? (
          <>
            <Text style={styles.h2}>What you told us</Text>
            <List items={proposal.needs} />
          </>
        ) : null}
        <View style={styles.card} wrap={false}>
          <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}>{proposal.package.title}</Text>
          {proposal.package.body ? <Text style={[styles.muted, { marginTop: 4 }]}>{proposal.package.body}</Text> : null}
          <Text style={[styles.h2, { marginTop: 10 }]}>What is included</Text>
          <List items={proposal.deliverables} />
          <Text style={styles.price}>{proposal.price.title}</Text>
          {proposal.price.body ? <Text style={styles.muted}>{proposal.price.body}</Text> : null}
        </View>
        {proposal.guarantee ? (
          <>
            <Text style={styles.h2}>Our guarantee</Text>
            <Text>{proposal.guarantee.title}</Text>
            {proposal.guarantee.body ? <Text style={styles.muted}>{proposal.guarantee.body}</Text> : null}
          </>
        ) : null}
        {proposal.proof.length ? (
          <>
            <Text style={styles.h2}>Results for others</Text>
            <List items={proposal.proof.map((row) => (row.body ? `${row.title}: ${row.body}` : row.title))} />
          </>
        ) : null}
        <Text style={styles.h2}>Next steps</Text>
        <List items={proposal.nextSteps} numbered />
        <Text style={{ marginTop: 12 }}>{proposal.closing}</Text>
        <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `${proposal.business} · Proposal for ${proposal.leadName} · ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}
