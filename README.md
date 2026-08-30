# 🏈 FF-26 — Fantasy Football Draft Dashboard

A private, zero-dependency draft-day dashboard for the **2026/2027 NFL season**. No accounts, no build step, no internet required after the first load — just open it and draft.

## Quick start

1. Clone the repo (or download the ZIP).
2. Open `index.html` in a browser (Chrome/Edge/Firefox recommended).
3. On first launch, fill in **League setup**: team names, your draft slot, and rounds.
4. Draft. Everything autosaves to your browser (localStorage), so a refresh won't lose your board.

Prefer a URL? This repo deploys itself to Cloudflare Workers on every push to `main`
(see `.github/workflows/deploy-cloudflare.yml`), live at
**https://missionoaks.tatinc.us**. One-time setup: add `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` as repo secrets under **Settings → Secrets and variables → Actions**.

## Core features

- **Player board** — 300 ranked players organized by position (QB, RB, WR, TE, K, DST), sorted by overall rank, with team, bye week, tier, and positional rank.
- **One-click drafting** — `＋ Mine` adds a player to your roster; `✕` crosses him off as another team's pick and asks which team took him (defaults to whoever is on the clock).
- **Draft board** — snake-order grid (10 teams × 16 rounds by default) that fills itself in as you log picks. Click any empty cell to log a pick directly for that team.
- **Roster manager** — auto-assigns your picks to QB/RB/RB/WR/WR/TE/FLEX/K/DST slots plus bench, with position-need alerts.
- **Queue** — star players to line them up; draft straight from the queue.

## Extras

- Best-available strip (click a chip to jump to the player)
- On-the-clock banner with "your next pick in N picks" countdown
- Search (`/` to focus), position tabs, hide-taken filter
- TGT / AVD / 💤 tags from 2026 expert rankings, with ADP notes
- Undo stack, JSON backup export/import, CSV pick export
- Custom player entry for anyone not on the board

## Player data (2026 season)

| Field | Source |
|---|---|
| Overall rank, tiers, bye weeks, sleepers | [Lindy's Sports Top 300 half-PPR cheat sheet](https://lindyssports.com/fantasy/fantasy-football-cheat-sheet-2026-top-300-draft-player-rankings) (Aug 28, 2026) |
| ADP, target/avoid flags | [PrizePicks PPR Top 200](https://www.prizepicks.com/playbook-article/2026-ppr-fantasy-football-rankings-top-200-draft-cheat-sheet) (Aug 29, 2026) |

To swap in your own rankings, edit `data/players.js` — one object per player:

```js
{ r: 1, t: 1, n: "Jahmyr Gibbs", p: "RB", tm: "DET", bye: 6, s: 1, tag: "T", adp: 12.3 }
```

- `r` overall rank · `t` tier · `n` name · `p` position (QB/RB/WR/TE/K/DST) · `tm` team abbr · `bye` bye week
- Optional: `s:1` sleeper, `tag:"T"` target, `tag:"A"` avoid, `adp` average draft position

## Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | Focus search |
| `Esc` | Close dialog |

## Notes

- Rankings are a snapshot from Aug 28–29, 2026. The PrizePicks list assumes a 6–8 week suspension for Packers RB Josh Jacobs.
- Your draft state lives in this browser's localStorage — export a JSON backup before clearing browser data, and use Import on your draft-day machine to restore it.
- Built for a 10-team league but supports 4–16 teams and 10–20 rounds in League setup.

## Open-sourcing later

This repo is private. When you're ready to share it: **Settings → General → Danger Zone → Change visibility → Public**, and consider adding an MIT `LICENSE` file.

Not affiliated with the NFL. For personal fantasy-league use.
