/**
 * The GlobalLogic visual language, translated for an operating product.
 *
 * Derived from `docs/GLOBALLOGIC_VISUAL_REFERENCE.md` — what globallogic.com actually does at
 * 1440×900, inspected rather than remembered. Three observations drive almost everything here:
 *
 *   - the site has **no sidebar**; navigation is a floating rounded bar on a light-steel ground;
 *   - the site has **no cards**; grouping is done with bands, rules, alignment and space;
 *   - **orange is punctuation**, used as inline emphasis or one call to action, never as fills.
 *
 * The previous build broke all three. Cards were the default primitive, an admin rail ran down the
 * left, and orange was applied to any element that wanted attention. Palette alone was never going
 * to make it feel first-party.
 *
 * Type is a neutral system stack: BRAND_DESIGN_SYSTEM.md §4 forbids embedding a licensed face, and
 * a webfont would be the only external request in an otherwise self-contained build.
 */
import { GL_ACCESS_CSS } from './gl-access.js';
import { GL_ASSISTANT_CSS } from './gl-assistant.js';
import { GL_UPLOAD_CSS } from './gl-upload.js';

const GL_BASE_CSS = `
:root{
  --white:#FFFFFF; --steel-05:#F2F3F6; --steel-25:#C8CAD3; --steel-50:#858A9B;
  --steel-75:#484F6B; --steel-100:#181A24;
  --orange:#FF5F2D; --orange-deep:#CF3708; --orange-light:#FFCEB9;
  --blue:#4442E3; --blue-light:#D5D4FF; --blue-deep:#00018B; --cyan:#81CAFF;
  --green:#2E776A; --green-light:#91C4BB;
  --rag-red:#B3261E; --rag-red-bg:#FCEBE9;
  --rag-amber:#8A5A00; --rag-amber-bg:#FBF1DE;
  --rag-green:#2E776A; --rag-green-bg:#E4F0ED;
  --rule:#E3E5EB; --rule-strong:#C8CAD3;
  --font:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --sp:8px;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--steel-05);color:var(--steel-100);font-family:var(--font);
  font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased;
  font-variant-numeric:tabular-nums lining-nums}
h1,h2,h3,h4{margin:0;font-weight:600;letter-spacing:-0.02em;line-height:1.12;text-wrap:balance}
p{margin:0}
a{color:inherit}
.gl-skip{position:absolute;left:-9999px}
.gl-skip:focus{left:24px;top:24px;z-index:100;background:var(--white);padding:12px 20px;border-radius:8px}
:focus-visible{outline:2px solid var(--blue);outline-offset:3px;border-radius:4px}

/* ---- floating navigation, as the site does it ---- */
.gl-navwrap{position:sticky;top:0;z-index:50;padding:16px 40px 0;background:linear-gradient(var(--steel-05) 70%,transparent)}
.gl-nav{display:flex;align-items:center;gap:32px;background:var(--white);border-radius:14px;
  padding:14px 22px;box-shadow:0 1px 2px rgba(24,26,36,.06),0 8px 24px rgba(24,26,36,.05)}
.gl-brand{display:flex;flex-direction:column;line-height:1.1;flex:none}
.gl-brand b{font-size:17px;font-weight:600;letter-spacing:-0.01em}
.gl-brand span{font-size:10.5px;color:var(--steel-50);letter-spacing:.04em}
.gl-navlinks{display:flex;gap:26px;margin:0 auto;list-style:none;padding:0}
.gl-navlinks a{text-decoration:none;font-size:15px;font-weight:500;color:var(--steel-100);
  padding:4px 2px;border-bottom:2px solid transparent}
.gl-navlinks a:hover{border-bottom-color:var(--steel-25)}
/* Active state is weight, rule and colour together — never colour alone (WCAG 1.4.1). */
.gl-navlinks a[aria-current="page"]{color:var(--orange);font-weight:600;border-bottom-color:var(--orange)}
.gl-navmeta{display:flex;align-items:center;gap:14px;flex:none;font-size:12.5px;color:var(--steel-50)}
.gl-demo{border:1px solid var(--orange);color:var(--orange-deep);border-radius:999px;
  padding:4px 11px;font-size:10.5px;letter-spacing:.09em;font-weight:600;white-space:nowrap}

/* ---- editorial bands, not cards ---- */
.gl-band{padding:56px 0}
/*
 * A band publishes its own ground colour.
 *
 * The sticky first column of every table painted a hard-coded white, so on a tinted band it drew a
 * white stripe down the left of the table that reads as a stray border — visible on the Command
 * Center's intervention queue. A sticky cell has to opt out of the row it sits in, so it must be
 * told what to opt back into.
 */
.gl-band--white{background:var(--white);--gl-ground:var(--white)}
.gl-band--tint{background:var(--steel-05);--gl-ground:var(--steel-05)}
.gl-wrap{max-width:1240px;margin:0 auto;padding:0 40px}
.gl-eyebrow{font-size:12px;letter-spacing:.11em;text-transform:uppercase;color:var(--steel-50);
  font-weight:600;margin-bottom:14px}
.gl-lede{font-size:clamp(28px,3.4vw,44px);font-weight:600;letter-spacing:-0.025em;max-width:22ch}
.gl-lede em{font-style:normal;color:var(--orange)}
.gl-sub{margin-top:14px;color:var(--steel-75);max-width:64ch;font-size:16px}
h2.gl-h2{font-size:26px;margin-bottom:6px}
.gl-note{color:var(--steel-50);font-size:14px;max-width:70ch}
.gl-rule{border:0;border-top:1px solid var(--rule);margin:0}

/* ---- figures: aligned columns, no boxes ---- */
.gl-figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:0;
  border-top:1px solid var(--rule-strong);margin-top:32px}
/*
 * The gutter around a divider has to be symmetric, or the row reads as misaligned.
 *
 * This was 20px/24px/20px/0 — nothing on the left, 24px on the right, with the divider
 * drawn on the right edge. So every cell after the first had its label and figure pressed against
 * the rule immediately to its left, while all the air sat on the far side of the rule to its right.
 * The dividers were evenly spaced and the *content* was not, which is what makes the row look like
 * its columns do not line up.
 *
 * The first cell keeps a flush left edge, because it aligns with the headline, the prose and the
 * tables above and below it; every other cell is inset from the rule it follows by the same 24px it
 * leaves before the rule it precedes.
 */
.gl-fig{padding:20px 20px;border-right:1px solid var(--rule)}
.gl-fig:first-child{padding-left:0}
.gl-fig:last-child{border-right:0}
.gl-fig dt{font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--steel-50);font-weight:600}
.gl-fig dd{margin:8px 0 0;font-size:30px;font-weight:600;letter-spacing:-0.02em}
.gl-fig .gl-vs{margin-top:6px;font-size:13.5px;color:var(--steel-50)}

/* ---- RAG: text + shape, never colour alone ---- */
.gl-rag{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;
  letter-spacing:.05em;padding:2px 9px;border-radius:4px;white-space:nowrap}
.gl-rag::before{content:"";width:7px;height:7px;flex:none}
.gl-rag--GREEN{color:var(--rag-green);background:var(--rag-green-bg)}
.gl-rag--GREEN::before{background:var(--rag-green);border-radius:50%}
.gl-rag--AMBER{color:var(--rag-amber);background:var(--rag-amber-bg)}
.gl-rag--AMBER::before{background:var(--rag-amber);clip-path:polygon(50% 0,100% 100%,0 100%)}
.gl-rag--RED{color:var(--rag-red);background:var(--rag-red-bg)}
.gl-rag--RED::before{background:var(--rag-red)}

/* ---- health split: count and economic weight ---- */
.gl-split{display:grid;grid-template-columns:1fr 1fr;gap:56px;margin-top:28px}
.gl-meter{margin-top:18px}
.gl-meter h3{font-size:13px;letter-spacing:.07em;text-transform:uppercase;color:var(--steel-50);margin-bottom:12px}
.gl-bar{display:flex;height:34px;border-radius:5px;overflow:hidden;background:var(--steel-05)}
.gl-bar span{display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:600;color:var(--white)}
.gl-bar .g{background:var(--rag-green)} .gl-bar .a{background:#B07A16} .gl-bar .r{background:var(--rag-red)}
.gl-legend{display:flex;gap:20px;margin-top:10px;font-size:13px;color:var(--steel-75);flex-wrap:wrap}

/* ---- tables: editorial, no vertical rules ---- */
.gl-tablewrap{overflow-x:auto;margin-top:22px}
table.gl-t{width:100%;border-collapse:collapse;font-size:14px;min-width:860px}
table.gl-t th{text-align:left;font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;
  color:var(--steel-50);font-weight:600;padding:0 16px 10px 0;border-bottom:1px solid var(--rule-strong);white-space:nowrap}
table.gl-t td{padding:14px 16px 14px 0;border-bottom:1px solid var(--rule);vertical-align:top}
table.gl-t tbody tr:hover{background:var(--steel-05)}
.gl-band--tint table.gl-t tbody tr:hover{background:#EAECF0}
table.gl-t .num{text-align:right;padding-right:24px;white-space:nowrap}
table.gl-t th.num{text-align:right;padding-right:24px}

/*
 * Column widths, so cells stop wrapping where they have no business wrapping.
 *
 * "Deteriorating fast" broke across two lines in a column sized for "Stable", and "Escalate —
 * contractual exposure" wrapped on every row of the queue. Each wrap adds a line to the row, so a
 * five-row table stood 480px tall and read ragged. The layout stays automatic — these are floors
 * and ceilings, not a fixed grid, so a long customer name still behaves.
 */
/*
 * Two tables, two different problems — and one blanket rule made the second one worse.
 *
 * Forbidding every cell to wrap fixed the eight-column intervention queue and inflated the
 * ten-column Projects table from 1160px to 1476px inside a 1160px frame: "Margin at risk" clipped to
 * "Mar", the action column disappeared entirely, and the only sign was a scrollbar. A rule that
 * helps one table and truncates another is not a rule, so these are scoped.
 *
 * What is shared: a status chip and a number never wrap, because a wrapped chip is unreadable and a
 * wrapped figure is unscannable. Prose columns wrap, because prose should.
 */
table.gl-t{table-layout:auto}
table.gl-t td:has(.gl-rag){white-space:nowrap}
table.gl-t td .gl-pmeta{white-space:normal}
table.gl-t .num{padding-right:18px}
table.gl-t th.num{padding-right:18px}

/*
 * The Command Center queue has five rows and room to spare, so it gets it.
 *
 * Measured at 1440: the name column was taking 330px and "Northwind MedTech Digital Commerce Phase 1"
 * broke with the "1" alone on a second line — which reads as a different project — while "Escalate —
 * contractual exposure" wrapped on every row. Each wrap added ~22px and the rows ran 73/73/95/95/73.
 * The width comes back from numeric padding that had 24px doing nothing.
 */
table.gl-t--queue td:first-child,table.gl-t--queue th:first-child{min-width:340px}
table.gl-t--queue td:last-child,table.gl-t--queue th:last-child{min-width:215px;padding-right:0}
table.gl-t--queue td,table.gl-t--queue th{white-space:nowrap}
table.gl-t--queue td:first-child,table.gl-t--queue td:last-child{white-space:normal}

/*
 * The intervention queue carries a paragraph, so it is sized differently.
 *
 * Measured: the name column had 205px and wrapped every project onto two lines, the action column
 * 171px and wrapped every one of those too, while the ranking rationale — the only genuinely long
 * text in the table — was squeezed into 199px and ran to five lines. Rows stood 150–170px tall.
 *
 * A smaller floor than the Command Center's queue, because this table has to keep room for that
 * paragraph: names and actions stop wrapping, the rationale gets the width it actually needs, and
 * the condition column gives up the space it was not using.
 */
/*
 * Explicit widths, because min-widths made it worse.
 *
 * Adding floors to the first and last columns took the space from the only column that genuinely
 * needed it: the rationale dropped to 149px, ran to seven lines, and the rows grew from 150px to
 * 189px — the opposite of the intent, and the table then overflowed its frame.
 *
 * So this one is budgeted rather than nudged. 1160px available: the rationale is a paragraph and
 * gets 280, the name gets two comfortable lines, the short columns take exactly what their contents
 * need, and the total comes in under the frame. Percentages so it degrades proportionally rather
 * than falling off the edge on a narrower window.
 */
table.gl-t--long{table-layout:fixed}
/*
 * Each width is the measured width its own header needs, not a guess.
 *
 * Two rounds of nudging produced first a collision ("MARGIN AT RISKTRAJECTORY" running together) and
 * then two headers truncated to "TRAJECT…" and "TIME TO A…" — a clipped header being the worse of
 * the two, since a column you cannot name is a column you cannot read. Measured: 220 / 197 / 128 /
 * 102 / 99 / — / 174 at 1160px, which is 19/17/11/9/9/15 with 20 left for the paragraph.
 */
table.gl-t--long th:nth-child(1),table.gl-t--long td:nth-child(1){width:19%;white-space:normal}
table.gl-t--long th:nth-child(2),table.gl-t--long td:nth-child(2){width:17%;white-space:normal}
table.gl-t--long th:nth-child(3),table.gl-t--long td:nth-child(3){width:11%}
table.gl-t--long th:nth-child(4),table.gl-t--long td:nth-child(4){width:9%;white-space:normal}
table.gl-t--long th:nth-child(5),table.gl-t--long td:nth-child(5){width:9%}
table.gl-t--long th:nth-child(6),table.gl-t--long td:nth-child(6){width:20%;white-space:normal}
table.gl-t--long th:nth-child(7),table.gl-t--long td:nth-child(7){width:15%;white-space:normal;padding-right:0}
/* Graceful degradation only. Sized above so it never fires; if it ever does, the column is wrong. */
table.gl-t--long th{overflow:hidden;text-overflow:ellipsis}
.gl-pname{font-weight:600}
.gl-pname a{text-decoration:none;border-bottom:1px solid var(--steel-25)}
.gl-pname a:hover{border-bottom-color:var(--orange)}
.gl-pmeta{color:var(--steel-50);font-size:12.5px;margin-top:3px}
.gl-sticky{position:sticky;left:0;background:var(--gl-ground,var(--white));z-index:1}
/* The hover state must reach the sticky cell too, or the row lights up with a hole in it. */
table.gl-t tbody tr:hover .gl-sticky{background:var(--steel-05)}
.gl-band--tint table.gl-t tbody tr:hover .gl-sticky{background:#EAECF0}
table.gl-t tbody tr:hover .gl-sticky{background:var(--steel-05)}

/* ---- filters: real controls ---- */
.gl-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:18px 0}
.gl-filters label{display:inline-flex;flex-direction:column;gap:5px;font-size:11.5px;
  letter-spacing:.06em;text-transform:uppercase;color:var(--steel-50);font-weight:600}
.gl-filters select{font:inherit;font-size:14px;color:var(--steel-100);background:var(--white);
  border:1px solid var(--rule-strong);border-radius:8px;padding:8px 11px;min-width:150px}
.gl-quick{display:flex;flex-wrap:wrap;gap:8px;padding-bottom:6px}
.gl-quick button{font:inherit;font-size:13px;background:var(--white);border:1px solid var(--rule-strong);
  color:var(--steel-75);border-radius:999px;padding:7px 15px;cursor:pointer}
.gl-quick button:hover{border-color:var(--steel-50)}
.gl-quick button[aria-pressed="true"]{background:var(--steel-100);color:var(--white);border-color:var(--steel-100)}
.gl-reset{font:inherit;font-size:13.5px;background:none;border:0;color:var(--orange-deep);
  cursor:pointer;text-decoration:underline;padding:8px 2px}
.gl-scope{font-size:13.5px;color:var(--steel-75);padding:6px 0 0}
.gl-scope b{font-weight:600;color:var(--steel-100)}

/* ---- transitions ---- */
.gl-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:26px;
  border-top:1px solid var(--rule-strong)}
.gl-flow>div{padding:22px 24px 22px 0;border-right:1px solid var(--rule)}
.gl-flow>div:last-child{border-right:0}
.gl-flow h3{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:var(--steel-50);margin-bottom:14px}
.gl-moves{list-style:none;padding:0;margin:18px 0 0;font-size:14px}
.gl-moves li{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid var(--rule)}
.gl-moves li:last-child{border-bottom:0}
.gl-moves .to{color:var(--steel-75)}

/* ---- changes / drivers ---- */
.gl-list{list-style:none;padding:0;margin:22px 0 0}
.gl-list li{padding:15px 0;border-bottom:1px solid var(--rule);display:flex;gap:18px;align-items:baseline}
.gl-list li:last-child{border-bottom:0}
/* A driver is selectable: it reads as text until it is chosen, then it holds. */
.gl-driver{font:inherit;background:none;border:0;padding:0;text-align:left;cursor:pointer;color:inherit}
.gl-driver:hover b{border-bottom:1px solid var(--orange)}
.gl-driver[aria-pressed="true"] b{color:var(--orange-deep);border-bottom:2px solid var(--orange)}
.gl-list .k{flex:none;min-width:78px;font-weight:600;font-size:22px;letter-spacing:-0.02em}
.gl-list .v{color:var(--steel-75)}
.gl-empty{color:var(--steel-50);font-size:14.5px;padding:20px 0;max-width:64ch}
details summary{cursor:pointer;font-size:12px;color:var(--steel-50);margin-top:6px;list-style:none}
details summary::-webkit-details-marker{display:none}
details summary::before{content:"▸ ";color:var(--steel-25)}
details[open] summary::before{content:"▾ "}
details summary:hover{color:var(--steel-75)}
details span{display:block;margin-top:8px;font-size:12.5px;color:var(--steel-50)}
.gl-arrow{text-decoration:none;font-weight:600;font-size:14.5px;border-bottom:1px solid var(--orange);padding-bottom:2px}
footer.gl-foot{padding:40px 0 64px;color:var(--steel-50);font-size:13px}
footer.gl-foot p{max-width:78ch}
/* Keep the primary navigation on one line down to the 1024 target. */
@media (max-width:1240px){.gl-navlinks{gap:18px}.gl-navlinks a{font-size:14px}
  .gl-nav{gap:20px;padding:12px 18px}.gl-navmeta{font-size:11.5px;gap:10px}}
@media (max-width:1100px){.gl-split{grid-template-columns:1fr;gap:34px}.gl-flow{grid-template-columns:1fr}
  .gl-flow>div{border-right:0;border-bottom:1px solid var(--rule)}}
/*
 * Below 1000px the navigation wraps to its own scrollable row. It is not hidden.
 *
 * It used to be a display:none on the links with nothing put in its place, which is not a
 * responsive rule — it is a deletion. On a phone the product had **no navigation at all**: you
 * landed on the Command Center and there was no way to reach Projects, Forward Risk, Interventions,
 * the Assistant or Data Sources. Reported from a Galaxy Fold, whose cover screen sits under the old
 * 820px breakpoint.
 *
 * 1000px, not 820: measured, not chosen. Brand + six links + the as-at date and DEMO badge need
 * about 990px on one row, so between 821 and 1000 the old rule left the nav intact and pushed the
 * page 91px wider than the viewport instead. A breakpoint has to be where the content stops fitting,
 * not where a round number falls.
 *
 * A scrolling row rather than a hamburger: six short labels fit a swipe, every destination stays
 * visible rather than hidden behind an icon that has to be discovered, and it needs no menu state,
 * no focus trap and no new interaction for a reader to learn. The scrollbar is suppressed because
 * on touch it is chrome nobody needs; the runtime scrolls the active item into view on load, so the
 * sixth tab is never silently off-screen.
 */
@media (max-width:1000px){
  .gl-navwrap{padding:12px 12px 0}
  .gl-nav{flex-wrap:wrap;gap:10px 16px;padding:12px 16px}
  .gl-navmeta{margin-left:auto;font-size:11.5px;gap:8px}
  .gl-navlinks{display:flex;order:3;width:100%;margin:0;gap:20px;
    overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;
    scrollbar-width:none;padding:2px 0 4px;scroll-padding-inline:4px}
  .gl-navlinks::-webkit-scrollbar{display:none}
  .gl-navlinks li{flex:0 0 auto}
  .gl-navlinks a{font-size:14px;white-space:nowrap}
  .gl-wrap{padding:0 22px}
}

/*
 * Nothing may exceed the viewport width on a phone.
 *
 * The tables already scroll inside their own containers; these are the blocks that were sized for a
 * laptop and had no narrow case at all.
 */
@media (max-width:640px){
  .gl-figs{grid-template-columns:1fr 1fr}
  .gl-fig{padding:16px 14px}
  .gl-fig:nth-child(odd){padding-left:0}
  .gl-fig:nth-child(even){border-right:0}
  .gl-fig dd{font-size:24px}
  .gl-lede{font-size:34px}
  .gl-lenses{gap:6px}
  .gl-lenses button{font-size:12.5px;padding:6px 12px}
  .gl-glimpse{width:min(290px,calc(100vw - 24px))}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

/**
 * The stylesheet every route carries.
 *
 * The Assistant's rules live in their own module beside the surface they describe, and are appended
 * here rather than duplicated: one stylesheet on every page means a control that looks a certain way
 * on the Command Center looks that way in the Assistant, which is most of what makes a product feel
 * like one product.
 */
/* ---- the executive glimpse ----
 *
 * A white panel with a hairline and editorial type, not a black chart tooltip. The distinction is
 * not decoration: a chart-library tooltip reads as an artefact of a charting widget, and this panel
 * is a governed statement about a population — the same register as the rest of the page.
 */
const GL_LENS_CSS = `
/* ---- executive lenses and decision density ----
 *
 * A section a lens has nothing to say about is dimmed and tightened rather than deleted: the page
 * keeps its shape, so a reader who switches lenses is not re-learning the layout each time.
 */
