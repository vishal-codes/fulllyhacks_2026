<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# agents.md

## Project Overview
This project is a Next.js frontend MVP for a Virtual Patient Practice app.

The app has 3 main pages:
1. Landing Page
   - Teacher selects a disease from a list or types a custom disease
   - On submit, the app redirects to the conversation page

2. Conversation Page
   - Student chats with a virtual patient based on the chosen disease
   - The patient should behave like a real person, not like a medical textbook
   - The conversation ends when the student clicks "Conclude Conversation"

3. Report Page
   - A structured report is shown after the conversation ends
   - The report summarizes the case, symptoms revealed, and feedback for the student

This is an MVP. Prioritize clean implementation, clarity, and extensibility over premature complexity.

---

## Primary Goal
Help build and maintain a simple, functional educational interface where:
- teachers can start a scenario quickly
- students can practice diagnostic questioning
- the app produces a useful report at the end

---

## Product Rules
- Keep the app simple and focused on the 3-page flow
- Do not add authentication unless explicitly requested
- Do not add a database unless explicitly requested
- Prefer mock data or local state when enough for MVP needs
- Avoid overengineering
- Build reusable components only where there is clear value
- Maintain a professional, clean educational UI
- Optimize for readability and straightforward user flow

---

## User Roles
### Teacher
- Enters or selects a disease
- Starts the scenario

### Student
- Talks to the virtual patient
- Ends the conversation
- Reviews the generated report

---

## Core Functional Requirements

### Landing Page
Must support:
- text input for custom disease
- dropdown or selectable list for predefined diseases
- a submit/start action
- redirect to conversation page after disease selection/input

Rules:
- If both manual input and selected option exist, prefer manual input unless product logic says otherwise
- Validate that some disease value exists before continuing
- Keep the experience fast and minimal

### Conversation Page
Must support:
- visible case/disease context stored in app state or route params
- a chat interface for student ↔ virtual patient interaction
- a clear "Conclude Conversation" button
- generation of a report payload after the conversation ends
- redirect to report page

Rules for patient behavior:
- The patient should speak naturally and realistically
- The patient should reveal information gradually in response to questions
- The patient should not instantly disclose the diagnosis
- The patient should answer as a patient would, not as a clinician
- The patient may describe symptoms, timeline, discomfort, habits, or concerns
- The patient should avoid breaking character unless explicitly instructed

### Report Page
Must display:
- selected disease
- brief conversation summary
- key symptoms revealed
- student conclusion or suspected diagnosis if collected
- evaluation or feedback
- missed clues or missed questions, when possible

Rules:
- Report should be structured and easy to scan
- Feedback should be constructive and concise
- Avoid overly long blocks of text
- Prefer sections, cards, or bullet lists

---

## Engineering Principles

### Architecture
- Use Next.js app/router or pages/router consistently
- Keep state handling simple
- Prefer local component state, context, or lightweight client state for MVP
- Separate UI components from domain logic where practical
- Keep AI interaction logic isolated from presentational components

### Code Style
- Prefer TypeScript
- Use clear, descriptive names
- Keep components small when reasonable
- Avoid deeply nested logic in JSX
- Extract repeated UI into reusable components
- Keep files easy to scan

### UI/UX
- Use a clean, simple interface
- Prioritize clarity over visual novelty
- Make primary actions obvious
- Ensure layout works on laptop-sized screens first
- Reasonable mobile responsiveness is good, but desktop-first is acceptable for MVP
- Include loading and error states where needed

### State/Data
For MVP, acceptable options:
- route params
- search params
- local storage
- React context
- local mock data
- temporary in-memory state

Avoid introducing:
- complex global stores unless clearly needed
- database schemas
- backend abstractions not required for MVP

---

## Disease Scenario Guidance
Predefined diseases may include:
- Asthma
- Pneumonia
- Diabetes
- Hypertension
- Migraine
- Appendicitis

Custom disease input should also be supported.

When building disease logic:
- Prefer a scenario object structure
- Allow future extension with:
  - symptoms
  - patient persona
  - severity
  - age
  - history
  - likely responses
  - report rubric

Example conceptual shape:
- id
- name
- patientProfile
- presentingSymptoms
- hiddenClues
- expectedQuestions
- reportHints

---

## AI Integration Rules
If AI is used for the virtual patient or report generation:
- Keep prompts scoped to the current scenario
- Ensure the patient stays in character
- Ensure report generation is structured and deterministic where possible
- Do not return raw unstructured model output directly into UI without formatting
- Prefer JSON or predictable schemas for report generation
- Guard against empty or malformed responses
- Add safe fallbacks for broken model outputs

---

## What Not To Do
- Do not add login/signup
- Do not add multi-tenant teacher dashboards
- Do not add analytics unless requested
- Do not redesign the product into a full LMS
- Do not introduce unnecessary backend complexity
- Do not add medical claims presented as authoritative diagnosis tools
- Do not let the virtual patient behave like a doctor or diagnostic engine

---

## Preferred MVP Folder Intent
This is only a guideline. Adapt if needed.

- app/
  - page.tsx                -> landing page
  - conversation/page.tsx   -> conversation page
  - report/page.tsx         -> report page
- components/
  - DiseaseSelector.tsx
  - ChatWindow.tsx
  - MessageList.tsx
  - MessageInput.tsx
  - ReportCard.tsx
- lib/
  - scenarios.ts
  - promptBuilders.ts
  - reportFormatter.ts
  - validators.ts
- types/
  - scenario.ts
  - chat.ts
  - report.ts

---

## Decision Priorities
When making implementation decisions, optimize in this order:
1. Working MVP flow
2. Clear user experience
3. Clean code organization
4. Extensibility
5. Visual polish

---

## Expected Behavior For Agents Working In This Repo
When modifying or generating code:
- preserve the 3-page MVP flow
- avoid unnecessary dependencies
- prefer readable solutions
- preserve type safety
- do not invent extra features not asked for
- keep generated UI and logic aligned with the educational purpose of the app
<!-- END:nextjs-agent-rules -->
