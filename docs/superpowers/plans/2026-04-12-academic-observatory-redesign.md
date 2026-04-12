# Academic Observatory UI Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic AI-generated UI with the "Academic Observatory" design — serif/sans typography, teal/amber/rose palette on warm paper, sidebar navigation, inline progress stepper, and confidence meters.

**Architecture:** CSS-first redesign. Most changes are CSS variable + rule replacements. Three components need JSX restructuring: header (minor), ProcessingProgress (modal → inline stepper), and ResultsDashboard (horizontal tabs → sidebar layout). Desktop and web packages share the same design but have separate CSS/TSX files.

**Tech Stack:** Google Fonts (Source Serif 4, IBM Plex Sans, IBM Plex Mono), CSS custom properties, React, react-tabs (removed in favor of custom sidebar nav)

**Reference:** `design-mockup.html` in project root contains the complete target CSS.

---

## File Map

### Desktop (`packages/desktop/src/renderer/`)
| Action | File | Purpose |
|--------|------|---------|
| Modify | `index.html` | Add Google Fonts preconnect + stylesheet |
| Rewrite | `index.css` | Design tokens + global reset |
| Rewrite | `App.css` | Header, layout, buttons |
| Modify | `App.tsx` | Header JSX (thin accent bar + clean nav) |
| Rewrite | `components/FileUpload.css` | Dropzone + file list |
| Modify | `components/FileUpload.tsx` | File type badges, dropzone icon |
| Rewrite | `components/ProcessingOptions.css` | Collapsible options panel |
| Modify | `components/ProcessingOptions.tsx` | Wrap in `<details>` element |
| Rewrite | `components/ProcessingProgress.css` | Inline stepper styles |
| Rewrite | `components/ProcessingProgress.tsx` | Modal → inline 8-stage stepper |
| Rewrite | `components/ResultsDashboard.css` | Sidebar nav, panels, tables, meters |
| Rewrite | `components/ResultsDashboard.tsx` | Tabs → sidebar, confidence meters, rings |
| Rewrite | `components/UpdateNotification.css` | Refined toast |

### Web (`packages/web/src/`)
| Action | File | Purpose |
|--------|------|---------|
| Modify | `../index.html` | Add Google Fonts |
| Rewrite | `index.css` | Design tokens + global reset |
| Rewrite | `App.css` | Header, footer, layout |
| Modify | `App.tsx` | Header JSX restructure |
| Rewrite | `pages/LandingPage.css` | Hero, features, download section |
| Modify | `pages/LandingPage.tsx` | Feature cards, hero structure |
| Rewrite | `pages/ToolPage.css` | Upload, options, progress |
| Modify | `pages/ToolPage.tsx` | Dropzone refinements, details panel |
| Rewrite | `pages/AboutPage.css` | Documentation page |
| Rewrite | `components/ResultsDashboard.css` | Sidebar nav, panels, tables |
| Rewrite | `components/ResultsDashboard.tsx` | Tabs → sidebar, confidence meters |

---

## Task 1: Desktop — Design Tokens & Global Styles

**Files:**
- Modify: `packages/desktop/src/renderer/index.html`
- Rewrite: `packages/desktop/src/renderer/index.css`

- [ ] **Step 1: Add Google Fonts to index.html**

Add before the closing `</head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Rewrite index.css with design tokens**

Replace entire file with the design token system from `design-mockup.html` — the `:root` variables block, reset, base typography, scrollbar, and utility classes. Key tokens:

```css
:root {
  --ink: #1a2332;
  --ink-soft: #3d4f5f;
  --ink-muted: #6b7c8a;
  --ink-faint: #94a3b1;
  --paper: #faf8f5;
  --paper-warm: #f4f1ec;
  --paper-cool: #f0eff2;
  --white: #ffffff;
  --accent: #2a9d8f;
  --accent-dim: #238578;
  --accent-bg: #e8f6f4;
  --amber: #e9c46a;
  --amber-bg: #fdf8eb;
  --amber-dark: #c4952a;
  --rose: #d4726a;
  --rose-bg: #fdf0ee;
  --rose-dark: #b5524a;
  /* ... full token set from mockup */
  --font-display: 'Source Serif 4', 'Georgia', serif;
  --font-body: 'IBM Plex Sans', 'Helvetica Neue', sans-serif;
  --font-mono: 'IBM Plex Mono', 'Menlo', monospace;
}
```

- [ ] **Step 3: Verify desktop dev server renders with new fonts**

Run: `cd packages/desktop && npm run dev`
Expected: App loads with Source Serif 4 headings, IBM Plex Sans body text, warm paper background.

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/src/renderer/index.html packages/desktop/src/renderer/index.css
git commit -m "style(desktop): add Academic Observatory design tokens and typography"
```