.gl-quiet{opacity:.62}
.gl-quiet .gl-h2{font-size:20px}
.gl-band:has(> .gl-wrap > .gl-quiet){padding-top:34px;padding-bottom:34px}
.gl-zero{margin:14px 0 0;max-width:70ch;font-size:14px;color:var(--steel-75)}

/* The methodology note: one line until asked for. */
.gl-method{margin:14px 0 0;max-width:74ch}
.gl-method summary{cursor:pointer;font-size:13px;color:var(--steel-50);
  list-style:none;display:inline-flex;align-items:center;gap:6px}
.gl-method summary::-webkit-details-marker{display:none}
.gl-method summary::before{content:'+';font-size:14px;color:var(--orange)}
.gl-method[open] summary::before{content:'\u2212'}
.gl-method summary:hover{color:var(--steel-75)}
.gl-method summary:focus-visible{outline:2px solid var(--blue);outline-offset:3px;border-radius:3px}
.gl-method p{margin-top:10px}

/*
 * Decision density.
 *
 * Measured, not guessed: the hero was 750px of a 723px viewport, so the economic consequence sat
 * below the fold on every visit. 165px of that was a wall of scope dropdowns above the figures.
 * Folding those, tightening the band rhythm and capping the change log reclaims roughly a third of
 * the page's vertical travel while leaving the type scale, the rules and the white space philosophy
 * exactly where they were. The target is editorial calm at executive density.
 */
