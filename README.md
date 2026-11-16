# Study App

An installable study app (PWA) for FRV courses. It has study notes for each topic and a
"test your knowledge" section that tracks progress.

- **Notes:** transcribed from the SO exam study book, page by page, plus the full source documents
  (OMS, OPP, OPG, ORP, POL 003, ORG 109/133, Workplace Behaviour Policy, AIIMS card, FRV Act).
- **Tests:** questions from the study book, the numbered Q&A bank, and the source documents. Short-fact questions are
  multiple choice. List questions are flashcards that you mark yourself.
- **Progress:** kept on the device in `localStorage`. A question is mastered after 3 correct
  answers in a row. The "Smart mix" test favours questions you've missed or haven't seen yet.
  You can back progress up and restore it from the Progress tab.
- **Offline:** a service worker caches the app after the first visit.

## Adding material

1. Add chunk files (JSON with `notes` and `questions`) to `content/<course>/`. Each course
   folder also needs a `course.json` that lists its topic groups. See `content/course6/` for the format.
   Notes and questions can carry an optional `ref` (e.g. "OMS 020") that is shown instead of a page number.
2. Run `python3 scripts/build.py` to regenerate `data/`.
3. If you added files to `data/`, add them to `SHELL` in `sw.js`, and bump `CACHE` in `sw.js`
   whenever the app's code changes.

Hosted on GitHub Pages from the `main` branch root: https://camjastewart90.github.io/Study-app/