---

## Task 2: Desktop — Header & App Layout

**Files:**
- Rewrite: `packages/desktop/src/renderer/App.css`
- Modify: `packages/desktop/src/renderer/App.tsx`

- [ ] **Step 1: Rewrite App.css**

Replace the gradient header with thin accent bar + white header. Replace button styles with the `.btn` system from mockup. Key changes:
- `.app-header` → white bg, 1px bottom border, `::before` pseudo-element for 3px gradient accent bar
- `.header-inner` → flex between brand + nav, 60px height
- `.header-brand` → serif font, teal dot accent
- `.btn-primary` → teal background (not purple gradient)
- `.btn-secondary` → white bg, subtle border
- Remove purple gradient entirely

- [ ] **Step 2: Update App.tsx header JSX**

Replace the current header structure (lines ~104-114):

**Current:**
```jsx
<header className="app-header">
  <div className="header-content">
    <div className="header-title">
      <div className="header-title-group">
        <h1>CiteSight</h1>
        <span className="header-version">v{version}</span>
      </div>
      <p>Academic Citation & Writing Analysis</p>
    </div>
  </div>
</header>
```

**New:**
```jsx
<header className="app-header">
  <div className="header-inner">
    <div className="header-brand">
      <h1>CiteSight<span className="dot"></span></h1>
      <span className="version">v{version}</span>
    </div>
  </div>
</header>
```

Also update button classes throughout: `analyze-btn` → `btn btn-primary`, `reset-btn` → `btn btn-secondary`, etc.

- [ ] **Step 3: Verify header renders correctly**

Run desktop dev server, confirm:
- Thin 3px gradient bar at very top
- Clean white header with serif "CiteSight" + teal dot
- Teal analyze button, subtle gray reset button

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/src/renderer/App.css packages/desktop/src/renderer/App.tsx
git commit -m "style(desktop): redesign header with accent bar and update button system"
```

---

## Task 3: Desktop — FileUpload Component

**Files:**
- Rewrite: `packages/desktop/src/renderer/components/FileUpload.css`
- Modify: `packages/desktop/src/renderer/components/FileUpload.tsx`

- [ ] **Step 1: Rewrite FileUpload.css**

Apply mockup styles: refined dropzone (teal hover, 14px rounded corners), file list with monospace type badges, subtle remove buttons. Key class mappings:
- `.dropzone` → dashed border with `var(--ink-faint)`, hover goes teal
- `.file-type-badge` → mono font, uppercase, colored per type (pdf=teal, docx=indigo, txt=gray)
- `.file-item` → flex row with hover background
- `.file-remove` → circle button, transparent → rose on hover

- [ ] **Step 2: Update FileUpload.tsx**

Update `getFileIcon()` to return a `<span className="file-type-badge [type]">` instead of plain text. Map extensions to badge classes:
- `.pdf` → default teal badge
- `.docx` → `docx` class (indigo)
- `.txt`, `.md` → `txt` class (gray)

Update the dropzone empty state to use the new icon/text structure from mockup.

- [ ] **Step 3: Verify upload screen**

Confirm dropzone has dashed teal border on hover, file badges are color-coded, remove buttons are subtle circles.

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/src/renderer/components/FileUpload.css packages/desktop/src/renderer/components/FileUpload.tsx
git commit -m "style(desktop): redesign file upload with type badges and refined dropzone"
```

---

## Task 4: Desktop — ProcessingOptions Component

**Files:**
- Rewrite: `packages/desktop/src/renderer/components/ProcessingOptions.css`
- Modify: `packages/desktop/src/renderer/components/ProcessingOptions.tsx`

- [ ] **Step 1: Rewrite ProcessingOptions.css**

