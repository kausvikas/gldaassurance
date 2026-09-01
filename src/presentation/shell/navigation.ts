/**
 * The navigation taxonomy — declared once, as data.
 *
 * **Every destination names the surface and phase that owns it.** `PRODUCT_SPEC.md` §5 defines six
 * executive surfaces; the Phase 6 brief names nine navigation destinations plus three placeholders.
 * Those are not in conflict — a surface is a deliverable, a destination is a route — but the mapping
 * has to be written down or Phase 7 will invent one. It is the `surface` field below.
 *
 * **Placeholders are disabled and labelled, never hidden.** A greyed "Benchmarks — Planned" item
 * tells a viewer the shape of the product; a hidden one tells them the product is smaller than it
 * is. And an item that is *disabled in the UI* is not access control — the server authorises every
 * request regardless (`SECURITY_MODEL.md` §12.1), which is why `enabled` here is a maturity flag and
 * carries no security meaning whatsoever.
 *
 * **`requiresCapability` is a hint, not a gate.** It lets the shell hide a control the user cannot
 * use — a courtesy. The capability list arrives from the server's authorization result; the UI never
 * derives it from a role name, and hiding is never the control.
 */

export interface NavDestination {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  /** A shape, not an image — no icon font, no sprite sheet, no fabricated brand marks. */
  readonly glyph: string;
  /** Which `PRODUCT_SPEC.md` §5 surface this destination leads to, and the phase that builds it. */
  readonly surface: string;
  readonly phase: number | null;
  readonly enabled: boolean;
  /** Shown beside a disabled item so its state is legible without colour. */
  readonly stateLabel?: string;
  /**
   * Capability the server must have granted for this destination to be useful. **Presentation
   * hint only** — the enforcement point re-checks on every request (REQ-SEC-002, §12.1).
   */
  readonly requiresCapability?: string;
}

export interface NavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavDestination[];
}

/**
 * Grouping is a scanning aid, not a hierarchy. Three groups, ordered by how a CDO actually moves:
 * *where is the problem* → *what does it cost / what do we do* → *can I trust and govern this*.
 */
export const NAVIGATION: readonly NavGroup[] = [
  {
    id: 'portfolio',
    label: 'Portfolio',
    items: [
      {
        id: 'portfolio', label: 'Portfolio', href: '/portfolio', glyph: '▦',
        surface: 'Portfolio Command Center', phase: 7, enabled: true,
        requiresCapability: 'portfolio.viewAggregates',
      },
      {
        id: 'green-at-risk', label: 'Green-at-Risk', href: '/green-at-risk', glyph: '◆',
        surface: 'Portfolio Command Center (divergence view, AC-2)', phase: 7, enabled: true,
        requiresCapability: 'portfolio.viewAggregates',
      },
      {
        id: 'projects', label: 'Projects', href: '/projects', glyph: '▤',
        surface: 'Project Executive Health', phase: 8, enabled: true,
        requiresCapability: 'project.view',
      },
    ],
  },
  {
    id: 'economics',
    label: 'Economics & risk',
    items: [
      {
        id: 'financial', label: 'Financial Intelligence', href: '/financial', glyph: '◫',
        surface: 'Margin Intelligence', phase: 9, enabled: true,
        requiresCapability: 'project.viewCommercial',
      },
      {
        id: 'early-warnings', label: 'Early Warnings', href: '/early-warnings', glyph: '◬',
        surface: 'Forward Risk & Recovery', phase: 10, enabled: true,
        requiresCapability: 'project.view',
      },
      {
        id: 'recovery', label: 'Recovery', href: '/recovery', glyph: '◷',
        surface: 'Forward Risk & Recovery', phase: 10, enabled: true,
        requiresCapability: 'intervention.manage',
      },
    ],
  },
  {
    id: 'governance',
    label: 'Governance',
    items: [
      {
        id: 'assurance', label: 'Assurance', href: '/assurance', glyph: '◎',
        surface: 'Assurance & Audit', phase: 5, enabled: true,
        requiresCapability: 'audit.read',
      },
      {
        id: 'data-quality', label: 'Data Quality', href: '/data-quality', glyph: '◍',
        surface: 'Data Confidence (PRODUCT_SPEC §3.4)', phase: 8, enabled: true,
        requiresCapability: 'project.view',
      },
      {
        id: 'rules', label: 'Rules & Models', href: '/rules', glyph: '⚙',
        surface: 'Rule and threshold governance (REQ-RULE-001…004)', phase: 8, enabled: true,
        requiresCapability: 'rules.editThresholds',
      },
      {
        /*
         * The assistant sits under **Governance**, not beside the portfolio surfaces.
         *
         * That is a semantic placement, not a layout convenience: it explains governed assessments
         * and cannot produce them, so it belongs with the things that account for the model rather
         * than with the things that state the position. Filing it next to the Command Center would
         * suggest it is another way of *deciding*, when it is a way of *reading*.
         */
        id: 'assistant', label: 'Assistant', href: '/assistant', glyph: '◇',
        surface: 'Delivery Intelligence Assistant', phase: 11, enabled: true,
        requiresCapability: 'assistant.use',
      },
    ],
  },
];

/** Declared, disabled, labelled. The shape of the product, without pretending it is built. */
export const PLANNED_DESTINATIONS: readonly NavDestination[] = [
  {
    id: 'benchmarks', label: 'Benchmarks', href: '/benchmarks', glyph: '◰',
    surface: 'Not in POC scope (PRODUCT_SPEC §4.2)', phase: null, enabled: false,
    stateLabel: 'Planned',
  },
  {
    id: 'deal-intelligence', label: 'Deal Intelligence', href: '/deal-intelligence', glyph: '◱',
    surface: 'Not in POC scope (PRODUCT_SPEC §4.2)', phase: null, enabled: false,
    stateLabel: 'Planned',
  },
  {
    id: 'administration', label: 'Administration', href: '/administration', glyph: '◲',
    surface: 'Identity and grant administration (SECURITY_MODEL §4.1 SECURITY_ADMIN)', phase: null,
    enabled: false, stateLabel: 'Planned',
  },
];

export const PLANNED_GROUP: NavGroup = {
  id: 'planned',
  label: 'Planned',
  items: PLANNED_DESTINATIONS,
};

/** Every destination, enabled or not — used by tests to assert coverage and uniqueness. */
export const ALL_DESTINATIONS: readonly NavDestination[] =
  [...NAVIGATION.flatMap((g) => g.items), ...PLANNED_DESTINATIONS];