.gl-band{padding-top:44px;padding-bottom:44px}
.gl-band .gl-h2{margin-bottom:6px}
.gl-figs{margin-top:22px}

/* Executive lenses: questions, in the open. */
.gl-lenses{display:flex;flex-wrap:wrap;gap:8px;padding:20px 0 0}
.gl-lenses button{font:inherit;font-size:13px;color:var(--steel-75);background:var(--white);
  border:1px solid var(--rule-strong);border-radius:999px;padding:7px 14px;cursor:pointer;
  transition:background .12s ease,color .12s ease,border-color .12s ease}
.gl-lenses button:hover{border-color:var(--steel-50);color:var(--steel-100)}
.gl-lenses button[aria-pressed="true"]{background:var(--steel-100);border-color:var(--steel-100);
  color:var(--white)}
.gl-lenses button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}

/* Scope filters: folded, and honest about what they hold. */
.gl-scopefilters{margin:14px 0 0}
.gl-scopefilters summary{cursor:pointer;list-style:none;display:inline-flex;align-items:baseline;
  gap:8px;font-size:13px;padding:4px 0}
.gl-scopefilters summary::-webkit-details-marker{display:none}
.gl-scopefilters__k{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--steel-50)}
.gl-scopefilters__v{color:var(--steel-75);border-bottom:1px dashed var(--rule-strong)}
.gl-scopefilters summary:hover .gl-scopefilters__v{color:var(--steel-100);border-color:var(--steel-50)}
.gl-scopefilters__v.is-set{color:var(--steel-100);font-weight:600;border-bottom-style:solid;
  border-color:var(--orange)}