Apply mockup styles for collapsible details panel:
- `.options-panel` → white bg, subtle border, rounded
- `summary` → no default marker, custom `>` arrow that rotates on open
- `.option-label` → uppercase mono, muted color
- `.option-select` → clean border, teal focus ring
- `.checkbox-row` → flex with teal accent-color, hint text right-aligned

- [ ] **Step 2: Update ProcessingOptions.tsx**

Wrap content in `<details className="options-panel" open>` with `<summary>Analysis Options</summary>`. Add `option-label` classes to labels. Add `hint` spans for checkbox descriptions.

- [ ] **Step 3: Verify options panel**

Confirm collapsible behavior works, summary arrow rotates, teal checkboxes.

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/src/renderer/components/ProcessingOptions.css packages/desktop/src/renderer/components/ProcessingOptions.tsx
git commit -m "style(desktop): redesign options as collapsible details panel"
```

---

## Task 5: Desktop — ProcessingProgress (Modal → Inline Stepper)

**Files:**
- Rewrite: `packages/desktop/src/renderer/components/ProcessingProgress.css`
- Rewrite: `packages/desktop/src/renderer/components/ProcessingProgress.tsx`
- Modify: `packages/desktop/src/renderer/App.tsx` (move progress placement)

- [ ] **Step 1: Rewrite ProcessingProgress.tsx**

Replace the modal overlay with an inline 8-stage stepper. The component receives the same props (`progress`, `batchIndex`, `batchTotal`, `currentFileName`, `onCancel`).

Map the existing `progress.percent` to 8 stages:
```
Extract(10) → Readability(20) → Quality(30) → Words(40) → Patterns(50) → References(65) → Verify(85) → Cross-ref(100)
```

Each step renders as a `.step` div with `.done`, `.active`, or default state. The stepper has a connecting line with CSS `::before`/`::after` showing progress fill.

Below the stepper, show the current stage name in serif font + a thin progress bar.

Remove the fixed/overlay positioning — this is now a normal flow element.

- [ ] **Step 2: Rewrite ProcessingProgress.css**

Apply the mockup's inline stepper styles:
- `.progress-card` → white bg, border, rounded, padding
- `.progress-stepper` → flex between with connecting `::before` line and `::after` progress fill
- `.step-dot` → 28px circle, done=teal filled, active=teal border+pulse animation
- `@keyframes pulse-ring` for active step
- `.progress-bar-wrapper` → thin 6px bar

- [ ] **Step 3: Update App.tsx placement**

Move `<ProcessingProgress>` from its current position (after results, as overlay) to render inline within the upload section when `isProcessing` is true — replacing the upload/options content during processing.

- [ ] **Step 4: Verify progress stepper**

Upload a file and trigger analysis. Confirm:
- No modal overlay
- Inline stepper shows 8 stages
- Active step has pulsing ring
- Completed steps show teal checkmark
- Progress bar fills smoothly

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/src/renderer/components/ProcessingProgress.css packages/desktop/src/renderer/components/ProcessingProgress.tsx packages/desktop/src/renderer/App.tsx
git commit -m "style(desktop): replace modal progress with inline 8-stage stepper"
```

---

## Task 6: Desktop — ResultsDashboard (Tabs → Sidebar)

This is the largest task. The horizontal `react-tabs` are replaced with a sidebar nav + content panel layout.

**Files:**
- Rewrite: `packages/desktop/src/renderer/components/ResultsDashboard.css`
- Rewrite: `packages/desktop/src/renderer/components/ResultsDashboard.tsx`

- [ ] **Step 1: Restructure ResultsDashboard.tsx**

Remove the `react-tabs` import. Replace with a custom sidebar layout:

```jsx
const [activeSection, setActiveSection] = useState('overview');

return (
  <div className="results-shell">
    <aside className="results-sidebar">
      <div className="sidebar-filename">{fileName}</div>
      <nav className="sidebar-nav">
        {sections.map(s => (
          <button key={s.id}
            className={`sidebar-link ${activeSection === s.id ? 'active' : ''}`}
            onClick={() => setActiveSection(s.id)}>
            <span><span className="icon">{s.icon}</span> {s.label}</span>
            {s.badge && <span className={`sidebar-badge ${s.warn ? 'warn' : ''}`}>{s.badge}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-actions">
        {/* Export PDF, CSV, New Analysis buttons */}
      </div>
    </aside>
    <main className="results-content">
      <div className="summary-strip">{/* 6 stat cards */}</div>
      {activeSection === 'overview' && <OverviewPanel />}
      {activeSection === 'references' && <ReferencesPanel />}
      {/* etc */}
    </main>
  </div>
);
```

