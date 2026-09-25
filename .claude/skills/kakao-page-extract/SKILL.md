---
name: kakao-page-extract
description: Save a Kakao Page (카카오페이지, page.kakao.com) or Ridi (리디북스, ridibooks.com) web-novel episode that the user already has open and can read in their own Chrome, as clean Markdown for their own offline reading — or save a work's public listing (title, author, synopsis, episode list) from its series/book page. Works through Claude in Chrome on the user's logged-in session. The two viewers change their rendering without notice (text in the DOM, text inside iframes or shadow roots, CSS pseudo-element text, invisible per-account strings, or pages drawn as images/canvas), so this probes how the page is actually rendered before extracting anything and stops when the text isn't there as text. Use it whenever the user points at a page.kakao.com/content/... or ridibooks.com/books/... URL and wants an episode or the work's info saved, exported, read offline, or translated. Prefer this over a plain innerText grab on these sites, which silently picks up menus and hidden text and misses pseudo-element runs.
---

# Saving Kakao Page / Ridi episodes you're reading

This is for episodes the user can already open and read in their own browser
session — it saves, for their own offline copy, the text the page is already
showing them. It is not a way around the paywall, a wait-for-free timer, or DRM:

- Only work on an episode that is **open and readable in the user's tab**. If
  the viewer shows a purchase / ticket / login prompt, stop and tell the user.
- Don't call the sites' internal APIs, fetch other episodes' content, decrypt
  anything, or read data the viewer hasn't rendered for the reader.
- One episode at a time, at the user's request. Not for bulk-harvesting a work
  or for redistribution.

Keep the output as the user's own reading copy — don't paste episodes back
into chat; the file on disk is the deliverable, and the report is metadata
(counts, rendering mode, verification), not prose.

## Which page is which

| URL | What it is | What you can save |
|---|---|---|
| `page.kakao.com/content/<seriesId>` | Kakao series home | Listing: title, author, synopsis, episode list |
| `page.kakao.com/content/<seriesId>/viewer/<productId>` | Kakao episode viewer | The episode, if rendered as text |
| `ridibooks.com/books/<bookId>` | Ridi book detail | Listing: title, author, synopsis, volumes/episodes |
| `ridibooks.com/books/<bookId>/view` | Ridi web viewer (may redirect to a `view.` host) | The episode/volume, if rendered as text |

If the user gives a series/book URL but wants an episode, ask which episode and
have them open it (so their own session unlocks it), rather than picking one.

## Why probe first

Nothing about these viewers' markup is stable, so the scripts never assume
class names. What they do assume is the set of ways reading text can be
rendered, and each needs different handling — or a stop:

- **Plain DOM text** (paragraphs in `<p>`/`<div>`, or `<br>`-separated runs).
  Extractable. Menus, comments and episode lists are also text, which is why
  the probe ranks containers by how much paragraph text they hold.
- **Same-origin iframe or open shadow root.** Extractable; `document.body.innerText`
  from the top frame simply never sees it. The probe walks into both.
- **CSS `::before`/`::after` text.** `innerText`/`textContent` skip it; the
  extractor splices it back in (reported as `pseudoGain`).
- **Invisible text** (opacity 0, zero font size, transparent colour, hidden
  ancestors) — viewers sometimes plant per-account strings in the prose. It
  isn't what the reader sees, so it's left out (reported as `hiddenChars`).
- **Pictures** — pages drawn as `<img>` (often `blob:` URLs) or on a `<canvas>`.
  There is no text to extract. **Stop.** Don't screenshot the pages and
  transcribe them: that means retyping the whole work through the assistant,
  which is exactly what this skill exists to avoid.
- **Private-font glyph substitution** (Private Use Area codepoints in the DOM).
  The DOM text is not what's displayed. **Stop** and report it; don't guess
  characters from context.
- **Cross-origin frame** holding the text. It can't be read from the top frame.
  **Stop** and report it rather than navigating the tab to the frame's URL.

## Workflow

### 1. Open the page

Use the Chrome tools (`mcp__claude-in-chrome__*`) — episodes need the user's
logged-in session. Load tools with one `ToolSearch` call:

```
select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp
```

Call `tabs_context_mcp` with `createIfEmpty: true`, then `tabs_create_mcp` for
your own tab, `navigate` it to the URL, and use that tabId for everything
after. Close it with `tabs_close_mcp` when you're finished.

Take one `computer` screenshot after the page settles. It tells you at a glance
whether you're looking at the text, a purchase/login prompt, or an age gate —
any of those last three is a stop: ask the user to open the episode themselves.
Don't click through purchase or ticket dialogs on the user's behalf.

### 2. Probe

Paste `scripts/01_probe.js` into `javascript_tool`. It reports:

- `site`, `kind` (`viewer` / `series` / `book` / `other`)
- `mode` — **`text`**, **`image`**, **`metadata`** or **`empty`**
- `roots` — where it looked (`top`, `top>iframe[0]`, `…>shadow(x-viewer)`)
- `crossOriginFrames` — frames it could not read
- `candidates` — up to five containers, ranked by paragraph text:
  `{i, where, tag, blocks, chars, brMode}`
