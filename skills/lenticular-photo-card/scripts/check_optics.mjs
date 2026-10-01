// Numeric checks of the virtual lens sheet in assets/template/renderer.js. Expected
// values come from closed forms or separate brute-force code written here,
// never from the renderer's own integration. Runs in Node, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../assets/template/renderer.js',import.meta.url),'utf8'),sandbox);
const R=sandbox.window.TiltRenderer,O=R.optics,L=R.LENSES,n=O.index,T=O.thickness,RAD=O.radius,D0=O.design,deg=Math.PI/180;
const report={};
// A far eye: rays toward `at` have yaw a (positive = moving to +x) and elevation b.
function far(a,b,at){const I=[Math.sin(a*deg)*Math.cos(b*deg),Math.sin(b*deg),-Math.cos(a*deg)*Math.cos(b*deg)],d=1e7;return [at[0]-I[0]*d,at[1]-I[1]*d,at[2]-I[2]*d];}
// The scene eye, written out again: card yaw turns it to -x.
function eye(yaw,pitch,D){return [-Math.sin(yaw*deg)*Math.cos(pitch*deg)*D*L,Math.sin(pitch*deg)*D*L,Math.cos(yaw*deg)*Math.cos(pitch*deg)*D*L];}
const share=(i,v,yaw,pitch,D)=>R.lensShare(i,v,yaw/22,pitch/14,D);
// Brute force: point samples across lens i, absolute print phase, any print
// pitch; each landing sees the printed edge as 11 points across +-EDGE.
function brute(i,v,yaw,pitch,D,rho,samples=96,repeats=1,edge=O.edge){
  const e=eye(yaw,pitch,D),py=(.5-v)*4/3*L;let b=0;
  for(let s=0;s<samples;s++){
    const h=O.landing(i-L/2+(s+.5)/samples,py,e);
    const phase=(h[0]+h[1])/rho+L/2,printed=repeats===1?phase:.5+repeats*(phase-.5);
    for(let k=-5;k<=5;k++){const chi=printed+edge*k/5;if(chi-Math.floor(chi)>=.5)b++;}
  }
  return b/(samples*11);
}
// Yaw where f crosses .5 between lo and hi (scan, then linear interpolation).
function crossing(f,lo,hi,step=.02){let p=f(lo);for(let a=lo+step;a<=hi+1e-9;a+=step){const q=f(a);if((p-.5)*(q-.5)<=0&&p!==q)return a-step+step*(.5-p)/(q-p);p=q;}return null;}
function width(f,lo,hi,step=.02){let a10=null,a90=null;for(let a=lo;a<=hi;a+=step){const v=f(a);if(a10===null&&v>=.1)a10=a;if(a90===null&&v>=.9)a90=a;}return a90-a10;}
const grid=[];for(const v of [.1,.3,.5,.7,.9])for(const i of [0,31,62,93,124,155,185])grid.push([i,v]);
const cardMean=(yaw,pitch,D,fn=share)=>grid.reduce((s,[i,v])=>s+fn(i,v,yaw,pitch,D),0)/grid.length;
// Scalar 2D trace at normal incidence, from angles only (no vectors).
function scalarLanding(u,r){const sag=r-Math.sqrt(r*r-u*u),th=Math.asin(u/r),tw=Math.asin(Math.sin(th)/n);return u-Math.tan(th-tw)*(T-sag);}
function rms(r){let s=0,s2=0;const m=400;for(let k=0;k<m;k++){const x=scalarLanding(-.5+(k+.5)/m,r);s+=x;s2+=x*x;}return Math.sqrt(s2/m-(s/m)**2);}
assert.equal(L,186);
// Independent optical probe distances. These do not vary with responsive UI.
const DESK=1500 / 420,PHONE=1500 / 342,SMALL=1500 / 300;

