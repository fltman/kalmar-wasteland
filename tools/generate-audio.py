"""Generate prerendered v4 dialogue via the user's ElevenLabs skill and SFX via ElevenLabs.
Credentials stay on this machine. Existing outputs are reused. No browser-side API keys.
"""
import os, sys, json, subprocess, importlib.util
from pathlib import Path
from dotenv import dotenv_values

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/audio'
OUT.mkdir(parents=True,exist_ok=True)
SCRIPT=Path('/Users/andersbj/Projekt/hooklinecoder/.claude/skills/elevenlabs-skill/scripts/generate_dialogue.py')
env=os.environ.copy()
if not env.get('ELEVENLABS_API_KEY'):
    for path in [Path('/Users/andersbj/Projekt/aipresenter/.env'),Path('/Users/andersbj/Projekt/hooklinecoder/.env')]:
        if path.exists():
            key=dotenv_values(path).get('ELEVENLABS_API_KEY')
            if key:env['ELEVENLABS_API_KEY']=key;break
if not env.get('ELEVENLABS_API_KEY'):sys.exit('ElevenLabs key is not configured locally.')
voice=os.getenv('BATTLECARS_VOICE_ID','JBFqnCBsd6RMkjVDRZzb')
os.environ['ELEVENLABS_API_KEY']=env['ELEVENLABS_API_KEY']
client_options={}
if os.getenv('BATTLECARS_AUDIO_TRANSPORT')=='files':
    import httpx
    from audio_transport import ToolTransport
    client_options['httpx_client']=httpx.Client(transport=ToolTransport(),timeout=300)
lines={
 'intro':'[gravelly] The streets of Kalmar used to belong to everyone. [pause] Now they belong to whoever makes it home. Stay moving, watch your armor, and bring back the scrap.',
 'wave':'[urgent] Raider engines on the horizon. They are coming through the streets. Keep your gun hot and your escape route open.',
 'critical':'[urgent] Your armor is breaking up. Find a repair crate, or get out of their line of fire. You still have a way out.',
 'repair':'[relieved] Fresh steel, fresh chance. Your armor is repaired. Now get back out there.',
 'win':'[excited] You made it. The last raider is burning, and Kalmar is yours for one more night. Bring that engine home.',
 'wrecked':'[somber] The engine is quiet. But the road is still there. Build it again, and make them remember you.'
}
selected_effects=set(filter(None,os.getenv('BATTLECARS_SFX_ONLY','').split(',')))
for name,text in lines.items():
    if selected_effects:continue
    output=OUT/f'voice-{name}.mp3'
    if output.exists():continue
    inp=ROOT/'art'/f'voice-{name}.json';inp.write_text(json.dumps([{'text':text,'voice_id':voice}],indent=2))
    spec=importlib.util.spec_from_file_location('elevenlabs_dialogue_skill',SCRIPT)
    skill=importlib.util.module_from_spec(spec);spec.loader.exec_module(skill)
    if client_options:
        from elevenlabs import ElevenLabs
        skill.get_client=lambda:ElevenLabs(api_key=env['ELEVENLABS_API_KEY'],**client_options)
    sys.argv=[str(SCRIPT),'--input',str(inp),'--output',str(output),'--model','eleven_v4']
    skill.main()

from elevenlabs import ElevenLabs
client=ElevenLabs(api_key=env['ELEVENLABS_API_KEY'],**client_options)
effects={
 'engine':('Close recorded supercharged V8 engine idling steadily, gravelly low mechanical rumble, constant speed, seamless looping engine texture, no music, no voices.',5,True),
 'gun':('A short tight twin machine gun burst, four crunchy metallic shots, mechanical cycling, dry outdoor recording, no music, no voices.',1,False),
 'explosion':('One cinematic car explosion: sharp metal cracking, deep bass blast and brief falling debris, isolated effect, no music, no voices.',3,False),
 'impact':('A single heavy steel car ram collision, crunching metal and brief shattered glass, dry close recorded impact, no music, no voices.',1.5,False),
 'impact-metal-light':('One small vehicle bumper dent: short dry sheet steel clunk and a loose bolt rattle, low intensity parking collision, instant attack, isolated close game sound, no music or speech.',.7,False),
 'impact-metal-heavy':('One violent armored truck collision: immediate deep bass thud with tearing buckling steel, chassis groan and falling metal fragments, powerful compact single impact, dry close recording, no music or speech.',1.3,False),
 'impact-concrete':('One heavy steel car crashing into a concrete wall: instant blunt deep thump, sharp stone crack and falling crunchy masonry grit, short heavy mechanical impact, isolated dry game sound, no music or speech.',1.2,False),
 'impact-wood':('One car smashing a wooden bench: immediate dry timber snap, splintering planks and small pieces rattling onto cobblestones, short isolated close impact, no music or speech.',.9,False),
 'impact-glass':('One immediate shattering glass impact: crisp brittle snap followed by a short shower of tinkling glass fragments onto stone, isolated dry close recorded single sound, no music or speech.',.8,False),
 'scrape-metal':('Continuous abrasive steel bodywork scraping along coarse concrete, gritty midrange grinding, occasional metallic squeaks and loose panel vibration, steady seamless loop, no impact blast, no music or speech.',1.8,True),
 'nitro':('A short powerful pressurized nitrous oxide boost: fast air hiss into roaring jet exhaust whoosh, isolated vehicle game effect, no music or voices.',2,False),
 'pickup':('A short satisfying scavenged metal pickup chime, three bright resonant metal notes over a soft mechanical click, no voice, no music.',1,False),
 'rocket':('A single vehicle mounted rocket launcher firing, forceful metallic thump followed immediately by a hot rocket motor hiss and short doppler whoosh, dry isolated sound, no music or voices.',1.6,False),
 'mine':('A heavy magnetic land mine dropping onto cobblestones with a metallic clack, followed by two quiet electronic arming chirps, close isolated game sound, no music or voices.',1.2,False),
 'flame':('A vehicle flamethrower jet, fierce pressurized roaring gas with a crackling hot flame, constant even intensity for the whole clip, no start or end transient, no music or voices.',1.6,True)
}
for name,(prompt,duration,loop) in effects.items():
    if selected_effects and name not in selected_effects:continue
    path=OUT/f'sfx-{name}.mp3'
    if path.exists():continue
    print('Generating sound effect:',name,flush=True)
    data=client.text_to_sound_effects.convert(text=prompt,duration_seconds=duration,prompt_influence=.5,model_id='eleven_text_to_sound_v2',loop=loop)
    path.write_bytes(b''.join(data))
reused={'wind':'Kalmar Halloween / wind_loop.mp3','fire':'Kalmar Halloween / fire_far.mp3'}
(OUT/'generation.json').write_text(json.dumps({'prerendered_voice_model':'eleven_v4','realtime_voice_model':'eleven_v4_turbo','sfx_model':'eleven_text_to_sound_v2','voice_skill':str(SCRIPT),'voices':[name for name in lines if (OUT/f'voice-{name}.mp3').exists()],'effects':[name for name in effects if (OUT/f'sfx-{name}.mp3').exists()]+list(reused),'reused_effects':reused},indent=2))
print('ELEVENLABS_AUDIO_COMPLETE')
