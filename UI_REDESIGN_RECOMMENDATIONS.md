# PocketBench Windows: UI Improvement & Modern Windows Design Recommendations

**Target Application**: PocketBench Windows (`dev.pocketbench.desktop`)  
**Target Platform**: Windows 11 (22H2 / 23H2 / 24H2+, x64 / ARM64)  
**Design System Standards**: Microsoft Windows 11 Fluent Design System, WinUI 3 / Windows App SDK, `@fluentui/react-components` (Fluent UI v9)  
**Deliverable**: Requirement R2 — UI Redesign Research & Recommendations  
**Date**: October 2026  
**Author**: PocketBench UI/UX Architecture Team  

---

## Table of Contents
1. [Executive Summary & Design System Vision](#1-executive-summary--design-system-vision)
2. [Microsoft Windows 11 Fluent Design System Architecture](#2-microsoft-windows-11-fluent-design-system-architecture)
   - [2.1 Materials & Depth Architecture](#21-materials--depth-architecture)
   - [2.2 Typography Scale & Segoe UI Variable Font Ramp](#22-typography-scale--segoe-ui-variable-font-ramp)
   - [2.3 Layout Grid, Spacing & Geometry](#23-layout-grid-spacing--geometry)
   - [2.4 Theme Synchronization & Accessibility (WCAG AA)](#24-theme-synchronization--accessibility-wcag-aa)
3. [Comparative Benchmark Software Research](#3-comparative-benchmark-software-research)
   - [3.1 Analysis of Modern Accessible Benchmark Utilities](#31-analysis-of-modern-accessible-benchmark-utilities)
   - [3.2 Analysis of Legacy Intimidating Utility Anti-Patterns](#32-analysis-of-legacy-intimidating-utility-anti-patterns)
   - [3.3 Synthesis: The PocketBench UX Design Manifesto](#33-synthesis-the-pocketbench-ux-design-manifesto)
4. [Simplified 1-Click Benchmark Workflow](#4-simplified-1-click-benchmark-workflow)
   - [4.1 The 90-Second Standard Benchmark Architecture](#41-the-90-second-standard-benchmark-architecture)
   - [4.2 Progressive Disclosure: Custom & Advanced Mode Expander](#42-progressive-disclosure-custom--advanced-mode-expander)
   - [4.3 Pre-Flight Reassurance & Advisory Notices](#43-pre-flight-reassurance--advisory-notices)
5. [4-Tier Non-Technical Result Comprehension Framework](#5-4-tier-non-technical-result-comprehension-framework)
   - [5.1 Tier 1: Plain-English Performance Rating Badge & Overall Score](#51-tier-1-plain-english-performance-rating-badge--overall-score)
   - [5.2 Tier 2: Relative Percentile Distribution Indicator](#52-tier-2-relative-percentile-distribution-indicator)
   - [5.3 Tier 3: Everyday Real-World Capability Cards](#53-tier-3-everyday-real-world-capability-cards)
   - [5.4 Tier 4: Comparative Hardware Baseline Bar Charts](#54-tier-4-comparative-hardware-baseline-bar-charts)
   - [5.5 Tier 5 (Enthusiast Layer): Progressive Disclosure Technical Accordion](#55-tier-5-enthusiast-layer-progressive-disclosure-technical-accordion)
6. [Anti-Freeze Execution Architecture](#6-anti-freeze-execution-architecture)
   - [6.1 Decoupled Background Worker Process Architecture](#61-decoupled-background-worker-process-architecture)
   - [6.2 Coordinated Visual Motion (ProgressRing + Determinate ProgressBar)](#62-coordinated-visual-motion-progressring--determinate-progressbar)
   - [6.3 Dynamic Real-Time Countdown Engine](#63-dynamic-real-time-countdown-engine)
   - [6.4 Plain-Language Sub-Stage Narrative Ticker](#64-plain-language-sub-stage-narrative-ticker)
   - [6.5 Instantaneous, Non-Destructive Cancellation Architecture](#65-instantaneous-non-destructive-cancellation-architecture)
7. [Detailed Visual ASCII Wireframes](#7-detailed-visual-ascii-wireframes)
   - [7.1 Wireframe 1: Landing / Dashboard Screen](#71-wireframe-1-landing--dashboard-screen)
   - [7.2 Wireframe 2: Benchmark In-Progress Screen](#72-wireframe-2-benchmark-in-progress-screen)
   - [7.3 Wireframe 3: Benchmark Results Dashboard](#73-wireframe-3-benchmark-results-dashboard)
   - [7.4 Wireframe 4: Custom / Advanced Configuration Expander](#74-wireframe-4-custom--advanced-configuration-expander)
8. [Concrete Component Implementation Mapping to `@fluentui/react-components` v9](#8-concrete-component-implementation-mapping-to-fluentuireact-components-v9)
   - [8.1 Core Component Inventory & Property Specification](#81-core-component-inventory--property-specification)
   - [8.2 Fluent Design Token Usage & `makeStyles` Styling Patterns](#82-fluent-design-token-usage--makestyles-styling-patterns)
9. [Dual-Mode Harmonization: Bridging Benchmarking & AI Repair](#9-dual-mode-harmonization-bridging-benchmarking--ai-repair)
   - [9.1 The Unified "Benchmark -> Grade -> Explain -> Optimize" Lifecycle](#91-the-unified-benchmark---grade---explain---optimize-lifecycle)
   - [9.2 Zero-Configuration Offline Baseline with Optional Deep AI Research](#92-zero-configuration-offline-baseline-with-optional-deep-ai-research)
   - [9.3 Dismantling Psychological Anxiety: Financial, Security & Irreversibility Shields](#93-dismantling-psychological-anxiety-financial-security--irreversibility-shields)
10. [Implementation Roadmap & Acceptance Verification](#10-implementation-roadmap--acceptance-verification)

---

## 1. Executive Summary & Design System Vision

### 1.1 The PocketBench Paradigm Shift
`pocketbench-windows` is an Electron desktop application built on React 19, TypeScript, and Microsoft Fluent UI React Components v9 (`@fluentui/react-components`). The initial usability audit (`USABILITY_AUDIT.md`) uncovered a profound dissonance between user expectations and reality:
- **Brand Expectation**: The name **PocketBench** naturally communicates a fast, accessible, lightweight system benchmark utility—a modern Windows counterpart to tools like *Geekbench* or *CrystalDiskMark*.
- **Initial Reality**: The app presented an intimidating, developer-centric AI repair workbench gated behind user-supplied API keys, featuring unmetered 30-minute system scans, raw Windows system internals (`W32Time`, `HKCU\Run`), and terrifying financial meters (`$90.00 Limit`).

This document provides the definitive, comprehensive architectural specification to transform PocketBench into a **premier, modern Windows 11 system benchmark and optimization companion**. By aligning directly with the **Microsoft Windows 11 Fluent Design System** and synthesizing best-in-class UX patterns from leading consumer utilities, PocketBench will deliver:
1. **Zero-Friction 1-Click Benchmarking**: A hero ~90-second automated system benchmark testing CPU, RAM, Disk, and System Responsiveness without requiring setup, configuration, or API keys.
2. **4-Tier Non-Technical Score Comprehension**: Plain-English verbal rating badges, relative percentile rankings ("Faster than 78% of PCs"), relatable everyday capability cards (Office, 4K Video, Gaming), and comparative hardware baseline bar charts.
3. **Anti-Freeze Execution Architecture**: Guaranteed 60fps UI fluidity via decoupled background worker processes, coordinated dual-progress motion, dynamic countdown timers, and instant safe cancellation.
4. **Cohesive Dual-Mode Lifecycle**: Intelligent harmonization connecting performance evaluation directly to system health: *"Benchmark -> Grade -> Explain -> Optimize / Repair"*.

```
+---------------------------------------------------------------------------------------------------+
|                                  THE POCKETBENCH REDESIGN VISION                                  |
|                                                                                                   |
|   INTIMIDATING LEGACY UTILITY                         MODERN WINDOWS 11 FLUENT BENCHMARK          |
|   ---------------------------                         ----------------------------------          |
|   • Cryptic raw metrics (MIPS, IOPS)        ===>      • Plain-English ratings ("Excellent: 8,420")|
|   • Freezes UI thread, triggers (Not Resp)  ===>      • Decoupled 60fps worker, dynamic countdown |
|   • Scary warnings ("Cannot be undone!")    ===>      • Reassuring safety guarantees & guidance   |
|   • Hard-gated API keys & $90 billing dials ===>      • 100% free offline 1-click execution       |
|   • Flat dark Win32-style frames            ===>      • Mica material, Acrylic blur, 8px corners  |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Microsoft Windows 11 Fluent Design System Architecture

Windows 11 establishes a distinct, dignified visual language characterized by light-aware materials, soft rounded geometry, deliberate typography, and high-visibility accessibility. PocketBench must implement these principles natively.

### 2.1 Materials & Depth Architecture

Windows 11 replaces arbitrary dark fills with purposeful physical materials that ground applications within the operating system shell:

```
+-----------------------------------------------------------------------------------------+
| WINDOWS 11 LAYERED DEPTH ARCHITECTURE                                                   |
|                                                                                         |
|  [Layer 3: Flyouts, Dialogs & Modals]  -->  Acrylic / Smoke Overlay (blur + dim)        |
|      ▲                                                                                  |
|  [Layer 2: Hovered / Floating Cards]  -->  Elevated Surface + 4px subtle drop shadow    |
|      ▲                                                                                  |
|  [Layer 1: Content Containers / Cards]-->  Solid Neutral Surface + 1px elevation border |
|      ▲                                                                                  |
|  [Layer 0: App Window Canvas]         -->  Mica / Mica Alt Backdrop (Desktop Wallpaper) |
+-----------------------------------------------------------------------------------------+
```

#### 1. Mica & Mica Alt (The Foundation Canvas)
- **Role**: The persistent background material for the primary application window, title bar, and sidebar navigation pane.
- **Behavior**: Mica dynamically samples the user's active desktop wallpaper through a subtle tint, visually embedding the application into the desktop environment. When the window loses focus (inactive state), Mica automatically transitions to an opaque neutral fallback color (`--pb-bg-inactive`), signaling background status without distracting the user.
- **Mica Alt**: Reserved for tabbed containers and the left navigation sidebar to establish subtle visual contrast against the main content canvas.
- **Electron Implementation**:
  ```typescript
  // src/main/window.ts
  const mainWindow = new BrowserWindow({
    width: 1080,
    height: 740,
    minWidth: 840,
    minHeight: 600,
    frame: false, // Custom Fluent titlebar
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#ffffff',
      height: 40
    },
    backgroundMaterial: 'mica', // Windows 11 DWM native Mica
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  });
  ```
  ```css
  /* src/renderer/styles/fluent-materials.css */
  :root {
    --pb-mica-fallback-dark: #1a1f26;
    --pb-mica-fallback-light: #f3f3f3;
  }
  body {
    margin: 0;
    padding: 0;
    background: transparent !important; /* Permits native DWM Mica passthrough */
    overflow: hidden;
    user-select: none;
  }
  ```

#### 2. Acrylic Material (Transient Surfaces)
- **Role**: A translucent, blurred glass effect reserved strictly for **light-dismiss, ephemeral surfaces**: context menus, tooltips, flyout popovers, dropdown lists, and search autocomplete menus.
- **Performance Rule**: Acrylic samples and blurs content dynamically behind the element. Acrylic must **never** be applied to permanent, scrollable main content surfaces, as continuous blur re-computation causes GPU frame drops and micro-stuttering during scrolling.
- **Styling Configuration**:
  ```css
  .fluent-acrylic-flyout {
    background: rgba(32, 36, 42, 0.75);
    backdrop-filter: blur(20px) saturate(125%);
    -webkit-backdrop-filter: blur(20px) saturate(125%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.28);
    border-radius: 12px;
  }
  ```

#### 3. Smoke Overlay (Modal Focus)
- **Role**: A semi-transparent dimming scrim placed directly beneath modal dialogs (e.g., benchmark execution overlay, cancel confirmation prompts, export dialogs).
- **Parameters**: `rgba(0, 0, 0, 0.40)` in dark mode; `rgba(0, 0, 0, 0.20)` in light mode.
- **Function**: Focuses user attention completely on the active task while blocking background pointer interactions. Dismissible via `Escape` key or explicit cancel actions.

#### 4. 1px Subtle Elevation Borders & Shadows
Windows 11 abandons heavy, muddy drop shadows in favor of crisp 1px borders paired with subtle ambient diffusion:
- **Dark Mode Elevation Border**: `1px solid rgba(255, 255, 255, 0.08)` (subtle top highlight matching physical overhead lighting).
- **Light Mode Elevation Border**: `1px solid rgba(0, 0, 0, 0.06)`.
- **Card Hover Elevation**: `box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12)`.
- **Modal Elevation**: `box-shadow: 0 16px 32px rgba(0, 0, 0, 0.24)`.

---

### 2.2 Typography Scale & Segoe UI Variable Font Ramp

Typography in Windows 11 is built upon **Segoe UI Variable**, an optical-size variable font engineered to provide optimal legibility from compact 11px system captions up to 68px display hero titles.

```
+-------------------------------------------------------------------------------------------------------+
| SEGOE UI VARIABLE TYPE RAMP FOR POCKETBENCH                                                           |
+------------------+-------+-------------+---------------+--------------+-------------------------------+
| Level            | Size  | Line Height | Weight        | Optical Axis | Application in PocketBench    |
+------------------+-------+-------------+---------------+--------------+-------------------------------+
| Display          | 68px  | 92px        | Semibold (600)| 'opsz' 36    | Milestone celebration score   |
| Title Large      | 40px  | 52px        | Semibold (600)| 'opsz' 36    | Main benchmark score readout  |
| Title            | 28px  | 36px        | Semibold (600)| 'opsz' 28    | Page headings ("System Bench")|
| Subtitle         | 20px  | 26px        | Semibold (600)| 'opsz' 20    | Section titles, Card headers  |
| Body Large       | 16px  | 22px        | Regular (400) | 'opsz' 16    | Hero subtexts, Verbal ratings |
| Body             | 14px  | 20px        | Regular (400) | 'opsz' 14    | Default UI text, card desc.   |
| Caption          | 12px  | 16px        | Regular (400) | 'opsz' 12    | Hardware specs, timestamps    |
+------------------+-------+-------------+---------------+--------------+-------------------------------+
```

#### Strict Typography Rules
1. **Sentence Case Enforcement**: All headers, button labels, tabs, and card titles must use sentence case (e.g., *"Run standard benchmark"*, not *"RUN STANDARD BENCHMARK"* or *"Run Standard Benchmark"*).
2. **Tabular Numerals for Telemetry**: All dynamic metrics (clock speeds, live CPU load, elapsed countdown timers, disk read/write throughput) must enforce tabular numerals to prevent layout jitter:
   ```css
   .pb-tabular-metric {
     font-variant-numeric: tabular-nums;
     font-feature-settings: "tnum";
     font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
   }
   .pb-code-metric {
     font-family: "Cascadia Code", "Consolas", monospace;
     font-variant-numeric: tabular-nums;
   }
   ```
3. **High-DPI Optical Scaling**: Segoe UI Variable dynamically adjusts letter spacing and stroke thickness based on the active display scaling factor (100%, 125%, 150%, 175%, 200%, 250%), ensuring crisp legibility on 4K laptops and multi-monitor setups.

---

### 2.3 Layout Grid, Spacing & Geometry

Windows 11 utilizes an incremental **4px / 8px grid system** that produces a structured rhythm across diverse window dimensions:

```
+-------------------------------------------------------------------------------------------------------+
| 4px / 8px GRID SYSTEM & GEOMETRY HIERARCHY                                                            |
|                                                                                                       |
|   Spacing Units:                                                                                      |
|   • 4px  : Micro spacing (icon-to-text margin, status dot padding)                                    |
|   • 8px  : Tight control spacing (gap between inline action buttons, badge internal padding)          |
|   • 12px : Standard control gap (gap between adjacent cards in grid)                                  |
|   • 16px : Card interior padding (compact cards, list items)                                          |
|   • 24px : Hero container padding, section vertical separation                                        |
|   • 32px : Primary page horizontal margins                                                            |
|                                                                                                       |
|   Corner Radii Standards:                                                                             |
|   • Window Frame Canvas : 8px (OS standard)                                                           |
|   • Content Cards       : 8px (border-radius: 8px)                                                    |
|   • Flyouts & Modals    : 12px (border-radius: 12px)                                                  |
|   • Buttons & Controls  : 4px to 6px (border-radius: 6px)                                              |
|   • Status Pills/Badges : 9999px (fully rounded ends)                                                 |
+-------------------------------------------------------------------------------------------------------+
```

- **Interactive Control Sizing**:
  - Primary Hero CTA Button: `height: 40px`, `padding: 0 24px`, font weight 600.
  - Standard Action Buttons: `height: 32px`, `padding: 0 16px`.
  - Icon-only Action Buttons: `width: 32px`, `height: 32px`.
  - Minimum touch/click target area: `32px x 32px` to prevent misclicks on touch-enabled Windows 11 devices (Surface Pro, 2-in-1s).

---

### 2.4 Theme Synchronization & Accessibility (WCAG AA)

#### 1. Dynamic System Theme Synchronization
PocketBench must not hardcode dark theme (`main.tsx:17`). Instead, it must dynamically track the Windows 11 system personalization settings:

```typescript
// src/renderer/theme/ThemeManager.tsx
import React, { useEffect, useState } from 'react';
import { FluentProvider, webDarkTheme, webLightTheme, Theme } from '@fluentui/react-components';

export const PocketBenchThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme} className="pb-app-container">
      {children}
    </FluentProvider>
  );
};
```

#### 2. High Contrast Mode Support (Windows Contrast Themes)
PocketBench must support Windows High Contrast themes (`Aquatic`, `Desert`, `Dusk`, `Night Sky`) via the standardized CSS media query:
```css
@media (forced-colors: active) {
  .pb-card, .pb-hero-card {
    border: 2px solid ButtonText !important;
    background: Canvas !important;
    color: CanvasText !important;
  }
  .pb-badge {
    border: 1px solid Highlight !important;
    color: Highlight !important;
  }
  .pb-progress-bar-fill {
    background: Highlight !important;
  }
}
```

#### 3. Two-Layer High-Visibility Keyboard Focus Rings
In accordance with Windows 11 accessibility standards, all interactive controls must feature high-visibility two-layer focus rings:
```css
:focus-visible {
  outline: 2px solid #ffffff !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px #000000 !important;
}
```

#### 4. W3C WAI-ARIA Live Region Updates
For screen readers (Windows Narrator, NVDA, JAWS), benchmark state changes must be voiced automatically using `aria-live="polite"`:
```html
<div aria-live="polite" aria-atomic="true" class="sr-only">
  Stage 2 of 4 started: Testing processor multi-core responsiveness. Estimated time remaining: 38 seconds.
</div>
```

---

## 3. Comparative Benchmark Software Research

To design an exemplary user interface, we evaluated the foremost contemporary benchmark utilities alongside legacy power tools to identify design patterns that foster confidence versus anti-patterns that induce intimidation.

### 3.1 Analysis of Modern Accessible Benchmark Utilities

```
+--------------------------------------------------------------------------------------------------------------------+
| MODERN ACCESSIBLE BENCHMARK TOOLS COMPARATIVE EVALUATION MATRIX                                                    |
+-------------------+----------------------------+-----------------------------+-------------------------------------+
| Tool              | Exemplary UX Strengths     | Critical Weaknesses         | PocketBench Redesign Adoption       |
+-------------------+----------------------------+-----------------------------+-------------------------------------+
| **Geekbench 6**   | • Zero-friction 1-click CTA| • Cloud-only comparison db  | Adopt the clean 1-click execution   |
|                   | • Relatable real workloads | • Window freezes on memory  | and relatable real-world task       |
|                   | • Generous whitespace      | • Zero live hardware metrics| metaphors; ensure offline baselines.|
|                   | • Clean modern typography  | • Minimal progress detail   | Provide non-blocking UI fluidity.   |
+-------------------+----------------------------+-----------------------------+-------------------------------------+
| **Cinebench 2024**| • Visceral visual progress | • Massive 1.3 GB download   | Adopt the horizontal comparative    |
|                   | • Instant comparative bars | • 10-minute test duration   | ranking bar charts directly below   |
|                   | • High-contrast dark theme | • Complex enterprise 3D UI  | the overall score badge.            |
+-------------------+----------------------------+-----------------------------+-------------------------------------+
| **CrystalDiskMark**| • Simple 4x2 matrix layout| • Outdated Win32 aesthetic  | Adopt preset test profiles;         |
|                   | • Color-coded read/write   | • Cryptic jargon (Q8T1, IOPS)| translate raw MB/s into plain cards |
|                   | • Instant, zero-bloat launch| • No overall rating verdict | ("Ultra-Fast NVMe", "Instant boot").|
+-------------------+----------------------------+-----------------------------+-------------------------------------+
| **UL 3DMark**     | • Single unified score badge| • Enormous 30 GB download   | Adopt the percentile bell curve     |
|                   | • Percentile distribution  | • High hardware requirements| ("Faster than 78% of PCs") and      |
|                   | • Real-world FPS estimates | • Complex paid DLC structure| everyday real-world capability cards|
|                   | • Clear baseline comparison|                             | (Web, 4K Video, Gaming, Storage).   |
+-------------------+----------------------------+-----------------------------+-------------------------------------+
| **Windows 11 Task**| • Native Fluent Mica design| • No standardized benchmark | Replicate the visual language, card |
| **Manager**       | • SVG sparkline mini-graphs| • No comparative scoring    | elevation, and SVG telemetry        |
|                   | • Clear categorization     | • No historical tracking    | sparklines for hardware metrics.    |
+-------------------+----------------------------+-----------------------------+-------------------------------------+
```

---

### 3.2 Analysis of Legacy Intimidating Utility Anti-Patterns

Legacy utilities often terrify non-technical users, causing immediate cancellation or uninstallation. PocketBench explicitly prohibits these anti-patterns:

```
+--------------------------------------------------------------------------------------------------------------------+
| LEGACY INTIMIDATING UTILITY ANTI-PATTERNS & POCKETBENCH PROHIBITIONS                                               |
+-------------------+----------------------------+-----------------------------+-------------------------------------+
| Legacy Utility    | Intimidating Anti-Pattern  | User Psychological Reaction | PocketBench Strict Anti-Pattern Rule|
+-------------------+----------------------------+-----------------------------+-------------------------------------+
| **AIDA64**        | Dense Win95 tree hierarchy | Cognitive overload; novice  | **Rule 1: Progressive Disclosure**  |
|                   | with 100+ branches and raw | feels lost, fears clicking   | Hide raw registers, voltages, and   |
|                   | acronyms (VRM, VDDQ, PCH). | wrong items, exits app.     | sensor IDs in an expandable panel.  |
+-------------------+----------------------------+-----------------------------+-------------------------------------+
| **Prime95**       | "Torture Test" dialog with | Panic; user believes the    | **Rule 2: Never Freeze UI**         |
|                   | 16-32 blank worker consoles| system crashed or is infected| Execute workloads on isolated worker|
|                   | completely locking the UI. | by a virus; power-button kill| threads; maintain dynamic countdown.|
+-------------------+----------------------------+-----------------------------+-------------------------------------+
| **FurMark**       | Menacing furry donut with  | Fear of hardware destruction;| **Rule 3: Reassuring Advisory**     |
|                   | alarming fire hazard alerts| user immediately uninstalls | Explain fan spin-up transparently:  |
|                   | and sudden roaring fan RPM.| utility to protect PC.      | *"Fans will ramp up; this is normal"|
+-------------------+----------------------------+-----------------------------+-------------------------------------+
| **PassMark**      | 28 sequential tests seizing| Disorientation; user feels  | **Rule 4: Contained Windowed Flow** |
|                   | screen control with chaotic| hijacked by the app; radar  | Keep all tests inside app window;   |
|                   | 10-axis radar spider charts| charts are unreadable.      | use clear horizontal baseline bars. |
+-------------------+----------------------------+-----------------------------+-------------------------------------+
```

---

### 3.3 Synthesis: The PocketBench UX Design Manifesto

From these comparative findings, we define five inviolable design principles:
1. **Never Intimidate, Always Reassure**: Frame tests as safe system health verifications. Reassure the user that fan noise is healthy cooling behavior.
2. **One Click to Verdict**: The user should never need to configure thread counts, block sizes, or memory buffers just to evaluate their PC.
3. **Contextualize Every Number**: A raw number (e.g. `6,800 MB/s` or `12,400 pts`) means nothing in isolation. Every score must be accompanied by a verbal rating, a percentile rank, and a baseline comparison.
4. **Relatable Real-World Metaphors**: Ground technical hardware metrics in daily human experiences: web browsing, video streaming, office multitasking, and app startup speed.
5. **Absolute Fluidity**: The application must never trigger the Windows `(Not Responding)` window title or stutter the mouse cursor.

---

## 4. Simplified 1-Click Benchmark Workflow

### 4.1 The 90-Second Standard Benchmark Architecture

To deliver an instant, delightful experience, PocketBench establishes a **1-Click Standard Benchmark** that executes four automated stages in exactly ~90 seconds:

```
[ 1. User Clicks "Run Standard Benchmark" ]
       │
       ▼ (Stage 1: ~15s)
[ Stage 1: System Health & Responsiveness Check ]
       │ • Measures CPU idle headroom, background interference, and thermal state
       │ • Validates memory capacity and power profile (AC vs Battery)
       ▼ (Stage 2: ~35s)
[ Stage 2: Processor (CPU) Performance Evaluation ]
       │ • Single-Core Responsiveness (15s): Web parsing, code syntax analysis simulation
       │ • Multi-Core Throughput (20s): Parallel mathematical calculations across all threads
       ▼ (Stage 3: ~20s)
[ Stage 3: Memory (RAM) Bandwidth & Latency ]
       │ • Sequential data streaming throughput (GB/s)
       │ • Memory latency access timing (ns)
       ▼ (Stage 4: ~20s)
[ Stage 4: Storage (Disk) Speed & Responsiveness ]
       │ • Sequential 1MB read/write throughput (MB/s) on primary OS drive
       │ • Random 4K read responsiveness (OS boot & app launch simulation)
       ▼
[ Immediate Transition: 4-Tier Results Dashboard ]
```

---

### 4.2 Progressive Disclosure: Custom & Advanced Mode Expander

Power users and technicians who wish to isolate specific components or run stress tests do so through a collapsible `SettingsExpander` card positioned directly below the hero card:

- **Default State (Collapsed)**: Conserves visual real estate; presents a clean title *"Custom & advanced benchmark options"* with an informative subtitle *"Select individual components or stress testing durations"* and a subtle chevron icon.
- **Expanded State**: Smoothly slides open to reveal granular configuration controls:
  - **Component Selection Checkboxes**:
    - `[x] Processor (CPU) - Single-Core & Multi-Core Workloads`
    - `[x] Memory (RAM) - Bandwidth & Latency Evaluation`
    - `[x] Storage (SSD/HDD) - Sequential & Random Access Speed`
    - `[ ] Extended System Stress Test (Continuous stability loop)`
  - **Target Storage Drive Dropdown**: Select between available volumes (`C: (NVMe SSD, 1.1 TB Free)`, `D: (SATA SSD, 450 GB Free)`).
  - **Duration / Intensity Slider**:
    - `Quick (~45s)` — Fast evaluation for quick checkups.
    - `Standard (~90s)` *(Default)* — Balanced 4-stage evaluation.
    - `Thorough (~5 min)` — Deep multi-pass workload.
    - `Endurance (~15 min)` — Thermal throttling and stability evaluation.
  - **Execution Action**: Dedicated secondary CTA button `[ Run Custom Benchmark ]`.

---

### 4.3 Pre-Flight Reassurance & Advisory Notices

Before and during execution, PocketBench provides comforting guidance that neutralizes anxiety:
- **Cooling Reassurance Notice**: Embedded inline inside the Hero card:
  > *(i) Reassurance: Your cooling fans may spin up during testing—this is completely normal and confirms your cooling system is functioning properly. Your screen and mouse will remain fully responsive.*
- **Battery Power Advisory InfoBar**: If the device is a laptop running on battery power:
  > *⚠️ Laptop Running on Battery: For the highest performance and most accurate score, plug in your power charger before benchmarking.* (Includes an inline `[ Benchmark Anyway ]` button).
- **Disk Space Pre-Check**: Proactively ensures at least 2.5 GB of free space exists on the target drive before launching the storage benchmark stage.

---

## 5. 4-Tier Non-Technical Result Comprehension Framework

The central flaw of conventional benchmark software is presenting incomprehensible raw numbers (`52,380 MIPS`, `6,842 MB/s`, `42.4 ns`). PocketBench pioneers a **4-Tier Non-Technical Comprehension Framework** that translates raw physics into human understanding:

```
+-----------------------------------------------------------------------------------------+
| POCKETBENCH 4-TIER RESULT COMPREHENSION ARCHITECTURE                                    |
|                                                                                         |
|  [TIER 1: Plain-English Rating & Score]  -->  "EXCELLENT PERFORMANCE" · 8,420           |
|                                                                                         |
|  [TIER 2: Relative Percentile Ranking]  -->  "Faster than 78% of tested Windows 11 PCs"|
|                                                                                         |
|  [TIER 3: Everyday Capability Cards]    -->  Web & Office: Instantaneous               |
|                                         -->  4K Video & Editing: Smooth & Capable       |
|                                         -->  Gaming: Modern 1080p/1440p Ready           |
|                                         -->  Storage: Ultra-Fast NVMe Boot             |
|                                                                                         |
|  [TIER 4: Comparative Baseline Charts]  -->  Horizontal bars comparing vs Ref PCs      |
|                                                                                         |
|  [TIER 5: Progressive Tech Accordion]   -->  (Optional) Raw clock, MB/s, IOPS, thermals|
+-----------------------------------------------------------------------------------------+
```

---

### 5.1 Tier 1: Plain-English Performance Rating Badge & Overall Score

At the top of the Results Dashboard, the user receives an authoritative, unambiguous verdict:
- **Numerical Overall Score**: Formatted in Segoe UI Variable Display at 40px (e.g., `8,420`).
- **Verbal Rating Tiers**:
  ```
  • 9,000+       : EXCEPTIONAL PERFORMANCE  (Vibrant Purple / Brand Tint Badge)
                   Top-tier desktop or creator workstation; effortless high-end multitasking.
  • 7,500 - 8,999: EXCELLENT PERFORMANCE    (Success Green Tint Badge)
                   Fast, modern computer; excels at demanding productivity, gaming, and 4K media.
  • 5,500 - 7,499: GOOD EVERYDAY PERFORMANCE (Informative Blue Tint Badge)
                   Smooth, responsive performance for everyday office tasks, web, and streaming.
  • 3,500 - 5,499: FAIR PERFORMANCE          (Warning Yellow/Amber Tint Badge)
                   Adequate for basic browsing and documents; may experience slowdowns under load.
  • < 3,500      : NEEDS ATTENTION           (Danger Red Tint Badge)
                   Noticeable sluggishness detected; storage cleanup or hardware upgrade recommended.
  ```

---

### 5.2 Tier 2: Relative Percentile Distribution Indicator

Directly below the rating badge, a horizontal percentile gradient bar visualizes where the user's PC ranks in the broader ecosystem:
- **Narrative Headline**: **"Your PC is faster than 78% of tested Windows 11 computers."**
- **Context Subtitle**: *"Based on 250,000+ anonymous Windows 11 benchmark profiles collected across similar desktop and laptop hardware."*
- **Visual Presentation**: A smooth, rounded horizontal track with an accented indicator pin showing the system's position on the distribution curve.

---

### 5.3 Tier 3: Everyday Real-World Capability Cards

Translates component performance into 4 tangible lifestyle activity cards:

```
+---------------------------------------------------------------------------------------------------------+
| EVERYDAY CAPABILITIES GRID (4 MODULAR CARDS)                                                            |
+-----------------------------+-----------------------------+---------------------------------------------+
| Card Category               | Rating & Headline           | Plain-English Capability Description        |
+-----------------------------+-----------------------------+---------------------------------------------+
| 🌐 **Everyday Web & Office**| **Instantaneous**           | Boots productivity apps in under 1 second;  |
|                             | *(Sub-Score: 9,200)*        | effortlessly handles 35+ active browser tabs|
|                             |                             | without stuttering or memory exhaustion.    |
+-----------------------------+-----------------------------+---------------------------------------------+
| 🎬 **4K Media & Creation**  | **Smooth & Fast**           | Capable of effortless 4K video playback,    |
|                             | *(Sub-Score: 8,150)*        | multi-track audio editing, and fast batch   |
|                             |                             | photo processing in modern creative apps.   |
+-----------------------------+-----------------------------+---------------------------------------------+
| 🎮 **Gaming & 3D Graphics** | **Great for Modern Gaming** | Delivers fluid 60+ FPS performance in modern|
|                             | *(Sub-Score: 7,900)*        | games at 1080p and 1440p resolutions with   |
|                             |                             | medium-to-high graphical fidelity.          |
+-----------------------------+-----------------------------+---------------------------------------------+
| ⚡ **Storage Responsiveness**| **Ultra-Fast NVMe SSD**     | Windows restarts in under 6 seconds; large  |
|                             | *(Sub-Score: 9,850)*        | file transfers and game loading screens     |
|                             |                             | complete near-instantaneously.              |
+-----------------------------+-----------------------------+---------------------------------------------+
```

---

### 5.4 Tier 4: Comparative Hardware Baseline Bar Charts

Displays clear horizontal comparison bars bench-marking the user's system against standardized reference profiles:

```
HOW YOUR PC COMPARES TO REFERENCE BENCHMARKS

Your PC (Ryzen 7 7800X, 32GB, NVMe)   [======================================= 8,420 ] (Brand Blue)
High-End Creator Desktop (2026)       [=============================================== 10,400 ] (Subtle)
Typical Modern Home/Office PC (2025)  [============================= 6,200 ] (Subtle)
Budget Laptop (2023)                  [================== 3,900 ] (Subtle)
```
- **Scale Normalization**: Automatically scales the max width dynamically to prevent bar overflow.
- **Visual Focus**: The user's bar is highlighted in the active Windows brand accent color, while reference baselines use neutral muted fills.

---

### 5.5 Tier 5 (Enthusiast Layer): Progressive Disclosure Technical Accordion

For power users, gamers, and IT professionals who need raw hardware telemetry, an expandable accordion card titled `[ > View Detailed Hardware & Sensor Telemetry ]` reveals:
- **Processor (CPU)**: Single-Core score (e.g. `2,150`), Multi-Core score (e.g. `14,820`), maximum clock frequency reached (`5.04 GHz`), peak package temperature (`74.2 °C`).
- **Memory (RAM)**: Measured read bandwidth (`64.2 GB/s`), write bandwidth (`58.8 GB/s`), access latency (`68.4 ns`).
- **Storage Drive (C:)**: Sequential Read (`6,850 MB/s`), Sequential Write (`5,120 MB/s`), Random 4K Read IOPS (`680,000 IOPS`).
- **Copy / Export**: A 1-click `[ Copy Raw Results (JSON) ]` button for forum sharing.

---

## 6. Anti-Freeze Execution Architecture

Conventional utilities frequently freeze the Windows message pump during heavy calculations, resulting in the dreaded `(Not Responding)` window title, corrupted window repainting, and terrified users killing the process in Task Manager. PocketBench implements five mandatory architectural safeguards:

```
+-----------------------------------------------------------------------------------------+
| DECOUPLED ANTI-FREEZE WORKER THREAD ARCHITECTURE                                        |
|                                                                                         |
|   [ Electron Renderer (UI Thread) ]                                                     |
|       │ • 60 FPS Fluidity: Handles window drag, resize, theme, and animations           |
|       │ • Throttled IPC updates: Receives progress messages buffered at 100ms intervals |
|       │ • Smooth CSS Transitions: 300ms cubic-bezier progress easing                    |
|       ▲                                                                                 |
|       │ (Safe Non-Blocking Electron IPC: `benchmark:status` / `benchmark:cancel`)       |
|       ▼                                                                                 |
|   [ Background Worker Process (Node.js Worker Thread / Child Process) ]                 |
|       │ • PRIORITY_BELOW_NORMAL: Windows scheduler reserves CPU headroom for UI thread  |
|       │ • Sandboxed I/O: Writes temp benchmark files to %LOCALAPPDATA%\PocketBench\     |
|       │ • Instant AbortController: Terminates execution within < 300ms on cancel        |
+-----------------------------------------------------------------------------------------+
```

### 6.1 Decoupled Background Worker Process Architecture
1. **Isolation**: All mathematical loops, synthetic memory allocations, and disk I/O routines execute inside a dedicated Node.js `worker_threads` instance or an isolated child process (`benchmarkWorker.ts`).
2. **Priority Throttling**: The background process sets its scheduling priority to `PRIORITY_BELOW_NORMAL` via `os.setPriority()`. This ensures the Windows kernel always reserves CPU cycles for desktop compositing, mouse tracking, and UI event dispatching.
3. **Throttled IPC Telemetry**: Rather than flooding the Electron IPC channel with thousands of updates per second, worker telemetry is buffered and dispatched at a smooth 10 Hz rate (every 100ms), maintaining 60fps UI rendering.

---

### 6.2 Coordinated Visual Motion (ProgressRing + Determinate ProgressBar)
During execution, two complementary progress indicators operate simultaneously:
- **Determinate `ProgressBar`**: Spans the width of the card, tracking overall benchmark completion percentage (0% to 100%) with smooth CSS easing (`transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1)`).
- **Continuous Indeterminate `ProgressRing` / `Spinner`**: Positioned directly beside the active stage header. Even if a specific calculation takes 5 seconds without incrementing the overall percentage bar, the spinning motion provides continuous visual proof that the application is actively working and has not frozen.

---

### 6.3 Dynamic Real-Time Countdown Engine
Users abandon tasks when they cannot predict how long they will take. PocketBench provides an explicit dynamic countdown readout:
- **Format**: *"Estimated time remaining: ~42 seconds"*
- **Adaptive Clamping Algorithm**: If background system activity causes a stage to run slower than predicted, the countdown never jumps backward (e.g. from 10s to 18s) and never freezes at 0s. Instead, it smoothly clamps to:
  > *"Finishing up last calculations (~a few moments)..."*

---

### 6.4 Plain-Language Sub-Stage Narrative Ticker
Beneath the progress indicators, a live narrative ticker continuously describes the active sub-workload in friendly language:
- **CPU Stage**: *"Testing multi-core responsiveness: factoring mathematical simulations across 16 threads..."*
- **RAM Stage**: *"Testing memory speed: streaming 4 GB data blocks to measure transfer bandwidth..."*
- **Disk Stage**: *"Testing storage drive (C:): measuring app launch responsiveness and 4K random read speed..."*

---

### 6.5 Instantaneous, Non-Destructive Cancellation Architecture
An unmissable secondary button `[ Cancel Benchmark ]` is visible throughout the test:
- **Immediate Termination**: Clicking instantly signals the `AbortController` in the worker process, terminating active calculations within < 300ms.
- **Safe Sandboxed Cleanup**: Automatically flushes and deletes all temporary test files in `%LOCALAPPDATA%\PocketBench\benchmark_temp\`.
- **Clean State Reset**: Restores system power state and smoothly returns the user to the landing view without errors or window freezes.

---

## 7. Detailed Visual ASCII Wireframes

### 7.1 Wireframe 1: Landing / Dashboard Screen

```
+------------------------------------------------------------------------------------------------------------------+
| [=] PocketBench  -  System Benchmark & Health                                               [ _ ]  [ [] ]  [ X ]  |
+------------------------------------------------------------------------------------------------------------------+
|  NAVIGATION PANE     |  BREADCRUMB:  System Benchmark  >  Overview                                               |
|  ------------------  |-------------------------------------------------------------------------------------------|
|                      |                                                                                           |
|  (H) Dashboard   *   |  # System Benchmark & Health                                                              |
|  (B) Benchmark       |  Evaluate your computer's speed, stability, and everyday performance in ~90 seconds.      |
|  (C) Comparison      |                                                                                           |
|  (H) History         |  +-------------------------------------------------------------------------------------+  |
|  (R) AI Optimize     |  | HERO CARD: STANDARD SYSTEM BENCHMARK                                                |  |
|                      |  |                                                                                     |  |
|                      |  |  ( Lightning Bolt Icon )                                                            |  |
|                      |  |  Standard System Benchmark                                                          |  |
|                      |  |  A complete evaluation of Processor, Memory, and Storage. Takes ~90 seconds.        |  |
|                      |  |                                                                                     |  |
|                      |  |  [  > Run Standard Benchmark (~90s)  ]    (Primary Royal Blue Button, 40px height)  |  |
|                      |  |                                                                                     |  |
|                      |  |  (i) Reassurance: Your cooling fans may spin up during testing. Screen stays fluid.|  |
|                      |  +-------------------------------------------------------------------------------------+  |
|                      |                                                                                           |
|                      |  +-------------------------------------------------------------------------------------+  |
|                      |  | [ v ] Custom & Advanced Benchmark Options                             (Expander)    |  |
|                      |  +-------------------------------------------------------------------------------------+  |
|                      |                                                                                           |
|                      |  CURRENT SYSTEM HARDWARE SNAPSHOT                                                         |
|                      |  +--------------------+  +--------------------+  +--------------------+  +-------------+  |
|                      |  | PROCESSOR (CPU)    |  | MEMORY (RAM)       |  | STORAGE DRIVE (C:) |  | OS HEALTH   |  |
|                      |  | AMD Ryzen 7 7800X   |  | 32.0 GB DDR5       |  | 2.0 TB NVMe SSD    |  | Win 11 Pro  |  |
|                      |  | 8 Cores, 16 Threads|  | 18.4 GB Available  |  | 1.1 TB Free Space  |  | 24H2 Active |  |
|  ------------------  |  +--------------------+  +--------------------+  +--------------------+  +-------------+  |
|  (*) Settings        |                                                                                           |
+----------------------+-------------------------------------------------------------------------------------------+
```

---

### 7.2 Wireframe 2: Benchmark In-Progress Screen

```
+------------------------------------------------------------------------------------------------------------------+
| [=] PocketBench  -  Running Benchmark                                                       [ _ ]  [ [] ]  [ X ]  |
+------------------------------------------------------------------------------------------------------------------+
|                      |                                                                                           |
|                      |                                                                                           |
|                      |                               STAGE 2 OF 4: PROCESSOR TESTING                             |
|                      |                                                                                           |
|                      |                                   ( Fluent ProgressRing )                                 |
|                      |                                                                                           |
|                      |                               Testing Multi-Core Performance                              |
|                      |               Measuring parallel processing throughput across all 16 processor threads... |
|                      |                                                                                           |
|                      |               [========================================---------------------]  62%        |
|                      |                                                                                           |
|                      |                                Estimated time remaining: ~36 seconds                      |
|                      |                                                                                           |
|                      |       [✓] System Health   --->   [*] Processor   --->   [ ] Memory   --->   [ ] Storage   |
|                      |                                                                                           |
|                      |                                   [ Cancel Benchmark ]                                    |
|                      |                                                                                           |
+----------------------+-------------------------------------------------------------------------------------------+
```

---

### 7.3 Wireframe 3: Benchmark Results Dashboard

```
+------------------------------------------------------------------------------------------------------------------+
| [=] PocketBench  -  Benchmark Results                                                       [ _ ]  [ [] ]  [ X ]  |
+------------------------------------------------------------------------------------------------------------------+
|  NAVIGATION PANE     |  BREADCRUMB:  System Benchmark  >  Results  (October 30, 2026 at 22:15)                   |
|  ------------------  |-------------------------------------------------------------------------------------------|
|                      |                                                                                           |
|  (H) Dashboard       |  +-------------------------------------------------------------------------------------+  |
|  (B) Benchmark   *   |  | OVERALL PERFORMANCE RATING                                                          |  |
|  (C) Comparison      |  |                                                                                     |  |
|  (H) History         |  |     [ EXCELLENT PERFORMANCE ]   (Success Green Tint Pill Badge)                     |  |
|  (R) AI Optimize     |  |     8,420                       (40px Segoe UI Variable Display)                    |  |
|                      |  |                                                                                     |  |
|                      |  |  ★ Faster than 78% of tested Windows 11 PCs                                         |  |
|                      |  |  [==========================================================--------------] 78%    |  |
|                      |  |  Your PC delivers outstanding speed for high-end productivity, gaming, and 4K media.|  |
|                      |  +-------------------------------------------------------------------------------------+  |
|                      |                                                                                           |
|                      |  EVERYDAY REAL-WORLD CAPABILITIES                                                         |
|                      |  +-------------------------+  +-------------------------+  +---------------------------+  |
|                      |  | 🌐 Web & Office Apps    |  | 🎬 4K Media & Creation  |  | ⚡ Storage & Responsiveness|  |
|                      |  | Instantaneous           |  | Smooth & Fast           |  | Ultra-Fast NVMe           |  |
|                      |  | Boots apps in < 1 second|  | Handles 4K video editing|  | Restarts in < 5 seconds   |  |
|                      |  +-------------------------+  +-------------------------+  +---------------------------+  |
|                      |                                                                                           |
|                      |  HOW YOUR PC COMPARES TO REFERENCE BENCHMARKS                                             |
|                      |  +-------------------------------------------------------------------------------------+  |
|                      |  | Your PC (Ryzen 7 7800X, 32GB)      [======================================== 8,420 ]|  |
|                      |  | High-End Creator Desktop (2026)    [================================================ 10,400]
|                      |  | Typical Modern Home/Office PC (2025)[============================== 6,200 ]          |  |
|                      |  | Budget Laptop (2023)               [================== 3,900 ]                      |  |
|                      |  +-------------------------------------------------------------------------------------+  |
|                      |                                                                                           |
|                      |  [ > View Detailed Hardware & Sensor Telemetry ]  (Expandable Accordion)                  |
|                      |                                                                                           |
|  ------------------  |  [ Run Benchmark Again ]    [ Export Report (PDF/PNG) ]    [ AI Optimization Advice ]     |
|  (*) Settings        |                                                                                           |
+----------------------+-------------------------------------------------------------------------------------------+
```

---

### 7.4 Wireframe 4: Custom / Advanced Configuration Expander

```
+------------------------------------------------------------------------------------------------------------------+
|  CUSTOM & ADVANCED BENCHMARK CONFIGURATION                                                          [ ^ Collapse ]|
+------------------------------------------------------------------------------------------------------------------+
|  Customize individual hardware tests, select target storage volumes, or configure endurance testing.             |
|                                                                                                                  |
|  SELECT WORKLOAD COMPONENTS:                                                                                     |
|    [X] Processor (CPU) Testing           • Evaluates single-core responsiveness and multi-threaded throughput     |
|    [X] Memory (RAM) Testing              • Measures bandwidth throughput (GB/s) and memory access latency         |
|    [X] Storage Drive (SSD/HDD) Testing   • Tests sequential 1MB read/write speeds and 4K random access IOPS       |
|    [ ] System Thermal Stress Test        • Continuous 100% loop testing to verify cooling and thermal headroom   |
|                                                                                                                  |
|  TARGET STORAGE VOLUME:                                                                                          |
|    [ Drive C:  (Primary NVMe SSD - 1,120 GB Free)                                                           [v] ]|
|                                                                                                                  |
|  TEST DURATION & INTENSITY:                                                                                      |
|    Quick (~45s)           Standard (~90s) [Default]         Thorough (~5 min)          Endurance (~15 min)       |
|    (---O-------------------------*----------------------------------O----------------------------O--------------)|
|                                                                                                                  |
|  [  > Run Custom Benchmark (~90s)  ]                         [ Reset to Defaults ]                               |
+------------------------------------------------------------------------------------------------------------------+
```

---

## 8. Concrete Component Implementation Mapping to `@fluentui/react-components` v9

PocketBench is built on React 19 and `@fluentui/react-components` v9. The table below maps every visual element directly to its corresponding Fluent UI component, property set, and design tokens:

### 8.1 Core Component Inventory & Property Specification

```
+--------------------------------------------------------------------------------------------------------------------+
| FLUENT UI V9 COMPONENT MAPPING TABLE                                                                               |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Interface Element     | Fluent UI v9 Component      | Required Props & Attributes        | Styling / Token Mapping |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Window Shell Canvas   | `<FluentProvider>`          | `theme={isDark ? webDarkTheme : ..}`| `background: transparent`|
|                       |                             |                                    | (Mica passthrough)      |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Left Navigation Pane  | `<TabList vertical>`        | `selectedValue={activeTab}`        | `tokens.colorNeutral-   |
|                       | `<Tab>`                     | `size="large"`, `icon={<...Regular>}`| `Background2`          |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Hero Action Container | `<Card>`                    | `appearance="filled"`              | `tokens.colorNeutral-   |
|                       |                             | `size="large"`                     | `Background1`, 1px stroke|
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Primary CTA Button    | `<Button>`                  | `appearance="primary"`             | `tokens.colorBrand-     |
|                       |                             | `size="large"`, `icon={<Play...>}` | `Background`, 40px h    |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Secondary CTA Button  | `<Button>`                  | `appearance="secondary"`           | `tokens.colorNeutral-   |
|                       |                             | `size="medium"`                    | `Stroke1`, 32px h       |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Cancel Button         | `<Button>`                  | `appearance="subtle"`              | Red text on hover       |
|                       |                             | `icon={<DismissRegular />}`        | `tokens.colorPaletteRed`|
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Determinate Progress  | `<ProgressBar>`             | `value={progressValue}` (0.0 - 1.0)| `color="brand"`,        |
|                       |                             | `shape="rounded"`                  | `thickness="large"`     |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Indeterminate Spinner | `<Spinner>`                 | `size="huge"`, `appearance="primary"| Fluid spinning motion   |
|                       |                             | `labelPosition="below"`            | during heavy tests      |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Performance Badge     | `<Badge>`                   | `size="large"`, `appearance="tint"`| `color="success"`       |
|                       |                             | `shape="rounded"`                  | (Green tint)            |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Advisory InfoBar      | `<MessageBar>`              | `intent="info" | "warning"`        | Embedded dismiss & CTA  |
|                       |                             | `layout="multiline"`               | button                  |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Advanced Expander     | `<Accordion>`               | `collapsible={true}`               | Smooth height transition|
|                       | `<AccordionItem>`           | `value="advanced-config"`          | with chevron rotation   |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Hardware Metrics Grid | `<Card>` (Metric Cards)     | `appearance="subtle"`              | 8px border-radius,      |
|                       |                             | `size="small"`                     | tabular numeric styling |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Comparison Bars       | `<ProgressBar>` / SVG bar   | `value={item.score / maxScore}`    | Brand accent for user,  |
|                       |                             | `color={item.isUser ? "brand" : ..}`| neutral for reference   |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
| Tooltip Descriptions  | `<Tooltip>`                 | `relationship="description"`       | Acrylic translucent blur|
|                       |                             | `withArrow={true}`                 | on hover                |
+-----------------------+-----------------------------+------------------------------------+-------------------------+
```

---

### 8.2 Fluent Design Token Usage & `makeStyles` Styling Patterns

```typescript
// src/renderer/styles/useRedesignStyles.ts
import { makeStyles, shorthands, tokens } from '@fluentui/react-components';

export const useRedesignStyles = makeStyles({
  heroCard: {
    ...shorthands.padding('24px'),
    ...shorthands.borderRadius(tokens.borderRadiusMedium), // 8px
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    boxShadow: tokens.shadow4,
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('16px'),
    transition: 'transform 150ms ease, box-shadow 150ms ease',
    ':hover': {
      boxShadow: tokens.shadow8,
    }
  },
  ctaButton: {
    height: '40px',
    fontSize: tokens.fontSizeBase400, // 16px
    fontWeight: tokens.fontWeightSemibold,
    ...shorthands.borderRadius(tokens.borderRadiusSmall), // 6px
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    ':hover': {
      backgroundColor: tokens.colorBrandBackgroundHover,
    }
  },
  scoreDisplay: {
    fontSize: '40px',
    lineHeight: '52px',
    fontWeight: tokens.fontWeightSemibold,
    fontFamily: '"Segoe UI Variable Display", "Segoe UI", sans-serif',
    fontVariantNumeric: 'tabular-nums',
    color: tokens.colorNeutralForeground1,
  },
  ratingBadgeSuccess: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
    ...shorthands.border('1px', 'solid', tokens.colorPaletteGreenBorder1),
    ...shorthands.padding('4px', '12px'),
    ...shorthands.borderRadius(tokens.borderRadiusCircular),
    fontWeight: tokens.fontWeightSemibold,
  },
  percentileBar: {
    height: '8px',
    ...shorthands.borderRadius(tokens.borderRadiusCircular),
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: 'hidden',
    position: 'relative',
  },
  comparisonBarUser: {
    backgroundColor: tokens.colorBrandBackground,
    height: '100%',
    ...shorthands.borderRadius(tokens.borderRadiusCircular),
    transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
  },
  comparisonBarRef: {
    backgroundColor: tokens.colorNeutralForeground4,
    height: '100%',
    ...shorthands.borderRadius(tokens.borderRadiusCircular),
  }
});
```

---

## 9. Dual-Mode Harmonization: Bridging Benchmarking & AI Repair

The usability audit highlighted a critical identity conflict: the application was named **PocketBench** but operated exclusively as an AI repair workbench. Rather than abandoning either capability, the redesign harmonizes them into an intelligent, unified lifecycle:

### 9.1 The Unified "Benchmark -> Grade -> Explain -> Optimize" Lifecycle

```
+---------------------------------------------------------------------------------------------------+
| THE UNIFIED POCKETBENCH LIFECYCLE                                                                 |
|                                                                                                   |
|  [ 1. BENCHMARK ]  ===>  1-Click ~90s test of CPU, RAM, Disk & System Responsiveness             |
|         │                                                                                         |
|         ▼                                                                                         |
|  [ 2. GRADE ]      ===>  Overall Score (8,420), Percentile (Top 22%), Everyday Capability Cards   |
|         │                                                                                         |
|         ▼                                                                                         |
|  [ 3. EXPLAIN ]    ===>  Plain-English diagnosis of bottlenecks:                                  |
|         │                "Your CPU and RAM are blazing fast, but Disk C: has low free space."     |
|         ▼                                                                                         |
|  [ 4. OPTIMIZE ]   ===>  1-Click Verified Local Maintenance (Clean Temp, Flush DNS, Trim SSD)     |
|         │                OR Optional Deep AI Repair for complex, obscure Windows issues.          |
+---------------------------------------------------------------------------------------------------+
```

- **Seamless Transition**: After benchmarking, if PocketBench detects system bottlenecks (e.g. thermal throttling, high background process drag, stopped core services, or fragmented temp caches), it displays a friendly optimization card:
  > *💡 Optimization Insight: Your CPU performance is in the top 15%, but 4 background startup applications are consuming 3.2 GB of RAM. Click below to review and optimize startup apps.*
- **Action Button**: Direct transition to `[ Review Optimization Recommendations ]`.

---

### 9.2 Zero-Configuration Offline Baseline with Optional Deep AI Research

1. **Zero-Configuration Offline Core**:
   - All benchmarking, hardware detection, scoring, comparative charts, and standard maintenance routines (flushing DNS, restarting stopped Windows services, clearing temporary caches) work **100% offline out-of-the-box**.
   - No API keys, no internet connection, and no developer accounts are ever required for core functionality.
2. **Optional Deep AI Investigation**:
   - AI assistance (Meta Muse Spark) is repositioned as an optional **"Deep AI Research Specialist"** reserved exclusively for investigating obscure Windows event log errors or custom user-reported symptoms.
   - If invoked without a key, the app presents a transparent, friendly modal explaining what the AI does, offering a direct 1-click link to obtain a free key, and providing a `[ Test Key ]` verification button.

---

### 9.3 Dismantling Psychological Anxiety: Financial, Security & Irreversibility Shields

1. **Elimination of Financial Anxiety**:
   - The frightening `"$90.00 Limit"` spend dial in Settings is completely eliminated from the mainstream consumer UI.
   - For users utilizing their own API key, it is labeled as *"Free Developer Usage Allowance"* and moved into an expandable *"Developer & Quota Settings"* accordion.
2. **Elevation & UAC Shielding**:
   - Elevated operations must invoke a dedicated native helper executable signed with the application certificate so the Windows UAC prompt displays:
     > **Program name: PocketBench System Helper** (Verified Publisher: PocketBench Team)
     instead of the suspicious `"Windows PowerShell"` prompt.
3. **Reframing "Cannot Be Undone" Warnings**:
   - Eliminate alarming yellow badges reading *"Cannot be undone"*.
   - Replace with reassuring safety explanations:
     > *🔒 Safe System Action: Windows replaces corrupted system files with pristine original versions. Your personal files, photos, and documents are never touched.*

---

## 10. Implementation Roadmap & Acceptance Verification

To guarantee flawless execution, the UI redesign recommendations are scheduled across structured implementation phases:

```
+-------------------------------------------------------------------------------------------------------+
| IMPLEMENTATION ROADMAP & VERIFICATION GATES                                                           |
+-------+-------------------------+---------------------------------------------------------------------+
| Phase | Focus Area              | Deliverables & Quality Gates                                        |
+-------+-------------------------+---------------------------------------------------------------------+
| **1** | Fluent Foundation &     | • Implement `PocketBenchThemeProvider` with dynamic Dark/Light sync |
|       | Navigation Framework    | • Configure native Windows 11 DWM Mica material in Electron main    |
|       |                         | • Restructure left navigation pane with standard Fluent `TabList`   |
+-------+-------------------------+---------------------------------------------------------------------+
| **2** | 1-Click Benchmark &     | • Implement Hero Benchmark Card with ~90s standard test preset      |
|       | Execution Engine        | • Build decoupled `benchmarkWorker.ts` with `PRIORITY_BELOW_NORMAL` |
|       |                         | • Build Execution Screen with `ProgressBar`, `Spinner` & countdown  |
|       |                         | • Validate non-destructive cancellation in < 300ms                  |
+-------+-------------------------+---------------------------------------------------------------------+
| **3** | 4-Tier Result Dashboard | • Build Overall Rating Badge with 5 verbal tiers                    |
|       | & Baseline Comparisons  | • Build Percentile distribution bar with local offline dataset      |
|       |                         | • Implement 4 Everyday Capability Cards with plain-English text     |
|       |                         | • Implement horizontal comparative hardware baseline charts         |
+-------+-------------------------+---------------------------------------------------------------------+
| **4** | Dual-Mode Harmonization | • Connect benchmark results to safe local optimization routines     |
|       | & Safety Polish         | • Re-label API quota counters and remove financial anxiety triggers |
|       |                         | • Add pre-flight advisories (battery check, fan spin-up reassurance)|
|       |                         | • Validate full WCAG AA contrast, keyboard Tab order, and ARIA live |
+-------+-------------------------+---------------------------------------------------------------------+
```

### Final Conclusion
By implementing these comprehensive UI/UX redesign recommendations, PocketBench will resolve all identified friction points, eliminate user intimidation, and establish itself as the premier modern Windows 11 system benchmark and performance companion for mainstream and enthusiast users alike.