Key structural changes:
- Summary strip is always visible above panels (not inside overview tab)
- Sidebar badges show counts + warn state for issues
- Export actions move to sidebar bottom
- Each panel is a `<div className="panel-card">` with header + body

**Sub-components to update:**

**Overview panel:**
- Replace flat stat cards with readability rings (SVG circles)
- Add writing quality metric bars with contextual hints

**References panel:**
- Add status chip summary row (verified/suspicious/not found counts)
- Add inline confidence meter bars next to each reference
- Expand detail shows "cited vs found" side-by-side comparison
- Status badges get `::before` dot indicators

**Cross-refs panel:** Minor style update only.

**Quality panel:** Metric bars use `var(--accent)` for good, `var(--amber)` for warning, `var(--rose)` for poor.

**Words panel:** Word tags use new color tokens.

**Patterns panel:** Pattern cards use left-border severity coloring with evidence in mono font.

- [ ] **Step 2: Rewrite ResultsDashboard.css**

This is a full rewrite. Apply all styles from the mockup:
- `.results-shell` → CSS grid `220px 1fr`
- `.results-sidebar` → sticky positioning
- `.sidebar-link` → flex between, active=teal bg
- `.sidebar-badge` → mono font, warn=rose
- `.summary-strip` → flex wrap stat cards with left-border colors
- `.panel-card` → white bg, subtle border, rounded
- `.ref-table` → refined table with hover, expanded detail rows
- `.confidence-meter` → inline bar + value
- `.status-badge` → pill with `::before` dot
- `.readability-ring` → SVG circle container
- `.metric-bar` → 8px height with rounded fill
- `.pattern-card` → severity left-border coloring
- All colors use CSS variables

- [ ] **Step 3: Verify results dashboard**

Run analysis on a test PDF. Verify:
- Sidebar nav on left with section names and badges
- Summary strip at top with 6 stat cards
- Readability rings render as circular gauges
- Reference table has inline confidence bars
- Expanding a reference shows side-by-side comparison
- Status badges have colored dots
- Pattern cards have severity borders
- Switching sections via sidebar works

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/src/renderer/components/ResultsDashboard.css packages/desktop/src/renderer/components/ResultsDashboard.tsx
git commit -m "style(desktop): replace tabs with sidebar nav, add confidence meters and readability rings"
```

---

## Task 7: Desktop — UpdateNotification Refinement

**Files:**
- Rewrite: `packages/desktop/src/renderer/components/UpdateNotification.css`

- [ ] **Step 1: Rewrite UpdateNotification.css**

Apply design tokens to the toast notification:
- Background: `var(--ink)` instead of `#323232`
- Button: `var(--accent)` instead of `#4CAF50`
- Font: `var(--font-mono)` for version text
- Border-radius: `var(--r-lg)`
- Shadow: `var(--shadow-lg)`

- [ ] **Step 2: Commit**

```bash
git add packages/desktop/src/renderer/components/UpdateNotification.css
git commit -m "style(desktop): update notification toast with design tokens"
```

---

## Task 8: Web — Design Tokens & Global Styles

**Files:**
- Modify: `packages/web/index.html`
- Rewrite: `packages/web/src/index.css`

- [ ] **Step 1: Add Google Fonts to web index.html**

Same font links as desktop Task 1.

- [ ] **Step 2: Rewrite index.css**

Copy the same design token `:root` block and global reset from desktop. Web and desktop share identical tokens.

- [ ] **Step 3: Commit**

```bash
git add packages/web/index.html packages/web/src/index.css
git commit -m "style(web): add Academic Observatory design tokens and typography"
```

---

## Task 9: Web — App Shell (Header + Footer)

**Files:**
- Rewrite: `packages/web/src/App.css`
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Rewrite App.css**

