# Calcium Audio blog

A custom, static blog. No CMS, database, dependencies, or accounts. Generated HTML works on the same hosting as the rest of the website. Reading does not require JavaScript.

## Publishing a post

1. Duplicate `posts/001.json` into a new numbered JSON file.
2. Set a unique URL slug and issue number, title, date (YYYY-MM-DD), category, reading time, intro, and sections. Each section has a heading and a list of paragraphs. Text is escaped automatically.
3. Run `python3 blog/build.py` from the repository root.
4. Preview `/blog/`, then deploy the repository through the site's usual hosting process.

The index is generated newest first. Post files live at `/blog/<slug>/index.html`. Edit JSON rather than generated HTML. Styling and interactions are in `blog.css` and `blog.js`.

Track 1 is the supplied original MP3 in `audio/01-14-10-26.mp3`. The article uses a native audio player with seeking, volume, and download. Audio starts only when the reader presses play. The Web Audio analyser reads bass (35–180 Hz), highs (1.8–9 kHz), RMS energy, and changes in energy to deform a full-screen ASCII canvas. Three field geometries are available. Freeze Animation leaves audio playback alone; reduced-motion preferences freeze the field by default. No external libraries or fonts are loaded.

The article is a draft based on Calum’s stated reasons for the project. The MP3 was measured (7:30, mean -18.6 dB, peak -1.5 dB); no subjective listening assessment is claimed.
