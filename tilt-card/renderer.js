/* Original adaptation of the angle-dependent lens plan returned by Opus 5.5.
 * WebGL1, classic ES2017; all images and effects are local. No 3D reconstruction. */
(function (root) {
  'use strict';
  var LIMIT = 2000000;
  var RECT = [0.035, 0.02625, 0.965, 0.95625];
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function hash(i) { var x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }
  function lensShareB(i, t, n) {
    var threshold = 0.16 * ((i + 0.5) / n - 0.5) + 0.03 * (hash(i + 1) - 0.5);
    return clamp(0.5 + (t - threshold) / 0.10, 0, 1);
  }
  function rounded(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  var VERT = 'attribute vec2 p; varying vec2 uv; void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'varying vec2 uv; uniform sampler2D a,b; uniform vec2 res; uniform float t,y,foil,lenses,mode,quality;',
    'float rnd(float n){return fract(sin(n*12.9898)*43758.5453);}',
    'vec3 spectrum(float h){return clamp(abs(fract(h+vec3(0.,.6667,.3333))*6.-3.)-1.,0.,1.);}',
    'float box(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}',
    'void main(){',
    ' vec2 px=uv*res; float unit=res.x;',
    ' float outer=box(px-res*.5,res*.5-1.,unit*.037);',
    ' float alpha=clamp(.5-outer,0.,1.);',
    ' vec2 lo=vec2(.035,.02625)*res, hi=vec2(.965,.95625)*res;',
    ' float edge=box(px-(lo+hi)*.5,(hi-lo)*.5,unit*.021);',
    ' vec2 q=clamp((px-lo)/(hi-lo),0.,1.);',
    ' float diagonal=dot(uv-.5,vec2(.85,.527));',
    ' float light=-t*.62+y*.22;',
    ' float d=(diagonal-light)/.17; float glare=exp(-d*d);',
    ' float brush=rnd(floor(px.y*.8));',
    ' vec3 metal=mix(vec3(.50,.51,.53),vec3(.87,.88,.87),.6+(uv.x-.5)*t*.32-uv.y*.1);',
    ' metal+=(brush-.5)*.026+glare*.23;',
    ' metal=mix(metal,metal*(.8+.28*spectrum(diagonal*2.2+t)),foil*glare*.45);',
    ' metal+=.10*exp(-max(-outer,0.)/(unit*.004));',
    ' metal*=1.-.26*exp(-max(edge,0.)/(unit*.004));',
    ' vec3 photo;',
    ' if(mode<.5){',
    '   float lp=q.x*lenses, li=floor(lp), phase=fract(lp);',
    '   float threshold=.16*((li+.5)/lenses-.5)+.035*(q.y-.5)+.03*(rnd(li+1.)-.5);',
    '   float portion=.5+(t-threshold)/.10;',
    '   float aa=lenses/max((hi.x-lo.x),1.);',
    '   float selectB=clamp((portion-phase)/aa+.5,0.,1.);',
    '   float sx=(li+.5+(phase-.5)*.86+t*.08)/lenses;',
    '   vec2 sampleUv=vec2(clamp(sx,0.,1.),q.y);',
    '   photo=mix(texture2D(a,sampleUv).rgb,texture2D(b,sampleUv).rgb,selectB);',
    '   float normal=phase*2.-1.; photo*=1.-.032*normal*normal;',
    '   float spec=max(0.,1.-abs(normal-clamp(t*1.1+y*.15,-.9,.9))/.30);',
    '   photo+=vec3(1.,.99,.97)*spec*spec*spec*(.015+.10*glare);',
    '   photo=1.-(1.-photo)*(1.-spectrum(diagonal*2.6+t*1.2+phase*.1)*glare*.09*foil);',
    ' }else{',
    '   photo=texture2D(a,q).rgb;',
    '   float lum=dot(photo,vec3(.299,.587,.114));',
    '   float h=dot(q,vec2(.9,.55))*1.3+t*.9+y*.45+.025*sin(q.y*37.+q.x*23.);',
    '   float band=exp(-pow((diagonal-light)/.28,2.));',
    '   vec3 color=mix(vec3(1.),spectrum(h),.84)*(.15+.85*band)*(.35+.65*lum)*foil*.60;',
    '   photo=1.-(1.-photo)*(1.-color);',
    '   if(quality>.5){',
    '     vec2 cell=floor(q*vec2(96.,128.)); float r=rnd(cell.x+cell.y*127.1);',
    '     float blink=max(0.,cos(r*41.+t*7.+y*5.)); blink=pow(blink,16.);',
    '     photo+=step(.977,r)*blink*(.2+band)*foil*.40*mix(vec3(1.),spectrum(r*5.+t),.5);',
    '   }',
    '   photo+=vec3(1.,.99,.97)*glare*.09*foil;',
    ' }',
    ' photo*=1.-.08*dot(q-.5,q-.5);',
    ' photo*=1.-.20*exp(min(edge,0.)/(unit*.004));',
    ' vec3 result=mix(metal,photo,clamp(.5-edge,0.,1.));',
    ' gl_FragColor=vec4(clamp(result,0.,1.)*alpha,alpha);',
    '}'
  ].join('\n');

  function TiltRenderer(host, opts) {
    this.host=host; this.options=opts||{}; this.images={a:null,b:null}; this.textures={a:null,b:null};
    this.quality=1; this.dprCap=1.5; this.width=300; this.height=400; this.lenses=100;
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
      this.loc={};['a','b','res','t','y','foil','lenses','mode','quality'].forEach(function(n){self.loc[n]=gl.getUniformLocation(self.program,n);});
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
      if(this.buffer)this.gl.deleteBuffer(this.buffer);if(this.program)this.gl.deleteProgram(this.program);
    }
    this.gl=null;this.textures={a:null,b:null};this.lost=false;this.backend='canvas2d';this.fallbackReason=reason;
    this._canvas();this.ctx=this.canvas.getContext('2d');this._size();this._notify('fallback');
  };
  TiltRenderer.prototype._size=function(){
    var dpr=Math.min(root.devicePixelRatio||1,this.dprCap);
    var w=Math.max(1,Math.round(this.width*dpr)),h=Math.max(1,Math.round(this.height*dpr));
    var budget=this.quality?LIMIT:1000000;
    if(w*h>budget){var scale=Math.sqrt(budget/(w*h));w=Math.floor(w*scale);h=Math.floor(h*scale);}
    this.canvas.width=w;this.canvas.height=h;this.dpr=dpr;this.lenses=Math.max(40,(RECT[2]-RECT[0])*w/(dpr>1.2?4:3));
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
  TiltRenderer.prototype._state=function(s){s=s||{};return{t:clamp(+s.t||0,-1,1),y:clamp(+s.y||0,-1,1),mode:s.mode==='foil'?'foil':'lenticular',foil:clamp(s.foil === undefined ? 0.45 : +s.foil,0,1)};};
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
        gl.uniform2f(l.res,this.canvas.width,this.canvas.height);gl.uniform1f(l.t,s.t);gl.uniform1f(l.y,s.y);
        gl.uniform1f(l.foil,s.foil);gl.uniform1f(l.lenses,this.lenses);gl.uniform1f(l.mode,s.mode==='foil'?1:0);gl.uniform1f(l.quality,this.quality);
        gl.drawArrays(gl.TRIANGLES,0,6);
      }
    }catch(error){this._fallback('render-failed');if(this.ctx)this._draw2d(s);}
    var cost=performance.now()-began;this._lastCost=this._lastCost*.94+cost*.06;
    if(this._lastCost>24){this.degrade();this._lastCost=0;}
    return true;
  };
  TiltRenderer.prototype._draw2d=function(s){
    var ctx=this.ctx;if(!ctx)return;
    var W=this.canvas.width,H=this.canvas.height,x=W*RECT[0],y=H*RECT[1],w=W*(RECT[2]-RECT[0]),h=H*(RECT[3]-RECT[1]);
    ctx.clearRect(0,0,W,H);ctx.save();rounded(ctx,0,0,W,H,W*.037);ctx.clip();
    var metal=ctx.createLinearGradient(0,0,W,H);metal.addColorStop(0,'#e5e7e6');metal.addColorStop(.48,'#a6abae');metal.addColorStop(1,'#c7cbca');ctx.fillStyle=metal;ctx.fillRect(0,0,W,H);
    ctx.save();rounded(ctx,x,y,w,h,W*.021);ctx.clip();ctx.drawImage(this.images.a,x,y,w,h);
    if(s.mode==='lenticular'){
      var n=this.lenses,B=this.images.b,bw=B.width/n,lw=w/n;
      if(s.t>.3)ctx.drawImage(B,x,y,w,h);
      else if(s.t>-.3)for(var i=0;i<Math.ceil(n);i++){var f=lensShareB(i,s.t,n),sw=Math.min(f*bw,B.width-i*bw);if(sw>0)ctx.drawImage(B,i*bw,0,sw,B.height,x+i*lw,y,sw/bw*lw,h);}
      ctx.fillStyle='rgba(0,0,0,.045)';for(var j=1;j<n;j++)ctx.fillRect(x+j*lw,y,.7,h);
    }else{
      var r=ctx.createLinearGradient(x-w*s.t*.4,y,x+w*(1-s.t*.4),y+h);
      ['#e8839b','#ddc376','#92caaf','#6bbbc5','#a99ad7','#dd9aba'].forEach(function(c,i){r.addColorStop(i/5,c);});
      ctx.globalCompositeOperation='screen';ctx.globalAlpha=s.foil*.33;ctx.fillStyle=r;ctx.fillRect(x,y,w,h);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    }
    var center=.5-s.t*.6+s.y*.2,g=ctx.createLinearGradient((center-.25)*W,0,(center+.25)*W,H);
    g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,'rgba(255,255,255,.09)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(x,y,w,h);ctx.restore();ctx.restore();
  };
  TiltRenderer.prototype.snapshot=function(state,width){
    var keepW=this.canvas.width,keepH=this.canvas.height,keepLenses=this.lenses;
    var W=Math.min(1024,width||768),H=Math.round(W*4/3),out=document.createElement('canvas');out.width=W;out.height=H;
    try{this.canvas.width=W;this.canvas.height=H;this.lenses=W*.93/3;if(!this.render(state))throw new Error('卡片还没准备好，请稍后重试');out.getContext('2d').drawImage(this.canvas,0,0);}
    finally{this.canvas.width=keepW;this.canvas.height=keepH;this.lenses=keepLenses;this.render(state);}
    return out;
  };
  TiltRenderer.prototype.degrade=function(){
    if(this.quality){this.quality=0;this.dprCap=1;this._size();this._notify('reduced');return'reduced';}
    if(this.backend==='webgl1'){this._fallback('slow-frames');return'canvas2d';}return'';
  };
  TiltRenderer.prototype.getInfo=function(){return{backend:this.backend,width:this.canvas.width,height:this.canvas.height,dpr:this.dpr,lenses:this.lenses,quality:this.quality,contextLosses:this.contextLosses,fallbackReason:this.fallbackReason};};
  TiltRenderer.WINDOW=RECT.slice();TiltRenderer.MAX_TEXTURE=1024;TiltRenderer.lensShareB=lensShareB;TiltRenderer.roundRectPath=rounded;
  root.TiltRenderer=TiltRenderer;
}(window));
