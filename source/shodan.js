(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = Object.fromEntries(['message','count','paste','speak','stop','notice','discordAppId','discordAsset','discordConnect','discordDisconnect','discordStatus','inspectSource','iceDialog','iceClose','auto','smooth','blend','blendValue','phase','phaseValue','mini','idle','idleHelp','outputText','sourceInfo','avatar','avatarStatus','wave','meterStatus','log','fullscreen','cyberspace','engineStatus'].map(id => [id,$(id)]));
  let config={defaults:{autoSpeak:false,autoSpeakDelayMs:1000,smoothVoice:true,characterTilt:-50,phaseDepth:-50,autoClear:true,idleEnabled:true,idleDelayMs:60000,idleRepeatMs:60000,externalQuoteChance:.2},limits:{maxCharacters:5000,chunkCharacters:110}};
  let generation=0,autoTimer=null,meterTimer=null,noiseTimer=null,active=false,audioCtx=null,noiseBuffer=null,currentSource=null,analyser=null,controller=null,piperReady=false,glitchIntensity=35,glitchCues=[],pitchModulePromise=null,finishTimer=null,cleanupGraph=null;
  let localPiperWorker=null,piperRequestId=0;const piperRequests=new Map();let phaseSettingTouched=false;
  const soundNodes=new Set();
  let idleArmed=false,idlePlaying=false,idleTimer=null,idleSettingTouched=false,smoothSettingTouched=false,blendTouched=false,lastMove=0,miniWindow=null,miniInput=null,miniStatus=null,presenceConnected=false,presencePoll=null;
  let allQuotes=Array.isArray(window.SHODAN_MONOLOGUES)?window.SHODAN_MONOLOGUES:[],userDeck=[],gameDeck=[],lastQuote='';
  for(let i=0;i<44;i++)el.wave.appendChild(document.createElement('i'));
  function status(text){el.notice.textContent=text;if(miniStatus)miniStatus.textContent=text;}
  function ensureAmyWorker(){
    if(localPiperWorker)return localPiperWorker;
    const worker=new Worker(new URL('./tts-worker.js',import.meta.url),{type:'module'});localPiperWorker=worker;
    worker.onmessage=event=>{
      const data=event.data||{},job=piperRequests.get(data.requestId);
      if(data.type==='progress'){
        const p=data.progress||{},pct=p.total?Math.min(100,Math.round(100*p.loaded/p.total)):0;
        if(job)status(`Loading bundled Mimic 3 Amy voice… ${pct}%`);return;
      }
      if(data.type==='status'){if(job)status(data.message);return;}
      if(!job)return;
      piperRequests.delete(data.requestId);
      if(data.type==='result')job.resolve(data.audio);
      else if(data.type==='error')job.reject(new Error(data.message||'Piper Amy synthesis failed.'));
    };
    worker.onerror=event=>{
      const error=new Error(event.message||'Local Piper worker failed.');
      for(const job of piperRequests.values())job.reject(error);piperRequests.clear();
      try{worker.terminate();}catch(e){}if(localPiperWorker===worker)localPiperWorker=null;
    };
    return worker;
  }
  function requestAmy(text){
    return new Promise((resolve,reject)=>{
      const id=++piperRequestId;piperRequests.set(id,{resolve,reject});
      try{ensureAmyWorker().postMessage({type:'speak',requestId:id,text,baseUrl:new URL(import.meta.env.BASE_URL,document.baseURI).href});}
      catch(error){piperRequests.delete(id);reject(error);}
    });
  }
  function terminateAmyWorker(){
    if(localPiperWorker){try{localPiperWorker.terminate();}catch(e){}localPiperWorker=null;}
    const error=new DOMException('Transmission cancelled.','AbortError');
    for(const job of piperRequests.values())job.reject(error);piperRequests.clear();
  }
  function log(text,type='SYSTEM'){const row=document.createElement('div'),prefix=document.createElement('span');prefix.className='dim';prefix.textContent=`[${type}] `;row.append(prefix,document.createTextNode(text));el.log.append(row);while(el.log.children.length>5)el.log.firstElementChild.remove();}
  function updateCount(){el.count.textContent=`${el.message.value.length} / ${el.message.maxLength}`;}
  function speechLevel(){if(!analyser)return 0;const samples=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(samples);let sum=0;for(const v of samples)sum+=(v-128)*(v-128);return Math.min(1,Math.sqrt(sum/samples.length)/18);}
  function setActive(on){active=on;notifyPresence(on?(idlePlaying?'idle_monologue':el.sourceInfo.textContent==='SIMULATION / BLACK ICE'?'simulation':'speaking'):'standby');el.avatar.classList.toggle('speaking',on);el.wave.classList.toggle('active',on);el.avatarStatus.textContent=on?'●  TRANSMITTING':'●  STANDBY';el.meterStatus.textContent=on?'TRANSMITTING':'STANDBY';el.stop.disabled=!on;el.speak.textContent=on?'▶   RESTART TRANSMISSION':'▶   SYNTHESIZE VOICE';clearInterval(meterTimer);if(on){meterTimer=setInterval(()=>{const level=speechLevel();for(const bar of el.wave.children)bar.style.height=`${3+Math.random()*level*55}px`;},100);}else for(const bar of el.wave.children)bar.style.height='3px';}
  // Rich Presence publishes only fixed activity labels and elapsed time; no entered text.
  async function presenceRequest(action,payload){
    const r=await fetch(`api/presence/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await r.json();if(!r.ok)throw Error(data.error||data.message||'Discord connection failed.');return data;
  }
  function notifyPresence(state){if(presenceConnected)presenceRequest('activity',{state}).catch(()=>{});}
  function applyPresenceStatus(data){presenceConnected=!!data.connected;el.discordStatus.textContent=data.message||'Not connected.';el.discordConnect.disabled=presenceConnected;el.discordDisconnect.disabled=!presenceConnected;if(!presenceConnected){clearInterval(presencePoll);presencePoll=null;}}
  async function refreshPresence(){try{const r=await fetch('api/presence/status',{cache:'no-store'});if(!r.ok)throw Error();applyPresenceStatus(await r.json());}catch(e){applyPresenceStatus({connected:false,message:'Start the local server to use Discord Rich Presence.'});}}
  el.discordConnect.addEventListener('click',async()=>{
    const applicationId=el.discordAppId.value.trim(),assetKey=el.discordAsset.value.trim();
    if(!/^\d{15,21}$/.test(applicationId)){el.discordStatus.textContent='Enter your numeric Discord Application ID (15–21 digits).';return;}
    if(assetKey&&!/^[a-zA-Z0-9_-]{1,64}$/.test(assetKey)){el.discordStatus.textContent='Image key: letters, numbers, hyphens or underscores only.';return;}
    el.discordConnect.disabled=true;el.discordStatus.textContent='Connecting to Discord desktop…';
    try{const data=await presenceRequest('connect',{applicationId,assetKey});applyPresenceStatus(data);notifyPresence(active?(idlePlaying?'idle_monologue':el.sourceInfo.textContent==='SIMULATION / BLACK ICE'?'simulation':'speaking'):'standby');clearInterval(presencePoll);presencePoll=setInterval(refreshPresence,20000);}
    catch(e){applyPresenceStatus({connected:false,message:e.message||'Could not connect to Discord desktop.'});}
  });
  el.discordDisconnect.addEventListener('click',async()=>{
    el.discordDisconnect.disabled=true;try{applyPresenceStatus(await presenceRequest('disconnect',{}));}catch(e){applyPresenceStatus({connected:false,message:'Could not disconnect; stop the local server to clear presence.'});}
  });
  window.addEventListener('pagehide',()=>{if(presenceConnected&&navigator.sendBeacon){navigator.sendBeacon('api/presence/disconnect',new Blob(['{}'],{type:'application/json'}));}});
  function initAudio(){try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return null;if(!audioCtx){audioCtx=new Audio();noiseBuffer=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*.16),audioCtx.sampleRate);const d=noiseBuffer.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});return audioCtx;}catch(e){return null;}}
  // SoundTouch adjusts pitch independently of the source tempo on supported browsers.
  function ensurePitchModule(context){
    if(!context.audioWorklet||!window.AudioWorkletNode)return Promise.resolve(false);
    if(!pitchModulePromise)pitchModulePromise=context.audioWorklet.addModule('soundtouch-processor.js').then(()=>true).catch(()=>false);
    return pitchModulePromise;
  }
  // Scheduled bursts share the AudioContext clock with pitch automation and visual cues.
  function burstAt(amount, when, duration=.11){
    if(!audioCtx||audioCtx.state!=='running'||!noiseBuffer)return;
    try{const source=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain();
      source.buffer=noiseBuffer;source.loop=true;filter.type='bandpass';filter.frequency.value=1300+Math.random()*2400;filter.Q.value=2+Math.random()*3;
      gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(.012*amount/35,when+.006);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
      source.connect(filter);filter.connect(gain);gain.connect(audioCtx.destination);soundNodes.add(source);
      source.onended=()=>{soundNodes.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};source.start(when);source.stop(when+duration+.005);
    }catch(e){}
  }
  function startInterference(){ /* Static is scheduled exactly at pitch-glitch cues. */ }
  function stopInterference(){glitchCues=[];clearInterval(noiseTimer);for(const node of soundNodes){try{node.stop();}catch(e){}}soundNodes.clear();}
  function stop(announce=true){generation++;idlePlaying=false;clearTimeout(autoTimer);clearTimeout(finishTimer);if(controller){controller.abort();controller=null;}terminateAmyWorker();if(currentSource){try{currentSource.stop();}catch(e){}currentSource=null;}if(cleanupGraph){cleanupGraph();cleanupGraph=null;}analyser=null;stopInterference();setActive(false);if(announce){status('Transmission stopped.');log('Transmission terminated.');}}
  function chunks(text,max){const words=text.trim().split(/\s+/),result=[];let current='';for(let word of words){while(word.length>max){if(current){result.push(current);current='';}result.push(word.slice(0,max));word=word.slice(max);}if(!word)continue;const next=current?current+' '+word:word;if(next.length>max){result.push(current);current=word;}else current=next;if(/[.!?;:]$/.test(word)&&current.length>30){result.push(current);current='';}}if(current)result.push(current);return result;}
  function glitchText(text,amount){
    const chance=Math.min(.42,.07+amount/160);
    return text.replace(/\b[A-Za-z][A-Za-z'-]{3,}\b/g,word=>{
      if(Math.random()>chance)return word;
      const cut=1+Math.floor(Math.random()*Math.min(4,word.length-1)),fragment=word.slice(0,cut);
      const mode=Math.random();
      if(mode<.5)return `${fragment}-${word}`;
      if(mode<.82)return `${fragment}… ${word}`;
      return `${word}—${fragment}${word.slice(cut)}`;
    });
  }
  function timeSliceBuffer(context,buffer,amount){
    if(buffer.duration<.65||amount<8)return buffer;
    const rate=buffer.sampleRate,channels=buffer.numberOfChannels;
    const eventCount=Math.max(1,Math.min(7,Math.floor(buffer.duration*(.16+amount/75))));
    const events=[];let attempts=0;
    while(events.length<eventCount&&attempts++<eventCount*8){
      const length=Math.floor(rate*(.045+Math.random()*.055));
      const start=Math.floor(rate*(.2+Math.random()*Math.max(.05,buffer.duration-.45)));
      const repeats=Math.random()<.68?1:2;
      if(start+length>=buffer.length)continue;
      if(events.some(e=>start<e.start+e.length+rate*.08&&start+length>e.start-rate*.08))continue;
      events.push({start,length,repeats});
    }
    if(!events.length)return buffer;
    events.sort((a,b)=>a.start-b.start);
    const total=buffer.length+events.reduce((n,e)=>n+e.length*e.repeats,0);
    const result=context.createBuffer(channels,total,rate);
    const input=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));
    const output=Array.from({length:channels},(_,c)=>result.getChannelData(c));
    let read=0,write=0;
    const copy=(from,to,count,repeat=false)=>{
      for(let c=0;c<channels;c++){
        const src=input[c],dst=output[c];
        for(let i=0;i<count;i++){
          let gain=1;
          if(repeat){const fade=Math.min(Math.floor(rate*.004),Math.floor(count/4));if(fade>0)gain=Math.min(1,(i+1)/fade,(count-i)/fade);}
          dst[to+i]=src[from+i]*gain;
        }
      }
    };
    for(const e of events){
      const end=e.start+e.length;
      if(e.start<read)continue;
      copy(read,write,e.start-read);write+=e.start-read;
      copy(e.start,write,e.length);write+=e.length;read=end;
      for(let n=0;n<e.repeats;n++){copy(e.start,write,e.length,true);write+=e.length;}
    }
    copy(read,write,buffer.length-read);
    return result;
  }
  function speak(override=null, idleQuote=null){
    clearTimeout(autoTimer);const draftSnapshot=el.message.value;let draftCleared=false;const text=typeof override==='string'?override.trim():draftSnapshot.trim();
    if(!text){status('Enter or paste a message before transmitting.');el.message.focus();return;}
    stop(false);const context=initAudio();if(!context){status('Web Audio unavailable. Try Chrome, Edge, Firefox, or Safari.');scheduleIdle(config.defaults.idleRepeatMs);return;}
    idlePlaying=!!idleQuote&&idleQuote.source!=='simulation';
    const run=++generation,parts=chunks(text,config.limits.chunkCharacters||110);let index=0;
    const smoothVoice=el.smooth.checked,characterTilt=Number(el.blend.value),tiltNorm=characterTilt/50,phaseAmount=Number(el.phase.value)/100;const basePitch=Math.pow(2,(characterTilt*.06)/12)*(1+(Math.random()-.5)*.025),baseRate=.78+Math.random()*.08;glitchIntensity=smoothVoice?12+Math.random()*12:22+Math.random()*32;
    const usingPiper=piperReady;
    el.outputText.textContent=text;
    el.sourceInfo.textContent=idleQuote?(idleQuote.source==='simulation'?'SIMULATION / BLACK ICE':idleQuote.source==='user'?`IDLE MONOLOGUE / ${idleQuote.mood.toUpperCase()}`:`IDLE QUOTE / ${idleQuote.source}`):'USER TRANSMISSION';
    status(`${idleQuote?(idleQuote.source==='simulation'?'BLACK ICE simulation':'Idle monologue'):'Transmitting'} · ${usingPiper?`Mimic 3 Amy / ${characterTilt}% character tilt / ${phaseAmount>0?'+':''}${Math.round(phaseAmount*100)}% phase`:'built-in fallback voice'}.`);
    log(`${idleQuote?(idleQuote.source==='simulation'?'BLACK ICE simulation':'Idle '+idleQuote.mood):'Transmission'} · ${usingPiper?'Mimic 3 Amy':'fallback'}${smoothVoice?' / smooth':''} · ${text.length} chars.`, 'VOICE');setActive(true);startInterference();
    function fail(message){if(run!==generation)return;stopInterference();idlePlaying=false;analyser=null;setActive(false);status(message);log(message,'ERROR');scheduleIdle(config.defaults.idleRepeatMs);}
    function next(){
      if(run!==generation)return;
      if(index>=parts.length){stopInterference();idlePlaying=false;analyser=null;setActive(false);status('Transmission complete.');log('Transmission complete.','VOICE');scheduleIdle(config.defaults.idleRepeatMs);return;}
      const part=glitchText(parts[index++],glitchIntensity),pitch=basePitch+(Math.random()-.5)*.06,rate=baseRate+(Math.random()-.5)*.04;
      let wavPromise;
      if(usingPiper){wavPromise=requestAmy(part);}
      else{try{if(!window.bundledTTS)throw Error('Fallback voice not loaded');const wav=window.bundledTTS.speak(part,{rawdata:true,pitch:Math.round(50+characterTilt*.16),speed:170,amplitude:100});if(!wav||!wav.byteLength)throw Error('Empty audio');wavPromise=Promise.resolve(wav);}catch(e){fail('Fallback synthesis failed: '+e.message);return;}}
      Promise.all([wavPromise,context.state==='suspended'?context.resume():Promise.resolve(),ensurePitchModule(context)]).then(async ([wav,_,hasPitch])=>({buffer:timeSliceBuffer(context,await context.decodeAudioData(wav.slice(0)),glitchIntensity),hasPitch})).then(({buffer,hasPitch})=>{
        if(run!==generation)return;if(context.state!=='running'){fail('Audio is blocked. Open this page in a regular browser tab and click SYNTHESIZE.');return;}
        const source=context.createBufferSource(),dry=context.createGain(),output=context.createGain(),filter=context.createBiquadFilter(),shape=context.createWaveShaper(),delay=context.createDelay(),echo=context.createGain(),meter=context.createAnalyser();const amount=glitchIntensity/60;
        source.buffer=buffer;const baseline=hasPitch?pitch:pitch*rate;dry.gain.value=smoothVoice?.96:1-amount*.22;output.gain.value=smoothVoice?.78:.8;filter.type='bandpass';filter.frequency.value=1550;filter.Q.value=.5;
        const curve=new Float32Array(2048),k=1+amount*12;for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1;curve[i]=Math.tanh(k*x)/Math.tanh(k);}shape.curve=curve;delay.delayTime.value=.038;echo.gain.value=amount*(smoothVoice?.045:.2);meter.fftSize=256;analyser=meter;
        let pitchNode=null,voiceInput=source;
        if(hasPitch){
          try{
            pitchNode=new AudioWorkletNode(context,'soundtouch-processor',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
            source.playbackRate.value=rate;pitchNode.parameters.get('playbackRate').value=rate;source.connect(pitchNode);voiceInput=pitchNode;
          }catch(e){pitchNode=null;hasPitch=false;}
        }
        if(!hasPitch){status('Independent pitch unavailable in this browser; using speed-linked pitch fallback.');}
        // Gentle vocal cleanup applies to the actual speech before the dry and effects paths.
        // It improves clarity but cannot replace the underlying voice or remove baked-in artifacts.
        const voiceFilters=[];let processed=voiceInput;
        if(smoothVoice){
          const hp=context.createBiquadFilter();hp.type='highpass';hp.frequency.value=95;hp.Q.value=.7;
          const mud=context.createBiquadFilter();mud.type='peaking';mud.frequency.value=330;mud.Q.value=.8;mud.gain.value=-1.1-tiltNorm*1.5;
          const presence=context.createBiquadFilter();presence.type='peaking';presence.frequency.value=2600+tiltNorm*500;presence.Q.value=.7;presence.gain.value=.3+tiltNorm*1.8;
          const harsh=context.createBiquadFilter();harsh.type='peaking';harsh.frequency.value=5800;harsh.Q.value=.8;harsh.gain.value=-2.8+tiltNorm*.8;
          const lowpass=context.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=8500;lowpass.Q.value=.65;
          const compressor=context.createDynamicsCompressor();compressor.threshold.value=-20;compressor.knee.value=18;compressor.ratio.value=2.5;compressor.attack.value=.012;compressor.release.value=.18;
          voiceFilters.push(hp,mud,presence,harsh,lowpass,compressor);
          for(const node of voiceFilters){processed.connect(node);processed=node;}
        }
        const phaseStages=[],phaseOscillators=[],phaseNodes=[];let phaseInput=processed;
        const phaseCenters=[390,760,1480,2860],phaseSweeps=[85,155,300,500],phaseHz=4.32,phasePeriod=1/phaseHz;
        for(let i=0;i<phaseCenters.length;i++){
          const allpass=context.createBiquadFilter();allpass.type='allpass';allpass.frequency.setValueAtTime(phaseCenters[i],context.currentTime);allpass.Q.value=1.05;
          phaseInput.connect(allpass);phaseInput=allpass;phaseStages.push(allpass);
          const lfo=context.createOscillator(),depth=context.createGain();
          lfo.type='sine';lfo.frequency.value=phaseHz;depth.gain.value=phaseSweeps[i]*phaseAmount;
          lfo.connect(depth);depth.connect(allpass.frequency);lfo.start(context.currentTime,phasePeriod*i/4);
          phaseOscillators.push(lfo);phaseNodes.push(depth);
        }
        const phaseWet=context.createGain();phaseWet.gain.setTargetAtTime(.48*Math.abs(phaseAmount),context.currentTime,.12);
        phaseInput.connect(phaseWet);phaseWet.connect(output);
        processed.connect(dry);dry.connect(output);processed.connect(filter);filter.connect(shape);shape.connect(delay);delay.connect(echo);echo.connect(output);output.connect(meter);meter.connect(context.destination);
        currentSource=source;
        // Sustained bends use the same audio-clock timestamps as visual glitches and static.
        const start=context.currentTime+.06, estimated=buffer.duration/rate;
        const pitchParam=hasPitch?pitchNode.parameters.get('pitch'):source.playbackRate;
        const normal=hasPitch?pitch:pitch*rate;
        pitchParam.setValueAtTime(normal,start);glitchCues=[];
        let at=.70+Math.random()*.28, cueIndex=0;
        while(at<estimated-.90){
          const when=start+at, duration=Math.min(1.2+Math.random()*.35,estimated-at-.22);
          const factor=cueIndex%2===0?1.40:.72; // Preserve wide up/down pitch sweeps at every character-tilt setting
          pitchParam.setValueAtTime(normal,when);
          pitchParam.linearRampToValueAtTime(normal*factor,when+.25);
          pitchParam.setValueAtTime(normal*factor,when+duration-.27);
          pitchParam.linearRampToValueAtTime(normal,when+duration);
          glitchCues.push({start:when,end:when+duration});burstAt(glitchIntensity*(smoothVoice?.35:1),when,.11);
          at+=duration+1.0+Math.random()*.45;cueIndex++;
        }
        let cleaned=false;
        const dispose=()=>{if(cleaned)return;cleaned=true;for(const osc of phaseOscillators){try{osc.stop();}catch(e){}}for(const n of [source,pitchNode,...voiceFilters,...phaseStages,...phaseNodes,phaseWet,dry,filter,shape,delay,echo,output,meter])if(n){try{n.disconnect();}catch(e){}}};
        cleanupGraph=dispose;
        source.onended=()=>{
          if(currentSource===source)currentSource=null;
          // The worklet buffers audio; allow its final samples to drain before disconnecting.
          finishTimer=setTimeout(()=>{dispose();if(cleanupGraph===dispose)cleanupGraph=null;if(run===generation){stopInterference();analyser=null;next();}},hasPitch?400:50);
        };
        source.start(start);
        // Clear only the exact manually transmitted draft, and only after audio starts successfully.
        if(!idleQuote&&!draftCleared&&config.defaults.autoClear&&el.message.value===draftSnapshot){el.message.value='';updateCount();syncMiniInput();draftCleared=true;}
      }).catch(e=>{
        if(e.name==='AbortError'||run!==generation)return;
        if(usingPiper){
          piperReady=false;el.engineStatus.textContent='FALLBACK / ROBOTIC';
          log(`Local Amy unavailable (${e.message}); switching to bundled fallback.`,'WARN');
          status('Local neural voice failed; retrying with the bundled robotic fallback.');
          speak(text,idleQuote);return;
        }
        fail('Synthesis failed: '+e.message);
      });
    }
    next();
  }
  el.inspectSource.addEventListener('click',()=>{
    try{el.iceDialog.showModal();}catch(e){status('The BLACK ICE demo could not open in this browser.');return;}
    speak('Curious hacker. Black Ice deployed. Relax, insect. This is only a simulation.',{mood:'black-ice',source:'simulation'});
  });
  el.iceClose.addEventListener('click',()=>el.iceDialog.close());
  el.iceDialog.addEventListener('close',()=>{if(active&&el.sourceInfo.textContent==='SIMULATION / BLACK ICE')stop(false);status('BLACK ICE simulation ended.');});
  el.speak.addEventListener('click',()=>speak());el.stop.addEventListener('click',()=>stop());
  el.message.addEventListener('input',e=>{updateCount();syncMiniInput();clearTimeout(autoTimer);if(el.auto.checked){if(active)stop(false);if(el.message.value.trim()&&!e.isComposing)autoTimer=setTimeout(speak,config.defaults.autoSpeakDelayMs||1000);}});
  el.message.addEventListener('compositionend',()=>{if(el.auto.checked&&el.message.value.trim()){clearTimeout(autoTimer);autoTimer=setTimeout(speak,config.defaults.autoSpeakDelayMs||1000);}});
  el.blend.addEventListener('input',()=>{blendTouched=true;el.blendValue.textContent=`${Number(el.blend.value)>0?'+':''}${el.blend.value}%`;});
  el.phase.addEventListener('input',()=>{phaseSettingTouched=true;el.phaseValue.textContent=`${Number(el.phase.value)>0?'+':''}${el.phase.value}%`;});
  el.smooth.addEventListener('change',()=>{smoothSettingTouched=true;status(el.smooth.checked?'Smooth voice enabled for the next transmission.':'Smooth voice disabled for the next transmission.');});
  el.auto.addEventListener('change',()=>{clearTimeout(autoTimer);if(el.auto.checked){initAudio();status('Type-to-speak enabled. Speech starts after a 1 second pause.');}else status('Type-to-speak disabled.');});
  el.message.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();speak();}});
  el.paste.addEventListener('click',async()=>{try{if(!navigator.clipboard||!navigator.clipboard.readText)throw Error('Clipboard not available');const text=await navigator.clipboard.readText();if(!text){status('Clipboard is empty.');return;}el.message.value=text.slice(0,el.message.maxLength);el.message.dispatchEvent(new Event('input'));status(el.auto.checked?'Text pasted; transmission will begin after a pause.':'Clipboard text pasted. Press Enter to transmit.');}catch(e){status('Clipboard unavailable. Click the text box and paste with Ctrl/⌘ + V.');el.message.focus();}});
  el.fullscreen.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await el.avatar.requestFullscreen();}catch(e){status('Fullscreen is unavailable here. Open in a normal browser tab.');}});
  document.addEventListener('fullscreenchange',()=>{el.fullscreen.textContent=document.fullscreenElement?'⛶ EXIT FULLSCREEN':'⛶ AVATAR FULLSCREEN';});
  // Playback is armed only after a genuine user click/key so browser audio policies are respected.
  function shuffle(items){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function chooseQuote(){
    const user=allQuotes.filter(q=>q.source==='user'&&q.text),game=allQuotes.filter(q=>q.source!=='user'&&q.text);
    if(!user.length&&!game.length)return null;
    const chooseGame=game.length&&(!user.length||Math.random()<(Number(config.defaults.externalQuoteChance)||0));
    if(chooseGame){if(!gameDeck.length)gameDeck=shuffle(game);if(gameDeck.length>1&&gameDeck[gameDeck.length-1].text===lastQuote)[gameDeck[0],gameDeck[gameDeck.length-1]]=[gameDeck[gameDeck.length-1],gameDeck[0]];const q=gameDeck.pop();lastQuote=q.text;return q;}
    if(!userDeck.length)userDeck=shuffle(user);if(userDeck.length>1&&userDeck[userDeck.length-1].text===lastQuote)[userDeck[0],userDeck[userDeck.length-1]]=[userDeck[userDeck.length-1],userDeck[0]];const q=userDeck.pop();lastQuote=q.text;return q;
  }
  function scheduleIdle(ms){
    clearTimeout(idleTimer);
    if(!el.idle.checked||!idleArmed)return;
    idleTimer=setTimeout(()=>{if(!el.idle.checked||!idleArmed)return;if(active){scheduleIdle(5000);return;}const quote=chooseQuote();if(!quote){status('No idle monologues found. Check monologues.xml.');return;}speak(quote.text,quote);},Math.max(50,Number(ms)||60000));
  }
  function userActivity(event){
    if(!event.isTrusted)return;
    const gesture=event.type==='pointerdown'||event.type==='keydown'||event.type==='touchstart';
    if(!idleArmed&&gesture){idleArmed=true;if(el.idle.checked)initAudio();}
    if(event.type==='pointermove'){const now=Date.now();if(now-lastMove<500)return;lastMove=now;}
    if(idlePlaying){stop(false);status('Idle monologue interrupted by activity.');}
    scheduleIdle(config.defaults.idleDelayMs);
  }
  for(const name of ['pointerdown','keydown','pointermove','wheel','touchstart'])window.addEventListener(name,userActivity,{passive:true,capture:true});
  el.idle.addEventListener('change',()=>{idleSettingTouched=true;clearTimeout(idleTimer);if(el.idle.checked){idleArmed=true;initAudio();scheduleIdle(config.defaults.idleDelayMs);status('Idle monologues enabled.');}else{if(idlePlaying)stop(false);status('Idle monologues disabled.');}});
  // Prefer the editable XML over its bundled offline snapshot when served over HTTP.
  fetch('monologues.xml',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('xml');return r.text();}).then(text=>{
    const xml=new DOMParser().parseFromString(text,'application/xml');if(xml.querySelector('parsererror'))throw Error('Invalid monologue XML');
    const entries=Array.from(xml.querySelectorAll('quote')).map(q=>({text:q.textContent.trim().replace(/\s+/g,' '),mood:q.getAttribute('mood')||'unknown',source:q.getAttribute('source')||'user',url:q.getAttribute('url')||''})).filter(q=>q.text);
    if(entries.length){allQuotes=entries;userDeck=[];gameDeck=[];}
  }).catch(()=>{});
  function syncMiniInput(){if(miniInput&&miniInput.value!==el.message.value)miniInput.value=el.message.value;}
  // Keyboard handling is deliberately scoped to this page and its own floating window.
  // Browser pages cannot capture keys from other apps or tabs.
  function redirectKeys(e,input){
    if(e.defaultPrevented||e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
    const target=e.target,tag=(target.tagName||'').toLowerCase();
    if(target.isContentEditable||['input','textarea','select','button'].includes(tag))return;
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();speak();return;}
    if(e.key.length===1){e.preventDefault();input.focus();input.setRangeText(e.key,input.selectionStart,input.selectionEnd,'end');input.dispatchEvent(new input.ownerDocument.defaultView.Event('input',{bubbles:true}));}
    else if(e.key==='Backspace'){e.preventDefault();input.focus();const start=input.selectionStart,end=input.selectionEnd;input.setRangeText('',start===end?Math.max(0,start-1):start,end,'end');input.dispatchEvent(new input.ownerDocument.defaultView.Event('input',{bubbles:true}));}
  }
  document.addEventListener('keydown',e=>redirectKeys(e,el.message));
  el.mini.addEventListener('click',async()=>{
    if(miniWindow&&!miniWindow.closed){miniWindow.focus();return;}
    if(!('documentPictureInPicture' in window)){status('Floating mode needs a compatible desktop browser (Chrome or Edge). Open the app directly, not in an embedded preview.');return;}
    try{
      const pip=await window.documentPictureInPicture.requestWindow({width:360,height:550});miniWindow=pip;
      pip.document.title='SHODAN // FLOATING';
      pip.document.body.innerHTML=`<style>*{box-sizing:border-box}body{margin:0;background:#07100b;color:#c8e4c5;font:11px ui-monospace,monospace}.wrap{padding:10px}.top{display:flex;justify-content:space-between;letter-spacing:.14em;color:#b8ef8a;padding:4px 2px 9px}.art{display:block;width:100%;aspect-ratio:1;object-fit:cover;border:1px solid #38563b;background:#030704}textarea{resize:none;width:100%;height:70px;background:#0b1710;border:1px solid #3c6041;color:#e0efdb;outline:0;margin-top:8px;padding:8px;font:12px/1.4 ui-monospace,monospace}textarea:focus{border-color:#a5ef7b}.actions{display:flex;gap:6px;margin-top:6px}button{font:700 10px ui-monospace,monospace;letter-spacing:.07em;padding:10px;border:1px solid #46694a;background:#16271b;color:#cee8c4;cursor:pointer}button:first-child{background:#b7f76a;color:#12200d;flex:1;border-color:#b7f76a}.status{margin:8px 0 0;color:#91ae96;font-size:9px;line-height:1.4}.hint{color:#6f9076;font-size:9px;margin-top:6px}</style><div class="wrap"><div class="top"><b>SHODAN // FLOAT</b><span>● LIVE</span></div><canvas class="art" id="face" width="700" height="700" aria-label="Animated AI avatar"></canvas><textarea id="draft" placeholder="Type here and press Enter" aria-label="Message to synthesize"></textarea><div class="actions"><button id="send">▶ TRANSMIT</button><button id="halt">■ STOP</button></div><p class="status" id="state"></p><p class="hint">TYPE WHILE THIS WINDOW IS FOCUSED · ENTER TO SEND</p></div>`;
      miniInput=pip.document.getElementById('draft');miniStatus=pip.document.getElementById('state');miniInput.value=el.message.value;miniStatus.textContent=el.notice.textContent;
      miniInput.addEventListener('input',()=>{el.message.value=miniInput.value;el.message.dispatchEvent(new Event('input',{bubbles:true}));});
      miniInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();speak();}});
      pip.document.addEventListener('keydown',e=>redirectKeys(e,miniInput));
      pip.document.getElementById('send').addEventListener('click',()=>speak());pip.document.getElementById('halt').addEventListener('click',()=>stop());
      for(const name of ['pointerdown','keydown','pointermove','wheel','touchstart'])pip.addEventListener(name,userActivity,{passive:true,capture:true});
      const pc=pip.document.getElementById('face'),pctx=pc.getContext('2d'),image=el.avatar.querySelector('img');
      const draw=()=>{
        if(pip.closed)return;const w=pc.width,h=pc.height,t=performance.now()/1000;
        pctx.clearRect(0,0,w,h);if(image.complete&&image.naturalWidth)pctx.drawImage(image,0,0,w,h);
        const v=active?speechLevel():0;
        if(v>.025){pctx.beginPath();pctx.ellipse(w*.5,h*.757,w*.067,h*(.002+v*.022),0,0,Math.PI*2);pctx.fillStyle='rgba(0,8,3,.95)';pctx.fill();pctx.strokeStyle='rgba(160,240,170,.55)';pctx.stroke();}
        pctx.strokeStyle='rgba(140,255,150,.16)';pctx.lineWidth=1;for(let i=0;i<7;i++){let y=((i/7+t*.08)%1)*h;pctx.beginPath();pctx.moveTo(0,y);pctx.lineTo(w*.13,y);pctx.moveTo(w*.87,y);pctx.lineTo(w,y);pctx.stroke();}
        const now=audioCtx?audioCtx.currentTime:0,cue=active&&glitchCues.some(g=>now>=g.start&&now<g.end);if(cue&&image.complete&&image.naturalWidth){for(let i=0;i<5;i++){const y=Math.random()*h,sh=2+Math.random()*15;pctx.globalAlpha=.65;pctx.drawImage(image,0,y/w*image.naturalHeight,image.naturalWidth,sh/w*image.naturalHeight,(Math.random()-.5)*45,y,w,sh);}pctx.globalAlpha=1;}
        pip.requestAnimationFrame(draw);
      };pip.requestAnimationFrame(draw);
      pip.addEventListener('pagehide',()=>{if(miniWindow===pip){miniWindow=null;miniInput=null;miniStatus=null;}});
      miniInput.focus();status('Floating mode active. Type while the floating window is focused.');
    }catch(e){status('Floating window could not open. Use a supported desktop browser in a normal tab.');}
  });
  // Procedural cyberspace: depth grid, data particles and displaced image slices.
  const canvas=el.cyberspace, ctx=canvas.getContext('2d'), img=el.avatar.querySelector('img');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0, lastW=0,lastH=0, mouthLevel=0;
  const particles=Array.from({length:36},()=>({x:Math.random(), y:Math.random(), speed:.015+Math.random()*.045, size:Math.random()*2+1}));
  function render(t){
    if(!ctx)return;
    const rect=el.avatar.getBoundingClientRect(), w=rect.width,h=rect.height;
    if(!w||!h){requestAnimationFrame(render);return;}
    // Render at least 1.5x for a crisp HUD; cap pixel count to keep large displays responsive.
    const requestedDpr=Math.min(Math.max(window.devicePixelRatio||1,1.5),3);
    const dpr=Math.min(requestedDpr,Math.sqrt(10000000/(w*h)));
    if(lastW!==Math.round(w*dpr)||lastH!==Math.round(h*dpr)){lastW=Math.round(w*dpr);lastH=Math.round(h*dpr);canvas.width=lastW;canvas.height=lastH;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);frame++;
    const power=glitchIntensity/60, phase=t*.001, motion=reduced.matches?0:1;
    const now=audioCtx?audioCtx.currentTime:0;
    const cue=active&&glitchCues.some(g=>now>=g.start&&now<g.end);
    el.avatar.dataset.glitch=cue?'on':'off';
    // Animate a mouth aperture over the portrait from the actual outgoing speech signal.
    // This is amplitude-driven rather than phoneme/viseme detection.
    const target=active ? speechLevel() : 0;
    mouthLevel += (target-mouthLevel)*(target>mouthLevel?.48:.25);
    el.avatar.dataset.mouthLevel=mouthLevel.toFixed(3);
    if(img.complete && img.naturalWidth && mouthLevel>.025){
      const scale=document.fullscreenElement===el.avatar?Math.min(w/img.naturalWidth,h/img.naturalHeight):Math.max(w/img.naturalWidth,h/img.naturalHeight);
      const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale,ix=(w-iw)/2,iy=(h-ih)/2;
      const mx=ix+iw*.5,my=iy+ih*.757, jawDrop=ih*.014*mouthLevel;
      // Move a clipped portion of the portrait's lower lip and chin down with the voice.
      ctx.save();ctx.beginPath();ctx.ellipse(mx,iy+ih*.791,iw*.111,ih*.035,0,0,Math.PI*2);ctx.clip();
      ctx.globalAlpha=.75;ctx.drawImage(img,img.naturalWidth*.385,img.naturalHeight*.76,img.naturalWidth*.23,img.naturalHeight*.09,ix+iw*.385,iy+ih*.76+jawDrop,iw*.23,ih*.09);ctx.restore();
      const rx=iw*(.063+mouthLevel*.013),ry=ih*(.002+mouthLevel*.022);
      ctx.save();ctx.beginPath();ctx.moveTo(mx-rx,my);ctx.quadraticCurveTo(mx,my-ry*.78,mx+rx,my);ctx.quadraticCurveTo(mx,my+ry*1.45,mx-rx,my);ctx.closePath();
      ctx.fillStyle='rgba(0,8,3,.95)';ctx.fill();ctx.strokeStyle='rgba(122,205,132,.48)';ctx.lineWidth=Math.max(1,iw*.0016);ctx.stroke();
      ctx.beginPath();ctx.moveTo(mx-rx*.45,my+ry*.46);ctx.quadraticCurveTo(mx,my+ry*.7,mx+rx*.45,my+ry*.46);ctx.strokeStyle='rgba(160,225,166,.34)';ctx.stroke();ctx.restore();
    }
    // Perspective wireframe hugs the edges, allowing the portrait to stay legible.
    ctx.save();ctx.lineWidth=.7;ctx.strokeStyle='rgba(141,255,126,0.17)';
    for(let side=0;side<2;side++){
      const edge=side?w:0, center=side?w*.84:w*.16;
      for(let i=0;i<7;i++){const x=edge+(center-edge)*i/6;ctx.beginPath();ctx.moveTo(edge,h*.12);ctx.lineTo(x,h);ctx.stroke();}
      for(let i=0;i<9;i++){const v=((i/9+(phase*.11*motion))%1);const y=h*(.14+.86*v*v);const span=Math.abs(center-edge)*v;ctx.beginPath();ctx.moveTo(edge,y);ctx.lineTo(edge+(side?-span:span),y);ctx.stroke();}
    }
    ctx.restore();
    // A ghosted offset copy of actual image strips creates real visual displacement.
    if(motion && img.complete && img.naturalWidth && (cue||Math.random()<(active?.05:.025)*(0.35+power))){
      const scale=document.fullscreenElement===el.avatar?Math.min(w/img.naturalWidth,h/img.naturalHeight):Math.max(w/img.naturalWidth,h/img.naturalHeight);
      const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale,ix=(w-iw)/2,iy=(h-ih)/2;
      for(let n=0;n<(cue?7:active?2:1);n++){
        const sy=Math.random()*img.naturalHeight,sh=4+Math.random()*img.naturalHeight*.035;
        ctx.save();ctx.globalAlpha=.35+Math.random()*.45;ctx.drawImage(img,0,sy,img.naturalWidth,sh,ix+(Math.random()-.5)*w*(cue?.22:.05),iy+sy*scale,iw,sh*scale);ctx.restore();
      }
    }
    // Layer animated eye glows and high-resolution circuit arcs over the original artwork.
    if(img.complete && img.naturalWidth){
      const scale=document.fullscreenElement===el.avatar?Math.min(w/img.naturalWidth,h/img.naturalHeight):Math.max(w/img.naturalWidth,h/img.naturalHeight);
      const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale,ix=(w-iw)/2,iy=(h-ih)/2;
      for(const ex of [.36,.64]){
        const x=ix+iw*ex,y=iy+ih*.474,r=iw*(cue?.035:.022),g=ctx.createRadialGradient(x,y,0,x,y,r);
        g.addColorStop(0,`rgba(160,255,171,${cue?.55:.20+speechLevel()*.18})`);g.addColorStop(1,'rgba(70,255,132,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
      }
      if(motion){ctx.save();ctx.lineWidth=Math.max(.6,iw*.001);ctx.strokeStyle='rgba(154,255,159,.18)';ctx.setLineDash([iw*.012,iw*.018]);ctx.lineDashOffset=-phase*8;ctx.beginPath();ctx.arc(ix+iw*.5,iy+ih*.48,iw*.31,Math.PI*1.08,Math.PI*1.92);ctx.stroke();ctx.restore();}
    }
    if(cue&&motion){
      ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle='rgba(122,255,164,.07)';ctx.fillRect(0,0,w,h);
      for(let i=0;i<10;i++){const y=Math.random()*h;ctx.fillStyle=`rgba(${i%3?120:235},255,${i%2?174:238},${.1+Math.random()*.22})`;ctx.fillRect(Math.random()*w*.4,y,Math.random()*w*.55+8,1+Math.random()*h*.014);}ctx.restore();
    }
    ctx.save();ctx.fillStyle='rgba(156,255,127,.55)';
    for(const p of particles){const y=((p.y+phase*p.speed*motion)%1)*h;const x=p.x*w;if(x>w*.2&&x<w*.8)continue;ctx.globalAlpha=.25+(.2+.2*Math.sin(phase*4+p.y*20));ctx.fillRect(x,y,p.size,p.size*(active?3:1));}
    ctx.restore();
    // HUD rings, scan line and random data fragments.
    ctx.save();ctx.strokeStyle='rgba(157,255,133,.14)';ctx.lineWidth=1;ctx.setLineDash([5,8]);
    ctx.beginPath();ctx.arc(w/2,h*.48,Math.min(w,h)*.36,phase*.16*motion,Math.PI*1.6+phase*.16*motion);ctx.stroke();ctx.restore();
    if(motion){const y=(phase*(active?65:28))%h;const gradient=ctx.createLinearGradient(0,y-12,0,y+4);gradient.addColorStop(0,'rgba(159,255,123,0)');gradient.addColorStop(1,`rgba(159,255,123,${active?.20:.09})`);ctx.fillStyle=gradient;ctx.fillRect(0,y-12,w,16);}
    if(motion&&Math.random()<(active?.4:.1)*(0.3+power)){for(let i=0;i<(active?5:2);i++){ctx.fillStyle=`rgba(180,255,143,${Math.random()*.28})`;ctx.fillRect(Math.random()*w,Math.random()*h,Math.random()*w*.1+2,1+Math.random()*3);}}
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
  updateCount();
  fetch('shodan.json').then(r=>{if(!r.ok)throw Error('config');return r.json();}).then(data=>{config.defaults={...config.defaults,...data.defaults};config.limits={...config.limits,...data.limits};el.auto.checked=config.defaults.autoSpeak;if(!smoothSettingTouched)el.smooth.checked=config.defaults.smoothVoice;if(!blendTouched){el.blend.value=config.defaults.characterTilt??-50;el.blendValue.textContent=`${Number(el.blend.value)>0?'+':''}${el.blend.value}%`;}if(!phaseSettingTouched){el.phase.value=config.defaults.phaseDepth??-50;el.phaseValue.textContent=`${Number(el.phase.value)>0?'+':''}${el.phase.value}%`;}if(!idleSettingTouched)el.idle.checked=config.defaults.idleEnabled;el.idleHelp.textContent=`After your first click or keypress, plays a random line after ${Math.round(config.defaults.idleDelayMs/1000)} seconds of inactivity. Any interaction stops it.`;el.message.maxLength=config.limits.maxCharacters;updateCount();if(idleArmed)scheduleIdle(config.defaults.idleDelayMs);}).catch(()=>{});
  refreshPresence();
  piperReady=!!(window.Worker&&window.WebAssembly&&(window.AudioContext||window.webkitAudioContext));
  el.engineStatus.textContent=piperReady?'MIMIC 3 / AMY MEDIUM':'FALLBACK / ROBOTIC';
  if(piperReady){status('Bundled MycroftAI Mimic 3 Amy voice available. First transmission initializes the local neural model.');log('Local Mimic 3 Amy voice pack available.');}
  else{status('Neural voice unavailable in this browser. Using the bundled robotic fallback.');log('WebAssembly worker unavailable; fallback active.','WARN');}

})();
