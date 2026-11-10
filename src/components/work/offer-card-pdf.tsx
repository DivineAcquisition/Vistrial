import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { GUARANTEE_WORDS, itemText, type OfferContent } from "../../../convex/lib/offerCards";

const INK = "#16151f";
const MUTED = "#6b6a78";
const BRAND = "#7e67f2";
const TINT = "#f5f3ff";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, color: INK, fontFamily: "Helvetica" },
  card: { borderWidth: 1.5, borderColor: BRAND, borderRadius: 16, padding: 28 },
  eyebrow: { fontSize: 8, letterSpacing: 1.6, color: MUTED, textTransform: "uppercase" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  name: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 4, maxWidth: 300 },
  outcome: { fontSize: 11, marginTop: 6, maxWidth: 300 },
  price: { fontSize: 24, fontFamily: "Helvetica-Bold" },
  version: { fontSize: 8, color: MUTED, textAlign: "right", marginTop: 2 },
  label: { fontSize: 9, color: MUTED, marginBottom: 6 },
  item: { flexDirection: "row", marginBottom: 4 },
  tick: { color: BRAND, width: 14, fontFamily: "Helvetica-Bold" },
  boxes: { flexDirection: "row", gap: 12, marginTop: 18 },
  box: { flex: 1, backgroundColor: TINT, borderRadius: 10, padding: 12 },
  terms: { marginTop: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e6e3f5", fontSize: 10 },
  missing: { color: MUTED, fontFamily: "Helvetica-Oblique" },
});

function Value({ text }: { text: string }) {
  return text ? <Text>{text}</Text> : <Text style={styles.missing}>Not stated</Text>;
}

/** The offer card as a one-page PDF. Text only, so it prints sharp and stays small. */
export function OfferCardPdf({ offer, version }: { offer: OfferContent; version?: number }) {
  return (
    <Document title={offer.name || "Offer"}>
      <Page size="A4" style={styles.page}>
        <View style={styles.card}>
          <View style={styles.top}>
            <View>
              <Text style={styles.eyebrow}>Offer</Text>
              <Text style={styles.name}>{offer.name || "Not stated"}</Text>
              {offer.outcome ? <Text style={styles.outcome}>{offer.outcome}</Text> : null}
            </View>
            <View>
              <Text style={styles.price}>{offer.price || "Not stated"}</Text>
              {offer.pricing?.was ? <Text style={styles.version}>Was {offer.pricing.was}</Text> : null}
              {version ? <Text style={styles.version}>Version {version}</Text> : null}
            </View>
          </View>
          <Text style={styles.label}>What&apos;s included</Text>
          {offer.included.length ? (
            (offer.items.length ? offer.items.map(itemText) : offer.included).map((item) => (
              <View key={item} style={styles.item}>
                <Text style={styles.tick}>•</Text>
                <Text>{item}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.missing}>Not stated</Text>
          )}
          {offer.bonuses.length ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Bonuses</Text>
              {offer.bonuses.map((bonus) => (
                <View key={bonus} style={styles.item}>
                  <Text style={styles.tick}>+</Text>
                  <Text>{bonus}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.boxes}>
            <View style={styles.box}>
              <Text style={styles.label}>{offer.guaranteeType ? GUARANTEE_WORDS[offer.guaranteeType] : "Guarantee"}</Text>
              <Value text={offer.guarantee} />
            </View>
            <View style={styles.box}>
              <Text style={styles.label}>For</Text>
              <Value text={offer.targetCustomer} />
            </View>
          </View>
          <View style={styles.terms}>
            <Text>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Terms: </Text>
              {offer.terms || "Not stated"}
            </Text>
            {offer.cta || offer.channel ? <Text style={{ marginTop: 6 }}>{[offer.cta && `Call to action: ${offer.cta}`, offer.channel && `Channel: ${offer.channel}`].filter(Boolean).join("  ·  ")}</Text> : null}
          </View>
        </View>
      </Page>
    </Document>
  );
}
