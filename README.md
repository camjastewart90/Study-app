# Study App

An installable study app (PWA) for FRV courses. It has study notes for each topic and a
"test your knowledge" section that tracks progress.

- **Notes:** transcribed from the Course 6 Exam Study Book, page by page.
- **Tests:** questions from the study book plus the numbered Q&A bank. Short-fact questions are
  multiple choice. List questions are flashcards that you mark yourself.
- **Progress:** kept on the device in `localStorage`. A question is mastered after 3 correct
  answers in a row. The "Smart mix" test favours questions you've missed or haven't seen yet.
  You can back progress up and restore it from the Progress tab.
- **Offline:** a service worker caches the app after the first visit.

## Adding material

1. Add chunk files (JSON with `notes` and `questions`) to `content/<course>/`. Each course
   folder also needs a `course.json` that lists its topic groups. See `content/course6/` for the format.
2. Run `python3 scripts/build.py` to regenerate `data/`.
3. If you added files to `data/`, add them to `SHELL` in `sw.js`, and bump `CACHE` in `sw.js`
   whenever the app's code changes.

Hosted on GitHub Pages from the `main` branch root.
