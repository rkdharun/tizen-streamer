# ReelTV — Samsung Tizen TV app

A remote-friendly streaming browser (like reelix / CatFlix / StreamSrc). Metadata comes from TMDB
and playback uses third-party embed players in an iframe. Popups, new tabs and redirects are blocked.

Plain HTML/CSS/JS with no build step. It targets Tizen 4.0+ (2018+ Samsung TVs).

## Features
- Home: rotating hero, Continue watching, Trending, Popular Movies/TV/Anime, Now in theatres, Top rated, On the air (rows load more as you scroll right)
- Movies / TV Shows / Anime: genre chips plus an infinite poster grid
- Search: on-screen D-pad keyboard (a USB/BT keyboard works too) with live results
- Details: info, Play/Resume, My List, season chips, episode row (remembers the last watched episode), "More like this"
- Player: multiple sources, next/previous episode, the ad shield, and an Interact mode
- Collections: 50+ franchises (Harry Potter, MCU, Bond, Baahubali, KGF…) in release order, with "continue where you left off"
- Streaming services: "Browse by service" tiles and "Popular on Netflix / Prime Video / JioHotstar…" rows for your region (Settings → Region)
- Trailers: official YouTube trailers from TMDB, controlled by the remote (OK pause, ◀ ▶ seek). If one can't be embedded, the next trailer is tried
- Cast & crew row on every title, with person pages (bio, known for, movies, shows)
- Movies in a franchise show their collection row on the details page
- My List, watch history and settings are stored on the TV (localStorage)

## Remote controls
| Key | Action |
|---|---|
| ◀ ▲ ▼ ▶ / OK | Move / select |
| BACK | Go back (on Home it asks before exiting) |
| CH+ / CH− | Jump rows. In the player: next/previous episode |
| GREEN | Add to / remove from My List (details, My List) |
| RED | Search: delete a character. Player: cycle the shield level |
| YELLOW | Player: try the next source |
| BLUE or ▶❙❙ | Player: Interact (hand the remote to the embedded player) |

On a desktop keyboard: arrows, Enter, Esc/Backspace = Back, PageUp/PageDown = CH±, and R/G/Y/B for the colour keys.

## How popups and redirects are blocked
1. **Sandboxed iframe** (`allow-scripts allow-same-origin allow-forms allow-presentation`).
   It leaves out `allow-popups`, `allow-top-navigation` and `allow-modals`. So `window.open`,
   `target=_blank`, `top.location = …` and alert spam all fail, in the embed and in every
   iframe nested inside it.
2. **Redirect guard.** If the embed frame navigates again after it has loaded (the
   usual "click → ad page" hijack), the app reloads the original source and shows
   "Blocked a redirect".
3. **Focus guard.** If an embed grabs keyboard focus, the app takes it back, so BACK and
   the menu keep working.
4. **Click shield.** A transparent layer covers the iframe whenever the menu is in control.
5. **config.xml** has `<tizen:allow-navigation>*</tizen:allow-navigation>`. Samsung TVs won't
   load external pages in an iframe without it. Redirects of the app itself are blocked by the
   sandbox (strict / popups ok) instead, so **Shield off** can let an ad take over the app.

**Shield levels** (RED in the player cycles them; remembered per source):
| Level | Popups / new tabs | Top-frame redirects | Use for |
|---|---|---|---|
| strict (default) | blocked | blocked | sources that play sandboxed (2Embed) |
| popups ok | allowed (popups stay sandboxed) | blocked | sources that say "Please disable sandbox" |
| off | allowed | allowed* | last resort |

\* The redirect guard still applies, but an ad could take over the whole app.