Same header styles as desktop (accent bar, white bg, serif brand). Add footer styles using `var(--ink)` bg and `var(--font-mono)`.

Web-specific: navigation links (Home, Check Citations, About) with active/hover states using teal.

- [ ] **Step 2: Update App.tsx header JSX**

Replace the gradient header with the accent bar + clean nav structure. Map nav links to new classes.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/App.css packages/web/src/App.tsx
git commit -m "style(web): redesign header with accent bar and clean navigation"
```

---

## Task 10: Web — Landing Page

**Files:**
- Rewrite: `packages/web/src/pages/LandingPage.css`
- Modify: `packages/web/src/pages/LandingPage.tsx`

- [ ] **Step 1: Rewrite LandingPage.css**

Apply mockup hero styles:
- Hero: subtle radial gradients on paper bg, serif heading with teal `<em>` accent
- Feature cards: white bg, subtle border, hover shadow+lift
- Feature icons: colored rounded squares (teal, amber, rose)
- Download section: refined with platform buttons

- [ ] **Step 2: Update LandingPage.tsx**

Update hero heading to use `<em>` for the accent word. Update feature card icons to use colored divs. Update CTA buttons to `btn btn-primary` / `btn btn-secondary`.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/LandingPage.css packages/web/src/pages/LandingPage.tsx
git commit -m "style(web): redesign landing page with academic observatory theme"
```

---

## Task 11: Web — Tool Page (Upload + Progress)

**Files:**
- Rewrite: `packages/web/src/pages/ToolPage.css`
- Modify: `packages/web/src/pages/ToolPage.tsx`

- [ ] **Step 1: Rewrite ToolPage.css**

Apply upload styles from mockup: refined dropzone, file type badge, collapsible options, privacy notice in teal, inline progress spinner using accent color.

- [ ] **Step 2: Update ToolPage.tsx**

- Wrap options in `<details>` element
- Update dropzone empty state with icon/text structure
- Update privacy notice styling
- Update button classes

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/ToolPage.css packages/web/src/pages/ToolPage.tsx
git commit -m "style(web): redesign tool page with refined upload and options"
```

---

## Task 12: Web — ResultsDashboard (Tabs → Sidebar)

**Files:**
- Rewrite: `packages/web/src/components/ResultsDashboard.css`
- Rewrite: `packages/web/src/components/ResultsDashboard.tsx`

- [ ] **Step 1: Port desktop ResultsDashboard changes to web**

The web ResultsDashboard is nearly identical to desktop (550 vs 572 lines). Apply the same structural changes:
- Remove `react-tabs` usage
- Add sidebar navigation with badges
- Add summary strip
- Add confidence meters, readability rings, status badge dots
- Pattern cards with severity borders

Key difference: web version doesn't have screenshot support — skip that code path.

- [ ] **Step 2: Rewrite ResultsDashboard.css**

Port the desktop CSS from Task 6 with minor adjustments (no screenshot-related styles).

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/ResultsDashboard.css packages/web/src/components/ResultsDashboard.tsx
git commit -m "style(web): replace tabs with sidebar nav, add confidence meters and readability rings"
```

---

## Task 13: Web — About Page

**Files:**
- Rewrite: `packages/web/src/pages/AboutPage.css`

- [ ] **Step 1: Rewrite AboutPage.css**

Apply design tokens: serif headings, warm paper sections, teal accents for links and highlights. Definition lists styled with mono font for scores.

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/pages/AboutPage.css
git commit -m "style(web): redesign about page with academic observatory theme"
```

---

## Task 14: Cleanup & Final Verification

- [ ] **Step 1: Remove react-tabs dependency from desktop**

```bash
cd packages/desktop && npm uninstall react-tabs
```

- [ ] **Step 2: Remove react-tabs dependency from web**

```bash
cd packages/web && npm uninstall react-tabs
```

- [ ] **Step 3: Verify desktop builds**

```bash
cd packages/desktop && npm run build
```

- [ ] **Step 4: Verify web builds**

```bash
cd packages/web && npm run build
```

- [ ] **Step 5: Remove design mockup file**

```bash
rm design-mockup.html
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: remove react-tabs dependency and design mockup"
```
