# Kalmar Wasteland deployment

The game is static. Apache/PHP/MySQL does not run the game simulation. The small
Ubuntu machine at **70.34.197.55** runs only `server/index.mjs`: room membership,
message routing, sender IDs, heartbeat, limits, and the latest pose packet for a
late join. It imports no city, vehicle, physics, combat or score modules.

Each browser owns its car physics, armor, weapons, damage and score. This arena
is intended for friends; a modified browser can cheat. Server authority would be
needed for competitive anti-cheat. Scores are session-local, and supply crates
are local to each player. There is no global pause: opening the map or pause menu
leaves that driver's car vulnerable. Respawn takes five seconds and gives three
seconds of protection.

## Static site on bjarby.com

Run `npm run build`. Upload **the contents** of `dist/` to the Apache directory
served as `https://bjarby.com/kalmar-wasteland/`. Upload `index.html` **last**.
Hashed `assets/` files can sit next to the old ones, so the running version keeps
working until the new page goes live. If the new page arrives before `tiles/`,
visitors meanwhile see "City tile index is missing". Keep the trailing slash, or let
Apache redirect to it. The build uses relative URLs. PHP and MySQL are optional.
The build includes `.htaccess` and configures the production arena URL.

The generated `arena-config.json` contains:

```json
{"url":"wss://arena.bjarby.com/ws"}
```

To publish against another secure relay, run `KALMAR_ARENA_URL=wss://your-host/ws npm run build`.
The source default is an empty URL, which connects to `arena/ws` beneath the game
directory. During development Vite attaches the relay to its existing port 5220
at `/arena/ws`; it needs no second listening process.

## Relay on the Ubuntu machine

**Installed 2026-10-05 over SSH (root, key `id_ed25519`).** The server already
ran **Caddy 2.11** on 80/443 for `mobil.bjarby.com`, with no nginx, and Node
v24.21.0 from `/opt/node-v24.21.0-linux-x64` via `/usr/local/bin/node`, with no
npm in PATH. `install-relay.sh` was therefore **not** run; it targets nginx and
would stop at the 80/443 check. The equivalent steps were done by hand:

- System user `kalmar-arena`; `/opt/kalmar-arena` holds `index.mjs`,
  `package.json`, `package-lock.json` and `node_modules/ws` 8.22.0, installed
  with `npm ci --omit=dev --ignore-scripts` using the existing Node's npm.
  No apt packages were installed and the global Node was not changed.
- `/etc/systemd/system/kalmar-arena.service` from `kalmar-arena.service`, with
  `ExecStart=/usr/local/bin/node`. Enabled and running on 127.0.0.1:5221.
- The `deploy/caddy-arena.caddy` block appended to `/etc/caddy/Caddyfile`.
  The backup is `/etc/caddy/Caddyfile.backup-20261005-041712`. It was validated
  as the `caddy` user, then applied with `systemctl reload caddy`. Caddy obtained the Let's Encrypt
  certificate (valid until 2027-01-03) and renews it. `/ws` is proxied; every
  other path, including `/health`, returns 404 publicly.
- ufw already allowed 22/80/443. Port 5221 is loopback only. The presenter
  service and the `mobil.bjarby.com` site were not touched.
- Install sources remain in `/root/kalmar-arena-install/`.

To update the relay later: copy a new `server/index.mjs` to `/opt/kalmar-arena/`
(owner `kalmar-arena`) and run `systemctl restart kalmar-arena`.

The rest of this section describes the original nginx-based installer for
another host.

`deploy/kalmar-arena-install.tgz` contains only the relay and deployment files.
Extract it in a temporary directory on the Ubuntu server, then run
`bash deploy/install-relay.sh` as root. It checks the relay, adds a separate nginx
vhost and requests its TLS certificate. It does not upgrade an existing Node
installation, replace other vhosts, or restart the presenter service. If another
web server occupies 80/443 without a system nginx installation, it stops for review.
The individual installation steps are described below.

Use an existing Node installation (the service expects `/usr/bin/node`; adjust
it if Node is elsewhere). Copy only `server/index.mjs`, `server/package.json`
and `server/package-lock.json` to `/opt/kalmar-arena/`. Run `npm ci --omit=dev`
there. Neither the city nor the game assets belong on this machine.

Create a system user `kalmar-arena` without a login shell, make it the owner of
that directory, and install `deploy/kalmar-arena.service` in
`/etc/systemd/system/`. Then enable and start that service. Verify locally with
`curl http://127.0.0.1:5221/health`; the response must say `"mode":"relay"`.

Point the DNS name `arena.bjarby.com` to **70.34.197.55**. Add the separate nginx
vhost from `deploy/nginx-arena.conf`, run `nginx -t`, reload nginx, and obtain a
TLS certificate for that name. The game is HTTPS, so its WebSocket endpoint must
be **wss**, not ws. Preserve any existing presenter-relay service and site.
Only HTTPS/HTTP need public access; keep the Node port on loopback.

