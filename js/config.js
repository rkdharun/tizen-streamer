/*
 * ReelTV configuration.
 *
 * TMDB_API_KEY: get a free v3 API key at https://www.themoviedb.org/settings/api
 * (It can also be entered at runtime from the Settings screen; that value wins.)
 *
 * SOURCES: embed providers. Placeholders:
 *   {tmdb} {imdb} {season} {episode}
 * Embed domains change often - edit/add entries here when one stops working.
 *   shield: "strict" (default) -> sandboxed: blocks popups, new tabs, top redirects
 *           "popups"           -> sandboxed but popups allowed (for sources that refuse strict)
 *           "off"              -> no sandbox
 *   The level can be cycled live in the player with RED / the Shield button (remembered).
 *   control: "postmessage" -> source accepts {command:"play"|"pause"|"seek"} messages and
 *            sends PLAYER_EVENT updates; the remote then controls playback directly.
 *   {start} -> resume position in seconds (0 if none).
 *   {sub}   -> subtitle language code chosen in the player menu ("" = off).
 *   subsList -> optional URL returning [{language, display}] to list available subtitles.
 */
var CONFIG = {
  TMDB_API_KEY: "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5YTBjMzkzOWM4MTg1ZWNkYmEwMDQwZjJhNDE2N2I3MCIsIm5iZiI6MTczMTQ4NTE3OC4wNjkyOTAyLCJzdWIiOiI2NzM0NWQ0MDljMWEyMzhkOGE5ZDM5MTUiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.YQcc2sBHfT9DdFH3Kqas7oPPDKSJuHOEQu2LlvAySZs",
  TMDB_BASE: "https://api.themoviedb.org/3",
  IMG_BASE: "https://image.tmdb.org/t/p/",
  LANGUAGE: "en-US",

  // Seconds the remote stays "inside" the player after choosing Interact.
  INTERACT_SECONDS: 12,

  SOURCES: [
    {
      id: "vidfast",
      name: "VidFast",
      movie: "https://vidfast.pro/movie/{tmdb}?autoPlay=true&startAt={start}&sub={sub}",
      tv: "https://vidfast.pro/tv/{tmdb}/{season}/{episode}?autoPlay=true&startAt={start}&sub={sub}",
      shield: "strict",
      control: "postmessage",  // remote drives play/pause/seek directly
      subsList: "https://vidfast.vc/wyzie?id={tmdb}"   // languages available per title
    },
    {
      id: "2embed",
      name: "2Embed",
      movie: "https://www.2embed.cc/embed/{tmdb}",
      tv: "https://www.2embed.cc/embedtv/{tmdb}&s={season}&e={episode}",
      shield: "strict"
    }
,
    {
      // 2Embed's inner players, loaded directly (skips 2Embed's click-to-play wrapper).
      // They refuse to run in any sandbox, so they default to shield "off".
      id: "vsrcbuzz",
      name: "2Embed · Vsrc",
      movie: "https://vidsrc.buzz/embed/movie/{tmdb}?autoplay=1",
      tv: "https://vidsrc.buzz/embed/tv/{tmdb}/{season}/{episode}?autoplay=1",
      shield: "off"
    },
    {
      id: "videm",
      name: "2Embed · Videm",
      movie: "https://videm.xyz/embed/movie/{tmdb}?autoplay=1",
      tv: "https://videm.xyz/embed/tv/{tmdb}/{season}/{episode}?autoplay=1",
      shield: "off"
    },
    {
      id: "vidlink",
      name: "VidLink",
      movie: "https://vidlink.pro/movie/{tmdb}?autoplay=true&startAt={start}",
      tv: "https://vidlink.pro/tv/{tmdb}/{season}/{episode}?autoplay=true&startAt={start}",
      shield: "strict"
    },
    {
      id: "vidsrccc",
      name: "VidSrc",
      movie: "https://vidsrc.cc/v2/embed/movie/{tmdb}?autoPlay=true",
      tv: "https://vidsrc.cc/v2/embed/tv/{tmdb}/{season}/{episode}?autoPlay=true",
      shield: "strict"
    },
    {
      id: "multiembed",
      name: "MultiEmbed",
      movie: "https://multiembed.mov/?video_id={tmdb}&tmdb=1",
      tv: "https://multiembed.mov/?video_id={tmdb}&tmdb=1&s={season}&e={episode}",
      shield: "strict"
    }
  ]
};