.gl-scopefilters summary:focus-visible{outline:2px solid var(--blue);outline-offset:3px;border-radius:3px}
.gl-scopefilters .gl-filters{padding:12px 0 4px}

@media (max-width: 900px){ .gl-band{padding-top:34px;padding-bottom:34px} }
@media (prefers-reduced-motion: reduce){ .gl-lenses button{transition:none} }
`;

const GL_GLIMPSE_CSS = `
/* The panel takes the pointer, because the action at its foot has to be clickable. */
.gl-glimpse{position:absolute;z-index:80;width:290px;padding:16px 18px 14px;background:var(--white);
  border:1px solid var(--rule);border-radius:10px;
  box-shadow:0 1px 2px rgba(24,26,36,.05),0 12px 32px rgba(24,26,36,.14);
  font-size:13px;line-height:1.45}
.gl-glimpse__t{margin:0 0 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;
  color:var(--steel-75);display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.gl-glimpse__f{margin:0 0 12px;display:flex;flex-direction:column;gap:9px}
.gl-glimpse__f div{display:grid;grid-template-columns:1fr auto;column-gap:12px;align-items:baseline}
.gl-glimpse__f dt{font-size:12px;color:var(--steel-75)}
.gl-glimpse__f dd{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em;color:var(--steel-100);
  font-variant-numeric:tabular-nums}
.gl-glimpse__f span{grid-column:1/-1;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--steel-50)}
.gl-glimpse__l{margin:0 0 5px;padding-top:11px;border-top:1px solid var(--rule);
  font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--steel-50)}
