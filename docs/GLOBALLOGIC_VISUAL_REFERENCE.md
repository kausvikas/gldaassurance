# GlobalLogic.com — observed design language

Inspected in Chrome at 1440×900, 2 Sep 2026: homepage and Insights. Recorded before implementation
so the visual work is derived from what the site actually does, not from remembered brand rules.
`BRAND_DESIGN_SYSTEM.md` governs how these translate into an enterprise application.

## What the site actually does

| Aspect | Observation |
| --- | --- |
| Ground | Very light steel, not white. Sections alternate light steel and white as full-bleed bands. |
| Navigation | A **floating rounded white bar**, inset from the viewport edges, radius ~14px, soft shadow. Wordmark left, links centred, language + a single orange pill CTA right. **No sidebar anywhere.** |
| Nav type | ~16px, medium weight, near-black; the active section is orange text — not a filled tab or underline. |
| Display type | Very large, tight tracking, weight ~600, near-black `#181A24`. "Engineering Impact" runs ~110px at 1440. |
| Editorial pattern | Small grey eyebrow line above a large headline; body sits in a narrow measure beneath. |
| Orange | Used as **inline emphasis inside a sentence** and for one CTA. Never as fills, borders or icon washes. |
| Whitespace | Extreme. The hero is mostly empty. Sections separated by very large vertical gaps. |
| Containers | **Effectively none.** No cards, no panels, no boxed metrics. Grouping is done with whitespace, alignment and band changes. |
| Links | Text plus a trailing arrow, e.g. "Learn more about what sets us apart →". |
| Buttons | Pill-shaped; secondary is light grey with a circular arrow badge; primary is solid orange. |
| Content width | Left-aligned column, roughly 76% of viewport, with a wide left margin. |

## What this means for Delivery Intelligence

- **Kill the sidebar.** The current admin-style left rail is the single largest departure from the
  brand's language. Navigation becomes a floating top bar.
- **Kill the card grid.** Cards are the default primitive in the current build and are absent from
  the reference. Group with rules, bands and space.
- **Type does the work.** A serious editorial scale, not widget microcopy at one size.
- **Orange is punctuation.** One accent moment per view at most; status colour stays separate from
  brand colour.
- **Bands, not boxes.** Alternating light-steel and white full-bleed sections give the page rhythm.

## What must not be copied

Marketing heroes, promotional imagery, campaign CTAs and case-study carousels. The question is what
this design organisation would build for an operating product, not how to paste the website over one.
