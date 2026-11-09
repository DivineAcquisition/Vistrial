import { Document, Font, Image, Link, Page, StyleSheet, Svg, Rect, Text, View } from "@react-pdf/renderer";

import type { Bar, ReportPdfModel } from "@/lib/report-pdf/model";

// Titles and names break between words, never inside one.
Font.registerHyphenationCallback((word) => [word]);

/** A4 in points. */
const A4_HEIGHT = 841.89;

const INK = "#16151f";
const MUTED = "#6b6a78";
const LINE = "#e6e3f5";
const BRAND = "#7e67f2";
const BRAND_SOFT = "#ebe7ff";
const NEUTRAL = "#3a3946";
const NEUTRAL_SOFT = "#ededf2";

const styles = StyleSheet.create({
  page: { paddingTop: 52, paddingBottom: 60, paddingHorizontal: 52, fontSize: 10, color: INK, fontFamily: "Helvetica", lineHeight: 1.45 },
  cover: { padding: 0, fontFamily: "Helvetica", color: INK },
  coverBand: { height: 300, paddingHorizontal: 56, paddingTop: 64, justifyContent: "space-between", paddingBottom: 40 },
  eyebrow: { fontSize: 8, letterSpacing: 1.8, textTransform: "uppercase", color: MUTED },
  coverBusiness: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  coverTitle: { fontSize: 30, fontFamily: "Helvetica-Bold", lineHeight: 1.15, marginTop: 10 },
  coverSub: { fontSize: 11, color: MUTED, marginTop: 10 },
  coverBody: { paddingHorizontal: 56, paddingTop: 36 },
  logo: { height: 44, maxWidth: 180, objectFit: "contain", marginBottom: 14 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 12 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 8, marginTop: 18 },
  muted: { color: MUTED },
  stats: { flexDirection: "row", gap: 10, marginVertical: 14 },
  stat: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 10 },
  statValue: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  card: { borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 12, marginBottom: 8 },
  row: { flexDirection: "row", gap: 8 },
  num: { width: 18, fontFamily: "Helvetica-Bold", color: BRAND },
  pill: { fontSize: 7.5, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6, backgroundColor: NEUTRAL_SOFT, color: NEUTRAL, alignSelf: "flex-start" },
  refs: { fontSize: 8, color: MUTED, marginTop: 4 },
  chartTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  barLabel: { width: 120, fontSize: 8.5, color: INK },
  barValue: { width: 54, fontSize: 8.5, textAlign: "right", color: MUTED },
  footer: { position: "absolute", left: 52, right: 52, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
  link: { color: BRAND, textDecoration: "none" },
});

