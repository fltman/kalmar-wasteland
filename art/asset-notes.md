# Asset provenance

The vehicles were authored with `tools/build-vehicles.py` in Blender and exported by the user using the installed Blender 5.2.2. `art/battlecars.blend` is editable. The first GLBs' number-plate and ram-spike orientations were corrected with `tools/fix-model-orientation.mjs`; the generator now includes the same correction for later exports.

The bitmaps below were generated with the built-in Imagegen tool. The original outputs were copied into the project, preserving the dust sprite's transparency.

## Menu artwork

Saved as `public/art/kalmar-wasteland.png`.

Prompt: cinematic post-apocalyptic armored muscle car on the cobblestone streets of Kalmar at golden dusk, with the pale baroque Kalmar Cathedral's four corner towers in the distance, historic pastel stucco buildings, steel ram bumper, riveted graphite armor, exposed V8 supercharger, roof-mounted twin machine guns, chunky off-road tires, dusty warm air, rust and oil. Front three-quarter street-level view; car on the right, dark negative space on the left for the HTML title. Warm orange sunlight, charcoal shadows, desaturated amber. Wide landscape. No people, brand logos, text or watermarks. Realistic game key art.

## Dust sprite

Saved as `public/art/dust-smoke.png`.

Prompt: one soft billowing pale warm grey / dusty ochre smoke puff facing the camera, centered, with wispy translucent edges fading smoothly to full transparency. Square composition; no ground, scene, outside shadows, sparks, flames or text. Actual transparent background. Brighter and denser in the center without an opaque hard ball; designed for tinting and overlapping in a particle renderer.

## Audio

Voice scripts are saved in `art/voice-*.json`. The prerecorded clips use `eleven_v4` through the user's [ElevenLabs skill](/Users/andersbj/Projekt/hooklinecoder/.claude/skills/elevenlabs-skill/SKILL.md) and its `generate_dialogue.py` function. The official [sound-effects skill](https://github.com/elevenlabs/skills/blob/main/sound-effects/SKILL.md) was read and copied to `art/elevenlabs-sound-effects-SKILL.md`; its SDK workflow generated the six effects with `eleven_text_to_sound_v2`.

The realtime model ID, reserved for future voice features, is `eleven_v4_turbo`, as listed in the [official model documentation](https://elevenlabs.io/docs/overview/models). There are no runtime AI calls or keys in this static game.

The [Suno skill](/Users/andersbj/.agents/skills/synced/258f730f-5e54-4529-810c-1d5f2ef25eec_27d6fb7f-2403-433c-8826-1d399e9d1c9b/suno-music/SKILL.md) was used for `suno-soundtrack.md`. The exact 300-character revised prompt was entered into the official Suno Chrome UI. After explicit user approval, Create generated two instrumental tracks with v6. The user downloaded the second variation; it was copied from Downloads to `public/audio/music.mp3`. Source: https://suno.com/song/2330906b-b7b2-433a-9f3e-da27a70de98b. The bundled track lasts 183.08 seconds and loops during gameplay.

## Wasteland revision

`public/art/wasteland-grunge.png` and `public/art/fire-plume.png` were generated with the built-in Imagegen tool. Prompts are recorded in `wasteland-image-prompts.md`. The grunge scan drives surface weathering on city materials and armor. Fire preserves generated transparency. Wind and fire ambience were copied read-only from the original Halloween game.

The user completed the salvage export in Blender 5.2.2 on 2026-10-04 at 22:21 local time. The current `.blend` and GLBs include welded plows, asymmetric plates, spikes, rear spares, chains and the packed Imagegen rust texture (`salvage_v2`).

The subsequent three-class silhouette pass lowers the Interceptor, opens the Rust Hound cockpit and adds a bunker cab, load deck and tandem axle to the War Rig. It is implemented on the Blender-derived geometry at load time in `src/vehicle-design.js`, and mirrored in `tools/build-vehicles.py`. The current `.blend` is still the user-exported v2 scene; the next Blender export stores `vehicle_design_v3` and skips the browser upgrade. No re-export is needed to try the upgraded cars.

Three additional weapon SFX prompts are prepared in `tools/generate-audio.py`. The agent-session API request failed at DNS resolution before generation; no new weapon audio was produced. Rockets temporarily reuse the existing ElevenLabs nitro effect, the flamethrower layers the nitro and fire recordings as trigger-controlled loops, and mine deployment reuses the pickup effect. Existing v4 dialogue, original effects, ambience and Suno music are unchanged.
