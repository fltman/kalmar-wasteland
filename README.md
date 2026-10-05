# Kalmar Wasteland

A playable Three.js battle-car game in the existing Kalmar city model. Streets are open for driving across Kvarnholmen and the modelled mainland, with no race circuit or invisible track rails.

```sh
npm install
npm run dev
# http://localhost:5220
```

Choose a low Interceptor, an open-cage Rust Hound or a six-wheel War Rig in the live 3D garage. The current Blender exports are upgraded at load time, and the generator includes the same three silhouettes. **Street War** has three waves of road-following raiders, forward-firing twin guns, ramming, armor damage, overheating, repair crates and salvage. **Free Roam** opens the same city without enemies. **Online Arena** connects up to eight drivers through a lightweight WebSocket relay; each browser runs its own simulation. See `deploy/README.md` for LAMP hosting and relay installation. Set a waypoint by clicking the tactical map. Sand-colored dusk fog limits visibility to roughly 60–80 metres. Weathered facades, curb rubble, welded salvage armor, headlights, bloom, contact shadows and blowing sand give the city a ruined appearance. Gunfire and heavy impacts leave persistent cracked/scorched marks, chips and small facade breaches; heavily damaged sites can ignite. Vehicle fronts deform, critical vehicles smoke and wrecks burn. Twin moving luminous tracers and brief muzzle flashes accompany the machine guns. Larger finned rockets lock onto a visible enemy ahead, lead its movement and turn toward it, with hot exhaust, luminous trails, smoke and flash fireballs. Walls break the lock and still stop rockets. The flamethrower emits a continuous turbulent 32-metre jet from the turret, with a hot core, orange billows, sparks, fuel consumption and five seconds of afterburn and three seconds of harmful burning fuel on the road; walls block both the jet and damage. Its layered ElevenLabs burner/crackle loops follow the trigger instead of playing repeated one-shots. Rockets, the flamethrower and arming rear mines join the machine guns; salvage refills their ammunition. Direction markers show the three closest living enemies and nearest active repair crate. Vehicle mass, closing speed and impact energy determine ramming damage and momentum transfer. Light street furniture can be knocked loose and tumbles with gravity and ground friction. Light wall bumps dent bodywork; armor loss is based on hard motion into the wall, and scraping retains motion along it. Empty streets between authored city-object bounds remain drivable when the base ground is loaded. Four or six independent sampled wheel contacts drive damped suspension, pitch under braking/acceleration and outward roll in corners. The chassis rises gradually over curbs instead of snapping to the ground height; the War Rig’s rear tandem follows its own contacts. Building damage is localized surface destruction, not full structural collapse.

| Control | Action |
|---|---|
| WASD / arrows | Drive; S brakes, then reverses |
| F / left click | Fire forward; light aim assist |
| Shift | Nitro; recharges when released |
| Space | Handbrake / drift |
| C / VIEW button | Chase → driver's seat → bonnet camera |
| Q | Look behind |
| Tab / M | Tactical map; click for a waypoint |
| R / RESPAWN | Recover on a clear, street-aligned position without losing armor |
| 1 / 2 / 3 / 4 | Guns / rockets / flamethrower / rear mines |
| E | Cycle weapons |
| Esc | Pause |

Holding the accelerator or reverse while pinned shows an unstuck prompt and recovers automatically after six seconds. Manual respawn is also available on the pause screen. Recovery preserves the battle, resets all movement and gives three seconds of impact protection.

Touch controls appear on touch devices; `?touch=1` forces them on desktop. A captured left-thumb joystick drives, reverses and steers while a separate right-thumb button holds fire; boost and drift remain independent. Armor, fuel/ammunition and weapons form one compact top row. The garage and pause menus scroll so every control stays reachable in portrait and short landscape views. Speed uses a fixed three-digit column. LOW detail reduces pixel density and disables shadows, bloom and ambient occlusion. Transparent headlights, flame cards and decals are excluded from the occlusion normal pass. Touch devices also use the small city material library and a shorter streaming radius.

## Assets

