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
5. **config.xml** allows no external top-level navigation for the app itself.

**Shield levels** (RED in the player cycles them; remembered per source):
| Level | Popups / new tabs | Top-frame redirects | Use for |
|---|---|---|---|
| strict (default) | blocked | blocked | sources that play sandboxed (2Embed) |
| popups ok | allowed (popups stay sandboxed) | blocked | sources that say "Please disable sandbox" |
| off | allowed | allowed* | last resort |

\* The redirect guard and `config.xml` navigation rules still apply.

Tested in a desktop browser: **2Embed** loads in strict mode. **VidLink / VidFast** check whether
they can open a popup and show "Please Disable Sandbox" otherwise. The test browser blocks every
popup, so their real TV behaviour is unknown: try "popups ok" first on the TV, then "off".
VidSrc and MultiEmbed were blocked by the test network.

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
js/screens/*.js       home, browse (movies/tv/anime), search, details, player, mylist, settings
js/dev-mock.js        ?mock fake data for desktop testing
```

This product uses the TMDB API but is not endorsed or certified by TMDB. The third-party embed
providers host the streams, and what they serve is their responsibility. Check that using them
is legal where you live.
