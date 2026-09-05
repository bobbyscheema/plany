<div align="center">
  <img src="./public/favicon.svg" width="96" height="96" alt="plany logo">

  # plany

  **A fast, calm homework planner that turns natural language into organized tasks.**

  Add assignments, deadlines, exams, and repeating work without navigating through a long form. Everything stays in your browser—no account, backend, API key, or paid LLM required.
</div>

## What plany does

plany is designed around quick capture. Type a sentence such as:

```text
Biology quiz next Friday at 5pm high priority
```

Before saving, plany locally identifies the assignment name, class, type, due date, time, and priority. The parser is deterministic and runs entirely inside the app.

### Highlights

- Fast, notes-style task entry with Enter-to-add
- Local natural-language parsing with no LLM calls or usage costs
- Voice capture through supported browsers' built-in speech recognition
- Assignments, projects, readings, quizzes, exams, and deadlines
- Separate planner, assessments, and completed views
- Classes with quick-add shortcuts, filtering, and pastel colors
- Due dates, due times, priorities, notes, and recurrence
- Daily, weekly, biweekly, monthly, and multi-day repeating schedules
- Automatic creation of the next occurrence after completing recurring work
- Responsive desktop and mobile layouts
- Browser-local persistence with no sign-in or server required

## Quick-entry language

The quick-add field understands common phrases and previews the result before saving.

| What you type | What plany understands |
| --- | --- |
| `Biology quiz tomorrow` | Biology · Quiz · Due tomorrow · Medium priority |
| `Math homework 9/12 high priority` | Math · Assignment · Due September 12 · High priority |
| `Read chapter 4 Friday at 5pm` | Reading · Due Friday at 5:00 PM |
| `Chemistry final December 18 important` | Chemistry · Exam · Due December 18 · High priority |
| `Reading every Tuesday and Thursday` | Reading · Repeats Tuesday and Thursday |
| `Review notes daily` | Assignment · Repeats daily · Medium priority |

### Recognized dates

- `today`, `tonight`, `tomorrow`, and `day after tomorrow`
- Weekdays such as `Friday` or `next Tuesday`
- Numeric dates such as `9/12` or `09-12-2026`
- Written dates such as `September 12` or `Dec 18, 2026`

### Recognized priorities

- High: `high priority`, `urgent`, `important`, or `asap`
- Low: `low priority`, `not urgent`, or `whenever`
- Medium: the default when no priority phrase is included

### Repeating work

plany understands `daily`, `weekly`, `every other week`, `monthly`, and named weekday schedules. For example, completing a task that repeats every Tuesday and Thursday creates Thursday's occurrence after Tuesday, then the following Tuesday after Thursday.

## Voice input

Select the microphone beside the quick-add field, grant microphone permission, and speak the task naturally. Voice results go through the same local parser as typed text.

Speech recognition availability depends on the browser. Voice capture may use the browser vendor's speech service, but plany itself does not send requests to an LLM API or require an API key.

## Technology

- [React](https://react.dev/) for the interface
- [TypeScript](https://www.typescriptlang.org/) for application logic and type safety
- [Vite](https://vite.dev/) for development and production builds
- [Lucide](https://lucide.dev/) for interface icons
- `localStorage` for private, browser-local task and class data
- Web Speech API for supported-browser voice capture

## Run locally

Requirements:

- Node.js 20 or newer
- npm

```bash
git clone https://github.com/bobbyscheema/plany.git
cd plany
npm install
npm run dev
```

Open the local URL printed by Vite.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and create a production build in `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across the project |

## Data and privacy

Tasks and classes are stored in the current browser's local storage. plany has no application server, database, analytics integration, account system, or LLM API dependency.

Because data is browser-local:

- Clearing site storage removes saved planner data.
- Data does not automatically sync between browsers or devices.
- Running the app under a different domain or port may create a separate storage area.

## Project structure

```text
todo/
├── public/
│   ├── favicon.svg        # plany logo and browser icon
│   └── site.webmanifest   # installable app metadata
├── src/
│   ├── App.tsx            # planner interface and state
│   ├── parser.ts          # local natural-language parser
│   ├── main.tsx           # React entry point
│   └── styles.css         # responsive pastel interface
├── index.html
├── package.json
└── vite.config.ts
```

## Production build

```bash
npm run build
npm run preview
```

The generated `dist/` directory can be deployed to any static hosting provider.