// 1. Central ray: Snell at the vertex, closed form, with and without elevation.
let worst=0;
for(let a=-60;a<=60;a+=5)for(const b of [0,12]){
  const x=O.landing(.5,0,far(a,b,[.5,0,0]))[1];
  const ix=Math.sin(a*deg)*Math.cos(b*deg),iy=Math.sin(b*deg),tz=Math.sqrt(1-(ix*ix+iy*iy)/(n*n));
  const expected=b===0?T*Math.tan(Math.asin(Math.sin(a*deg)/n)):T*(ix/n)/tz;
  worst=Math.max(worst,Math.abs(x-expected));
}
assert(worst<1e-9,'Vertex ray obeys Snell: '+worst);report.vertexSnellError=worst;
// 2. Mirror symmetry of one lens, and agreement with the scalar trace.
worst=0;let scalar=0;
for(let u=-.48;u<=.48;u+=.04)for(const a of [0,7,19,33]){
  const p=O.landing(.5+u,0,far(a,0,[.5+u,0,0])),q=O.landing(.5-u,0,far(-a,0,[.5-u,0,0]));
  if(p[0]===.5&&q[0]===.5)worst=Math.max(worst,Math.abs(p[1]+q[1]));
  if(a===0)scalar=Math.max(scalar,Math.abs(p[1]-scalarLanding(u,RAD)));
}
assert(worst<1e-9&&scalar<1e-9,'Symmetric lens: mirrored rays land mirrored, and match the scalar trace');
// 3. RADIUS is the best focus of this thickness (independent scan).
let best=null;for(let r=.55;r<=.8;r+=.0005){const v=rms(r);if(!best||v<best.v)best={r,v};}
report.lens={pitchMm:25.4/O.lpi,thicknessMm:T*25.4/O.lpi,radiusMm:RAD*25.4/O.lpi,index:n,sag:RAD-Math.sqrt(RAD*RAD-.25),bestRadius:+best.r.toFixed(4),rmsSpot0:+best.v.toFixed(4)};
assert(Math.abs(best.r-RAD)<.01,'Lens radius is the best-focus radius: '+best.r);
// 4. Finite values everywhere in and beyond the gesture.
let finite=true;
for(const D of [2.5,DESK,PHONE,6]){
  for(let yaw=-66;yaw<=66;yaw+=6){
    for(const pitch of [-14,0,14]){
      for(const [i,v] of grid){
        const s=share(i,v,yaw,pitch,D),h=O.landing(i-L/2+.31,(.5-v)*4/3*L,eye(yaw,pitch,D));
        if(!(s>=0&&s<=1)||!Number.isFinite(h[1])||Math.abs(h[1])>3)finite=false;
      }
    }
  }
}
assert(finite,'Finite trace and share in [0, 1] for every tested pose');
// 5. Print registration frozen at the design distance.
const paraxial=T/(n*D0*L);
report.register={printPitch:O.register,excess:O.register-1,paraxialExcess:paraxial,ratio:(O.register-1)/paraxial};
assert(O.register>1,'Print pitch is larger than lens pitch');
assert(Math.abs((O.register-1)/paraxial-1)<.15,'Registration agrees with 1+t/(nD0) within 15%');
const edges=[0,46,93,139,185].map(i=>crossing(a=>share(i,.5,a,0,D0),-6,6,.01));
report.designHandoffs=edges.map(a=>+a.toFixed(3));
// A linear print pitch cannot follow the lens's slightly non-linear angle-to-landing map; the remainder is small.
assert(Math.max(...edges)-Math.min(...edges)<.4,'At the design distance every lens hands over together');
// Negative control: an unregistered print (pitch = lens pitch) fans out by the card's angular size.
const loose=[0,185].map(i=>crossing(a=>brute(i,.5,a,0,D0,1),-12,12,.02));
report.unregisteredSpread=+(loose[0]-loose[1]).toFixed(2);
assert(Math.abs(loose[0]-loose[1])>6,'Without registration the edges hand over far apart');
// Brute point sampling agrees with the renderer's footprint integral; it
// converges with finer footprints (WebGL uses ~0.07 pitch per sample).
worst=0;let coarse=0;
for(const a of [-30,-3,-1,-.4,0,.4,1,3,22,29,31,40]){
  for(const [i,v] of grid){
    const b=brute(i,v,a,0,DESK,O.register);
    worst=Math.max(worst,Math.abs(R.lensShare(i,v,a/22,0,DESK,32)-b));coarse=Math.max(coarse,Math.abs(share(i,v,a,0,DESK)-b));
  }
}
report.bruteVsFootprint={steps32:+worst.toFixed(4),steps8:+coarse.toFixed(4)};
assert(worst<.04&&coarse<.1,'Footprint integral matches brute-force sampling');
// 6. Nearer or farther than the design: the handoff moves across the card,
// in opposite directions, by the geometric angle residual.
report.offDesign=[];
for(const dist of [3,6]){
  const left=crossing(a=>share(0,.5,a,0,dist),-8,8,.01),right=crossing(a=>share(185,.5,a,0,dist),-8,8,.01);
  const x=(185.5-L/2)/L,expected=-2*x*(1/dist-1/D0)/deg,measured=right-left;
  report.offDesign.push({dist,measured:+measured.toFixed(3),expected:+expected.toFixed(3)});
  assert(Math.sign(measured)===Math.sign(expected),'Off-design residual has the geometric sign');
  assert(Math.abs(measured-expected)<.25*Math.abs(expected),'Off-design residual has the geometric size');
}
// 7. Wide angle: periodic print gives repeated viewing zones.
const mean0=a=>cardMean(a,0,D0);
const front=crossing(mean0,-5,5,.02),plus=crossing(mean0,10,50,.1),minus=crossing(a=>mean0(-a),10,50,.1);
const vertexZone=Math.asin(n*Math.sin(Math.atan(.5/T)))/deg;
const frontWidth=width(mean0,-6,6),lensWidth=width(a=>share(93,.5,a,0,D0),-6,6);
report.zones={front:+front.toFixed(2),repeatPlus:+plus.toFixed(2),repeatMinus:+(-minus).toFixed(2),vertexRayPrediction:+vertexZone.toFixed(2)};
report.handoff={cardWidth10to90:+frontWidth.toFixed(2),lensWidth10to90:+lensWidth.toFixed(2),at45:+mean0(45).toFixed(3),atMinus45:+mean0(-45).toFixed(3)};
assert(Math.abs(front)<.5,'Front handoff at the registered boundary');
assert(Math.abs(plus-vertexZone)<5&&Math.abs(minus-vertexZone)<5,'Repeat handoffs where the vertex ray reaches the next strip');
assert(mean0(45)<.2&&mean0(-45)>.8,'Beyond the zone the other photo returns');
assert(frontWidth/(plus+minus)<.12,'A handoff is a small part of the viewing-zone period');
// Endpoints follow the computed print at this prescription, desktop and phone geometry.
report.endpoints=[];
for(const dist of [DESK,PHONE,SMALL]){
  const left=Math.max(...grid.map(([i,v])=>share(i,v,-22,0,dist))),right=Math.min(...grid.map(([i,v])=>share(i,v,22,0,dist)));
  report.endpoints.push({dist:+dist.toFixed(2),maxBAtMinus22:+left.toFixed(3),minBAtPlus22:+right.toFixed(3)});
}
// 8. Static geometry: a held pose returns the same value after any path.
const route=[];for(let a=-40;a<=40;a+=.5)route.push(a);
const fwd=route.map(a=>share(93,.4,a,3,DESK)),back=route.slice().reverse().map(a=>share(93,.4,a,3,DESK)).reverse();
assert(fwd.every((v,k)=>v===back[k]),'Same pose, same share in either direction');
// 9. A uniform sheet has no upper/lower lobes: rows are symmetric and smooth,
// at the front handoff and at the repeat, where elevation does move it.
function rowsCheck(fn,lo=-8,hi=8){
  const h=[.05,.15,.25,.35,.5,.65,.75,.85,.95].map(v=>crossing(a=>fn(93,v,a),lo,hi,.01));
  if(h.some(a=>a===null))return {ok:false,asym:Infinity,curve:Infinity};
  let asym=0,curve=0;
  for(let k=0;k<4;k++)asym=Math.max(asym,Math.abs(h[k]-h[8-k]));
  for(let k=1;k<8;k++)curve=Math.max(curve,Math.abs(h[k-1]-2*h[k]+h[k+1]));
  return {ok:asym<.02&&curve<.1,asym,curve,spread:Math.max(...h)-Math.min(...h)};
}
const rows=rowsCheck((i,v,a)=>share(i,v,a,0,DESK));
const repeatRows=rowsCheck((i,v,a)=>share(i,v,a,0,DESK),20,40);
report.rows={front:rows,repeat:repeatRows};
assert(rows.ok&&repeatRows.ok,'Uniform sheet: symmetric, smooth handoff along a lens');
const up=crossing(a=>share(93,.5,a,8,DESK),-8,8,.01),down=crossing(a=>share(93,.5,a,-8,DESK),-8,8,.01);
assert(Math.abs(up-down)<.01,'Vertical tilt is symmetric for vertical lenses');
// 10. Negative control: the rejected noise-threshold crossfade fails the same checks.
function oldSelector(i,v,yaw){
  const hash=x=>{const s=Math.sin(x*1.23457+.781)*13758.5453;return s-Math.floor(s);};
  const u=(i+.5)/L,noise=(hash(Math.floor(u*2.3)*157+Math.floor(v*1.7+.2)*311)-.5)*1.1+.45*Math.cos((u-.5)*5)+.9*(u-.5)*(v-.5);
  const f=Math.min(1,Math.max(0,(yaw-noise*2.6+.35)/.7));
  return f*f*(3-2*f);
}
const oldRows=rowsCheck(oldSelector);
const oldRepeat=crossing(a=>grid.reduce((s,[i,v])=>s+oldSelector(i,v,a),0)/grid.length,10,50,.1);
assert(!oldRows.ok&&oldRepeat===null,'Checks reject the old saturated threshold selector');
report.negativeControl={oldRowsAsym:+oldRows.asym.toFixed(3),oldRepeat};
// 11. Optional range widens only the print edge, with registration frozen.
const registered=O.register,rangeRows=[];
for(const edge of [O.edge,.025,.035,.045,O.maxEdge]){
  const widened=(i,v,yaw,pitch,D)=>R.lensShare(i,v,yaw/22,pitch/14,D,8,edge);
  const mean=a=>cardMean(a,0,D0,widened);
  const central=crossing(mean,-6,6,.01),span=width(mean,-6,6,.01);
  const endpoints=[-22,22].map(a=>cardMean(a,0,D0,widened));
  assert(Math.abs(central-front)<.04,'Widening does not displace the card handoff centre');
  assert(endpoints[0]<.02&&endpoints[1]>.98,'Wider edge keeps endpoint zones, without forcing hard A/B clamps');
  const forward=route.map(a=>widened(93,.4,a,3,DESK));
  const backward=route.slice().reverse().map(a=>widened(93,.4,a,3,DESK)).reverse();
  assert(forward.every((v,k)=>v===backward[k]),'Wider range is static and reversible');
  rangeRows.push({edge,width10to90:+span.toFixed(2),centre:+central.toFixed(4),endpoints});
}
assert(rangeRows.every((v,k)=>k===0||v.width10to90>rangeRows[k-1].width10to90),'Wider print edges widen the handoff monotonically');
assert.equal(O.register,registered,'Tuning never recalibrates print registration');
assert.equal(R.lensShare(93,.5,.05,0,D0),R.lensShare(93,.5,.05,0,D0,8,O.edge),'Old lensShare signature keeps the original default');
const edgeEye=O.eyeAt(.05,0,D0);
assert.equal(O.footprintB(.5,0,edgeEye,.1),O.footprintB(.5,0,edgeEye,.1,O.edge),'Old footprintB signature keeps the original default');
for(const invalid of [undefined,NaN,Infinity,-Infinity,'bad',-1,0]){
  assert.equal(O.stripB(.5,.5,invalid),O.stripB(.5,.5,O.edge),'Invalid or subminimum edge remains finite and defaults/clamps safely');
}
assert.equal(O.stripB(.48,.48,1),O.stripB(.48,.48,O.maxEdge),'Oversized edge is clamped');
report.range=rangeRows;
// 12. Integer A/B repeats are printed within the same registered period. They
// add viewing zones; they do not change Snell, pose, sampling columns or pitch.
const repeatedZones=[];
for(const repeats of [1,2,3]){
  const repeated=(i,v,yaw,pitch,D)=>R.lensShare(i,v,yaw/22,pitch/14,D,8,O.maxEdge,repeats);
  const mean=a=>cardMean(a,0,D0,repeated),crossings=[];
  let prior=mean(-22),bruteError=0;
  for(let yaw=-21.9;yaw<=22;yaw+=.1){
    const s=mean(yaw);assert(Number.isFinite(s)&&s>=-1e-12&&s<=1+1e-12,'Repeated-print share is finite and bounded');
    if((prior-.5)*(s-.5)<0)crossings.push(yaw-.1+.1*(.5-prior)/(s-prior));
    prior=s;
  }
  assert.equal(crossings.length,2*repeats-1,'Integer repeats create the expected multiple handoffs within the gesture');
  const forward=route.map(yaw=>repeated(93,.4,yaw,3,DESK));
  const backward=route.slice().reverse().map(yaw=>repeated(93,.4,yaw,3,DESK)).reverse();
  assert(forward.every((s,k)=>s===backward[k]),'Repeated print is reversible without elapsed-time state');
  for(const yaw of [-22,-16,-10,-3,0,3,10,16,22])for(const [i,v] of grid){
    const sampled=brute(i,v,yaw,0,D0,O.register,192,repeats,O.maxEdge);
    const integrated=R.lensShare(i,v,yaw/22,0,D0,32,O.maxEdge,repeats);
    bruteError=Math.max(bruteError,Math.abs(sampled-integrated));
  }
  assert(bruteError<.05,'Repeated footprint agrees with independent repeated-print samples: '+bruteError);
  repeatedZones.push({repeats,crossings:crossings.map(v=>+v.toFixed(3)),bruteError:+bruteError.toFixed(4)});
}
assert.equal(O.register,registered,'Repeats never recalibrate the original print pitch');
assert.equal(O.stripB(.47,.52,O.edge),O.stripB(.47,.52,O.edge,1),'Repeat-one API preserves the original integral exactly');
for(const invalid of [undefined,NaN,Infinity,-Infinity,'bad',-1,0])assert.equal(O.stripB(.31,.36,O.edge,invalid),O.stripB(.31,.36,O.edge,1),'Invalid repeats fall back/clamp safely');
assert.equal(O.stripB(.31,.36,O.edge,2.6),O.stripB(.31,.36,O.edge,3),'Repeat count rounds to an integer');
assert.equal(O.stripB(.31,.36,O.edge,100),O.stripB(.31,.36,O.edge,3),'Repeat count is capped at three');
report.repeats=repeatedZones;
// Responsive geometry preserves the approved desktop scene, not a new print.
assert.equal(R.REFERENCE_WIDTH,342);
assert.equal(R.VIEW_DISTANCE,1500/342);
const responsiveState={t:.37,y:-.2},legacyPose=R.pose(responsiveState);
assert.equal(legacyPose.perspective,1500);
report.responsiveGeometry=[116,198,210,300,342,420].map(cssWidth=>{
  const p=R.pose(responsiveState,cssWidth),distance=p.perspective/cssWidth;
  assert(Math.abs(distance-1500/342)<1e-12,'CSS perspective and optical eye must match at every width');
  for(const key of ['rx','ry','yaw','pitch'])assert.equal(p[key],legacyPose[key]);
  return {cssWidth,perspective:p.perspective,distance};
});
for(const invalid of [undefined,null,0,-1,NaN,Infinity,'bad'])assert.equal(R.pose(responsiveState,invalid).perspective,1500);
console.log(JSON.stringify(report,null,1));
console.log('PASS optics tests');