Origin access is set in the service to `https://bjarby.com` and
`https://www.bjarby.com`. Add a staging origin if one is used. The relay caps a
room at eight drivers, packet size at 4 KiB and each connection at 150 messages
per second. Poses publish at 20 Hz; continuous fire damage is batched in clients.
No promises about production capacity have been measured on the external host.

## Verification

1. Open the game in two browsers, choose ONLINE ARENA, and join the same room.
2. Check positions, all four weapons, damage, five-second respawn and frag count.
3. Open pause/map on one browser: the other must continue playing.
4. Check portrait and landscape touch controls. Steering/gas use the left thumb;
   the right thumb can fire, boost or drift independently.
5. In development, open `/tools/arena-relay-check.html` for real WebSocket checks
   of sender IDs, room/target isolation, late join, capacity and disconnects.

References: [ws documentation](https://github.com/websockets/ws),
[Apache WebSocket proxy documentation](https://httpd.apache.org/docs/2.4/mod/mod_proxy_wstunnel.html).

## Publication status (2026-10-05)

- DNS: `arena.bjarby.com → 70.34.197.55` (A, TTL 600) was saved at one.com and is
  publicly visible via 1.1.1.1 and 8.8.8.8.
- Relay: installed and running behind Caddy, as described above. The public
  endpoint is `wss://arena.bjarby.com/ws`, with a Let's Encrypt certificate.
- Web build: the user copied it to `https://bjarby.com/kalmar-wasteland/`. All
  417 files answered 200; compressed text files matched the local hashes.
  `arena-config.json` points to the relay.
- Verified on the public endpoint from Node `ws` clients: a foreign Origin gets
  403; welcome, roster, late-join pose, sender-ID rewriting, targeted hits and
  disconnect all work. RTT was about 42 ms from the development Mac.
- Verified with the published page in Chrome and in headless Chromium (Metal),
  using a scripted relay peer as opponent. Verified: joining via arena-config,
  the remote car rendered, poses at about 15–17 Hz, guns/rocket/flame hits
  delivered with weapon and origin, mine synced in state, relayed damage, death
  with killer ID, respawn after 5.05 s, frag credit, local pause while the peer
  keeps receiving poses, all three radio tracks and 22 MP3 responses with no
  errors.
- **Bug found and fixed locally:** in the published build
  (`assets/index-BfspCWa0.js`), a flamethrower burst disconnected the shooter.
  Flame, fuel fire and afterburn alternated each frame and flushed each other's
  batch, giving 138+ hit packets/s against the relay's 150/s limit.
  `src/arena-client.js` now batches per target and weapon, at no more than 60 hit
  packets/s. A new test covers this, and 58/58 tests pass. The rebuilt
  `index.html` + `assets/index-CP_-c-YA.js` were tested against the live relay,
  with a peak of 27 hit packets/s and no disconnect. **These two files must be
  uploaded** (the JS first, then `index.html`); every other file is unchanged.
- Not verified by Claude: two human players on separate devices, real mobile
  touch (two fingers, both orientations), and listening to the collision
  sounds.

### Performance build (2026-10-05, `assets/index-DVtOo2sj.js` + `assets/bvh.worker-BECWBQ41.js`)

All changes are in the browser. The relay is unchanged.

- Shadow map is drawn once per frame (`shadowMap.autoUpdate=false`). Before,
  the SSAO pass's second scene render redrew it: −23 % draw calls, −28 % triangles.
- Physics substeps now add up to the frame time (≤1/90 s each). Fixed 1/90 s
  steps moved the car alternately 0.30/0.60 m per 60 Hz frame.
- City tile BVHs are built in workers (`src/bvh.worker.js`), with BVH bounds
  reused. Ground and solid rays test only meshes whose bounds they reach. A
  600 m drive went from max 217 ms / 18 frames >33 ms to max 33 ms / 1 frame
  (4× CPU throttle: max 883 → 167 ms).
- Remote cars use a snapshot buffer on the sender's clock with an adaptive
  delay (80–250 ms). Before, they advanced only when a packet arrived: 64 % of
  frames stood still. Poses now publish at 20 Hz instead of 15.
- `renderer.debug.checkShaderErrors` is only on with `?debug`. Resolution scales
  down to 0.6× when most frames miss 60 Hz (`src/resolution.js`).
- Verified on the published site: identical file hashes; remote car per-frame
  movement CV 0.035 with 0–80 ms uplink jitter; 63/63 tests.

### Draw-call build (2026-10-05, `assets/index-ClCYucUR.js`)

Upload `assets/index-ClCYucUR.js` first, then `index.html`. The worker and every
other file are unchanged.

- **Wheels:** each wheel exported 35 parts in 3 materials. They are now merged per
  material under the steering/spinning pivot. A car costs 12–18 wheel draws
  instead of 140–210 per pass. Street War with 4 raiders: render CPU 7.9 →
  4.4 ms (M5). With 4× CPU throttle, median frame 33 → 17 ms and 34 → 40 fps.
- Static city meshes skip their per-pass matrix update. Meshopt tile decoding
  runs in workers. Positions for the BVH worker are read straight from the
  quantised buffers. 600 m drive, 4× CPU: max frame 183 → 67 ms, none >100 ms.
- **City batching (`src/city-batches.js`) is built but opt-in via `?batch`.**
  One BatchedMesh per material template (≈95 near spawn; the 1500 materials
  differ mostly by tint) with per-instance colour and culling. Pixel-identical,
  draw calls 1431 → 462 in Street War, steady render CPU −25 %, about +50 MB JS
  heap. It is not on by default because inserting streamed tiles still costs
  more than it saves while driving into new areas (1×: up to 83 ms frames).
  Next step: pack and rebase indices in the worker, and write straight into the
  batch buffers instead of three's per-element `setGeometryAt` and regrowth.
- Tests: 68/68, including real-tile ray equivalence, batch slot reuse,
  growth/compaction, facade detach, and position-copy equivalence.

### Distance LOD build (2026-10-05, `assets/index-CrwMOKdI.js` + `assets/bvh.worker-Crt1Pf6Z.js`)

Upload both new `assets/` files first, then `index.html`. No new tile files are
needed: the distant versions are computed in the BVH workers from the tiles
already downloaded.

- Each streamed tile has three levels, picked every 0.2 s by the distance from
  the **camera** to the tile, with 6 m hysteresis. FogExp2(.025) hides 97 % at
  75 m and all of it beyond ~110 m:
  - < 75 m: full meshes, as before.
  - 75–125 m: meshopt `simplifySloppy` at ~22 % of the triangles (max deviation
    ~0.5 % of the mesh size). Same vertex buffers and materials, still casts
    shadows, skipped in the SSAO normal pass.
  - \> 125 m: ~5 % of the triangles merged into one fog-coloured silhouette
    mesh per tile (one draw call).
- Collisions, raycasts, collision audio and facade damage keep using the full
  meshes. Switches: `?nolod` turns LOD off. LOD is off with the experimental
  `?batch`.
- Measured with the camera at the same spots: triangles −43 % (spawn), −40 %
  (Kvarnholmen), −51 % (Ängöleden); draw calls −14 %. Images differ in under
  0.02 % of pixels by more than 24 levels. Streaming is no worse (600 m drive:
  0 frames >33 ms; 4× CPU: max 50 ms). Software rasterizer: frame 783 → 667 ms.
- The `base` tile (38 large objects such as the cemetery, rail and castle,
  1.1 M triangles near spawn) is not split by zone yet.
- Tests: 69/69. The new `test/lod.test.mjs` checks the levels on a real tile.

### Driver's-seat view (2026-10-05, `assets/index-tQ8gkRNx.js`)

Upload `assets/index-tQ8gkRNx.js` (and `assets/bvh.worker-Crt1Pf6Z.js` if the
LOD build is not up yet), then `index.html`.

- C, or the new VIEW button (also on touch), cycles chase → driver's seat →
  bonnet. The seat is in `src/cockpit.js` (`CABINS`), left-hand drive, just
  under the roof. The camera follows heading and pitch, softens roll, glances
  into turns, and Q looks back. The lens is wider (+8°) on landscape screens;
  portrait phones get a narrower lens and a slightly raised gaze.
- The Interceptor and War Rig cabins are closed armour shells under opaque
  smoked glass. Inside, the player's own car hides the glass, and a shader
  discards its shell inside the window band (car-space box). The bonnet, roof
  and hood guns stay. Only the player's car gets these cloned materials, so
  rivals of the same model are untouched, and shadows still come from the
  whole car. The player car leaves the SSAO pass while you sit in it.
- Interior, built on the first switch (`createCockpit`): an extruded, riveted
  dashboard with a brass nameplate and tape repairs; a binnacle with three
  backlit dials (KM/H, N2O, weapon HEAT) behind chrome bezels; four warning
  lamps (N2O while boosting, HEAT blinking when overheated, ARMR blinking
  under 30 % armour, LOCK with a rocket lock). Each car has its own wheel: a
  drilled three-spoke on the Interceptor, a welded chain on the Rust Hound, a
  four-spoke with a spinner knob on the War Rig. A toggle-switch bank, a radio
  whose display scrolls the current track, a red N2O button whose guard flips
  up while boosting, and a gear lever in D/N/R. A welded roll cage, riveted
  door cards with a pull strap, wiring under the dash, a folded sun visor, a
  cracked windscreen, and a rear-view mirror with a skull on a damped spring
  that swings when braking and cornering. Worn parts use the shared grime and
  rust weathering. About 36 draw calls, only while inside: fixed parts are
  merged per material and the dials share one texture.
- Tests: 71/71. `test/cockpit.test.mjs` checks that each seat is inside its
  cabin with a clear view ahead, that only the player car is cut, and that the
  wheel follows the steering.
