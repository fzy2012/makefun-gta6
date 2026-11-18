[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/fzy2012/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/fzy2012/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Heat

An open-world crime game in the fictional Solmar City, played top-down in a
desktop browser. You are Rook, a driver for hire back in town. Steal cars,
outrun the Solmar PD, run five jobs for Mara at The Rusty Anchor, and own the
city — on foot and behind the wheel.

## Play

```sh
node serve.ts
```

Then open http://localhost:8080.

- **WASD / arrows** — move on foot, drive when you're in a car
- **E** — get in a car, steal one, get out again
- **Mouse** — aim; **click** — shoot
- **Space** — punch
- **Esc** — pause (progress saves) · **M** — mute

## What's in the city

- A full street grid with traffic, pedestrians, a park, a beach and a harbour
- A wanted level (1–5 stars): police cars chase and ram, cops on foot chase
  and grab you; lay low and the heat dies down
- Five story missions with a timer, a payout and a next job at the garage:
  First Wheels, Package Run, Hot Lap, Cool Down, The Harbour Job
- Combat on foot (fists and a pistol), drive-by physics, skid marks, crashes
- A HUD with cash, health, ammo, wanted stars, a live minimap and the
  current objective — plus a start screen and saves between visits
- All art drawn in canvas and all sound synthesised with WebAudio; the game
  loads no network resource at all

## Layout

- `game/index.html` — the page; `game/src/` — the game, one job per file:
  `city.js` builds Solmar, `world.js` runs it, `render.js` draws it,
  `hud.js` draws the HUD and menus, `missions.js` holds Mara's jobs,
  `audio.js` synthesises every sound, `shots.js` stages the screenshots
- `main.ts` — hands `game/` and `screenshots/` in and writes the dossier
- `screenshots/` — four real renders of the game

<sub>Entered on [make.fun](https://make.fun/?ref=jzg6e99f&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
