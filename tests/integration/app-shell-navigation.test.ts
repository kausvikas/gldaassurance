/**
 * The application-shell and navigation contract.
 *
 * These assertions exist because the product shipped a preview in which the Command Center used the
 * new GlobalLogic experience while Projects and Assistant opened the retired admin sidebar, the
 * primary navigation disappeared once you left the landing page, and Interventions did not resolve.
 * Every one of those defects is a test below.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = join(process.cwd(), 'dist', 'executive-poc');
const ROUTES = [
  { file: 'index.html', label: 'Command Center', href: '/' },
  { file: 'projects.html', label: 'Projects', href: '/projects' },
  { file: 'forward-risk.html', label: 'Forward Risk', href: '/forward-risk' },
  { file: 'interventions.html', label: 'Interventions', href: '/interventions' },
  { file: 'assistant.html', label: 'Assistant', href: '/assistant' },
];

const read = (f: string): string => readFileSync(join(DIST, f), 'utf8');
const projectFiles = existsSync(join(DIST, 'projects'))
  ? readdirSync(join(DIST, 'projects')).filter((f) => f.endsWith('.html'))
  : [];

describe('every primary route is generated', () => {
  for (const r of ROUTES) {
    it(`generates ${r.href}`, () => {
      expect(existsSync(join(DIST, r.file)), r.file).toBe(true);
    });
  }
  it('generates a page for every project', () => {
    expect(projectFiles.length).toBeGreaterThan(0);
  });
});

describe('one canonical shell, on every route', () => {
  const all = [...ROUTES.map((r) => r.file), ...projectFiles.map((f) => join('projects', f))];

  it('renders exactly one application shell per page', () => {
    for (const f of all) {
      expect((read(f).match(/class="gl-nav"/g) ?? []).length, f).toBe(1);
    }
  });

  it('never publishes the retired admin-sidebar shell', () => {
    for (const f of all) {
      const html = read(f);
      for (const marker of ['gl-shell-sidebar', 'gl-sidebar', 'class="gl-app-shell"']) {
        expect(html.includes(marker), `${f} contains ${marker}`).toBe(false);
      }
    }
  });

  it('keeps the full primary navigation present on every route', () => {
    for (const f of all) {
      const html = read(f);
      for (const r of ROUTES) {
        expect(html.includes(`href="${r.href}"`), `${f} is missing a link to ${r.href}`).toBe(true);
        expect(html.includes(`>${r.label}</a>`), `${f} is missing the ${r.label} label`).toBe(true);
      }
    }
  });

  it('marks exactly one active navigation item, and never by colour alone', () => {
    for (const f of all) {
      const html = read(f);
      // Matched with the closing bracket so the CSS selector a[aria-current="page"] is not counted.
      expect((html.match(/aria-current="page">/g) ?? []).length, f).toBe(1);
    }
  });
});

describe('the 5 x 5 navigation matrix resolves', () => {
  /*
   * Every primary page links to every primary route, and every one of those targets exists as a
   * real file. Twenty-five transitions, asserted structurally: a link to a route that was never
   * generated is the defect that made Interventions dead in the preview.
   */
  const target = (href: string): string =>
    href === '/' ? 'index.html' : `${href.replace(/^\//, '')}.html`;

  for (const from of ROUTES) {
    for (const to of ROUTES) {
      it(`${from.label} → ${to.label}`, () => {
        expect(read(from.file).includes(`href="${to.href}"`)).toBe(true);
        expect(existsSync(join(DIST, target(to.href))), `${to.href} is not generated`).toBe(true);
      });
    }
  }
});

describe('project routes', () => {
  it('resolves one project per page, each to its own project', () => {
    const titles = new Set<string>();
    for (const f of projectFiles) {
      const html = readFileSync(join(DIST, 'projects', f), 'utf8');
      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
      expect(title, f).not.toBe('');
      titles.add(title);
    }
    // Distinct pages, not one page served under many names.
    expect(titles.size).toBeGreaterThan(projectFiles.length * 0.9);
  });

  it('keeps Projects as the active product area inside a project', () => {
    const html = readFileSync(join(DIST, 'projects', projectFiles[0] as string), 'utf8');
    expect(html).toMatch(/href="\/projects"[^>]*aria-current="page"/);
  });

  it('offers a route back to the originating population', () => {
    const html = readFileSync(join(DIST, 'projects', projectFiles[0] as string), 'utf8');
    expect(html).toContain('All projects');
  });

  it('is reachable from the pages that link to projects', () => {
    for (const f of ['index.html', 'projects.html']) {
      const hrefs = [...read(f).matchAll(/href="\/projects\/([a-z0-9-]+)"/g)].map((m) => m[1]);
      for (const id of hrefs) {
        expect(existsSync(join(DIST, 'projects', `${id as string}.html`)), `${f} → ${id as string}`).toBe(true);
      }
    }
  });
});

describe('no engineering vocabulary reaches an executive surface', () => {
  const BANNED = ['MET-', 'OVR-', 'ELV-', 'ADR-', 'DR-0', 'CONFLICT C-', 'NOT_COMPUTABLE',
    'CONFIGURATION_ERROR', 'RISK_OBJECT_ABSENT', '.md'];

  it('publishes none of the prohibited identifiers', () => {
    const offenders: string[] = [];
    for (const f of [...ROUTES.map((r) => r.file), ...projectFiles.map((p) => join('projects', p))]) {
      const html = read(f);
      for (const b of BANNED) if (html.includes(b)) offenders.push(`${f}: ${b}`);
    }
    expect(offenders.join('\n'), offenders.join('\n')).toBe('');
  });

  it('never renders a raw project identifier as text', () => {
    for (const f of ROUTES.map((r) => r.file)) {
      expect(read(f)).not.toMatch(/>prj-\d+</);
    }
  });
});

describe('the published product stays self-contained', () => {
  it('makes no external request from any route', () => {
    for (const f of ROUTES.map((r) => r.file)) {
      expect(read(f)).not.toMatch(/(?:src|href)="https?:\/\//);
    }
  });

  it('uses no eval, dynamic Function or inline event handler', () => {
    for (const f of ROUTES.map((r) => r.file)) {
      const html = read(f);
      expect(html).not.toMatch(/\beval\s*\(/);
      expect(html).not.toMatch(/new Function\s*\(/);
      expect(html).not.toMatch(/\son(?:click|load|error|mouseover)=/);
    }
  });
});