- `bigImgs`, `blobImgs`, `bigCanvas` — picture-based rendering signals
- `topHangul`, `topPUA`, `topZeroWidth` — about the top candidate

Branch on `mode`:

- `metadata` → step 2b.
- `text` → step 3, provided `topPUA` is 0.
- `image` → stop and explain (see above).
- `empty` → the text isn't on the page. Usually not logged in, not unlocked,
  or still loading. If `crossOriginFrames > 0`, the text is probably in a
  frame this can't read. Stop and tell the user which.

Sanity-check candidate 0: `chars` should be episode-sized (thousands), and
`topHangul` should be most of it for a Korean work. If candidate 0 is clearly
a comment thread or episode list (many short blocks, low `chars`), use the
index of the right one in step 3.

### 2b. Series / book page (listing only)

Paste `scripts/00_series_meta.js`. It reads og/meta tags and JSON-LD, plus any
episode links currently rendered, into `window.__META`, and returns short
fields and counts. `episodeLinks: 0` just means the list isn't made of links
(or isn't loaded) — say so rather than scrolling through hundreds of entries.

A synopsis and title are short enough to show the user in chat. To save them,
go to step 4 with `SOURCE = 'meta'`.

### 3. Extract the episode

**Make sure the whole episode is rendered first.** Viewers often lazy-load
paragraphs as you scroll or paginate. Scroll the tab to the end of the episode
(`computer` scroll, or ask the user to), then re-run `01_probe.js`: when
candidate 0's `chars` stops growing between probes, it's all there. If the
viewer paginates and only keeps the current page in the DOM, `chars` will stay
page-sized — report that rather than paging through and stitching.

Paste `scripts/02_extract.js`, setting `CAND` if you're not using candidate 0.
It serializes paragraph by paragraph with pseudo-element text spliced in,
hidden text left out, zero-width characters stripped, onto `window.__MD`, and
returns:

- `paras`, `normLen`, `codepointSum`, `xor` — the contract the file must meet
- `pseudoGain`, `hiddenChars` — what the CSS layers added and removed
- `hangulShare` — sanity check for a Korean episode (usually 70–90%)
- `leftoverPUA` — **must be 0**; otherwise stop (glyph substitution)
- `firstParaLen`, `lastParaLen` — a very short last paragraph is normal
  ("끝." / a scene break); an empty extraction is not

Record the four contract numbers.

### 4. Have the page save the file

Paste `scripts/03_download.js`. Fill in `WORK`, `AUTHOR` and `EPISODE` from
what the page shows (read them off the screenshot or the probe's `title`;
empty falls back to og:title / document.title). It writes a header, wraps it
and `window.__MD` (or `window.__META` with `SOURCE = 'meta'`) in a Blob, and
clicks a synthetic download link. Filenames come from the URL:
`kakaopage_<seriesId>_<productId>.md`, `kakaopage_<seriesId>_info.md`,
`ridi_<bookId>.md`, `ridi_<bookId>_info.md`.

**The text goes from the user's browser to the user's disk without being
retyped through the assistant.** Don't fall back to reading the episode out in
slices and writing it yourself. If the user doesn't want a download, the text
is sitting in `window.__MD` in their own tab, and they can copy it from the
console themselves.

Downloading is an action to get the user's agreement on first — say what the
file is and that it will land in their Downloads folder, and wait for a clear
yes.

**Use a fresh tab for each episode.** Chrome allows one automatic download per
tab and silently blocks the rest: no error, and the script still reports
success. Close the tab and open a new one between episodes.

The script recomputes `paras`, `chars`, `codepointSum` and `xor` over the exact
bytes it hands to the browser; compare them to step 3 before looking at disk.
The header shape (starts with `# `, a line of exactly `---` before the body) is
what `verify.py` relies on.

One quirk of `javascript_tool`: a return value containing a URL with a query
string, a long hex digest, an author name, or a dump of attributes can come
back as `[BLOCKED: ...]`. That filters what's returned to you, not what the page
computed — the file is still written correctly. Keep return values small and
plain; checksums are decimal for this reason.

### 5. Verify

Confirm the file exists (a blocked download reports success from the page's
side), then run:

```bash
python scripts/verify.py ~/Downloads/kakaopage_<seriesId>_<productId>.md \
  --paras 212 --chars 5310 --sum 229514012 --xor 40811
```

It re-derives the checksums and paragraph count from the file on disk and
confirms the header survived and that no PUA or zero-width characters remain.
Report the result honestly — on MISMATCH, find the divergence rather than
re-running hoping for a different answer.

Moving the file somewhere more permanent is the user's call; ask where they
want it.

## Reporting back

Report the site and page kind, the rendering mode and where the text lived
(`top`, an iframe, a shadow root), `pseudoGain` and `hiddenChars`, the paragraph
and character counts, and the verification result. If you stopped, say exactly
why (image/canvas pages, glyph substitution, cross-origin frame, not unlocked,
paginated DOM) — that is a useful answer, not a failure to apologise for.

Keep the episode itself out of the reply. Preserve the source's own quirks —
typos, spacing, punctuation — rather than "fixing" them.

## A note on pacing

Every step consumes the previous step's result (`window.__CANDS` → `__MD` →
the file), so the browser calls are sequential and can't be batched. Run the
scripts on the same tab, in order.
