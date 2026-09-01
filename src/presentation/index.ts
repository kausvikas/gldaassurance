/**
 * Presentation layer — public surface.
 *
 * **Untrusted. Renders; never decides.** (`ARCHITECTURE_DECISIONS.md` §4, `SECURITY_MODEL.md` §2 B1,
 * global invariant 7.) Phase 6 delivers the design system, the component library and the application
 * shell. The six executive surfaces are Phases 7–11 and are assembled *from* these parts — a surface
 * that needs a new colour, a new spacing value or a new status treatment has found a gap in the
 * system, and the fix is here, not there.
 *
 * What the architecture gate enforces around this layer:
 *
 * | Rule | Violation code |
 * | --- | --- |
 * | The only internal import permitted is `@app` | `ARCH-001` / `ARCH-002` |
 * | The only external packages permitted are `react` and `react-dom` | `ARCH-006` |
 * | No colour literal outside `tokens/palette.ts` | `ARCH-008` / G-COLOUR |
 * | No hand-typed `DEMO — SYNTHETIC DATA` string | `ARCH-008` / G-DEMO |
 * | No ambient clock, no numeric coercion | `ARCH-008` / G-CLOCK, G-FLOAT |
 *
 * The last two are new in Phase 6 and both exist for the same reason: a component that reads the
 * clock or parses a number has started to compute, and `PRODUCT_SPEC.md` §8 lists a metric computed
 * in a component as a **defect**.
 */

// --- Tokens -----------------------------------------------------------------
export { BRAND, DARK_ELEVATION, STATUS } from './tokens/palette.js';
export type { BrandColour } from './tokens/palette.js';
export {
  DARK_THEME, ELEVATION, FONT_STACK, GRID, LIGHT_THEME, MOTION, NUMERIC_FONT_FEATURES,
  PAIRING_RULES, RADIUS, RAG_TONE, SPACE, STATUS_TONES, SURFACE_HEX, TOKEN_NAMES, TYPE,
} from './tokens/tokens.js';
export type { PairingRule, StatusDefinition, StatusTone, Surface } from './tokens/tokens.js';
export { designSystemCss } from './tokens/stylesheet.js';
export {
  WCAG, contrastRatio, contrastRatioRounded, meetsContrast, parseHex, relativeLuminance,
} from './tokens/contrast.js';
export type { ContrastUse, Rgb } from './tokens/contrast.js';

// --- Application DTOs the surfaces consume (presentation may import @app only) --
export type {
  AssistantResponse, BubbleDto, CommandCenterView, ExecutiveRowDto, ForwardRiskView, KpiDto,
  MarginIntelligenceView, ProjectExecutiveHealthView,
} from '@app';

// --- View models ------------------------------------------------------------
export {
  RESTRICTED_LABEL, demoMarkerOf, toMetricViewModel, treatmentFor,
} from './view-models.js';
export type {
  BubbleMatrixViewModel, BubbleViewModel, BurnBarViewModel, CellViewModel, ColumnAlign,
  ColumnViewModel, ConfidenceViewModel, DeltaDirection, DeltaSentiment, DeltaViewModel,
  EmptyStateViewModel, ErrorStateViewModel, EvidenceLineViewModel, EvidenceViewModel,
  ExecutiveActionViewModel, FilterOptionViewModel, FilterViewModel, ForecastOutlookViewModel,
  FreshnessState, FreshnessViewModel, InsightViewModel, KpiViewModel, MetricComparisonRowViewModel,
  MetricComparisonViewModel, MetricViewModel, PlottableValue, ProgressBurnViewModel,
  ProvenanceTreatment, ReportingPeriodViewModel, RowViewModel, ScopeNodeViewModel,
  ScopeSelectionViewModel, StatusConflictViewModel, StatusViewModel, TableViewModel,
  TrajectoryDirection, TrajectoryViewModel, TrendChartViewModel, TrendPointViewModel,
  TrendSeriesViewModel, WaterfallStepViewModel, WaterfallViewModel,
} from './view-models.js';

// --- Components -------------------------------------------------------------
export {
  ConfidenceBadge, HealthBadge, StatusConflict, TrajectoryIndicator, statusFor,
} from './components/status.js';
export {
  EvidenceDisclosure, MetricValue, ProvenanceValue, RestrictedValue,
} from './components/evidence.js';
export {
  DeltaIndicator, ExecutiveActionCard, ExecutiveKpiCard, ForecastOutlook, InsightCallout,
  MetricComparison, Panel,
} from './components/executive.js';
export { DEMO_MARKER_TEXT, DemoSyntheticDataBadge } from './components/demo-badge.js';
export {
  DataFreshnessIndicator, DataTable, FilterBar, PortfolioScopeSelector, ReportingPeriodSelector,
} from './components/data.js';
export { BubbleMatrix, ProgressBurnBars, TrendChart, Waterfall } from './components/charts.js';
export { DegradedState, EmptyState, ErrorState, LoadingState } from './components/states.js';

// --- Shell ------------------------------------------------------------------
export { AppShell, BrandMark, SidebarNav, TopBar } from './shell/AppShell.js';
export type { AppShellProps, SidebarNavProps, TopBarProps } from './shell/AppShell.js';
export { ALL_DESTINATIONS, NAVIGATION, PLANNED_DESTINATIONS, PLANNED_GROUP } from './shell/navigation.js';
export type { NavDestination, NavGroup } from './shell/navigation.js';

// --- Surfaces (Phase 7+) ------------------------------------------------------
export { PortfolioCommandCenter, bubbleMatrix, executiveTable, kpiViewModel } from './surfaces/portfolio-command-center.js';
export type { PortfolioCommandCenterProps } from './surfaces/portfolio-command-center.js';
export {
  ProjectExecutiveHealth, commitmentTable, dimensionTable, milestoneTable,
} from './surfaces/project-executive-health.js';
export type { ProjectExecutiveHealthProps } from './surfaces/project-executive-health.js';
export {
  MarginIntelligence, bridgeTable, bridgeWaterfall, riskTable, trendTable,
} from './surfaces/margin-intelligence.js';
export type { MarginIntelligenceProps } from './surfaces/margin-intelligence.js';
export { ForwardRisk, actionTable, outlookTable, signalTable } from './surfaces/forward-risk.js';
export { RichText, formatInstant } from './components/rich-text.js';
export { DeliveryAssistant, evidenceModel, whyTable } from './surfaces/delivery-assistant.js';
export type { DeliveryAssistantProps } from './surfaces/delivery-assistant.js';
export type { ForwardRiskProps } from './surfaces/forward-risk.js';

export const PRESENTATION_STATE: string =
  'IMPLEMENTED (Phase 6) — tokens, 24 components, application shell and navigation. '
  + 'No executive surface is built; Phases 7-11 assemble these parts.';
