/**
 * The application shell: sidebar, top bar, content region.
 *
 * **Why the sidebar is dark.** It is not decoration. A dark rail does three things this product
 * needs: it separates navigation from data without a heavy border, it lets `impact-orange` be used
 * as the selection marker where it measures 5.71:1 rather than 2.73 on the app background
 * (`BRAND_DESIGN_SYSTEM.md` §2.1 rule 1), and it keeps the light content area free of a second
 * competing surface tone. The `.gl-theme-dark` class does the rest — every token inside the rail
 * resolves to its dark-correct value, so components dropped in there are contrast-correct without
 * knowing where they are.
 *
 * **The wordmark is text.** §1: *"No GlobalLogic logo asset is fabricated in this repository."* So
 * the identity is set type — "GlobalLogic" over "Delivery Intelligence" — with a short orange rule
 * beneath it. If a licensed asset is supplied later it drops into `BrandMark` and nothing else moves.
 *
 * **Landmarks are real.** `<nav>`, `<main>`, `<header>`, a skip link, and one `<h1>` per page.
 * REQ-UX-006 asks for keyboard navigability and this is most of it: without landmarks a keyboard
 * user tabs through nine navigation links to reach the content on every single route.
 */
import type { JSX, ReactNode } from 'react';
import type {
  FreshnessViewModel, ReportingPeriodViewModel, ScopeSelectionViewModel,
} from '../view-models.js';
import {
  DataFreshnessIndicator, PortfolioScopeSelector, ReportingPeriodSelector,
} from '../components/data.js';
import { DemoSyntheticDataBadge } from '../components/demo-badge.js';
import { NAVIGATION, PLANNED_GROUP, type NavGroup } from './navigation.js';

const CONTENT_ID = 'gl-content';

export function BrandMark(): JSX.Element {
  return (
    <div className="gl-brand">
      <div className="gl-brand-mark">GlobalLogic</div>
      <div className="gl-brand-product">Delivery Intelligence</div>
      <div className="gl-brand-rule" aria-hidden="true" />
    </div>
  );
}

export interface SidebarNavProps {
  readonly currentId: string;
  /**
   * Capabilities the **server** granted this caller. A destination whose `requiresCapability` is
   * absent from this list is dimmed as unavailable — a convenience, never a control. Omit the prop
   * to show everything, which is what the component gallery does.
   */
  readonly capabilities?: readonly string[];
  readonly groups?: readonly NavGroup[];
}

export function SidebarNav({ currentId, capabilities, groups = NAVIGATION }: SidebarNavProps): JSX.Element {
  const permitted = (required?: string): boolean =>
    capabilities === undefined || required === undefined || capabilities.includes(required);

  const renderGroup = (group: NavGroup): JSX.Element => (
    <div className="gl-nav-group" key={group.id}>
      <div className="gl-nav-group-label gl-eyebrow">{group.label}</div>
      <ul className="gl-nav-list">
        {group.items.map((item) => {
          const available = item.enabled && permitted(item.requiresCapability);
          const isCurrent = item.id === currentId && available;
          return (
            <li key={item.id}>
              <a
                className="gl-nav-item"
                href={available ? item.href : undefined}
                {...(isCurrent ? { 'aria-current': 'page' as const } : {})}
                {...(available ? {} : { 'aria-disabled': 'true' as const, tabIndex: -1 })}
              >
                <span className="gl-nav-icon" aria-hidden="true">{item.glyph}</span>
                <span>{item.label}</span>
                {item.stateLabel !== undefined
                  ? <span className="gl-chip gl-chip-planned gl-nav-tail">{item.stateLabel}</span>
                  : null}
                {!available && item.stateLabel === undefined
                  ? <span className="gl-visually-hidden"> — not available to your role</span>
                  : null}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <nav className="gl-nav" aria-label="Primary">
      {groups.map(renderGroup)}
      {renderGroup(PLANNED_GROUP)}
    </nav>
  );
}

export interface TopBarProps {
  readonly scope: ScopeSelectionViewModel;
  readonly period: ReportingPeriodViewModel;
  readonly freshness: FreshnessViewModel;
  readonly user: { readonly name: string; readonly roleLabel: string };
}

/**
 * The top bar carries the three things that change what every number on the page means: **who is
 * asking, over what scope, as at when** — plus how fresh the inputs are.
 *
 * Putting them anywhere else invites a screenshot whose numbers cannot be reproduced, because the
 * reader does not know which scope produced them. The demo marker sits here too, on every route, per
 * §6.
 */
export function TopBar({ scope, period, freshness, user }: TopBarProps): JSX.Element {
  return (
    <header className="gl-topbar">
      <PortfolioScopeSelector scope={scope} />
      <ReportingPeriodSelector period={period} />
      <span className="gl-topbar-spacer" />
      <span className="gl-topbar-actions gl-row">
        <DataFreshnessIndicator freshness={freshness} />
        <DemoSyntheticDataBadge />
        <span className="gl-row-tight">
          <span className="gl-body-sm" style={{ fontWeight: 600 }}>{user.name}</span>
          <span className="gl-chip gl-chip-neutral">{user.roleLabel}</span>
        </span>
      </span>
    </header>
  );
}

export interface AppShellProps {
  readonly currentId: string;
  readonly pageTitle: string;
  readonly scope: ScopeSelectionViewModel;
  readonly period: ReportingPeriodViewModel;
  readonly freshness: FreshnessViewModel;
  readonly user: { readonly name: string; readonly roleLabel: string };
  readonly capabilities?: readonly string[];
  /** Rendered between the page title and the content — degraded strips, filter bars. */
  readonly banner?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

export function AppShell(props: AppShellProps): JSX.Element {
  const { currentId, pageTitle, scope, period, freshness, user, capabilities, banner, actions, children } = props;
  return (
    <div className="gl-app">
      <a className="gl-skip-link" href={`#${CONTENT_ID}`}>Skip to content</a>
      <aside className="gl-sidebar gl-theme-dark">
        <BrandMark />
        <SidebarNav
          currentId={currentId}
          {...(capabilities !== undefined ? { capabilities } : {})}
        />
        <div className="gl-sidebar-foot">
          <DemoSyntheticDataBadge onDark />
        </div>
      </aside>
      <div className="gl-main">
        <TopBar scope={scope} period={period} freshness={freshness} user={user} />
        <main className="gl-content" id={CONTENT_ID} tabIndex={-1}>
          <div className="gl-stack" style={{ gap: 'var(--gl-space-lg)' }}>
            <div className="gl-row" style={{ justifyContent: 'space-between' }}>
              <h1 className="gl-h1">{pageTitle}</h1>
              {actions !== undefined ? <span className="gl-row">{actions}</span> : null}
            </div>
            {banner !== undefined ? banner : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
