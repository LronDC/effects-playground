/* Local WebGL1 print + cylindrical lens material. No 3D reconstruction.
 * Two-image flip print behind a uniform sheet of circular cylindrical lenses.
 * The A/B selection is a ray trace: the eye ray to each surface point is
 * refracted by the lens it meets (Snell, air to plastic) and lands on a flat,
 * periodic interlaced print registered for one fixed design distance. Viewing
 * zones therefore repeat with angle. See OPTICS.md and scripts/test-optics.mjs.
 * Earlier revisions adapted the focal-plane model of the MIT-licensed
 * Stoatworks Labs Lenticular project (Lens.h, commit
 * 570d3d3837574f4634262115f4b0bfd37c15e4da); its notice is retained below.
 * Lighting, finite-card presentation and this WebGL1 implementation are a
 * visual approximation, not a calibrated simulation of a specific PET sheet.
 * The separate ink / etched foil / localized shine layers were informed by
 * Pokebox (https://github.com/selop/pokebox, commit
 * 7f6b1b4b6bb4684f80b49d1318b2a1c90a357b80). This material uses an original,
 * deterministic data texture, not Pokebox/Pokemon imagery or texture maps.
 *
 * MIT License
 * Copyright (c) 2026 Stoatworks Labs
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(function (root) {
  'use strict';
  var LIMIT = 2000000;
  var RECT = [0, 0, 1, 1], LENSES = 186, PERSPECTIVE = 1500;
  var YAW = 22, PITCH = 14, RAD = Math.PI / 180;
  // Virtual lens sheet in units of one lens pitch: 186 lenses at 75 LPI
  // (0.3387 mm) make a 63 mm card. Cylinders run along the card height, their
  // vertices touch z = 0 and neighbouring arcs meet at cusps. The print is the
  // flat back face, z = -THICK. RADIUS gives the smallest RMS spot on the print
  // at normal incidence. A self-consistent prescription, not a measured sheet.
  var INDEX = 1.57, THICK = 1.6, RADIUS = 0.64;
  // DESIGN: design eye distance in card widths (about 250 mm for 63 mm).
  // EDGE: half-width of a printed strip edge (a 2400 dpi dot is ~0.03 pitch).
  var DESIGN = 4, EDGE = 0.015, MAX_EDGE = 0.056;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function flipRange(value) { value = +value; return isFinite(value) ? clamp(value, 0, 1) : 1; }
  function viewRepeats(value) { value = +value; return isFinite(value) ? Math.round(clamp(value, 1, 3)) : 1; }
  function printEdge(value) { value = +value; return isFinite(value) ? clamp(value, EDGE, MAX_EDGE) : EDGE; }
  function glf(x) { var s = String(x); return /[.e]/.test(s) ? s : s + '.'; }
  function pose(state) {
    return { rx: -(state.y || 0) * PITCH, ry: (state.t || 0) * YAW,
      yaw: (state.t || 0) * YAW * RAD, pitch: (state.y || 0) * PITCH * RAD,
      perspective: PERSPECTIVE };
  }
  function seedValue(n) {
    // CPU only: the same immutable material data is sampled by both renderers.
    var v = Math.sin(n * 1.23457 + 0.781) * 13758.5453; return v - Math.floor(v);
  }
  // Ray from (ox, 0) on the vertex plane, relative to a lens centre, against
  // that lens's arc (centre at depth RADIUS). Distance along the ray, or -1
  // if the ray leaves this lens before meeting it.
  function hitLens(ox, dx, dz) {
    var a = dx * dx + dz * dz, b = ox * dx + RADIUS * dz, d = b * b - a * ox * ox, s;
    if (d < 0) return -1;
    s = (-b - Math.sqrt(d)) / a;
    return Math.abs(ox + dx * s) > 0.5 ? -1 : s;
  }
  // Eye ray to point (px, py) of the vertex plane, card centred, in pitches:
  // refracted where it meets a lens, followed to the print. Returns
  // [centre of the lens it met, landing x relative to that centre].
  function landing(px, py, eye) {
    var dx = px - eye[0], dy = py - eye[1], dz = -eye[2], l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx /= l; dy /= l; dz /= l;
    var k = Math.floor(px) + 0.5, s = hitLens(px - k, dx, dz);
    if (s < 0) { k += dx > 0 ? 1 : -1; s = hitLens(px - k, dx, dz); }
    s = Math.max(s, 0);
    var hx = px - k + dx * s, hz = RADIUS + dz * s, nl = Math.sqrt(hx * hx + hz * hz), nx = hx / nl, nz = hz / nl;
    var c = -(dx * nx + dz * nz), e = 1 / INDEX, m = e * c - Math.sqrt(1 - e * e * (1 - c * c));
    return [k, hx + (e * dx + m * nx) * (RADIUS - hz - THICK) / (e * dz + m * nz)];
  }
  // Print phase in the frame of lens k0. Lens j's period spans [j, j + 1): A on
  // the first half, B on the second. Straight in front at the design distance,
  // every lens centre lands on its own A|B boundary.
  var REGISTER = 1;
  function printPhase(hit, k0) { return hit[0] - k0 + 0.5 + hit[0] * (1 / REGISTER - 1) + hit[1] / REGISTER; }
  function bArea(x) { var f = Math.floor(x); return f * 0.5 + clamp(x - f - 0.5, 0, 0.5); }
  // Share of print B over the phases [lo, hi], both ends spread by the strip edge.
  function stripB(lo, hi, edge, repeats) {
    repeats = viewRepeats(repeats);
    // Repeat the A/B pair within the fixed print period, around its original
    // central boundary. Edge remains in repeated-print units, not lens units.
    if (repeats > 1) { lo = 0.5 + repeats * (lo - 0.5); hi = 0.5 + repeats * (hi - 0.5); }
    edge = printEdge(edge); lo -= edge; hi += edge;
    return (bArea(hi) - bArea(lo)) / (hi - lo);
  }
  // Share of B over a footprint of half-width `foot` around px, kept inside
  // its lens. Landing is interpolated across it, never across a cusp.
  function footprintB(px, py, eye, foot, edge, repeats) {
    var k0 = Math.floor(px) + 0.5;
    var p = landing(Math.max(px - foot, k0 - 0.4999), py, eye), q = landing(Math.min(px + foot, k0 + 0.4999), py, eye);
    var a = printPhase(p, k0), b = printPhase(q, k0);
    if (p[0] !== q[0]) return 0.5 * (stripB(a, a, edge, repeats) + stripB(b, b, edge, repeats));
    return stripB(Math.min(a, b), Math.max(a, b), edge, repeats);
  }
  // Optical pitch test before printing: straight in front at the design
  // distance, the outermost lens must hand over together with the centre.
  // The print pitch is then frozen at the original EDGE; tuning the range
  // only widens the sampling edge, never re-registers the printed sheet.
  (function () {
    var lo = 1, hi = 1.01, eye = [0, 0, DESIGN * LENSES];
    for (var k = 0; k < 40; k++) {
      REGISTER = (lo + hi) / 2;
      for (var s = 0, b = 0; s < 16; s++) b += footprintB(LENSES / 2 - 1 + (s + 0.5) / 16, 0, eye, 1 / 32);
      if (b > 8) lo = REGISTER; else hi = REGISTER;
    }
  }());
  function eyeAt(t, y, distance) {
    var o = pose({ t: t, y: y }), d = distance * LENSES;
    return [-Math.sin(o.yaw) * Math.cos(o.pitch) * d, Math.sin(o.pitch) * d, Math.cos(o.yaw) * Math.cos(o.pitch) * d];
  }
  // Share of print B the eye sees through lens column i (0 left) at height v
  // (0 top), integrated over the lens width in `steps` footprints.
  function lensShare(i, v, t, y, distance, steps, edge, repeats) {
    var eye = eyeAt(t, y, distance), py = (0.5 - v) * 4 / 3 * LENSES, n = steps || 8, sum = 0;
    for (var s = 0; s < n; s++) sum += footprintB(i - LENSES / 2 + (s + 0.5) / n, py, eye, 0.5 / n, edge, repeats);
    return sum / n;
  }
  function makeFoilSheet() {
    var size=512,data=new Uint8Array(size*size*4),cols=128,rows=170,cw=size/cols,ch=size/rows;
    var seeds=[];
    for(var cy=-1;cy<=rows;cy++){
      for(var cx=-1;cx<=cols;cx++){
        var id=(cy+1)*(cols+2)+cx+1;
        var angle=Math.atan2(((cy+.5)/rows-.38)*4/3,(cx+.5)/cols-.42)+(seedValue(id*7+3)-.5)*1.4;
        seeds[id]={x:(cx+.15+.7*seedValue(id*7+1))*cw,
          y:(cy+.15+.7*seedValue(id*7+2))*ch,
          gx:Math.cos(2*angle),gy:Math.sin(2*angle),period:seedValue(id*7+5)};
      }
    }
    for(var y=0;y<size;y++){
      for(var x=0;x<size;x++){
        var gx=Math.floor(x/cw),gy=Math.floor(y/ch),best=1e9,second=1e9,facet=null;
        for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){
          var cell=seeds[(gy+dy+1)*(cols+2)+gx+dx+1];
          var dd=(x-cell.x)*(x-cell.x)+(y-cell.y)*(y-cell.y)*16/9;
          if(dd<best){second=best;best=dd;facet=cell;}else if(dd<second){second=dd;}
        }
        var fine=seedValue(y*size+x+781),edge=clamp((Math.sqrt(second)-Math.sqrt(best))/.9,0,1);
        var at=(y*size+x)*4;
        // Double-angle directions survive linear/mipmap filtering without an
        // artificial wrap from 359 to 0 degrees. A mixed facet loses coherence.
        data[at]=Math.round(127.5+127*facet.gx);data[at+1]=Math.round(127.5+127*facet.gy);
        data[at+2]=Math.round(facet.period*255);data[at+3]=Math.round(edge*(.25+.75*Math.pow(fine,1.3))*255);
      }
    }
    return {size:size,data:data};
  }
  function rounded(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  var VERT = 'attribute vec2 p; varying vec2 uv; void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'varying vec2 uv; uniform sampler2D a,b,material; uniform vec2 res,rotation; uniform float distance,foil,lenses,mode,quality,printEdge,viewRepeats;',
    // The same lens trace as landing()/footprintB() on the CPU, in pitches.
    'const float LR=' + glf(RADIUS) + ',LT=' + glf(THICK) + ',ETA=' + glf(1 / INDEX) + ',IRG=' + glf(1 / REGISTER) + ',IRG1=' + glf(1 / REGISTER - 1) + ',EDGE=' + glf(EDGE) + ';',
    'float hitLens(float ox,vec2 d){float a=dot(d,d),b=ox*d.x+LR*d.y,disc=b*b-a*ox*ox;if(disc<0.)return -1.;float s=(-b-sqrt(disc))/a;return abs(ox+d.x*s)>.5?-1.:s;}',
    'vec2 landing(vec3 e,vec2 p){',
    ' vec3 i=normalize(vec3(p,0.)-e);',
    ' float k=floor(p.x)+.5,s=hitLens(p.x-k,i.xz);',
    ' if(s<0.){k+=i.x>0.?1.:-1.;s=hitLens(p.x-k,i.xz);}',
    ' vec2 h=vec2(p.x-k,LR)+i.xz*max(s,0.);',
    ' vec3 r=refract(i,normalize(vec3(h.x,0.,h.y)),ETA);',
    ' return vec2(k,h.x+r.x*(LR-h.y-LT)/r.z);',
    '}',
    'float printPhase(vec2 h,float k0){return h.x-k0+.5+h.x*IRG1+h.y*IRG;}',
    'float bArea(float x){float f=floor(x);return f*.5+clamp(x-f-.5,0.,.5);}',
    // Keep the original constant-edge arithmetic at the crisp end (range 0).
    'float stripB(float lo,float hi){if(viewRepeats>1.){lo=.5+viewRepeats*(lo-.5);hi=.5+viewRepeats*(hi-.5);}if(printEdge>EDGE){lo-=printEdge;hi+=printEdge;}else{lo-=EDGE;hi+=EDGE;}return (bArea(hi)-bArea(lo))/(hi-lo);}',
    'float box(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}',
    'vec3 toWorld(vec3 v){float c=cos(rotation.x),s=sin(rotation.x);v=vec3(c*v.x+s*v.z,v.y,-s*v.x+c*v.z);c=cos(rotation.y);s=sin(rotation.y);return vec3(v.x,c*v.y-s*v.z,s*v.y+c*v.z);}',
    'vec3 toLocal(vec3 v){float c=cos(rotation.y),s=sin(rotation.y);v=vec3(v.x,c*v.y+s*v.z,-s*v.y+c*v.z);c=cos(rotation.x);s=sin(rotation.x);return vec3(c*v.x-s*v.z,v.y,s*v.x+c*v.z);}',
    'vec3 spectral(float x){vec3 d=(vec3(x)-vec3(.80,.52,.20))/vec3(.24,.20,.20);vec3 c=max(1.-d*d,0.)*smoothstep(0.,.10,x)*(1.-smoothstep(.90,1.,x));return mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,.55);}',
    'float pane(vec2 p,vec2 center,vec2 size,float softness){vec2 d=abs(p-center)-size;return (1.-smoothstep(-softness,softness,d.x))*(1.-smoothstep(-softness,softness,d.y));}',
    'vec3 room(vec3 r){',
    ' vec2 p=r.xy/max(r.z,.12);',
    ' float window=pane(p,vec2(-.58,.62),vec2(.27,.73),.13);',
    ' float rail=1.-.38*pane(p,vec2(-.58,.62),vec2(.018,.85),.025);',
    ' float fill=pane(p,vec2(.95,-.12),vec2(.11,1.1),.18);',
    ' return vec3(.16,.18,.20)+window*rail*vec3(3.4,3.32,3.18)+fill*vec3(.85,.90,1.);',
    '}',
    'vec3 foilRoom(vec3 r){vec2 p=r.xy/max(r.z,.12);float strip=pane(p,vec2(-.48,.58),vec2(.009,.54),.012);return vec3(.025)+strip*vec3(2.6,2.55,2.45);}',
    'vec3 surface(vec2 q){',
    ' q=clamp(q,0.,1.);',
    ' float cy=cos(rotation.x),sy=sin(rotation.x),cx=cos(rotation.y),sx=sin(rotation.y);',
    ' vec3 eye=distance*vec3(-sy*cx,sx,cy*cx);',
    ' float lp=q.x*lenses,li=floor(min(lp,lenses-.001)),phase=fract(lp);',
    ' float lensX=(li+.5)/lenses-.5;',
    ' vec3 v=normalize(eye-vec3(lensX,(.5-q.y)*1.333333,0.));',
    ' vec3 photo; vec3 microNormal;float foilGrain=1.;',
    ' if(mode<.5){',
    // Trace both ends of this sample's footprint on the lens surface and take
    // the share of print B between their landings on the interlaced print.
    '   vec3 e=eye*lenses;vec2 pc=vec2(min((q.x-.5)*lenses,lenses*.5-.001),(.5-q.y)*1.333333*lenses);',
    '   float k0=floor(pc.x)+.5,foot=(quality > 0.5 ? 0.125 : 0.5)*lenses/res.x;',
    '   vec2 h0=landing(e,vec2(max(pc.x-foot,k0-.4999),pc.y)),h1=landing(e,vec2(min(pc.x+foot,k0+.4999),pc.y));',
    '   float c0=printPhase(h0,k0),c1=printPhase(h1,k0);',
    '   float shareB=h0.x==h1.x?stripB(min(c0,c1),max(c0,c1)):.5*(stripB(c0,c0)+stripB(c1,c1));',
    // The period it lands in carries one interlaced column of each photo.
    '   float column=k0+lenses*.5-.5+floor(.5*(c0+c1));',
    '   vec2 s0=vec2(clamp((column+.25)/lenses,0.,1.),q.y),s1=vec2(clamp((column+.75)/lenses,0.,1.),q.y);',
    '   vec3 pa=pow(texture2D(a,s0).rgb,vec3(2.2))+pow(texture2D(a,s1).rgb,vec3(2.2));',
    '   vec3 pb=pow(texture2D(b,s0).rgb,vec3(2.2))+pow(texture2D(b,s1).rgb,vec3(2.2));',
    '   photo=.5*mix(pa,pb,shareB);',
    '   float slope=(phase*2.-1.)*.64;',
    '   microNormal=normalize(vec3(slope,.005*sin(q.y*11.),sqrt(max(1.-slope*slope,.01))));',
    '   photo*=1.-.055*pow(abs(phase*2.-1.),6.);',
    ' }else{',
    '   photo=pow(texture2D(a,q).rgb,vec3(2.2));',
    // The etched grating directions are fixed to the sheet. A facet receives
    // a spectral order only when light + view align across its grooves.
    '   vec4 film=texture2D(material,q);',
    '   foilGrain=film.a;',
    '   vec2 g2=film.rg*2.-1.;float coherence=min(length(g2),1.);',
    '   float angle=.5*atan(g2.y,g2.x);vec2 g=vec2(cos(angle),-sin(angle));',
    '   vec3 p=vec3(q.x-.5,(.5-q.y)*1.333333,0.);',
    '   vec2 tangents=normalize(toLocal(vec3(-.80,.80,3.))-p).xy+v.xy;',
    '   float across=dot(tangents,vec2(-g.y,g.x));',
    '   float wavelength=abs(dot(tangents,g))*1250.*(.85+.30*film.b);',
    '   float efficiency=coherence*film.a;',
    '   vec3 diffraction=spectral((wavelength-400.)/300.)*exp(-across*across/.00605)*efficiency;',
    '   float silver=exp(-dot(tangents,tangents)/.0162)*(1.-.5*efficiency);',
    '   vec3 reflectance=vec3(.64)+.65*silver*(.35+.65*film.a)+5.0*diffraction;',
    // Ink multiplies the underlying foil instead of receiving an additive
    // rainbow. Dark ink stays dark, and the coloured order can fully vanish.
    '   photo*=mix(vec3(1.),reflectance,foil);',
    // The plastic coat remains smooth; the rough foil sits underneath it.
    '   microNormal=normalize(vec3(.008*cos(q.x*3.141593),.006*sin(q.y*6.283185),1.));',
    ' }',
    ' vec3 macroNormal=normalize(vec3(.008*cos(q.x*3.141593),.008*sin(q.y*6.283185),1.));',
    ' float nv=max(dot(v,microNormal),0.);',
    ' float fresnel=.039+.961*pow(1.-nv,5.);',
    ' vec3 reflected=room(toWorld(reflect(-v,microNormal)));',
    ' vec3 coat=room(toWorld(reflect(-v,macroNormal)));',
    ' float broad=.043+.09*pow(1.-max(dot(v,macroNormal),0.),3.);',
    ' if(mode>.5){reflected=vec3(0.);coat=foilRoom(toWorld(reflect(-v,macroNormal)))*(.30+.70*foilGrain);fresnel=.012;broad=.022;}',
    ' float diffuse=.87+.09*max(dot(toWorld(macroNormal),normalize(vec3(-.5,.8,1.))),0.);',
    ' vec3 ink=mix(photo,vec3(.88,.88,.86),.008)*diffuse;',
    ' vec3 color=ink*(1.-fresnel-broad)+reflected*fresnel+coat*broad;',
    ' return color;',
    '}',
    'void main(){',
    ' vec2 px=uv*res;float outer=box(px-res*.5,res*.5-.6,res.x*.025);',
    ' float alpha=clamp(.5-outer,0.,1.);',
    ' if(alpha<=0.){gl_FragColor=vec4(0.);return;}',
    ' vec3 color;',
    ' if(quality>.5){',
    '   vec2 d=vec2(.375/res.x,0.);',
    '   color=(surface(uv-d)+surface(uv-d/3.)+surface(uv+d/3.)+surface(uv+d))*.25;',
    ' }else{color=surface(uv);}',
    ' float rim=exp(-max(-outer,0.)/max(res.x*.0018,.5));',
    ' vec3 edgeColor=vec3(.56,.61,.60)+.24*(1.-uv.y)+.10*sin(rotation.x*2.);',
    ' color=mix(color,edgeColor,rim*.58);',
    ' color=pow(clamp(color,0.,1.),vec3(1./2.2));',
    ' gl_FragColor=vec4(color*alpha,alpha);',
    '}'
  ].join('\n');

  function TiltRenderer(host, opts) {
    this.host=host; this.options=opts||{}; this.images={a:null,b:null}; this.textures={a:null,b:null};
    this.film=makeFoilSheet();this.filmTexture=null;this.foilLayer=null;
    this.quality=1; this.dprCap=1.5; this.width=300; this.height=400; this.lenses=LENSES;
    this.contextLosses=0; this.lost=false; this.fallbackReason=''; this._lastCost=0;
    this._canvas(); this._initGL(); this.resize(host.clientWidth||300,(host.clientWidth||300)*4/3);
  }
  TiltRenderer.prototype._notify=function(type){if(this.options.onChange)this.options.onChange(type);};
  TiltRenderer.prototype._canvas=function(){
    if(this.canvas&&this.canvas.parentNode)this.canvas.parentNode.removeChild(this.canvas);
    this.canvas=document.createElement('canvas');this.canvas.className='card-canvas';
    this.canvas.style.width='100%';this.canvas.style.height='100%';this.canvas.style.display='block';
    this.canvas.setAttribute('aria-hidden','true');this.host.appendChild(this.canvas);
  };
  TiltRenderer.prototype._initGL=function(){
    var self=this,gl;
    try{gl=this.canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:true,preserveDrawingBuffer:false});}catch(ignore){}
    if(!gl){this._fallback('webgl-unavailable');return;}
    this.gl=gl;this.backend='webgl1';
    function shader(type,source){var s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){var err=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(err);}return s;}
    try{
      var vs=shader(gl.VERTEX_SHADER,VERT),fs=shader(gl.FRAGMENT_SHADER,FRAG);
      this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);
      gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
      this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      this.loc={};['a','b','material','res','rotation','distance','foil','lenses','mode','quality','printEdge','viewRepeats'].forEach(function(n){self.loc[n]=gl.getUniformLocation(self.program,n);});
      this.filmTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.filmTexture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,this.film.size,this.film.size,0,gl.RGBA,gl.UNSIGNED_BYTE,this.film.data);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.attribute=gl.getAttribLocation(this.program,'p');
      this.canvas.addEventListener('webglcontextlost',function(e){
        e.preventDefault();self.lost=true;self.contextLosses++;self._notify('lost');
        clearTimeout(self._restoreTimer);
        self._restoreTimer=setTimeout(function(){if(self.lost)self._fallback('context-lost');},self.contextLosses>1?0:1500);
      });
      this.canvas.addEventListener('webglcontextrestored',function(){
        clearTimeout(self._restoreTimer);
        // One deterministic fall-back after a loss avoids stale GPU resources and retry loops.
        self._fallback('context-restored-in-safe-mode');
      });
    }catch(error){this._fallback('shader-setup-failed: '+error.message);}
  };
  TiltRenderer.prototype._fallback=function(reason){
    if(this.backend==='canvas2d')return;
    clearTimeout(this._restoreTimer);
    if(this.gl&&!this.gl.isContextLost()){
      if(this.textures.a)this.gl.deleteTexture(this.textures.a);if(this.textures.b)this.gl.deleteTexture(this.textures.b);
      if(this.filmTexture)this.gl.deleteTexture(this.filmTexture);
      if(this.buffer)this.gl.deleteBuffer(this.buffer);if(this.program)this.gl.deleteProgram(this.program);
    }
    this.gl=null;this.textures={a:null,b:null};this.filmTexture=null;this.lost=false;this.backend='canvas2d';this.fallbackReason=reason;
    this._canvas();this.ctx=this.canvas.getContext('2d');this._size();this._notify('fallback');
  };
  TiltRenderer.prototype._size=function(){
    var dpr=Math.min(root.devicePixelRatio||1,this.dprCap);
    var w=Math.max(1,Math.round(this.width*dpr)),h=Math.max(1,Math.round(this.height*dpr));
    var budget=this.quality?LIMIT:1000000;
    if(w*h>budget){var scale=Math.sqrt(budget/(w*h));w=Math.floor(w*scale);h=Math.floor(h*scale);}
    this.canvas.width=w;this.canvas.height=h;this.dpr=dpr;this.distance=PERSPECTIVE/this.width;
  };
  TiltRenderer.prototype.resize=function(w,h){this.width=Math.max(1,w);this.height=Math.max(1,h);this._size();};
  TiltRenderer.prototype.setImage=function(key,image){
    if(key!=='a'&&key!=='b')return;
    // Uploads are cropped by the UI. Clamp once more for callers and imported samples.
    if(image.width>1024||image.height>1024){var k=1024/Math.max(image.width,image.height);var small=document.createElement('canvas');small.width=Math.round(image.width*k);small.height=Math.round(image.height*k);small.getContext('2d').drawImage(image,0,0,small.width,small.height);image=small;}
    this.images[key]=image;
    if(!this.gl||this.lost)return;
    var gl=this.gl;
    try{
      if(this.textures[key])gl.deleteTexture(this.textures[key]);
      var texture=gl.createTexture();this.textures[key]=texture;gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    }catch(error){this._fallback('texture-upload-failed');}
  };
  TiltRenderer.prototype._state=function(s){s=s||{};return{t:clamp(+s.t||0,-1,1),y:clamp(+s.y||0,-1,1),mode:s.mode==='foil'?'foil':'lenticular',foil:clamp(s.foil === undefined ? 0.45 : +s.foil,0,1),flipRange:flipRange(s.flipRange),viewRepeats:viewRepeats(s.viewRepeats)};};
  TiltRenderer.prototype.render=function(state){
    var s=this._state(state);
    if(!this.images.a||(s.mode==='lenticular'&&!this.images.b)||this.lost||document.hidden)return false;
    var began=performance.now();
    try{
      if(this.backend==='canvas2d')this._draw2d(s);else{
        var gl=this.gl,l=this.loc;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);
        gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(this.attribute);gl.vertexAttribPointer(this.attribute,2,gl.FLOAT,false,0,0);
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures.a);gl.uniform1i(l.a,0);
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.textures.b||this.textures.a);gl.uniform1i(l.b,1);
        gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.filmTexture);gl.uniform1i(l.material,2);
        var orientation=pose(s);
        gl.uniform2f(l.res,this.canvas.width,this.canvas.height);gl.uniform2f(l.rotation,orientation.yaw,orientation.pitch);gl.uniform1f(l.distance,this.distance);
        gl.uniform1f(l.foil,s.foil);gl.uniform1f(l.lenses,this.lenses);gl.uniform1f(l.mode,s.mode==='foil'?1:0);gl.uniform1f(l.quality,this.quality);
        gl.uniform1f(l.printEdge,EDGE+s.flipRange*(MAX_EDGE-EDGE));
        gl.uniform1f(l.viewRepeats,s.viewRepeats);
        gl.drawArrays(gl.TRIANGLES,0,6);
      }
    }catch(error){this._fallback('render-failed');if(this.ctx)this._draw2d(s);}
    var cost=performance.now()-began;this._lastCost=this._lastCost*.94+cost*.06;
    if(this._lastCost>24){this.degrade();this._lastCost=0;}
    return true;
  };
  TiltRenderer.prototype._draw2d=function(s){
    var ctx=this.ctx;if(!ctx)return;
    var W=this.canvas.width,H=this.canvas.height,A=this.images.a;
    ctx.clearRect(0,0,W,H);ctx.save();rounded(ctx,.5,.5,W-1,H-1,W*.025);ctx.clip();
    if(s.mode==='lenticular'){
      var n=this.lenses,lw=W/n;
      ctx.drawImage(A,0,0,W,H);
      this._flip2d(ctx,s,W,H);
      var ridge=clamp(.45-s.t*.2+s.y*.12,.1,.85);
      for(var j=0;j<n;j++){
        ctx.fillStyle='rgba(255,255,255,.075)';ctx.fillRect((j+ridge)*lw,0,Math.max(.45,lw*.17),H);
        ctx.fillStyle='rgba(20,28,28,.04)';ctx.fillRect(j*lw,0,Math.max(.35,lw*.12),H);
      }
    }else{
      ctx.drawImage(A,0,0,W,H);
      this._foil2d(ctx,s,W,H);
    }
    var center=.35-s.t*.6+s.y*.1,span=s.mode==='foil' ? .035 : .32;
    var g=ctx.createLinearGradient((center-span)*W,0,(center+span)*W,H*.12);
    g.addColorStop(0,'rgba(250,251,248,0)');g.addColorStop(.34,'rgba(250,251,248,'+(s.mode==='foil'?'.025':'.14')+')');g.addColorStop(.62,'rgba(250,251,248,'+(s.mode==='foil'?'.04':'.17')+')');g.addColorStop(1,'rgba(250,251,248,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.restore();
    ctx.strokeStyle='rgba(220,230,226,.7)';ctx.lineWidth=.9;rounded(ctx,.5,.5,W-1,H-1,W*.025);ctx.stroke();
  };
  TiltRenderer.prototype._flip2d=function(ctx,s,W,H){
    // Same lens trace, one share per lens column and band (it varies slowly
    // along a lens): B is laid over A; equal neighbouring shares merge.
    var B=this.images.b,bands=16,levels=24,lw=W/LENSES,bh=H/bands,edge=EDGE+s.flipRange*(MAX_EDGE-EDGE);
    for(var band=0;band<bands;band++){
      var y0=Math.round(band*bh),y1=Math.round((band+1)*bh),v=(band+.5)/bands,start=0,share=-1;
      for(var i=0;i<=LENSES;i++){
        var next=i<LENSES?Math.round(lensShare(i,v,s.t,s.y,this.distance,8,edge,s.viewRepeats)*levels):-1;
        if(i<LENSES&&next===share)continue;
        if(i>0)this._flipRun(ctx,B,start,i,band,bands,share/levels,lw,y0,y1);
        start=i;share=next;
      }
    }
    ctx.globalAlpha=1;
  };
  TiltRenderer.prototype._flipRun=function(ctx,B,from,to,band,bands,share,lw,y0,y1){
    var x0=Math.round(from*lw),x1=Math.round(to*lw),sw=B.width/LENSES,sh=B.height/bands;
    if(share>0){ctx.globalAlpha=share;ctx.drawImage(B,from*sw,band*sh,(to-from)*sw,sh,x0,y0,x1-x0,y1-y0);}
  };
  TiltRenderer.prototype._foil2d=function(ctx,s,W,H){
    // Same fixed facet data, fewer samples. Not a travelling rainbow gradient.
    var size=192;
    if(!this.foilLayer){this.foilLayer=document.createElement('canvas');this.foilLayer.width=size;this.foilLayer.height=size;
      this.foilPixels=this.foilLayer.getContext('2d').createImageData(size,size);}
    var layer=this.foilLayer.getContext('2d'),image=this.foilPixels,data=image.data;
    var yaw=s.t*YAW*RAD,pitch=s.y*PITCH*RAD,cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch);
    var ly=cx*.80+sx*3,lz=-sx*.80+cx*3,light=[cy*-.80-sy*lz,ly,sy*-.80+cy*lz];
    var eye=[-sy*cx*this.distance,sx*this.distance,cy*cx*this.distance],film=this.film;
    var centers=[.80,.52,.20],widths=[.24,.20,.20],weights=[.2126,.7152,.0722],colors=[0,0,0];
    function smooth(a,b,x){var f=clamp((x-a)/(b-a),0,1);return f*f*(3-2*f);}
    for(var y=0;y<size;y++)for(var x=0;x<size;x++){
      var u=(x+.5)/size,vv=(y+.5)/size,fi=(Math.floor(vv*film.size)*film.size+Math.floor(u*film.size))*4;
      var vx=eye[0]-(u-.5),vy=eye[1]-(.5-vv)*4/3,vz=eye[2],vl=Math.sqrt(vx*vx+vy*vy+vz*vz);
      var lx=light[0]-(u-.5),llY=light[1]-(.5-vv)*4/3,llZ=light[2],ll=Math.sqrt(lx*lx+llY*llY+llZ*llZ);
      var tx=lx/ll+vx/vl,ty=llY/ll+vy/vl;
      var gx=film.data[fi]/255*2-1,gy=film.data[fi+1]/255*2-1,coh=Math.min(Math.sqrt(gx*gx+gy*gy),1);
      var angle=Math.atan2(gy,gx)*.5,grX=Math.cos(angle),grY=-Math.sin(angle),across=-tx*grY+ty*grX;
      var wavelength=Math.abs(tx*grX+ty*grY)*1250*(.85+.30*film.data[fi+2]/255),spectralX=(wavelength-400)/300;
      var efficiency=coh*film.data[fi+3]/255,gate=Math.exp(-across*across/.00605)*efficiency;
      var silver=Math.exp(-(tx*tx+ty*ty)/.0162)*(1-.5*efficiency)*(.35+.65*film.data[fi+3]/255),lum=0,at=(y*size+x)*4;
      for(var c=0;c<3;c++){
        var sd=(spectralX-centers[c])/widths[c];
        colors[c]=Math.max(1-sd*sd,0)*smooth(0,.10,spectralX)*(1-smooth(.90,1,spectralX));lum+=colors[c]*weights[c];
      }
      // Canvas uses gamma-space multiply: bounded approximation of the same
      // etched reflection. It intentionally omits over-white specular peaks.
      for(var k=0;k<3;k++)data[at+k]=Math.round(Math.pow(clamp(1-s.foil+s.foil*(.64+.65*silver+5*(lum*.45+colors[k]*.55)*gate),0,1),1/2.2)*255);
      data[at+3]=255;
    }
    layer.putImageData(image,0,0);
    ctx.globalCompositeOperation='multiply';ctx.drawImage(this.foilLayer,0,0,W,H);ctx.globalCompositeOperation='source-over';
  };
  TiltRenderer.prototype.snapshot=function(state,width){
    var keepW=this.canvas.width,keepH=this.canvas.height,keepLenses=this.lenses;
    var W=Math.min(1024,width||768),H=Math.round(W*4/3),out=document.createElement('canvas');out.width=W;out.height=H;
    try{this.canvas.width=W;this.canvas.height=H;if(!this.render(state))throw new Error('卡片还没准备好，请稍后重试');out.getContext('2d').drawImage(this.canvas,0,0);}
    finally{this.canvas.width=keepW;this.canvas.height=keepH;this.lenses=keepLenses;this.render(state);}
    return out;
  };
  TiltRenderer.prototype.degrade=function(){
    if(this.quality){this.quality=0;this.dprCap=1;this._size();this._notify('reduced');return'reduced';}
    if(this.backend==='webgl1'){this._fallback('slow-frames');return'canvas2d';}return'';
  };
  TiltRenderer.prototype.getInfo=function(){return{backend:this.backend,width:this.canvas.width,height:this.canvas.height,dpr:this.dpr,lenses:this.lenses,distance:this.distance,quality:this.quality,contextLosses:this.contextLosses,fallbackReason:this.fallbackReason};};
  TiltRenderer.WINDOW=RECT.slice();TiltRenderer.MAX_TEXTURE=1024;TiltRenderer.LENSES=LENSES;TiltRenderer.lensShare=lensShare;TiltRenderer.pose=pose;TiltRenderer.roundRectPath=rounded;
  TiltRenderer.optics={pitch:1,lpi:75,index:INDEX,thickness:THICK,radius:RADIUS,design:DESIGN,edge:EDGE,maxEdge:MAX_EDGE,register:REGISTER,
    landing:landing,printPhase:printPhase,stripB:stripB,footprintB:footprintB,eyeAt:eyeAt};
  root.TiltRenderer=TiltRenderer;
}(window));
