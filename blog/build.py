"""Build the blog: python3 blog/build.py (standard library only)."""
import json, html, pathlib, datetime
ROOT = pathlib.Path(__file__).resolve().parent
esc = html.escape
posts = sorted((json.loads(p.read_text()) for p in (ROOT/'posts').glob('*.json')), key=lambda p: p['date'], reverse=True)
def shell(title, content, depth=''):
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} — Calcium Audio</title><link rel="stylesheet" href="{depth}blog.css"></head><body><canvas id="field" aria-hidden="true"></canvas><header><a href="{depth}../index.html">calcium audio</a> / <a href="{depth}index.html">blog</a></header>{content}<footer><hr><a href="{depth}index.html">all posts</a> · <a href="{depth}../contact/index.html">contact</a></footer><script src="{depth}blog.js"></script></body></html>'''
for p in posts:
    assert p['slug'] and all(c in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in p['slug'])
    date = datetime.date.fromisoformat(p['date']).strftime('%d.%m.%Y')
    sections = ''.join(f'<section id="part-{i}"><span class="section-number">0{i}</span><h2>{esc(s["heading"])}</h2>'+''.join(f'<p>{esc(t)}</p>' for t in s['paragraphs'])+'</section>' for i,s in enumerate(p['sections'],1))
    toc = ''.join(f'<a href="#part-{i}"><b>0{i}</b> {esc(s["heading"])}</a>' for i,s in enumerate(p['sections'],1))
    player = '<div class="track"><p><b>01</b> / 14.10.26 <span>7:30</span></p><audio id="track" controls preload="metadata" src="../audio/01-14-10-26.mp3">Your browser does not support audio playback.</audio><div class="controls"><button id="motion" type="button" aria-pressed="false">freeze animation</button><button id="field-mode" type="button">change shape</button><a href="../audio/01-14-10-26.mp3" download>download mp3</a></div><p class="player-note" id="audio-status" role="status">press play. the page follows the sound.</p></div>' if p['number']=='001' else ''
    content = f'''<main><article><p class="metadata">{date} / Calum Vaughan</p><h1>{esc(p['title'])}</h1><p class="intro">{esc(p['intro'])}</p>{player}<div class="prose">{sections}<hr><p class="post-end">Calum<br>{date}</p><a href="../index.html">← all posts</a></div></article></main>'''
    folder=ROOT/p['slug']; folder.mkdir(exist_ok=True); (folder/'index.html').write_text(shell(p['title'],content,'../'))
cards=''.join(f'<li><time>{esc(p["date"])}</time> — <a href="{p["slug"]}/">{esc(p["title"])}</a></li>' for p in posts)
(ROOT/'index.html').write_text(shell('Blog',f'<main class="archive"><h1>Blog</h1><p>Music and things I’m working on.</p><hr><ul>{cards}</ul></main>'))
print(f'Built {len(posts)} post(s) and blog index.')
