"""File transport for the SDK when Python has no network access.
The agent's authorized curl tool submits each exact SDK request. This never changes the
dialogue skill, never uses a TTS endpoint, and keeps credentials in 0600 temporary files.
"""
from pathlib import Path
import json,time,os,httpx

class ToolTransport(httpx.BaseTransport):
    counter=max([int(p.stem) for p in Path('/private/tmp/battlecars-audio-api').glob('*') if p.stem.isdigit()]+[-1])+1
    def handle_request(self,request):
        folder=Path('/private/tmp/battlecars-audio-api');folder.mkdir(exist_ok=True,mode=0o700)
        number=ToolTransport.counter;ToolTransport.counter+=1
        name=f'{number:03d}'
        body=folder/(name+'.body');body.write_bytes(request.read())
        config=folder/(name+'.conf')
        def quote(s):return '"'+s.replace('\\','\\\\').replace('"','\\"')+'"'
        content=['url = '+quote(str(request.url)),'request = '+quote(request.method),'data-binary = '+quote('@'+str(body))]
        content+=['header = '+quote(k+': '+v) for k,v in request.headers.multi_items()]
        config.write_text('\n'.join(content)+'\n');os.chmod(config,0o600)
        (folder/'pending.json').write_text(json.dumps({'number':number,'path':request.url.path,'config':str(config),'output':str(folder/(name+'.response')),'status':str(folder/(name+'.status'))}))
        print('AUDIO_REQUEST_READY',name,request.url.path,flush=True)
        status=folder/(name+'.status');start=time.monotonic()
        while not status.exists() or not status.read_text().strip():
            if time.monotonic()-start>1800:raise TimeoutError('Authorized network tool did not complete the audio request.')
            time.sleep(.2)
        code=int(status.read_text().strip())
        if code<100:raise RuntimeError('The audio request could not reach ElevenLabs.')
        response=(folder/(name+'.response')).read_bytes()
        mime='audio/mpeg' if code==200 else 'application/json'
        return httpx.Response(code,content=response,headers={'content-type':mime},request=request)
