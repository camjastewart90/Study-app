# Study App

An installable study app (PWA) for FRV courses. It has study notes for each topic and a
"test your knowledge" section that tracks progress.

- **Notes:** transcribed from the SO exam study book, page by page, plus the full source documents
  (OMS, OPP, OPG, ORP, POL 003, ORG 109/133, Workplace Behaviour Policy, AIIMS card, FRV Act).
- **Tests:** questions from the study book, the numbered Q&A bank, and the source documents. Short-fact questions are
  multiple choice. List questions are flashcards that you mark yourself.
- **Spaced review:** every answered question gets a due date. A correct answer on a due question
  moves it up a box and pushes the next review out (1, 3, 7, 16, then 35 days); a miss drops it two
  boxes and brings it back tomorrow. Box 3 counts as mastered, but an overdue question slips back
  until it's reviewed. Home shows what's due today, and "Smart mix", "Priority", "Weak spots" and
  "Not seen yet" are still there for free practice.
- **Progress:** kept on the device in `localStorage`. Back it up and restore it from the Progress
  tab; Home reminds you after 7 days of study without a backup. A test in progress is saved after
  every answer and can be resumed from Home.
- **Keys and gestures:** `1`-`4` pick an answer or grade, `Space`/`Enter` reveal and go on, `/`
  searches, `Esc` goes back. Swipe a revealed flashcard right (got it) or left (missed it).
- **Offline:** a cache-first service worker opens the app instantly from the saved copy and checks
  for updates in the background, then offers "New version ready · Refresh".

## Adding material

1. Add chunk files (JSON with `notes` and `questions`) to `content/<course>/`. Each course
   folder also needs a `course.json` that lists its topic groups. See `content/course6/` for the format.
   Notes and questions can carry an optional `ref` (e.g. "OMS 020") that is shown instead of a page number.
2. Run `python3 scripts/build.py` to regenerate `data/`.
3. If you added files to `data/`, add them to `SHELL` in `sw.js`, and bump `CACHE` in `sw.js`
   whenever the app's code changes.

Hosted on GitHub Pages from the `main` branch root: https://camjastewart90.github.io/Study-app/
