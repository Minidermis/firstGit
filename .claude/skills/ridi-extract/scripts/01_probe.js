// Paste into mcp__claude-in-chrome__javascript_tool on the page the user has open.
//
// Nothing here is extracted yet. This only finds out what kind of page it is and
// HOW the reading text is rendered, because Kakao Page and Ridi change their
// viewers without notice and the right next step depends entirely on the answer:
//
//   mode 'text'      -> the episode is real text in the DOM; go to 02_extract.js
//   mode 'image'     -> pages are pictures or a canvas; stop (see SKILL.md)
//   mode 'metadata'  -> a series / book detail page; use 00_series_meta.js
//   mode 'empty'     -> nothing readable: not logged in, not unlocked, or still loading
//
// Candidates are left on window.__CANDS for 02_extract.js to use by index, so
// no selector has to survive a round trip (and iframe / shadow-root contents
// can't be addressed by a selector from the top document anyway).

(() => {
  const host = location.hostname;
  const path = location.pathname;
  const site = /(^|\.)kakao\.com$/.test(host) ? 'kakaopage'
    : /(^|\.)ridibooks\.com$|(^|\.)ridi\.io$/.test(host) ? 'ridi' : 'other';

  let kind = 'other';
  if (site === 'kakaopage') {
    kind = /\/viewer\//.test(path) ? 'viewer' : /^\/content\/\d+/.test(path) ? 'series' : 'other';
  } else if (site === 'ridi') {
    kind = /\/view/.test(path) || /^view\./.test(host) ? 'viewer'
      : /\/books\/\d+/.test(path) ? 'book' : 'other';
  }

  // Walk the document, open shadow roots, and same-origin iframes. Cross-origin
  // frames can't be read from here; they're only counted.
  const roots = [];
  let crossOriginFrames = 0;
  const visit = (root, where) => {
    roots.push({ root, where });
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) visit(el.shadowRoot, where + '>shadow(' + el.tagName.toLowerCase() + ')');
    }
    root.querySelectorAll('iframe, frame').forEach((f, i) => {
      let d = null;
      try { d = f.contentDocument; } catch (e) { /* cross-origin */ }
      if (d && d.body) visit(d, where + '>iframe[' + i + ']');
      else crossOriginFrames++;
    });
  };
  visit(document, 'top');

  // "Text blocks" are block-ish elements with text and no block-ish descendant
  // that has text of its own. Summing them per parent finds the container that
  // holds the prose, whatever its class names are this week.
  const BLOCK = 'p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre,section,article';
  const byParent = new Map();
  for (const { root, where } of roots) {
    for (const el of root.querySelectorAll(BLOCK)) {
      const t = (el.textContent || '').trim();
      if (!t) continue;
      const hasBlockKid = el.querySelector(BLOCK) &&
        [...el.querySelectorAll(BLOCK)].some(k => (k.textContent || '').trim());
      if (hasBlockKid) continue;
      const p = el.parentElement || el;
      const rec = byParent.get(p) || { el: p, where, blocks: 0, chars: 0 };
      rec.blocks++;
      rec.chars += t.length;
      byParent.set(p, rec);
    }
  }
  // Containers whose prose is a <br>-separated run of text nodes have no block
  // children at all; catch them by their own direct text.
  for (const { root, where } of roots) {
    for (const el of root.querySelectorAll('div,section,article,main,body')) {
      if (byParent.has(el)) continue;
      let direct = 0, brs = 0;
      for (const n of el.childNodes) {
        if (n.nodeType === 3) direct += n.nodeValue.trim().length;
        else if (n.nodeName === 'BR') brs++;
      }
      if (direct >= 200 && brs >= 3) byParent.set(el, { el, where, blocks: brs + 1, chars: direct, brMode: true });
    }
  }
  const cands = [...byParent.values()].sort((a, b) => b.chars - a.chars).slice(0, 5);
  window.__CANDS = cands;

  // Picture-based rendering: big images or a big canvas where the reader sits.
  const vw = innerWidth, vh = innerHeight;
  let bigImgs = 0, blobImgs = 0, bigCanvas = 0;
  for (const { root } of roots) {
    for (const im of root.querySelectorAll('img')) {
      const r = im.getBoundingClientRect();
      if (r.width * r.height > vw * vh * 0.25) bigImgs++;
      if (/^(blob|data):/.test(im.currentSrc || im.src)) blobImgs++;
    }
    for (const c of root.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width * r.height > vw * vh * 0.25) bigCanvas++;
    }
  }

  const top = cands[0];
  const topText = top ? (top.el.textContent || '') : '';
  const pua = [...topText].filter(ch => { const c = ch.codePointAt(0); return c >= 0xE000 && c <= 0xF8FF; }).length;
  const zw = (topText.match(/[\u200B-\u200D\u2060\uFEFF]/g) || []).length;
  const hangul = (topText.match(/[\uAC00-\uD7A3]/g) || []).length;

  let mode;
  if (kind === 'series' || kind === 'book') mode = 'metadata';
  else if (top && top.chars >= 500) mode = 'text';
  else if (bigImgs || bigCanvas) mode = 'image';
  else mode = 'empty';

  // Keep this return value small and plain: javascript_tool may replace URLs
  // with query strings or long attribute dumps with [BLOCKED: ...].
  return {
    site, kind, mode,
    title: document.title.slice(0, 120),
    roots: roots.map(r => r.where),
    crossOriginFrames,
    candidates: cands.map((c, i) => ({
      i, where: c.where, tag: c.el.tagName ? c.el.tagName.toLowerCase() : '#root',
      blocks: c.blocks, chars: c.chars, brMode: !!c.brMode
    })),
    bigImgs, blobImgs, bigCanvas,
    topHangul: hangul, topPUA: pua, topZeroWidth: zw
  };
})()
