# Pulse UI — Design System Specification & Multi-Project Style Guide

> **Official Design Specification for MedConnect Pulse & Portable Multi-Project UI Framework**  
> *Target Genres: Mission-Critical Healthcare, Telemetry Dashboards, Command Centers, High-Throughput Queue Engines, and Enterprise SaaS.*  
> *Zero AI-Slop Guarantee: High legibility, crisp hairlines, sub-150ms microinteractions, WCAG AAA/AA compliance, and atomic design tokens.*

---

## Table of Contents

1. [Executive Summary & Philosophy](#1-executive-summary--philosophy)
2. [Multi-Project Portability & Quick Start](#2-multi-project-portability--quick-start)
3. [Design Token Architecture](#3-design-token-architecture)
   - [Color System (Light & Dark Modes)](#color-system)
   - [Typography System](#typography-system)
   - [Spacing & Spatial Grid](#spacing--spatial-grid)
   - [Surfaces, Elevation & Borders](#surfaces-elevation--borders)
   - [Motion & Timing Physics](#motion--timing-physics)
4. [Component Design Specifications](#4-component-design-specifications)
   - [Buttons & Interactive Triggers](#buttons--interactive-triggers)
   - [Cards & Surface Containers](#cards--surface-containers)
   - [Form Controls & Input Fields](#form-controls--input-fields)
   - [Status Badges, Triage Chips & Telemetry Dots](#status-badges-triage-chips--telemetry-dots)
   - [Data Tables & Tabular Telemetry](#data-tables--tabular-telemetry)
   - [Alert Banners & Emergency Callouts](#alert-banners--emergency-callouts)
   - [Modals, Overlays & Drawers](#modals-overlays--drawers)
5. [The Anti-Slop Discipline (Quality Gates)](#5-the-anti-slop-discipline-quality-gates)
6. [Cross-Platform Integration Recipes](#6-cross-platform-integration-recipes)
   - [Vanilla HTML / Plain CSS](#vanilla-html--plain-css)
   - [React / Vite / Next.js](#react--vite--nextjs)
   - [Tailwind CSS Configuration Mapping](#tailwind-css-configuration-mapping)
   - [Vue / Nuxt / Svelte](#vue--nuxt--svelte)
7. [Backwards Compatibility & Migration Reference](#7-backwards-compatibility--migration-reference)

---

## 1. Executive Summary & Philosophy

Pulse UI was engineered for **MedConnect Pulse** to solve two demanding real-time operational challenges:
1. **AI Receptionist & Live Queue Engine**: High-stress patient triage, multilingual speech interactions, and live second-by-second wait-time countdowns.
2. **Emergency Geo-Dispatch & Resource Exchange**: Sub-100ms multi-hospital broadcasting, Haversine proximity radar mapping, and atomic bed/blood resource locking under life-or-death timelines.

### The 4 Core Design Pillars

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           PULSE UI PILLARS                              │
├────────────────────┬────────────────────┬───────────────────────────────┤
│ 1. CLINICAL        │ 2. ERGONOMIC       │ 3. DETERMINISTIC              │
│    LEGIBILITY      │    DENSITY         │    INTERACTION                │
│ Pure contrast,     │ High scannability, │ Zero bouncy spring slop;      │
│ instant focus      │ tabular numbers,   │ 140ms crisp feedback;         │
│ rings, no unneeded │ compact vertical   │ predictable tactile           │
│ blur or haze.      │ rhythm.            │ states.                       │
├────────────────────┴────────────────────┴───────────────────────────────┤
│ 4. ZERO-DEPENDENCY PORTABILITY                                          │
│ Standard CSS Custom Properties on :root, pure CSS classes, 100%         │
│ framework-agnostic. Drop into React, Vue, Next.js, or plain HTML.       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Multi-Project Portability & Quick Start

Pulse UI is packaged as a single, zero-dependency stylesheet: `pulse-design-system.css`.

### How to use it in ANY project:

#### 1. Direct Static Drop-In (HTML)
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your App</title>
  <!-- 1. Include Font Families (Optional but Recommended) -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  
  <!-- 2. Import Pulse UI CSS -->
  <link rel="stylesheet" href="pulse-design-system.css">
</head>
<body>
  <div class="pulse-card">
    <div class="pulse-flex pulse-items-center pulse-justify-between">
      <h2 class="pulse-h2">Emergency Telemetry</h2>
      <span class="pulse-badge pulse-badge-green">
        <span class="pulse-dot pulse-dot-green"></span> Live Stream
      </span>
    </div>
    <p class="pulse-text-muted">High-throughput atomic resource monitoring.</p>
    <button class="pulse-btn pulse-btn-primary">Dispatch Unit</button>
  </div>
</body>
</html>
```

#### 2. Modern Bundlers (Vite, Next.js, Nuxt, Webpack)
```javascript
// In main.jsx, _app.jsx, or layout.jsx:
import './pulse-design-system.css';
```

---

## 3. Design Token Architecture

All tokens are defined as standard CSS Custom Properties under `:root` with full dual-mode support (`[data-theme="dark"]` and `prefers-color-scheme: dark`).

### Color System

We utilize an OKLCH perceptual color space with sRGB and Hex fallbacks for maximum gamut depth on wide-gamut displays (Display P3) and universal rendering across legacy browsers.

| Token Variable | Default Value (OKLCH) | Hex / Fallback | Role & Semantic Intent |
|---|---|---|---|
| `--color-paper` | `oklch(98.5% 0.005 240)` | `#f9fafb` | Default canvas background (Clinical Zinc Tint) |
| `--color-paper-2` | `oklch(96.5% 0.008 240)` | `#f3f4f6` | Card background, sidebars, elevated panels |
| `--color-paper-subtle` | `oklch(94.5% 0.01 240)` | `#e5e7eb` | Subtle surface highlight, disabled inputs |
| `--color-ink` | `oklch(18% 0.02 250)` | `#0f172a` | Primary text, headers (High contrast deep navy) |
| `--color-ink-2` | `oklch(42% 0.02 250)` | `#475569` | Secondary text, clinical labels, metadata |
| `--color-ink-muted` | `oklch(58% 0.015 250)` | `#64748b` | Tertiary text, helper hints, placeholders |
| `--color-rule` | `oklch(88% 0.01 240)` | `#e2e8f0` | Structural hairline divider & card borders |
| `--color-rule-subtle` | `oklch(92% 0.008 240)` | `#edf2f7` | Faint divider within grouped items |
| `--color-accent` | `oklch(50% 0.20 250)` | `#2563eb` | Medical Sapphire Blue (Primary Action / <= 5% viewport) |
| `--color-accent-hover` | `oklch(44% 0.20 250)` | `#1d4ed8` | Accent hover state |
| `--color-accent-light` | `oklch(95% 0.03 250)` | `#eff6ff` | Tinted badge background & active tab highlight |
| `--color-emergency` | `oklch(54% 0.22 25)` | `#dc2626` | Crimson ER alert (Critical actions, trauma dispatch) |
| `--color-emergency-hover` | `oklch(48% 0.22 25)` | `#b91c1c` | Emergency hover state |
| `--color-emergency-light`| `oklch(96% 0.03 25)` | `#fef2f2` | Urgent triage highlight |
| `--color-operational` | `oklch(58% 0.16 150)` | `#10b981` | Emerald Operational (Online status, slots available) |
| `--color-amber` | `oklch(62% 0.18 80)` | `#f59e0b` | Triage amber (Delayed, warning, intermediate priority) |
| `--color-focus` | `oklch(50% 0.20 250)` | `#2563eb` | 3:1 high-contrast keyboard focus ring |

#### Dark Mode Tokens (`[data-theme="dark"]`)
When toggled to dark mode, the tokens smoothly invert:
- `--color-paper`: `oklch(14% 0.015 250)` (`#090d16`)
- `--color-paper-2`: `oklch(18% 0.018 250)` (`#111827`)
- `--color-paper-subtle`: `oklch(22% 0.02 250)` (`#1f2937`)
- `--color-ink`: `oklch(96% 0.005 240)` (`#f8fafc`)
- `--color-ink-2`: `oklch(76% 0.01 240)` (`#cbd5e1`)
- `--color-rule`: `oklch(26% 0.018 250)` (`#334155`)

---

### Typography System

Healthcare applications and high-density dashboards must prevent typographic shift and eye fatigue.

- **Display & Heading Font**: `Plus Jakarta Sans`, weight 700/800, tracking `-0.025em`.
- **Body & Interface Font**: `Plus Jakarta Sans`, weight 400/500/600, line-height `1.5`.
- **Monospace & Telemetry Font**: `JetBrains Mono` / `ui-monospace`, tabular numbers.
- **Rule of Thumb**: *Strictly NO italic headers. No faux handwriting fonts.*

```text
Scale Name    Font Size    Line Height    Tracking    Common Usage
─────────────────────────────────────────────────────────────────────────────
--text-3xs    0.625rem     0.875rem       +0.05em     Micro status badges, tags
--text-2xs    0.6875rem    0.9375rem      +0.03em     Form helper text, captions
--text-xs     0.75rem      1.0rem         +0.01em     Table headers, badges
--text-sm     0.875rem     1.25rem         0em        Standard UI labels, buttons
--text-base   1.0rem       1.5rem          0em        Body narrative, descriptions
--text-md     1.125rem     1.625rem       -0.01em     Card headers, callout lead
--text-lg     1.25rem      1.75rem        -0.015em    Section titles
--text-xl     1.5rem       2.0rem         -0.02em     Panel headlines
--text-2xl    1.875rem     2.25rem        -0.025em    Page headers, metrics
--text-3xl    2.25rem      2.625rem       -0.03em     Telemetry KPIs, counters
--text-4xl    3.0rem       3.25rem        -0.035em    Hero banners, token display
```

#### Tabular Numerics (`.tabular-nums`)
All timers, hospital ICU counters, wait estimates, and coordinate telemetry MUST apply:
```css
.tabular-nums {
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
```
This eliminates visual jitter when digits increment or decrement.

---

### Spacing & Spatial Grid

We utilize an uncompromising **4-point base geometric scale**:

```css
--space-3xs: 0.25rem;  /* 4px  - icon gaps, micro padding */
--space-2xs: 0.5rem;   /* 8px  - compact badges, button inner padding */
--space-xs:  0.75rem;  /* 12px - input padding vertical, form gaps */
--space-sm:  1.0rem;   /* 16px - standard component internal padding */
--space-md:  1.5rem;   /* 24px - card content separation */
--space-lg:  2.0rem;   /* 32px - section margins, column gutters */
--space-xl:  3.0rem;   /* 48px - layout module blocks */
--space-2xl: 4.5rem;   /* 72px - major page divisions */
--space-3xl: 6.0rem;   /* 96px - hero spacing */
```

---

### Surfaces, Elevation & Borders

In clinical operations, muddy multi-layer blurred drop shadows reduce scannability. Pulse UI uses **crisp hairline borders (1px) combined with subtle micro-elevations**:

```css
/* Hairline Divider & Structural Rules */
--border-hairline: 1px solid var(--color-rule);

/* Micro Elevations */
--shadow-hairline: 0 1px 2px 0 rgba(15, 23, 42, 0.04);
--shadow-card:     0 2px 8px -2px rgba(15, 23, 42, 0.05), 0 1px 3px 0 rgba(15, 23, 42, 0.03);
--shadow-dropdown: 0 10px 30px -4px rgba(15, 23, 42, 0.10), 0 4px 10px -2px rgba(15, 23, 42, 0.04);
--shadow-modal:    0 20px 45px -10px rgba(15, 23, 42, 0.20), 0 8px 16px -4px rgba(15, 23, 42, 0.06);

/* Corner Radii */
--radius-xs:   0.375rem; /* 6px */
--radius-sm:   0.5rem;   /* 8px */
--radius-md:   0.75rem;  /* 12px */
--radius-lg:   1.0rem;   /* 16px */
--radius-xl:   1.25rem;  /* 20px */
--radius-pill: 9999px;
```

---

### Motion & Timing Physics

- **Stance**: `motion-cut`. We strictly forbid heavy animation libraries (Framer Motion / GSAP bloat) for critical interactive workflows.
- **Easing**: `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` (snappy acceleration, smooth settle).
- **Durations**:
  - Micro feedback (clicks, hover states): `80ms - 140ms`
  - Overlays & Popovers: `180ms - 220ms`
- **Accessibility**: When `prefers-reduced-motion: reduce` is enabled, all animations transition to instant or opacity cross-fade `<= 150ms`.

---

## 4. Component Design Specifications

### Buttons & Interactive Triggers

```html
<!-- Primary Medical Action -->
<button class="pulse-btn pulse-btn-primary">Confirm Booking</button>

<!-- Secondary Action -->
<button class="pulse-btn pulse-btn-secondary">Download PDF</button>

<!-- Outline Variant -->
<button class="pulse-btn pulse-btn-outline">View Details</button>

<!-- Emergency Alert Trigger -->
<button class="pulse-btn pulse-btn-emergency">Broadcast Trauma Alert</button>

<!-- Ghost / Icon Trigger -->
<button class="pulse-btn pulse-btn-ghost">Dismiss</button>
```

**Interaction Rules**:
- Single-line label with `white-space: nowrap;`.
- On `:active`, button shifts `transform: translateY(1px)` to mimic tactile mechanical depression.
- No bouncy overshoot or inflated `hover:scale-105` animations.

---

### Cards & Surface Containers

```html
<!-- High-Scannability Clinical Card -->
<div class="pulse-card">
  <div class="pulse-card-header">
    <h3 class="pulse-h3">Doctor Consultation Queue</h3>
    <span class="pulse-badge pulse-badge-blue">OPD Live</span>
  </div>
  <div class="pulse-card-body">
    <div class="pulse-stat-grid">
      <div class="pulse-stat-item">
        <span class="pulse-stat-label">Currently Serving</span>
        <span class="pulse-stat-value tabular-nums">TK-042</span>
      </div>
      <div class="pulse-stat-item">
        <span class="pulse-stat-label">Estimated Wait</span>
        <span class="pulse-stat-value tabular-nums">8 mins</span>
      </div>
    </div>
  </div>
  <div class="pulse-card-footer">
    <button class="pulse-btn pulse-btn-secondary pulse-btn-sm">Transfer Patient</button>
    <button class="pulse-btn pulse-btn-primary pulse-btn-sm">Call Next</button>
  </div>
</div>
```

---

### Form Controls & Input Fields

```html
<div class="pulse-form-group">
  <label class="pulse-label" for="patient-phone">Patient Mobile Number</label>
  <input type="tel" id="patient-phone" class="pulse-input" placeholder="+91 98765 43210" />
  <span class="pulse-hint">We send SMS queue alerts and QR tokens here.</span>
</div>

<div class="pulse-form-group">
  <label class="pulse-label" for="triage-severity">Triage Severity Level</label>
  <select id="triage-severity" class="pulse-select">
    <option value="routine">Routine Checkup (Green)</option>
    <option value="urgent">Urgent Attention (Amber)</option>
    <option value="critical">Critical Trauma (Red)</option>
  </select>
</div>
```

**Focus Rings**:
Every input features an instant, high-contrast focus ring:
```css
:focus-visible {
  outline: 2px solid var(--color-focus) !important;
  outline-offset: 2px !important;
}
```

---

### Status Badges, Triage Chips & Telemetry Dots

```html
<!-- Live Operational Status -->
<span class="pulse-badge pulse-badge-green">
  <span class="pulse-dot pulse-dot-green"></span> Available
</span>

<!-- Emergency Dispatch -->
<span class="pulse-badge pulse-badge-emergency">
  <span class="pulse-dot pulse-dot-red animate-pulse-gentle"></span> Critical ER
</span>

<!-- Triage Amber -->
<span class="pulse-badge pulse-badge-amber">
  <span class="pulse-dot pulse-dot-amber"></span> Pending Triage
</span>

<!-- Neutral Slate -->
<span class="pulse-badge pulse-badge-neutral">Archived</span>
```

---

### Data Tables & Tabular Telemetry

```html
<div class="pulse-table-container">
  <table class="pulse-table">
    <thead>
      <tr>
        <th>Hospital</th>
        <th>Specialty</th>
        <th>ICU Beds</th>
        <th>Blood Units</th>
        <th>Distance</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="pulse-font-semibold">DemoCare Central</td>
        <td>Trauma & Cardiac</td>
        <td class="tabular-nums">18 Free</td>
        <td class="tabular-nums">O-, A+, B+</td>
        <td class="tabular-nums">0.0 km</td>
        <td><span class="pulse-badge pulse-badge-green">Ready</span></td>
      </tr>
      <tr>
        <td class="pulse-font-semibold">Apollo Trauma Center</td>
        <td>Super-Specialty</td>
        <td class="tabular-nums">12 Free</td>
        <td class="tabular-nums">O-, B-, AB+</td>
        <td class="tabular-nums">4.8 km</td>
        <td><span class="pulse-badge pulse-badge-green">Ready</span></td>
      </tr>
    </tbody>
  </table>
</div>
```

---

### Alert Banners & Emergency Callouts

```html
<!-- Emergency Broadcast Callout -->
<div class="pulse-alert pulse-alert-emergency">
  <div class="pulse-alert-icon">⚠️</div>
  <div class="pulse-alert-content">
    <h4 class="pulse-alert-title">Trauma Code Red: Multi-Vehicle Collision</h4>
    <p class="pulse-alert-desc">Auto-escalation timer running: 120s remaining to accept broadcast.</p>
  </div>
  <button class="pulse-btn pulse-btn-emergency pulse-btn-sm">Claim Patient</button>
</div>
```

---

## 5. The Anti-Slop Discipline (Quality Gates)

Pulse UI strictly prohibits generic AI visual tropes:

1. **No Gratuitous Background Gradients**: No bright purple-to-indigo wash on backgrounds. Plain canvas with controlled zinc tinting (`--color-paper`).
2. **No Faux Glassmorphism**: Never use `backdrop-filter: blur(20px)` on primary text cards where legibility is critical. Use solid white / neutral cards with crisp hairlines.
3. **No Unneeded Icon Spinners**: Spinners should only appear for network transactions exceeding 200ms.
4. **No Card-in-Card Nesting**: Max 1 layer of surface containment.
5. **No Decorative Bouncing Springs**: Modals and drawers slide in with strict cubic-bezier deceleration.
6. **No Floating Sparkles or Emojis in Clinical Views**: Use standard technical glyphs (Activity, Radio, Shield, HeartPulse).

---

## 6. Cross-Platform Integration Recipes

### Vanilla HTML / Plain CSS
Copy `pulse-design-system.css` into your project directory and link it:
```html
<link rel="stylesheet" href="./pulse-design-system.css">
```

### React / Vite / Next.js
Install fonts in `index.html` or `layout.jsx`, then import the stylesheet globally:
```javascript
// src/main.jsx or pages/_app.js
import './pulse-design-system.css';
```

### Tailwind CSS Configuration Mapping
If you use Tailwind CSS, add this to `tailwind.config.js` to map Pulse UI tokens directly into Tailwind utility classes:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: 'var(--color-paper)',
          2: 'var(--color-paper-2)',
          subtle: 'var(--color-paper-subtle)',
        },
        ink: {
          DEFAULT: 'var(--color-ink)',
          2: 'var(--color-ink-2)',
          muted: 'var(--color-ink-muted)',
        },
        rule: {
          DEFAULT: 'var(--color-rule)',
          subtle: 'var(--color-rule-subtle)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          light: 'var(--color-accent-light)',
        },
        emergency: {
          DEFAULT: 'var(--color-emergency)',
          hover: 'var(--color-emergency-hover)',
          light: 'var(--color-emergency-light)',
        },
        operational: {
          DEFAULT: 'var(--color-operational)',
          light: 'var(--color-operational-light)',
        },
        amber: {
          DEFAULT: 'var(--color-amber)',
          light: 'var(--color-amber-light)',
        }
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      boxShadow: {
        hairline: 'var(--shadow-hairline)',
        card: 'var(--shadow-card)',
        dropdown: 'var(--shadow-dropdown)',
        modal: 'var(--shadow-modal)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      }
    },
  },
  plugins: [],
}
```

### Vue / Nuxt / Svelte
Include in `nuxt.config.ts`:
```typescript
export default defineNuxtConfig({
  css: ['~/assets/pulse-design-system.css']
})
```
Or in SvelteKit `+layout.svelte`:
```html
<script>
  import '../pulse-design-system.css';
</script>
<slot />
```

---

## 7. Backwards Compatibility & Migration Reference

For this codebase (MedConnect Pulse), `pulse-design-system.css` includes automatic aliases for all legacy classes:

| Pulse UI Standard Class | Legacy Healthcare (`hc-*`) Alias | Legacy SaaS (`saas-*`) Alias |
|---|---|---|
| `.pulse-btn-primary` | `.hc-btn-primary` | `.saas-btn-primary` |
| `.pulse-btn-secondary` | `.hc-btn-secondary` | `.saas-btn-secondary` |
| `.pulse-btn-emergency` | `.hc-btn-emergency` | `.saas-btn-danger` |
| `.pulse-card` | `.hc-card` | `.saas-card` |
| `.pulse-card-hover` | `.hc-card-hover` | `.saas-card-hover` |
| `.pulse-badge-green` | `.hc-badge-green` | `.saas-badge-teal` |
| `.pulse-badge-amber` | `.hc-badge-warning` | `.saas-badge-amber` |
| `.pulse-badge-emergency` | `.hc-badge-emergency` | `.saas-badge-rose` |
| `.pulse-input` | `.hc-input` | `.saas-input` |

---

*Authored for MedConnect Pulse. Maintainer: Ishan-129 (Dev 3). Open for cross-project reuse.*