### Source comparison (checked against each provider's player code)
| Source | Autoplay | Remote control (OK / ◀ ▶) | Resume | Subtitle menu | Needs shield |
|---|---|---|---|---|---|
| **VidFast** | ✅ | ✅ commands via postMessage | ✅ `startAt` | ✅ `sub` + language list | plays on your TV (level you used) |
| **Reelix (website)** | ✅ (Reelix's page) | ❌ | Reelix's own | Reelix's own | off. vidcore is ad-free only when Reelix embeds it, so this loads Reelix's full page |
| **VidCore** (reelix.ac's player) | ✅ | ? same codebase as VidFast; connects automatically if supported | ✅ `startAt` | ✅ `sub` + language list | refuses Strict (like VidFast) |
| 2Embed | ❌ click-to-play wrapper | ❌ | ❌ | ❌ | strict loads, inner player refuses sandbox |
| 2Embed · Vsrc / Videm | ✅ `autoplay=1` | ❌ (Interact: arrows seek) | its own prompt | ❌ | **off** (rejects any sandbox) |
| VidLink | ✅ | ❌ events only | ✅ `startAt` + saved position | ❌ (only an external file) | **off** (rejects sandbox); calls an ad link on play/end |
| VidSrc.cc | ? | ? | ? | ? | down when tested (Cloudflare 522) |
| MultiEmbed | ? | ? | ? | ? | behind a Cloudflare check; untested |

Sources that report progress (VidFast, VidLink) also get resume and auto-next episode.

### Remote control (VidFast)
VidFast lets the app send it commands, so the remote controls playback directly. You don't need
Interact, and BACK always works:

| Key | Action |
|---|---|
| OK / ▶❙❙ | Play / pause |
| ◀ ▶ | Seek ∓10 s (hold to speed up to 30 s, then 60 s) |
| FF / REW | Seek ±30 s |
| ▲ ▼ | Open the player menu (sources, shield, episodes) |

**Subtitles:** open the menu (▲) and choose **Subtitles** to pick a language. The app asks VidFast
which languages exist for that title (falling back to a common list) and reloads the player at the
same position with `sub=<code>`. Quality adjusts automatically to your connection. VidFast has no
quality setting.

The app remembers where you stopped and resumes there next time (`{start}` in the source URL).
TV episodes go straight to the next one when an episode ends.

### Built-in player (recommended)
Embedded players belong to other websites, so the app can't click inside them. The built-in
player plays **direct streams** in ReelTV's own `<video>` (hls.js for HLS), so every control is
an app button and works with the remote, like Nuvio or Stremio on TVs.

1. **Built in:** the Archive.org public-domain addon
   (`https://dev.nebulawp.org/stremio/archive.org-addon/manifest.json`). It's only used for films
   released up to 1970, because it guesses by title and returns unrelated uploads for newer films.
   **Settings → Stream addons**: add your own Stremio-compatible addon URLs
   (`https://…/manifest.json`, comma-separated), e.g. a Jellyfin bridge for your own library.
   Extras are stored separately and never replace the defaults.
2. Press **Play**. The app asks each addon for streams
   (`/stream/movie/<imdb>.json`, `/stream/series/<imdb>:<s>:<e>.json`) and plays the first that works,
   skipping broken ones automatically. If none work, it falls back to the embed sources.

| Key | Action |
|---|---|
| OK / ▶❙❙ | Play / pause |
| ◀ ▶ | Seek ∓10 s (hold: 30 s, then 60 s) · FF/REW ±30 s |
| ▲ ▼ | Menu: Subtitles · Quality · Audio · Streams · Prev/Next · Embed sources |
| RED | Subtitles |
| CH+ / CH− | Next / previous episode |
| BACK | Close the panel / menu, then the player |

- **Subtitles** come from the public OpenSubtitles addon (and from the stream, if it has any).
  SRT is converted to WebVTT. Your last language is picked automatically next time.
- **Quality** and **Audio** list the stream's own HLS levels and audio tracks.
- Resume, auto-next episode and Continue watching work as with the other sources.
- Limitation: streams that need special request headers (an addon's `proxyHeaders`) usually
  can't play on Tizen without a relay server. They're tried last and marked ⚠ in Streams.
- Dev: `python3 dev-server.py` serves a test addon at `http://localhost:8765/dev-addon` with
  public test streams.

### Clicking inside the player (subtitles, quality, servers)
An app can't click inside another website's player (browser security), and **Interact does not
show a cursor**. It only forwards the arrow/OK keys for a few seconds. Two things do work:

- **Player menu → Browser**: opens this source, or Reelix's ad-free page, in Samsung's built-in
  browser. The browser has its own remote-driven cursor that can click anything. Come back to
  ReelTV when done; your position is saved.
- **A USB/Bluetooth mouse or a pointer remote**: move it over the player to enter mouse mode.
  Any remote key brings the app's controls back.

### About Interact
Key presses go to whichever frame has focus. While the embed is focused the app cannot see
any keys, including BACK. That's why **Interact** hands the remote to the player only for a
limited time (12 s by default, adjustable in Settings), then takes it back. Sources start
with `autoplay` where they support it, so you usually don't need Interact. It's for picking
servers, quality or subtitles inside the provider's player. How well the D-pad works inside
an embed depends on that provider's page.

## Setup

### 1. TMDB API key
Get a free key at https://www.themoviedb.org/settings/api (either the v3 key or the v4 read token works).
Either:
- put it in `js/config.js` → `TMDB_API_KEY: "..."` before building, **or**
- enter it on the TV in **Settings → TMDB API key** (OK opens the Samsung keyboard, Done saves).

### 2. Sources
Embed domains change often. Edit `CONFIG.SOURCES` in `js/config.js`. Placeholders:
`{tmdb}` `{imdb}` `{season}` `{episode}`.

### 3. Try it on a desktop
```bash
python3 dev-server.py
```
Open http://localhost:8765/index.html. Add `?mock` to use fake data without a TMDB key.

### 4. Install on the TV
1. Install **Tizen Studio** with the *TV Extensions* and *Samsung Certificate Extension*
   (Package Manager → Extension SDK).
2. Open **Certificate Manager** → create a **Samsung** certificate profile (TV). Name it `ReelTV`
   (or set `TIZEN_PROFILE`). Samsung TVs only accept apps signed with a Samsung certificate
   that includes the TV's DUID, so connect the TV first (step 3) and let the wizard read the DUID.
3. On the TV: **Apps** → press `1 2 3 4 5` on the remote → turn **Developer mode ON** →
   enter your computer's IP → restart the TV. The TV and computer must be on the same network.
4. Build and install:
   ```bash
   ./build.sh 192.168.1.50
   ```
   (Use your TV's IP. Without an IP it only builds `ReelTV.wgt`.) You can also import the folder into Tizen Studio
   as a Web project and use *Run As → Tizen Web Application*.

## Project layout
```
config.xml            Tizen manifest (privileges, CSP, access)
index.html            entry point
css/app.css           1920×1080 TV layout
js/config.js          TMDB key + embed sources
js/keys.js            Samsung remote key codes + registration
js/nav.js             spatial D-pad focus engine (rows, grids, focus memory)
js/app.js             router, sidebar, dialogs, key dispatch
js/tmdb.js            TMDB client (cached)
js/storage.js         settings / My List / history
js/ui.js              cards, rows, buttons, toast
js/screens/*.js       home, browse (movies/tv/anime), search, details, player, mylist, options (= Settings; not named settings.js because the Tizen packager drops it)
js/addons.js          Stremio-protocol stream + subtitle addons (built-in player)
js/vendor/hls.min.js  hls.js 1.5.20 (HLS playback, quality/audio tracks)
js/dev-mock.js        ?mock fake data for desktop testing
```

This product uses the TMDB API but is not endorsed or certified by TMDB. The third-party embed
providers host the streams, and what they serve is their responsibility. Check that using them
is legal where you live.
