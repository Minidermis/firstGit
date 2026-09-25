// Paste after 02_extract.js, once leftoverPUA is 0 and the counts look right
// (or after 00_series_meta.js, with SOURCE = 'meta', to save the listing).
//
// Hands the finished file from the user's browser straight to their disk. The
// text never gets retyped through the assistant, which is the point: the page
// already holds the episode, so let it deliver the file.
//
// Get the user's agreement before running this — it drops a file in their
// Downloads folder. Use a fresh tab per episode: Chrome silently blocks the
// second automatic download from the same tab.

(() => {
  // Fill these in from what the page shows. Leave '' to fall back to og:title /
  // document.title, which on these sites usually carries the work's name.
  const WORK = '';       // 작품명
  const AUTHOR = '';     // 작가
  const EPISODE = '';    // 회차 — e.g. '12화' or the episode title
  const SOURCE = 'episode';   // 'episode' (window.__MD) or 'meta' (window.__META)

  const meta = n =>
    (document.querySelector(`meta[property="${n}"], meta[name="${n}"]`) || {}).content || '';

  // Filename from the URL: kakaopage_<series>_<episode>.md / ridi_<book>.md
  const p = location.pathname;
  const km = p.match(/\/content\/(\d+)(?:\/viewer\/(\d+))?/);
  const rm = p.match(/\/books\/(\d+)/);
  const FILENAME =
    km ? 'kakaopage_' + km[1] + (km[2] ? '_' + km[2] : '_info') + '.md'
    : rm ? 'ridi_' + rm[1] + (SOURCE === 'meta' ? '_info' : '') + '.md'
    : 'episode.md';

  let body;
  if (SOURCE === 'meta') {
    const m = window.__META;
    if (!m) throw new Error('window.__META is empty — run 00_series_meta.js first.');
    body = [
      m.description,
      m.keywords ? '**키워드:** ' + m.keywords : '',
      m.episodes.length ? '## 회차 목록\n\n' + m.episodes.map(e => '- ' + e.text).join('\n') : ''
    ].filter(Boolean).join('\n\n');
  } else {
    if (!window.__MD) throw new Error('window.__MD is empty — run 02_extract.js first.');
    body = window.__MD;
  }

  const work = WORK || (window.__META && window.__META.title) || meta('og:title') || document.title;
  const author = AUTHOR || (window.__META && window.__META.author) || '';

  // This header shape is load-bearing: verify.py splits the body on a line of
  // exactly '---' and expects the file to start with '# '.
  const header = '# ' + work + '\n\n'
    + (author ? '**작가:** ' + author + '\n' : '')
    + (EPISODE ? '**회차:** ' + EPISODE + '\n' : '')
    + '**출처:** ' + location.origin + location.pathname + '\n\n'
    + '---\n\n';

  const full = header + body + '\n';

  const blob = new Blob([full], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = FILENAME;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);

  // Recompute the contract over the exact bytes handed to the browser, so what
  // gets checked is the delivered file rather than an assumption about it.
  // (indexOf, not split with a limit: JS split drops everything after the
  // limit, and prose can contain its own '---' scene break.)
  const b = full.slice(full.indexOf('\n---\n') + 5);
  const n = b.replace(/[\s\u3000]/g, '');
  let sum = 0, xor = 0;
  for (const ch of n) { sum += ch.codePointAt(0); xor ^= ch.codePointAt(0); }

  return {
    filename: FILENAME,
    bytes: new TextEncoder().encode(full).length,
    paras: b.split('\n\n').filter(s => s.trim()).length,
    chars: n.length,
    codepointSum: sum,
    xor: xor
  };
})()
