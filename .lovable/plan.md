## ContrAIct — AI Powered Contract Risk Analyzer

A polished frontend dashboard inspired by the red & white "Redflow" reference, adapted into a productivity-app layout with a fixed, collapsible left sidebar (icons + labels). Light and dark mode. All features from both PDFs are present as UI surfaces with realistic mock data — no backend yet (easy to wire to Lovable Cloud + Lovable AI later).

### Stack
- Vite + React + TypeScript ✅ (already in template)
- Tailwind CSS v4 ✅
- TanStack Query ✅ (already wired in `src/router.tsx`)
- shadcn/ui ✅ (full set already installed)
- Framer Motion — add via `bun add framer-motion`
- Routing: **TanStack Router** (required by the TanStack Start template — file-based routes under `src/routes/`). React Router DOM isn't supported here without migrating off the template.

### Design system
- Brand: bold red accent (~#E63946) + crisp whites / deep charcoals. Subtle red gradient washes echoing the reference.
- Display font: Space Grotesk. Body: Inter. Loaded via `<link>` in `src/routes/__root.tsx` head; referenced through `--font-display` / `--font-sans` tokens in `src/styles.css` under `@theme`.
- All colors as semantic `oklch` tokens in `src/styles.css` (`@theme inline`) with full light + dark palettes — no hardcoded color classes in components.
- Theme: `next-themes`-style provider (custom, lightweight) toggling `.dark` on `<html>`, persisted to `localStorage`, accessed only inside `useEffect` (SSR-safe).

### Layout
- `src/routes/__root.tsx` — shell, fonts, meta, ThemeProvider, QueryClientProvider (already there), Toaster.
- `src/routes/index.tsx` — public landing page (Redflow-style hero, stats, features, process, sample analysis preview, testimonials, CTA, footer). "Launch App" buttons link into the app.
- `src/routes/app.tsx` — app layout route. Wraps `<Outlet />` in `SidebarProvider` + `AppSidebar` + topbar (sidebar trigger, breadcrumb, theme toggle, user menu). Uses shadcn `sidebar.tsx` with `collapsible="icon"`, fixed left, applies the Tailwind v4 `w-[var(--sidebar-width)]` fix.
- `src/routes/app.index.tsx` → `/app` Dashboard
- `src/routes/app.upload.tsx` → `/app/upload`
- `src/routes/app.contracts.tsx` → `/app/contracts`
- `src/routes/app.contracts.$id.tsx` → `/app/contracts/:id` (analysis detail)
- `src/routes/app.analysis.tsx` → `/app/analysis`
- `src/routes/app.clauses.tsx` → `/app/clauses`
- `src/routes/app.chat.tsx` → `/app/chat`
- `src/routes/app.compare.tsx` → `/app/compare`
- `src/routes/app.timeline.tsx` → `/app/timeline`
- `src/routes/app.obligations.tsx` → `/app/obligations`
- `src/routes/app.reports.tsx` → `/app/reports`
- `src/routes/app.settings.tsx` → `/app/settings`

Each route sets its own `head()` with route-specific title + description.

### Sidebar (icon + label, collapsible)
Dashboard · Upload · Contracts · Analysis · Clauses · Chat · Compare · Timeline · Obligations · Reports · Settings. Footer: theme toggle + user avatar/menu. Active state via `useRouterState`.

### Feature surfaces (all PDF features covered)
- **Dashboard**: KPI cards (contracts analyzed, avg risk, high-risk clauses, upcoming deadlines), risk-category donut (Recharts), recent contracts list, AI confidence meter.
- **Upload**: drag-and-drop zone for PDF/DOCX/images, OCR-for-scans notice, simulated multi-stage progress (Extract → Chunk → Embed → Self-Healing RAG → Analyze), then routes to analysis.
- **Contracts**: searchable/filterable table of mock contracts with risk badges.
- **Analysis**: executive summary, overall risk gauge, risky clauses list, obligations, important dates, missing clauses, negotiation suggestions, AI confidence — tabbed.
- **Clauses**: clause-by-clause drill-down — original text, plain-English rewrite, risk level + reason, consequences, negotiation advice, confidence.
- **Chat**: chat-with-contract UI with mock streaming responses and cited clause chips.
- **Compare**: side-by-side diff of two contracts/versions with change highlights.
- **Timeline**: renewals, expiry, payment deadlines as a vertical timeline.
- **Obligations**: rights & obligations tracker table grouped by party.
- **Reports**: downloadable AI report cards (mock PDF export via `window.print()` stub).
- **Settings**: profile, theme, notification prefs, danger zone.

### Components
- `src/components/app-sidebar.tsx`
- `src/components/theme-provider.tsx`, `theme-toggle.tsx`
- `src/components/landing/*` — Hero, Stats, Features, Process, Preview, Testimonials, CTA, Footer
- `src/components/app/*` — RiskGauge, RiskBadge, ClauseCard, ConfidenceMeter, UploadDropzone, ContractTable, TimelineList, ObligationsTable, ChatPanel, CompareDiff, ReportCard
- `src/lib/mock-contracts.ts` — sample contracts, clauses, risks, dates, chat transcripts

### Out of scope (this pass)
Real OCR / RAG / LLM, auth, persistence, file storage. The UI is structured to plug into Lovable Cloud + Lovable AI later without restructuring routes.

After approval I'll implement the sidebar, theming, landing page, and all feature screens with mock data in one pass, and `bun add framer-motion`.