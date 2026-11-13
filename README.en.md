<div align="center">
  <img src="./logo.png" width="110" alt="AI Error Notebook" />

  <h1>AI Error Notebook</h1>

  <p><strong>Snap a photo · let AI diagnose the mistake · generate variants · track learning reports · multi-role teaching</strong></p>

  <p>
    English | <a href="./README.md">简体中文</a>
  </p>
</div>

---

## What this project solves

For most students, organizing wrong answers means copying the question and the answer once,
never looking at it again — and the underlying misunderstanding is never analyzed.
Teachers who want to spot weak points across a class can only count by hand.

This project automates the whole loop: **photo upload → AI extraction → root-cause diagnosis →
notebook archiving → variant exercise generation → learning reports**.
All data stays in a local SQLite file and a local uploads folder, so it is easy to self-host
without any external database.

## Features

### For students
- **Upload mistakes by photo**: single / multiple / cross-page modes, automatic question splitting and OCR
  of the question, the student's answer and the standard answer
- **Root-cause diagnosis**: standard solution, step-by-step diagnosis, error reason, knowledge points
- **Variant generation**: same-knowledge-point exercises generated from the original question
- **Notebook management**: multiple notebooks, mastery marking, original image playback
- **Feynman mode**: explain the question in your own words and get AI feedback
- **Learning reports**: daily / weekly / monthly reports with weak-point lists and radar charts
- **Paper generation and printing**: mistakes laid out as A4 exam papers, with precise geometry drawing
- **Membership**: AI quota, redemption codes, subscription plans

### For teachers
- **Teaching workbench**: quick answering (answers and key steps only), homework correction and review
- **Student management**: student list, editing, notebook access
- **Question library**: cross-teacher shared question queries

### For academic staff
- **Account creation**: create teachers and student accounts (notebooks are created automatically)
- **Report center**: class and student reports by day, week and month
- **Account validity**: renewal and expiry interception

### For administrators
- **AI provider configuration**: switch between OpenAI-compatible endpoints and Gemini at runtime,
  with connectivity tests and configuration history rollback
- **Quota management**: daily AI call limits per role
- **System settings**: announcement carousel, VIP contact, SMTP mail, redemption code generation
- **User management**: CRUD and weekly usage statistics

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, Vite 6, Tailwind CSS 4, Recharts, KaTeX, lucide-react |
| Backend | Node.js, Express 4, TypeScript, tsx |
| Database | SQLite via better-sqlite3, auto-migrated on startup |
| AI | OpenAI-compatible Chat Completions APIs, Google Gemini |
| Misc | SSE streaming, async task queue, sharp, nodemailer |

## Getting started

**Requirements**: Node.js 18 / 20 LTS

```bash
npm install          # install dependencies
cp .env.example .env # prepare environment variables
npm run dev          # start dev server (Vite HMR + Express API)
npm run build        # build for production
npm start            # run the production bundle
```

Then open `http://localhost:9088/notebook/`.
On first launch the SQLite database is created and a super admin account is initialized:
`admin / admin123` (**change the password right after deploying**).

You may also leave the API key empty and configure the model provider later in the
"System Settings" page of the admin console.

## Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `9088` |
| `GEMINI_API_KEY` | Gemini API key | empty |
| `GEMINI_MODEL` | Default Gemini model | `gemini-3.0` |
| `APP_URL` | Public base URL used for self-referential links | empty |
| `REPORT_PATH_PREFIX` | Path prefix for report links when served under a sub-path | empty |

Production deployment, Nginx reverse proxy and backup tips are documented in
[部署文档.md](./部署文档.md) (Chinese).

## Project layout

```
├── src/
│   ├── components/          # React pages and components
│   ├── lib/                 # Frontend utilities and API wrappers
│   ├── types/               # Shared types (including geometry structures)
│   └── server/
│       ├── config/          # Database bootstrap and configuration
│       ├── controllers/     # Business controllers
│       ├── middleware/      # Authentication and AI quota limiting
│       ├── routes/          # Route registration
│       ├── services/        # AI provider adapters
│       └── utils/           # Shared helpers
├── server.ts                # Entry point (Express + Vite middleware)
├── index.html
└── 部署文档.md
```

## Design notes

- **Async queue + SSE**: recognition and batch correction are long-running, so they are pushed to a
  background queue and streamed to the client, avoiding request timeouts
- **Structured output with frontend fallback**: the LLM only produces structured reasoning, while math
  formulas and table layout are rendered by KaTeX and the frontend renderer, reducing hallucination
- **Deterministic geometry rendering**: geometry figures are described by structured coordinates and
  drawn by the frontend instead of relying on generated images
- **No external database**: everything lives in one SQLite file; backup means copying
  `questions.db` and the `uploads/` folder

## Contributing

Issues and pull requests are welcome. Please make sure `npm run lint` (`tsc --noEmit`) passes before submitting.