.gl-glimpse__p{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px}
.gl-glimpse__p li{display:flex;justify-content:space-between;gap:14px}
.gl-glimpse__p span{color:var(--steel-100);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gl-glimpse__p b{font-variant-numeric:tabular-nums;font-weight:600;flex:0 0 auto}
.gl-glimpse__m{margin:5px 0 0;font-size:12px;color:var(--steel-50)}
.gl-glimpse__a{display:block;width:100%;margin:12px 0 0;padding:10px 0 0;
  border:0;border-top:1px solid var(--rule);background:none;text-align:left;
  font:inherit;font-size:12.5px;font-weight:600;color:var(--orange-deep);cursor:pointer}
.gl-glimpse__a:hover{color:var(--orange)}
.gl-glimpse__a:focus-visible{outline:2px solid var(--blue);outline-offset:2px;border-radius:3px}

/* Restrained affordance: a tonal shift and a cursor, never a button. A health band that looked like
 * a giant button would dominate a page whose whole argument is editorial calm. */
.gl-investigable{cursor:pointer;transition:filter .12s var(--ease,ease),outline-color .12s ease}
.gl-investigable:hover{filter:brightness(1.07)}
.gl-investigable:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.gl-bar .gl-investigable:hover{filter:brightness(1.12)}

/* Transition rows: two labelled figures, never one ambiguous number. */
.gl-moves li[data-move]{cursor:pointer;border-radius:8px;padding:10px 12px;margin:0 -12px;
  transition:background .12s ease}
.gl-moves li[data-move]:hover{background:var(--steel-05)}
.gl-moves li[data-move]:focus-visible{outline:2px solid var(--blue);outline-offset:1px}
/*
 * The movement rows, in the application's own figure register.
 *
 * The first attempt invented a register for this one component: right-aligned uppercase micro-labels
 * stacked under a bold count. It matched nothing else on the page, "$55.51M CONTRACTUAL VALUE" broke
 * across two lines with VALUE alone on the second, and the transition chips wrapped so GREEN sat
 * above AMBER. The rest of the product states a figure exactly one way — value, then a muted
 * sentence-case caption beneath it — and this now does the same, in a grid so the columns line up
 * from row to row.
 */
.gl-moves li[data-move]{display:grid;
  grid-template-columns:minmax(170px,auto) minmax(84px,auto) minmax(130px,1fr) minmax(130px,1fr);
  gap:10px 22px;align-items:start}
.gl-movepair{display:flex;align-items:center;gap:8px;white-space:nowrap}
.gl-movefig{display:flex;flex-direction:column;gap:3px;min-width:0}
.gl-movefig b{font-size:15px;font-weight:600;letter-spacing:-.01em;color:var(--steel-100);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.gl-movefig span{font-size:12.5px;color:var(--steel-50);line-height:1.3}
@media (max-width: 1080px){
  .gl-moves li[data-move]{grid-template-columns:1fr 1fr;gap:8px 18px}
  .gl-movepair{grid-column:1/-1}
}

@media (prefers-reduced-motion: reduce){
  .gl-investigable,.gl-moves li[data-move]{transition:none}
}
`;

export const GL_CSS = `${GL_BASE_CSS}${GL_ASSISTANT_CSS}${GL_UPLOAD_CSS}${GL_ACCESS_CSS}${GL_GLIMPSE_CSS}${GL_LENS_CSS}`;


