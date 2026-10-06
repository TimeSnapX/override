# OVERRIDE — Brisbane, 2100

A fast, cheeky, neon **mobile-first browser FPS**: humans vs the machines. You play Kestrel, a resistance runner with a
hacked arm, holding a rain-soaked rooftop in New Meanjin (Brisbane) in 2100 against SYNOD's Wasp drones, Sentinel walkers
and the Warden Unit boss. It's a static site with no build step. Three.js r170 is vendored in `vendor/three/`.

## Run locally
```
cd ..            # the folder that contains override/
python3 -m http.server 8095
# open http://localhost:8095/override/
```
Useful URL flags: `?debug=1` (debug panel), `?q=low|medium|high|ultra` (force a quality tier), `?skipintro`,
`?mobile=1|0` (force the touch or desktop layout), `?nolock` (no pointer lock).

## Deploy (later, to timesnapx.github.io/override/)
Copy this folder to `/override/` in the Pages repo as-is. The manifest `id` is `/override/?app=override` and its scope is `/override/`.
`sw.js` is network-first and still precaches every asset for offline play. Bump `VERSION` in `sw.js` on each release.

## Controls
**Touch (landscape):**
- Left half: floating move stick. Drag the right half to look.
- Buttons: FIRE (drag it to aim while firing), ⟳ reload, ⇄ swap, DASH, ⤒ jump, HACK (Override), ◎ Thermal scope, ▶ PLAY at arcade cabinets.
- Optional auto-fire-on-aim and aim assist are in Settings.

**Desktop:**
- WASD to move, mouse to look (pointer lock), left-click to fire, right-click or Z to scope.
- R reload, Q or the mouse wheel to swap, 1–5 to pick a weapon.
- Shift dash, Space jump, E Override, F interact, Esc or P pause, M mute, Enter READY.

## The Banana Gun (easter egg)
Either route unlocks it permanently (stored in localStorage):
1. **Find all 3 golden bananas in one match**:
   - #1 sits on top of the water tower in the north-east corner. Shoot it from the ground.
   - #2 is inside the "Bao Down" food truck in the north-west. Shoot it through the serving hatch.
   - #3 is sealed behind the out-of-order "DROP BEAR BREAKOUT" cabinet ("Gone bananas, back soon") in the arcade corner.
     Only a full-charge Thermal Rail shot, which penetrates cover, reaches it. Scope in and you'll see it glowing through the cabinet.
2. **Beat both arcade targets in one session**: Neon Cycles 250+ and Robo Invaders 1500+.
   - Hint: in Robo Invaders, shoot the SYNOD blimp three times in a row.
3. In the debug panel (`?debug=1`), use **BANANA GUN**.

## Files
- `index.html`, `css/style.css`
- `js/`:
  - `config.js`: all gameplay tunables, as the GDD specifies
  - `core.js`, `gfx.js`: renderer, post-processing, quality tiers and the auto scaler
  - `world.js`, `player.js`, `weapons.js`, `enemies.js`
  - `game.js`: waves, scoring and awards
  - `arcade.js`: the 2 mini-games
  - `ui.js`, `input.js`, `audio.js`, `fx.js`, `main.js`
- `manifest.webmanifest`, `sw.js`, `icons/`, `vendor/three/` (MIT, LICENSE included)
