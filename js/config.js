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
      movie: "https://vidfast.pro/movie/{tmdb}?autoPlay=true&startAt={start}",
      tv: "https://vidfast.pro/tv/{tmdb}/{season}/{episode}?autoPlay=true&startAt={start}",
      shield: "strict",
      control: "postmessage"   // remote drives play/pause/seek directly
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
      id: "vidlink",
      name: "VidLink",
      movie: "https://vidlink.pro/movie/{tmdb}?autoplay=true",
      tv: "https://vidlink.pro/tv/{tmdb}/{season}/{episode}?autoplay=true",
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
