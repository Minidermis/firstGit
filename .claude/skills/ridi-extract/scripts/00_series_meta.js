// Paste on a series / book detail page (probe mode 'metadata'):
//   page.kakao.com/content/<seriesId>      ridibooks.com/books/<bookId>
//
// Collects what the page publishes about the work — title, author, synopsis,
// keywords, and whatever episode links are rendered right now. Everything here
// is public listing information; no episode text is read.
//
// Returns counts and short fields only; the full record stays on window.__META
// for 03_download.js to save if the user wants it as a file.

(() => {
  const meta = n =>
    (document.querySelector(`meta[property="${n}"], meta[name="${n}"]`) || {}).content || '';

  // JSON-LD, when present, is the most structured source (Ridi uses it for Book).
  const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .flatMap(s => { try { const j = JSON.parse(s.textContent); return Array.isArray(j) ? j : [j]; } catch (e) { return []; } })
    .find(j => j && /Book|CreativeWork|Product/i.test(String(j['@type']))) || {};

  const authorOf = a => !a ? '' : Array.isArray(a) ? a.map(authorOf).filter(Boolean).join(', ')
    : typeof a === 'string' ? a : (a.name || '');

  // Episode links: Kakao viewer URLs contain /viewer/, Ridi volumes are /books/<id>.
  const seen = new Set();
  const episodes = [...document.querySelectorAll('a[href]')]
    .filter(a => /\/viewer\/\d+|\/books\/\d+/.test(a.getAttribute('href')))
    .map(a => ({ href: new URL(a.getAttribute('href'), location.href).pathname,
                 text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120) }))
    .filter(e => e.text && e.href !== location.pathname && !seen.has(e.href) && seen.add(e.href));

  window.__META = {
    title: ld.name || meta('og:title') || document.title,
    author: authorOf(ld.author),
    description: ld.description || meta('og:description') || meta('description'),
    keywords: meta('keywords'),
    image: ld.image || meta('og:image'),
    episodes
  };

  return {
    title: window.__META.title.slice(0, 100),
    authorLen: window.__META.author.length,     // read the name itself from the page/screenshot if BLOCKED
    descriptionLen: window.__META.description.length,
    episodeLinks: episodes.length,
    firstEpisode: episodes[0] ? episodes[0].text.slice(0, 60) : '',
    lastEpisode: episodes.length ? episodes[episodes.length - 1].text.slice(0, 60) : ''
  };
})()