/** One horizontal bar chart, drawn as vector shapes so it prints sharp. */
function BarChart({ title, bars, accent, format = (bar) => String(bar.value), empty }: { title: string; bars: Bar[]; accent: string; format?: (bar: Bar) => string; empty: string }) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  const width = 270;
  return (
    <View style={{ marginBottom: 16 }} wrap={false}>
      <Text style={styles.chartTitle}>{title}</Text>
      {bars.length === 0 ? (
        <Text style={styles.muted}>{empty}</Text>
      ) : (
        bars.map((bar) => (
          <View key={bar.label} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Text style={styles.barLabel}>{bar.label}</Text>
            <Svg width={width} height={10}>
              <Rect x={0} y={0} width={width} height={10} rx={3} fill={NEUTRAL_SOFT} />
              <Rect x={0} y={0} width={Math.max(4, (bar.value / max) * width)} height={10} rx={3} fill={accent} />
            </Svg>
            <Text style={styles.barValue}>{format(bar)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

/**
 * The footer, placed from the top of the page: react-pdf does not place a bottom-anchored box on a page
 * with padding. On a padded page the box is measured from the content edge.
 */
function Footer({ text, padded = true }: { text: string; padded?: boolean }) {
  return (
    <View style={padded ? [styles.footer, { top: A4_HEIGHT - 52 - 40 }] : [styles.footer, { top: A4_HEIGHT - 40 }]} fixed>
      <Text>{text}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function refs(numbers: number[]) {
  return numbers.length ? `Sources: ${numbers.map((n) => `[${n}]`).join(" ")}` : "No outside source";
}

/** The market report as a PDF: cover, summary, charts, findings, opportunities and the sources appendix. */
export function ReportPdf({ model }: { model: ReportPdfModel }) {
  const accent = model.cover.brandMark ? BRAND : NEUTRAL;
  const band = model.cover.brandMark ? BRAND_SOFT : NEUTRAL_SOFT;
  return (
    <Document title={model.meta.title} author={model.meta.author} creator={model.meta.creator} producer={model.meta.creator}>
      <Page size="A4" style={styles.cover}>
        <Footer text={model.footer} padded={false} />
        <View style={[styles.coverBand, { backgroundColor: band }]}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt; the business name is printed beside it. */}
            {model.cover.logoUrl ? <Image src={model.cover.logoUrl} style={styles.logo} /> : null}
            <Text style={styles.eyebrow}>{model.cover.eyebrow}</Text>
          </View>
          <View>
            <Text style={styles.coverBusiness}>{model.cover.businessName}</Text>
            <Text style={styles.coverTitle}>{model.cover.title}</Text>
            <Text style={styles.coverSub}>{model.cover.subtitle}</Text>
          </View>
        </View>
        <View style={styles.coverBody}>
          <Text style={styles.muted}>{model.cover.date}</Text>
          {model.summary.objective ? (
            <View style={{ marginTop: 20 }}>
              <Text style={styles.eyebrow}>The question</Text>
              <Text style={{ fontSize: 13, marginTop: 6 }}>{model.summary.objective}</Text>
            </View>
          ) : null}
          <View style={[styles.stats, { marginTop: 28 }]}>
            {model.summary.stats.map((stat) => (
              <View key={stat.label} style={styles.stat}>
                <Text style={[styles.statValue, { color: accent }]}>{stat.value}</Text>
                <Text style={styles.muted}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Footer text={model.footer} />
        <Text style={styles.h1}>Summary</Text>
        <Text>{model.summary.text}</Text>
        <Text style={styles.h2}>What the research saw</Text>
        <BarChart title="Sources by platform" bars={model.charts.platforms} accent={accent} empty="No sources were kept." />
        <BarChart title="Offers seen" bars={model.charts.offers} accent={accent} empty="No source showed an offer." />
        <BarChart title="Calls to action seen" bars={model.charts.ctas} accent={accent} empty="No source showed a call to action." />
        {model.charts.ownFigures ? (
          <View wrap={false}>
            <Text style={styles.h2}>Your own figures</Text>
            {model.charts.ownFigures.map((group) => (
              <View key={group.label} style={{ marginBottom: 10 }}>
                <Text style={styles.chartTitle}>
                  {group.label}
                  {group.period ? <Text style={styles.muted}> · {group.period}</Text> : null}
                </Text>
                <View style={styles.row}>
                  {group.rows.map((row) => (
                    <View key={row.label} style={[styles.stat, { padding: 8 }]}>
                      <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}>{row.display}</Text>
                      <Text style={[styles.muted, { fontSize: 8 }]}>{row.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </Page>

      <Page size="A4" style={styles.page}>
        <Footer text={model.footer} />
        <Text style={styles.h1}>Findings</Text>
        {model.findings.length === 0 ? <Text style={styles.muted}>No findings were written.</Text> : null}
        {model.findings.map((row) => (
          <View key={row.number} style={styles.card} wrap={false}>
            <View style={styles.row}>
              <Text style={[styles.num, { color: accent }]}>{row.number}</Text>
              <View style={{ flex: 1 }}>
                <Text>{row.statement}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 5, alignItems: "center" }}>
                  <Text style={styles.pill}>{row.basisLabel}</Text>
                  <Text style={[styles.refs, { marginTop: 0 }]}>{refs(row.sources)}</Text>
                </View>
              </View>
            </View>
          </View>
        ))}

        <Text style={[styles.h1, { marginTop: 18 }]}>Opportunities</Text>
        {model.opportunities.length === 0 ? <Text style={styles.muted}>No opportunity was supported by the research.</Text> : null}
        {model.opportunities.map((row) => (
          <View key={row.number} style={styles.card} wrap={false}>
            <View style={styles.row}>
              <Text style={[styles.num, { color: accent }]}>{row.number}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{row.opportunity}</Text>
                <Text style={{ marginTop: 4 }}>
                  <Text style={styles.muted}>Do: </Text>
                  {row.action}
                </Text>
                <Text style={{ marginTop: 2 }}>
                  <Text style={styles.muted}>How to tell if it worked: </Text>
                  {row.howToTell}
                </Text>
                {row.uncertainty ? <Text style={[styles.pill, { marginTop: 5 }]}>{row.uncertainty}</Text> : null}
                <Text style={styles.refs}>{refs(row.sources)}</Text>
              </View>
            </View>
          </View>
        ))}
        {model.limits.length ? (
          <View wrap={false}>
            <Text style={styles.h2}>Limits</Text>
            {model.limits.map((row) => (
              <Text key={row} style={styles.muted}>
                • {row}
              </Text>
            ))}
          </View>
        ) : null}
      </Page>

      <Page size="A4" style={styles.page}>
        <Footer text={model.footer} />
        <Text style={styles.h1}>Sources</Text>
        <Text style={[styles.muted, { marginBottom: 10 }]}>Every source this report rests on, numbered as the findings cite them.</Text>
        {model.appendix.map((row) => (
          <View key={row.number} style={{ flexDirection: "row", gap: 8, marginBottom: 6 }} wrap={false}>
            <Text style={[styles.num, { color: accent }]}>[{row.number}]</Text>
            <View style={{ flex: 1 }}>
              <Text>{row.title}</Text>
              <Text style={styles.refs}>
                {row.platform}
                {row.publisher ? ` · ${row.publisher}` : ""} ·{" "}
                <Link src={row.url} style={styles.link}>
                  {row.url}
                </Link>
              </Text>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}
