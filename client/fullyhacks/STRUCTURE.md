# Project Structure

A reference for editing, scaling, and understanding where every feature lives.

---

## Page Routes

| URL | File | Purpose |
|-----|------|---------|
| `/` | `app/page.tsx` | Welcome / landing page with "Enter Teacher Portal" CTA |
| `/setup` | `app/setup/page.tsx` | Teacher portal — disease selection + scenario editor |
| `/conversation` | `app/conversation/page.tsx` | Student chat with virtual patient (placeholder) |
| `/report` | `app/report/page.tsx` | Post-conversation report (not yet built) |

---

## Component Map

### `components/DiseaseSelector.tsx`
- Renders the grid of predefined disease buttons
- Handles the "Create Custom Scenario" button
- Owns the submit/start action that routes to `/conversation?disease=...`
- **To add a disease:** edit `lib/scenarios.ts` — no component changes needed
- **To change routing target:** update `router.push(...)` in `handleSubmit`
- **To add backend fetch for defaults:** replace the `JSON.parse(JSON.stringify(...))` clone in `handleSelectDisease` with a `fetch('/api/scenarios/:id/defaults')` call

### `components/ScenarioEditor.tsx`
- Side panel that appears when a disease is selected
- Sections: Vitals (6 fields) + Symptoms (toggleable rows with severity)
- Supports adding new symptoms via `AddSymptomRow`
- Supports removing any symptom via the ✕ button
- When `isCustom=true`, the disease name becomes an editable input
- **To add a new vital field:** add a `VitalField` entry and extend the `Vitals` type in `types/scenario.ts`
- **To change severity options:** edit `SEVERITY_OPTIONS` array at the top of this file

---

## Data & Types

### `types/scenario.ts`
Core TypeScript interfaces. Edit here when the data shape changes.

```
Vitals            — 6 numeric vital signs
Symptom           — id, label, present (bool), severity (mild|moderate|severe)
ScenarioConfig    — { vitals: Vitals, symptoms: Symptom[] }
DiseaseScenario   — id, name, defaultConfig, optional patient profile fields
```

### `lib/scenarios.ts`
- Array of all 18 predefined `DiseaseScenario` objects with hardcoded default vitals and symptoms
- **To add a scenario:** append a new entry to `PREDEFINED_DISEASES`
- **To connect to backend:** replace the array with a `fetch('/api/scenarios')` call and cache the result

### `lib/validators.ts`
- `validateDisease(value)` — returns an error string or `null`
- **To add more validation rules:** extend this function

---

## Styling

### `app/globals.css`
All global styles and animations. No Tailwind config file needed (Tailwind v4).

| Class | Purpose |
|-------|---------|
| `.bubble` | Animated rising bubble (background decoration) |
| `.ocean-card` | Frosted glass card used on all pages |
| `.hero-icon` | Pulsing glow animation for the shell emoji |
| `.fade-up-1` … `.fade-up-5` | Staggered entrance animations (landing page) |
| `.cta-btn` | Primary call-to-action button with hover glow |
| `.feature-card` | Feature card with hover lift effect |
| `.shimmer-line` | Horizontal gradient divider |

**Ocean color palette (CSS variables):**
```
--ocean-deep:    #060e1f   (page background)
--ocean-mid:     #0e2a4a   (card base)
--ocean-surface: #0d3b6e   (lighter blue)
--ocean-teal:    #0891b2   (primary action color)
--ocean-cyan:    #22d3ee   (accent / highlight)
--ocean-foam:    #e0f4f8   (text on dark)
```

---

## State Flow

```
app/setup/page.tsx          (owns selectedDisease, editorConfig, isCustom)
  ├── DiseaseSelector       (reads/writes selectedDisease via props)
  └── ScenarioEditor        (reads/writes editorConfig via props)
        ├── VitalField      (controlled number inputs)
        ├── SymptomRow      (toggle + severity selector per symptom)
        └── AddSymptomRow   (appends new symptom to config)
```

On submit → `router.push('/conversation?disease=...')`

**TODO:** Pass `editorConfig` (vitals + symptoms) to the conversation page.
Options when ready:
- Encode as a URL param (small configs only)
- Store in `localStorage` before navigating
- Use React Context wrapping the layout
- POST to backend and pass a session ID in the URL

---

## Planned Pages (not yet built)

### `/conversation`
- Chat interface: student messages on the right, virtual patient on the left
- "Conclude Conversation" button triggers report generation
- Key components to build: `ChatWindow`, `MessageList`, `MessageInput`
- Files to create: `components/ChatWindow.tsx`, `components/MessageList.tsx`, `components/MessageInput.tsx`, `types/chat.ts`, `lib/promptBuilders.ts`

### `/report`
- Structured post-conversation report
- Sections: disease, summary, symptoms revealed, student diagnosis, feedback, missed clues
- Key component to build: `ReportCard`
- Files to create: `components/ReportCard.tsx`, `types/report.ts`, `lib/reportFormatter.ts`

---

## Backend Integration Points

All backend TODOs are marked with `// TODO:` comments in the source.

| Location | What to replace |
|----------|----------------|
| `DiseaseSelector.tsx` → `handleSelectDisease` | Hardcoded JSON clone → `GET /api/scenarios/:id/defaults` |
| `DiseaseSelector.tsx` → `handleSubmit` | Local route push → POST session to backend, get session ID |
| `lib/scenarios.ts` → `PREDEFINED_DISEASES` | Static array → `GET /api/scenarios` |
| `app/conversation/page.tsx` | Placeholder → real AI chat via `POST /api/chat` |
| `app/report/page.tsx` | Not built → `GET /api/report/:sessionId` |

---

## Folder Summary

```
client/fullyhacks/
├── app/
│   ├── page.tsx                  Landing / welcome page
│   ├── layout.tsx                Root layout (fonts, metadata)
│   ├── globals.css               All global styles + animations
│   ├── setup/
│   │   └── page.tsx              Teacher portal
│   ├── conversation/
│   │   └── page.tsx              Student chat (placeholder)
│   └── report/                   (not yet created)
│       └── page.tsx
├── components/
│   ├── DiseaseSelector.tsx       Disease grid + custom scenario button
│   └── ScenarioEditor.tsx        Vitals + symptoms editor panel
├── lib/
│   ├── scenarios.ts              Predefined disease data
│   └── validators.ts             Input validation helpers
├── types/
│   └── scenario.ts               TypeScript interfaces
├── AGENTS.md                     AI agent rules and product spec
└── STRUCTURE.md                  ← this file
```