- `art/battlecars.blend`: editable Blender source, with the three cars and a studio setup.
- `tools/build-vehicles.py`: reproducible Blender modeling/export script. `npm run models` uses `/Applications/Blender.app` and exports `public/models/*.glb` plus a studio preview. It does not touch the city source.
- `public/tiles/`: a self-contained copy of the Halloween project's streamed city export (362 tiles, around 867 MB). The browser only loads nearby tiles.
- `public/map.json`: 679 streets/paths and 692 building footprints, including mainland road continuations.
- `public/art/`: Imagegen menu artwork, tileable rust/soot texture, transparent dust and fire sprites.
- `public/audio/`: six ElevenLabs v4 dialogue clips, fifteen generated ElevenLabs sound effects (including distinct light/heavy metal, concrete, wood, glass and scraping), and reused wind/fire ambience from the Halloween project. Credentials are never sent to the browser.
- `public/audio/music.json`: a bundled Suno v6 playlist: **Sandstorm Pursuit**, **Iron Tide** and **Dusk Convoy**. All were generated through the official Chrome UI. Their 300-character prompts and source links are recorded in `art/suno-*.md` and the manifest. The radio advances at track end; previous/next and local music import are on the pause screen.
- `public/art/fire-atlas-v2.png`: transparent eight-frame fire atlas generated with the built-in imagegen tool. `art/fire-atlas-v2.md` records the prompt. Independent animated plumes stay upright on the ground and fade with their harmful fuel patch.
- `server/index.mjs`: pure room relay; no server simulation or map assets. `server/package.json` has only the WebSocket dependency. Deploy configuration is in `deploy/`.


The city was imported read-only from `/Volumes/work2/Projekt/kalmar-kvarnholmen-web`, and its map data was read from `/Users/andersbj/Projekt/kalmar-kvarnholmen`. `npm run import:city` refreshes the copied assets. It accepts replacement web and source paths as two command-line arguments.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. The imported model is the existing web export snapshot, rather than a fresh export of the latest 1.1 GB city `.blend`.

## Build and checks

```sh
npm test          # real model loading, vehicle dynamics, collisions, routing, combat and waves
npm run build    # deployable static files in dist/
npm run preview  # serve the production build locally
```

This remains an arcade prototype. Mass/energy/impulse collisions, detached-prop motion and damped suspension are simulated, but it does not yet have a full rigid-body chassis, tire model or structural building collapse. The graphics are being improved; they are not AAA production assets. The city and Blender models work locally without external services at runtime. The Suno soundtrack is bundled; custom music import stays local. Realtime voice is not part of this version; its reserved model is `eleven_v4_turbo`.

## Audio regeneration

`python3 tools/generate-audio.py` uses the installed ElevenLabs dialogue skill's generation function with `eleven_v4`, and the ElevenLabs sound-effects SDK with `eleven_text_to_sound_v2`. It reuses existing clips. It reads a locally configured key or the existing local project environment files without printing the key.

In a restricted agent session, the optional file transport keeps the SDK/skill workflow intact while authorized `curl` requests carry the network calls. Temporary credential files are removed after generation. The normal Terminal workflow does not need this transport.

The user completed the textured `salvage_v2` Blender export on 2026-10-04. The new vehicle silhouette pass works immediately in the browser; the generator writes `vehicle_design_v3` on the next export to avoid applying it twice. Use a normal Terminal for Blender export if the agent sandbox cannot access Metal. `?debug=1` exposes facade-impact, street-prop crash, five-second driving and eight-second weapon demonstrations, plus a side camera for inspecting effects. The rocket launch, mine dispenser and sustained flamethrower now have separate ElevenLabs recordings generated through Chrome, alongside the six material collision/scrape recordings. Native API DNS was unavailable in this session; the official browser UI completed these assets.

Development review pages: `/tools/mobile-preview.html`, `/tools/audio-preview.html` and `/tools/arena-relay-check.html`. The relay checks use real WebSocket clients to verify sender IDs, late joins, targeted delivery, room isolation, the eight-player limit and disconnects. AI recovery tests cover narrow routes, authored building interiors and cars that shuffle without making progress. External publishing still needs SSH access and a working secure WebSocket hostname.
