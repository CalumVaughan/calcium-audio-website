const canvas = document.querySelector('#field');
const ctx = canvas.getContext('2d');
const audio = document.querySelector('#track');
const motion = document.querySelector('#motion');
const modeButton = document.querySelector('#field-mode');
const status = document.querySelector('#audio-status');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let frozen = reduced.matches, mode = 0, ac, analyser, source, bins, wave;
let w=0,h=0,t=0,last=0,low=0,high=0,energy=0,previous=0,kick=0;
function resize(){w=innerWidth;h=innerHeight;const d=Math.min(devicePixelRatio||1,2);canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);draw();}
function setMotion(){if(motion){motion.textContent=frozen?'resume animation':'freeze animation';motion.setAttribute('aria-pressed',String(frozen));}}
setMotion();motion?.addEventListener('click',()=>{frozen=!frozen;setMotion();});
reduced.addEventListener('change',e=>{frozen=e.matches;setMotion();});
modeButton?.addEventListener('click',()=>{mode=(mode+1)%3;draw();});
audio?.addEventListener('play',async()=>{
  try {
    if(!ac){ac=new AudioContext();analyser=ac.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.68;bins=new Uint8Array(analyser.frequencyBinCount);wave=new Uint8Array(analyser.fftSize);source=ac.createMediaElementSource(audio);source.connect(analyser);analyser.connect(ac.destination);}
    await ac.resume();status.textContent='01 / playing';
  }catch{status.textContent='Audio visualisation unavailable. Use the download link if playback fails.';}
});
audio?.addEventListener('pause',()=>{status.textContent='01 / paused';});
audio?.addEventListener('ended',()=>{status.textContent='01 / finished';});
audio?.addEventListener('error',()=>{status.textContent='Track could not load. Try the download link.';});
function sample(){
  if(!analyser||audio.paused){low*=.91;high*=.91;energy*=.91;kick*=.9;return;}
  analyser.getByteFrequencyData(bins);analyser.getByteTimeDomainData(wave);
  const hz=ac.sampleRate/analyser.fftSize;
  function band(a,b){let total=0,n=0;for(let i=Math.ceil(a/hz);i<Math.min(bins.length,b/hz);i++){total+=bins[i]/255;n++;}return n?total/n:0;}
  low=low*.65+band(35,180)*.35;high=high*.6+band(1800,9000)*.4;
  let rms=0;for(const n of wave)rms+=((n-128)/128)**2;
  energy=Math.min(1,Math.sqrt(rms/wave.length)*4);
  kick=Math.max(kick*.86,Math.max(0,energy-previous)*5);previous=energy;
}
function draw(){
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
  const step=w<600?11:12, rows=Math.ceil(h/step), cols=Math.ceil(w/(step*.66));
  ctx.font=`${step}px monospace`;ctx.textBaseline='top';
  const scroll=scrollY*.001;
  // A continuously deformed character field, not a looped decorative asset.
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      const px=x*step*.66,py=y*step;
      const nx=(px-w/2)/Math.min(w,h),ny=(py-h/2)/Math.min(w,h);
      const radius=Math.hypot(nx,ny),angle=Math.atan2(ny,nx);
      let v;
      if(mode===0)v=Math.sin(radius*(34+low*28)-t*2+Math.sin(angle*5+t+scroll)*(2+energy*5));
      else if(mode===1)v=Math.sin(nx*(30+low*30)+Math.sin(ny*12+t)*5+t)*Math.cos(ny*30-t+nx*8);
      else v=Math.sin(angle*(5+Math.floor(low*6))+radius*25-t*3)*Math.cos(radius*40+t);
      const lattice=Math.sin(nx*24+t*.7)*Math.sin(ny*19-t*.5);
      const density=Math.abs(v+lattice*.45);
      if(density<.64-energy*.2)continue;
      const chars=' .,:;+*ox%#@';
      const index=Math.min(chars.length-1,Math.floor(density*(4+energy*3)+high*3));
      const displacement=Math.sin(y*.19+t*4)*kick*30;
      ctx.fillStyle=`rgba(0,0,0,${Math.min(.8,.22+density*.24+energy*.2)})`;
      ctx.fillText(chars[index],px+displacement,py);
    }
  }
  // Oscilloscope threads run through the surrounding character field.
  if(wave&&audio&&!audio.paused){
    ctx.strokeStyle='#111';ctx.lineWidth=1;
    for(let strand=0;strand<3;strand++){
      ctx.beginPath();for(let i=0;i<180;i++){
        const x=i/179*w;
        const amp=(wave[Math.floor(i/180*wave.length)]-128)/128;
        const y=h*(.2+strand*.3)+Math.sin(i*.05+t+strand)*40+amp*(80+low*100);
        i?ctx.lineTo(x,y):ctx.moveTo(x,y);
      }ctx.stroke();
    }
  }
}
function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden||frozen||now-last<65)return;
  const dt=Math.min((now-last)/1000,.1);last=now;sample();t+=dt*(.38+energy*1.1);draw();
}
window.addEventListener('resize',resize);resize();requestAnimationFrame(frame);
