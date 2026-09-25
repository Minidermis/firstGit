// Paste after 01_probe.js reported mode 'text'. Set CAND to the candidate index
// you chose from the probe (0 is the largest, and is almost always right; pick
// another only if 0 is plainly a comment list or an episode list).
//
// Serializes the episode paragraph by paragraph, INCLUDING ::before/::after
// content (innerText and textContent both skip it), skipping text the page
// hides from the reader, and leaves the result on window.__MD. Returns the
// four numbers that become the contract for the delivered file, plus guards.

(() => {
  const CAND = 0;

  const c = window.__CANDS && window.__CANDS[CAND];
  if (!c) throw new Error('No candidate ' + CAND + ' — run 01_probe.js first, on this same tab.');
  const box = c.el;
  const win = (box.ownerDocument || document).defaultView || window;
  const gcs = (el, pseudo) => win.getComputedStyle(el, pseudo);

  const unq = v =>
    (!v || v === 'none' || v === 'normal') ? '' :
    v.replace(/^["']|["']$/g, '')
     .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (m, h) => String.fromCodePoint(parseInt(h, 16)));

  // Text a reader cannot see is not part of what the page shows them. Viewers
  // sometimes plant invisible per-account strings in the prose; keep them out.
  let hiddenChars = 0;
  const hidden = el => {
    const s = gcs(el);
    return s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0' ||
      parseFloat(s.fontSize) === 0 || s.color === 'rgba(0, 0, 0, 0)';
  };

  let pseudoGain = 0;
  const ser = node => {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType !== 1) return '';
    if (node.nodeName === 'BR') return '\n';
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|BUTTON|svg)$/i.test(node.nodeName)) return '';
    if (hidden(node)) { hiddenChars += (node.textContent || '').trim().length; return ''; }
    const b = unq(gcs(node, '::before').content);
    const a = unq(gcs(node, '::after').content);
    pseudoGain += b.length + a.length;
    let s = b;
    const kids = node.shadowRoot ? node.shadowRoot.childNodes : node.childNodes;
    for (const k of kids) s += ser(k);
    return s + a;
  };

  // Paragraph units: the same "text block" rule the probe used, in document
  // order. A <br>-separated container is split on its line breaks instead.
  const BLOCK = 'p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre';
  let raw;
  if (c.brMode) {
    raw = ser(box).split('\n');
  } else {
    const leaves = [...box.querySelectorAll(BLOCK)].filter(el =>
      (el.textContent || '').trim() &&
      !(el.querySelector(BLOCK) && [...el.querySelectorAll(BLOCK)].some(k => (k.textContent || '').trim())));
    // A leaf under a hidden ancestor is hidden too; ser() only sees downward.
    raw = leaves.map(el => {
      if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
        hiddenChars += (el.textContent || '').trim().length;
        return '';
      }
      return ser(el);
    });
  }

  const out = raw
    .map(s => s.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')   // zero-width padding
               .replace(/\u00A0/g, ' ')
               .replace(/\n{2,}/g, '\n')   // '\n\n' is reserved for "next paragraph"
               .replace(/[ \t\u3000]+$/g, '')
               .replace(/^[ \t]+/g, ''))
    .filter(s => s.trim().length);

  window.__MD = out.join('\n\n');

  const n = window.__MD.replace(/[\s\u3000]/g, '');
  let sum = 0, xor = 0, hangul = 0;
  for (const ch of n) {
    const cp = ch.codePointAt(0);
    sum += cp; xor ^= cp;
    if (cp >= 0xAC00 && cp <= 0xD7A3) hangul++;
  }

  return {
    paras: out.length,
    normLen: n.length,
    codepointSum: sum,
    xor: xor,
    hangulShare: n.length ? Math.round(100 * hangul / n.length) : 0,
    pseudoGain,        // characters recovered from CSS ::before/::after
    hiddenChars,       // characters skipped because the reader can't see them
    // Must be 0. Non-zero means the viewer substitutes glyphs through a
    // private webfont; the DOM text is not what's displayed. Stop (SKILL.md).
    leftoverPUA: [...window.__MD]
      .filter(ch => ch.codePointAt(0) >= 0xE000 && ch.codePointAt(0) <= 0xF8FF).length,
    firstParaLen: out[0] ? out[0].length : 0,
    lastParaLen: out.length ? out[out.length - 1].length : 0
  };
})()
