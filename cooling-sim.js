/* O'Roots — محاكي تبريد الصوبة (مجسم ثلاثي الأبعاد + محاكاة تشغيل المراوح والكروت).
   بيتحمّل لما حد يفتح تاب «محاكي التبريد». الإعدادات (التصميم والأبعاد والمراوح وحرارات التشغيل) بتتخزّن في settings/cooling
   ويظبطها المدير العام بس من الإعدادات. محتاج three.min.js (r128) من vendor/. ده تقدير للمقارنة والتخطيط، ومش بيتحكم في أي جهاز. */
(function(G){
'use strict';
var LAYOUTS=[
 {id:'tunnel',name:'تهوية نفقية',short:'كروت في وش الصوبة ومراوح في ضهرها',stages:1,flow:'x',haf:false,vents:false,},
 {id:'cross',name:'تهوية عرضية',short:'كروت على حيطة ومراوح على الحيطة اللي قدامها',stages:2,flow:'z',haf:false,vents:false,},
 {id:'both',name:'كروت على الجنبين ومراوح في الطرف',short:'الهواء بيدخل من حيطتين وبيتشفط من الطرف',stages:2,flow:'v',haf:false,vents:false,},
 {id:'haf',name:'نفقية + مراوح تقليب (HAF)',short:'نفس النفقية ومعاها مراوح صغيرة تحت القمة',stages:2,flow:'x',haf:true,vents:false,},
 {id:'staged',name:'نفقية على 3 مراحل',short:'المراوح على صفين وتشتغل مرحلة بمرحلة',stages:3,flow:'x',haf:false,vents:false,},
 {id:'hybrid',name:'سقف مفتوح + كروت + مراوح',short:'تهوية طبيعية من السقف الأول ولما تسخن كروت ومراوح',stages:2,flow:'x',haf:false,vents:true,}
];



var LAYOUT_IDS=LAYOUTS.map(function(l){return l.id});
function num(v,d,lo,hi){v=parseFloat(v);if(!isFinite(v))v=d;return Math.max(lo,Math.min(hi,v))}
function sane(c){c=c||{};
  var th=(c.th||[]).slice(0,3).map(function(t){var on=num(t&&t.on,30,18,45),off=num(t&&t.off,on-2,15,44);if(off>=on)off=on-1;return {on:on,off:off}});
  var def=[{on:28,off:26},{on:31,off:29},{on:34,off:32}];while(th.length<3)th.push(def[th.length]);
  var hr0=num(c.hr,5.2,3,8),he=num(c.he,3.2,2.2,5);if(hr0<=he+0.4)hr0=he+0.8;
  return {layout:LAYOUT_IDS.indexOf(c.layout)>=0?c.layout:'tunnel',L:num(c.L,40,10,150),W:num(c.W,9.6,4,18),spans:Math.round(num(c.spans,3,1,8)),fpp:Math.round(num(c.fpp,3,1,6)),
    arr:['row','tri','inv'].indexOf(c.arr)>=0?c.arr:'row',he:he,hr:hr0,cap:num(c.cap,40000,10000,100000),th:th,Tmax:num(c.Tmax,41,28,50),Tmin:num(c.Tmin,24,8,32),RH:num(c.RH,30,10,80)}}
var inst=null;
function loadThree(base){return new Promise(function(res,rej){
  if(G.THREE)return res();
  var s=document.createElement('script');s.src=(base||'')+'vendor/three.min.js';s.onload=function(){G.THREE?res():rej(new Error('three'))};s.onerror=function(){rej(new Error('three'))};document.head.appendChild(s)})}
function mount(host,cfg0,opts){
  opts=opts||{};if(inst){try{inst.destroy()}catch(e){}inst=null}
  if(!G.THREE)throw new Error('THREE not loaded');
  var cfg=sane(cfg0),dead=false,raf=0,THREE=G.THREE;
  var $=function(s){return host.querySelector(s)};
  var fmt=function(n,d){return Number(n).toLocaleString('en-US',{maximumFractionDigits:d==null?0:d,minimumFractionDigits:d==null?0:d})};
  var css=function(v){return getComputedStyle(host).getPropertyValue(v).trim()};
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

var S={layout:cfg.layout,L:cfg.L,W:cfg.W,spans:cfg.spans,fpp:cfg.fpp,arr:cfg.arr,he:cfg.he,hr:cfg.hr,cap:cfg.cap,time:new Date().getHours()*60,playing:!reduce,speed:3,Tmax:cfg.Tmax,Tmin:cfg.Tmin,RH:cfg.RH,mode:'auto',
  th:cfg.th,air:true,heat:true,rot:false,cam:'iso'};
var C={stage:0,pad:false,haf:false,vent:0,Ti:cfg.Tmin+3,kwh:0,water:0,hist:[],lastRec:-99};
var D=null;

  host.classList.add('cs-root');
  host.innerHTML=
  '<div class="cs-bar"><div><b class="cs-lname"></b><div class="cs-ldesc"></div></div><div class="cs-dims num" id="cs-dims"></div></div>'+
  '<div class="cs-main"><div class="cs-col">'+
    '<div class="cs-stage" id="cs-stage"><div class="cs-hud"><span class="cs-chip" id="cs-hudTime"></span><span class="cs-chip" id="cs-hudState"></span></div>'+
    '<div class="cs-cams" id="cs-cams"><button type="button" data-c="iso" aria-pressed="true">مجسم</button><button type="button" data-c="top" aria-pressed="false">من فوق</button><button type="button" data-c="side" aria-pressed="false">من الجنب</button><button type="button" data-c="in" aria-pressed="false">من جوه</button><button type="button" data-c="fan" aria-pressed="false">قرّب المراوح</button><button type="button" data-c="pad" aria-pressed="false">قرّب الكروت</button>'+
    '<button type="button" class="cs-t" id="cs-tAir" aria-pressed="true">هواء</button><button type="button" class="cs-t" id="cs-tHeat" aria-pressed="true">خريطة حرارة</button><button type="button" class="cs-t" id="cs-tRot" aria-pressed="false">دوران</button></div></div>'+
    '<div class="cs-panel"><h3>يوم كامل: الحرارة وتشغيل المراحل</h3><canvas id="cs-chart" class="cs-chart" role="img" aria-label="رسم حرارة اليوم ومراحل التشغيل"></canvas>'+
    '<div class="cs-legend"><span>أبرد</span><i></i><span>أسخن (خريطة حرارة أرضية الصوبة)</span></div></div>'+
  '</div><div class="cs-col">'+
    '<div class="cs-panel"><h3>الوقت والجو برّه</h3><div class="cs-actions"><button type="button" class="cs-t" id="cs-play" aria-pressed="true">⏸ إيقاف</button>'+
    '<button type="button" class="cs-t" data-sp="1" aria-pressed="false">بطيء</button><button type="button" class="cs-t" data-sp="3" aria-pressed="true">عادي</button><button type="button" class="cs-t" data-sp="8" aria-pressed="false">سريع</button></div>'+
    '<div class="cs-row"><label for="cs-time">الساعة</label><output id="cs-oTime"></output><input type="range" id="cs-time" min="0" max="1439" step="5"></div>'+
    '<div class="cs-row"><label for="cs-Tmax">أقصى حرارة برّه</label><output id="cs-oTmax"></output><input type="range" id="cs-Tmax" min="28" max="50" step="1"></div>'+
    '<div class="cs-row"><label for="cs-Tmin">أقل حرارة برّه</label><output id="cs-oTmin"></output><input type="range" id="cs-Tmin" min="8" max="32" step="1"></div>'+
    '<div class="cs-row"><label for="cs-RH">رطوبة النهار</label><output id="cs-oRH"></output><input type="range" id="cs-RH" min="10" max="80" step="1"></div></div>'+
    '<div class="cs-panel"><h3>التشغيل</h3><div class="cs-actions" id="cs-qm"><button type="button" class="cs-t" data-m="on" aria-pressed="false">شغّل المراوح والكروت</button><button type="button" class="cs-t" data-m="off" aria-pressed="false">فصل الكل</button><button type="button" class="cs-t" data-m="auto" aria-pressed="true">تلقائي</button></div>'+
    '<div id="cs-ths" class="cs-ths"></div></div>'+
    '<div class="cs-panel"><h3>الأرقام دلوقتي</h3><p class="cs-note" id="cs-fanNote"></p><div class="cs-kpis" id="cs-kpis"></div></div>'+
  '</div></div>'+
  '<p class="cs-note">محاكاة تقريبية للمقارنة والتخطيط، مش قياس حقيقي ومش بتتحكم في أي مروحة فعلًا.</p>';
/* ===== حسابات التصميم ===== */
function design(lay,o){
  var L=o.L,W=o.W*o.spans,he=o.he,hr=o.hr,havg=he+(hr-he)*0.62,vol=L*W*havg;
  var Vreq=vol*60*0.9,nReq=Math.max(2,Math.ceil(Vreq/o.cap)),n=(lay.flow==='z')?nReq:o.spans*o.fpp,V=n*o.cap,padArea=V/3600/1.5;
  var spd,note;
  if(lay.flow==='x'){spd=V/3600/(W*havg)}else if(lay.flow==='z'){spd=V/3600/(L*havg)}else{spd=V/3600/(W*havg)*0.8}
  if(lay.haf)spd+=0.25;
  var padH=lay.flow==='x'?Math.min(he-0.6,Math.max(1.2,padArea/(W-0.6))):1.6;
  var padLen=lay.flow==='x'?W-0.6:Math.min(L-3,padArea/(lay.flow==='v'?2:1)/padH);
  var A=L*W,Qs=0.5*850*A,dT=Qs/(1210*V/3600);
  var kw=n*1.1+(lay.haf?Math.max(o.spans,Math.round(L/10))*0.25:0)+0.75;
  return {vol:vol,n:n,nReq:nReq,V:V,padArea:padArea,padH:padH,padLen:padLen,spd:spd,dT:Math.min(9,dT),acm:V/60/vol,kw:kw,A:A,havg:havg};
}

/* ===== الجو ===== */
function envAt(h){
  var To=S.Tmin+(S.Tmax-S.Tmin)*0.5*(1-Math.cos(2*Math.PI*(h-3)/24));
  var frac=(To-S.Tmin)/Math.max(1,S.Tmax-S.Tmin),RH=Math.min(96,S.RH+(1-frac)*0.5*(100-S.RH));
  var G=(h>6&&h<18)?850*Math.sin(Math.PI*(h-6)/12):0;
  var Tw=To*Math.atan(0.151977*Math.sqrt(RH+8.313659))+Math.atan(To+RH)-Math.atan(RH-1.676331)+0.00391838*Math.pow(RH,1.5)*Math.atan(0.023101*RH)-4.686035;
  return {To:To,RH:RH,G:G,Tw:Tw};
}

/* ===== التحكم والفيزياء ===== */
function nStages(){return LAYOUTS.filter(function(l){return l.id===S.layout})[0].stages}
function activeFans(){var c=0;if(dyn.fans)dyn.fans.forEach(function(f){if(f.stage<C.stage)c++});return c}
function step(dtMin){
  var lay=cur(),h=S.time/60,env=envAt(h),ns=lay.stages,Ti=C.Ti;
  if(S.mode==='on'){C.stage=ns;C.pad=true;C.haf=lay.haf;C.vent=0}
  else if(S.mode==='off'){C.stage=0;C.pad=false;C.haf=false;C.vent=0}
  else{
    var st=0;for(var k=0;k<ns;k++){var on=(C.stage>k)?Ti>S.th[k].off:Ti>=S.th[k].on;if(on)st=k+1;else break}
    C.stage=st;C.pad=st>=1&&env.RH<88;
    C.haf=lay.haf&&(C.haf?Ti>S.th[0].off-2:Ti>=S.th[0].on-2);
    C.vent=(lay.vents&&st===0&&Ti>=S.th[0].off-1)?1:0;
  }
  var Vact=(lay.vents&&C.vent?0.3:0.03)*D.V+activeFans()*S.cap;
  var sup=C.pad?env.To-0.75*(env.To-env.Tw):env.To;
  var Qs=0.5*env.G*D.A,dT=Qs/(1210*Vact/3600);
  var closed=env.To+12*env.G/850;
  var eq=Math.min(closed,sup+Math.min(dT,25));
  C.Ti+=(eq-C.Ti)*(1-Math.exp(-dtMin/14));
  var water=C.pad?1.15*(Vact/3600)*(1005*(env.To-sup)/2.45e6)*3600:0;
  C.water+=water*dtMin/60;
  var kw=activeFans()*1.1+(C.haf?dyn.haf.length*0.25:0)+(C.pad?0.75:0)+(C.vent?0.4:0);
  C.kwh+=kw*dtMin/60;
  C.env=env;C.Vact=Vact;C.sup=sup;C.dT=Math.min(dT,9);C.kw=kw;C.water_h=water;
  if(S.time-C.lastRec>=5||S.time<C.lastRec){C.hist.push({t:S.time,To:env.To,Ti:C.Ti,st:C.stage,pad:C.pad});C.lastRec=S.time}
}
function cur(){return LAYOUTS.filter(function(l){return l.id===S.layout})[0]}

/* ===== المجسم ===== */
var stage=$('#cs-stage'),renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));stage.insertBefore(renderer.domElement,stage.firstChild);
var scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1.6,0.1,500);
scene.add(new THREE.HemisphereLight(0xffffff,0x6b7a6e,0.95));
var sun=new THREE.DirectionalLight(0xffffff,0.8);sun.position.set(-30,50,20);scene.add(sun);
var root=new THREE.Group();scene.add(root);
var dyn={},labels=[];
var cam={th:-0.9,ph:1.0,r:70,tx:0,ty:1.5,tz:0,goal:null};
var M={};
function mat(c,o){return new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:0.7,metalness:0.1},o||{}))}

function padTexture(){
  var c=document.createElement('canvas');c.width=128;c.height=128;var g=c.getContext('2d');
  g.fillStyle='#C9A25B';g.fillRect(0,0,128,128);
  for(var i=0;i<128;i+=8){g.fillStyle=i%16?'#B98B43':'#D9B570';g.fillRect(i,0,4,128)}
  g.strokeStyle='rgba(90,60,20,.35)';g.lineWidth=1;for(var j=-128;j<256;j+=10){g.beginPath();g.moveTo(j,0);g.lineTo(j+128,128);g.stroke()}
  var t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
var padTex=padTexture();

function totW(){return S.W*S.spans}
function spanC(i){return -totW()/2+S.W*(i+0.5)}
function archY(z){var W=S.W,zl=((z+totW()/2)%W+W)%W-W/2;return S.he+(S.hr-S.he)*Math.sqrt(Math.max(0,1-Math.pow(2*zl/W,2)))}
function profile(){var p=[],N=30,T=totW();p.push([-T/2,0]);for(var s=0;s<S.spans;s++){for(var i=(s?1:0);i<=N;i++){var z=-T/2+S.W*s+S.W*i/N;p.push([z,(i===N||i===0)?S.he:archY(z)])}}p.push([T/2,0]);return p}

function mkFan(d){
  var g=new THREE.Group(),steel=mat(0x6c7a72,{metalness:0.5});
  [[0,d/2+0.05,d+0.2,0.1],[0,-d/2-0.05,d+0.2,0.1]].forEach(function(b){var m=new THREE.Mesh(new THREE.BoxGeometry(b[2],b[3],0.42),steel);m.position.set(b[0],b[1],0);g.add(m)});
  [[d/2+0.05],[-d/2-0.05]].forEach(function(b){var m=new THREE.Mesh(new THREE.BoxGeometry(0.1,d,0.42),steel);m.position.set(b[0],0,0);g.add(m)});
  var disc=new THREE.Mesh(new THREE.CircleGeometry(d/2,28),new THREE.MeshBasicMaterial({color:0x101512,side:THREE.DoubleSide}));disc.position.z=-0.05;g.add(disc);
  var rotor=new THREE.Group();rotor.position.z=0.02;
  rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(d*0.07,d*0.07,0.16,14).rotateX(Math.PI/2),steel));
  for(var i=0;i<5;i++){var arm=new THREE.Group();arm.rotation.z=i*Math.PI*2/5;
    var bl=new THREE.Mesh(new THREE.BoxGeometry(d*0.4,d*0.1,0.015),mat(0xcfd6d2,{metalness:0.3}));bl.position.x=d*0.26;bl.rotation.x=0.5;arm.add(bl);rotor.add(arm)}
  g.add(rotor);
  var sh=[],ns=6;for(var k=0;k<ns;k++){var piv=new THREE.Group();piv.position.set(0,-d/2+d*(k+0.5)/ns,0.26);
    var sl=new THREE.Mesh(new THREE.BoxGeometry(d,d/ns*0.95,0.012),mat(0x9aa7a0));piv.add(sl);g.add(piv);sh.push(piv)}
  var blur=new THREE.Mesh(new THREE.CircleGeometry(d*0.5,32),new THREE.MeshBasicMaterial({color:0xdfe7e3,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));blur.position.z=0.05;g.add(blur);
  var lamp=new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.05,d*0.07),10,10),new THREE.MeshBasicMaterial({color:0xc23b2b}));lamp.position.set(d/2+0.05,d/2+0.2,0.25);g.add(lamp);
  var st=[];for(var q=0;q<7;q++){var sm=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.03,0.9),new THREE.MeshBasicMaterial({color:0x9fdcf5,transparent:true,opacity:0,depthWrite:false}));var a2=q/7*Math.PI*2,rr=d*0.32*(0.4+(q%3)*0.3);sm.userData={x:Math.cos(a2)*rr,y:Math.sin(a2)*rr,t:q/7};g.add(sm);st.push(sm)}
  return {g:g,rotor:rotor,sh:sh,omega:0,blur:blur,lamp:lamp,st:st};
}

function build(){
  while(root.children.length){var o=root.children.pop();o.traverse(function(x){if(x.geometry)x.geometry.dispose()})}
  dyn={fans:[],haf:[],pads:[],vents:[],src:[],dst:[]};labels=[].concat(labels.splice(0).map(function(l){l.el.remove();return null}).filter(Boolean));
  var lay=cur(),L=S.L,W=totW(),he=S.he,hr=S.hr,frameC=new THREE.Color(css('--frame')||'#3e4d44');
  D=design(lay,S);
  /* الأرض */
  var ground=new THREE.Mesh(new THREE.PlaneGeometry(L+60,W+60),mat(new THREE.Color(css('--scene')).offsetHSL(0,0,-0.03).getHex(),{roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-0.02;root.add(ground);
  /* خريطة الحرارة */
  dyn.hc=document.createElement('canvas');dyn.hc.width=96;dyn.hc.height=24;dyn.ht=new THREE.CanvasTexture(dyn.hc);dyn.ht.magFilter=THREE.LinearFilter;
  var floor=new THREE.Mesh(new THREE.PlaneGeometry(L,W),new THREE.MeshBasicMaterial({map:dyn.ht,transparent:true,opacity:0.9}));floor.rotation.x=-Math.PI/2;floor.position.y=0.01;root.add(floor);dyn.floor=floor;
  /* الغطاء */
  var P=profile(),pos=[],idx=[];
  for(var i=0;i<P.length;i++){pos.push(-L/2,P[i][1],P[i][0],L/2,P[i][1],P[i][0])}
  for(var j=0;j<P.length-1;j++){var a=j*2,b=a+1,c=a+2,d2=a+3;idx.push(a,c,b,b,c,d2)}
  var gc=new THREE.BufferGeometry();gc.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));gc.setIndex(idx);gc.computeVertexNormals();
  var coverM=new THREE.MeshStandardMaterial({color:0xdff3ee,transparent:true,opacity:0.2,side:THREE.DoubleSide,roughness:0.2,depthWrite:false});
  root.add(new THREE.Mesh(gc,coverM));
  [-1,1].forEach(function(s){var sh=new THREE.Shape();P.forEach(function(p,i){i?sh.lineTo(p[0],p[1]):sh.moveTo(p[0],p[1])});
    var gm=new THREE.Mesh(new THREE.ShapeGeometry(sh),new THREE.MeshStandardMaterial({color:0xdff3ee,transparent:true,opacity:0.12,side:THREE.DoubleSide,depthWrite:false}));
    gm.rotation.y=Math.PI/2;gm.position.x=s*L/2;root.add(gm)});
  var lp=[];var bays=Math.max(2,Math.round(L/3));
  for(var q=0;q<=bays;q++){var x=-L/2+L*q/bays;for(var m=0;m<P.length-1;m++){lp.push(x,P[m][1],P[m][0],x,P[m+1][1],P[m+1][0])}}
  for(var sp=0;sp<=S.spans;sp++){var zg=-W/2+S.W*sp;lp.push(-L/2,he,zg,L/2,he,zg);if(sp<S.spans){var zr0=spanC(sp);lp.push(-L/2,hr,zr0,L/2,hr,zr0)}}
  var lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.Float32BufferAttribute(lp,3));
  root.add(new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color:frameC,transparent:true,opacity:0.55})));
  /* مراقد الزراعة */
  var beds=Math.max(3,Math.floor((W-1.6)/1.5)),bm=mat(0xe8ece9),gm2=mat(0x4fae57,{roughness:1});
  for(var r=0;r<beds;r++){var z=-W/2+0.9+(W-1.8)*(r+0.5)/beds,bl=L-9;
    var bed=new THREE.Mesh(new THREE.BoxGeometry(bl,0.1,0.32),bm);bed.position.set(0.5,0.85,z);root.add(bed);
    var gr=new THREE.Mesh(new THREE.BoxGeometry(bl-0.2,0.2,0.26),gm2);gr.position.set(0.5,1.0,z);root.add(gr);
    [-1,1].forEach(function(e){var lg2=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.85,0.06),bm);lg2.position.set(0.5+e*(bl/2-0.3),0.42,z);root.add(lg2)})}
  /* مواد الكروت */
  var padM=new THREE.MeshStandardMaterial({map:padTex.clone(),roughness:0.9});padM.map.needsUpdate=true;
  function addPad(cx,cy,cz,w,h,axis,flip){ /* axis x: لوح عمودي على x (وش الصوبة) | z: على الطول */
    var m=padM.clone();m.map=padTex.clone();m.map.repeat.set(Math.max(1,w/1.2),Math.max(1,h/1.2));m.map.needsUpdate=true;
    var pad=new THREE.Mesh(new THREE.BoxGeometry(axis==='x'?0.16:w,h,axis==='x'?w:0.16),m);pad.position.set(cx,cy,cz);root.add(pad);
    var tr=new THREE.Mesh(new THREE.BoxGeometry(axis==='x'?0.45:w+0.2,0.16,axis==='x'?w+0.2:0.45),mat(0x2b6f9e));tr.position.set(cx+(axis==='x'?flip*0.12:0),0.08,cz+(axis==='z'?flip*0.12:0));root.add(tr);
    var pipe=new THREE.Mesh(new THREE.BoxGeometry(axis==='x'?0.08:w,0.08,axis==='x'?w:0.08),mat(0x5a6b74));pipe.position.set(cx+(axis==='x'?flip*0.15:0),cy+h/2+0.1,cz+(axis==='z'?flip*0.15:0));root.add(pipe);
    var N=Math.round(w*h*2.5),pa=new Float32Array(N*3),spd=[];
    for(var i=0;i<N;i++){var u=(Math.random()-0.5)*w,y=Math.random()*h;
      pa[i*3]=axis==='x'?cx+flip*0.2:cx+u;pa[i*3+1]=cy-h/2+y;pa[i*3+2]=axis==='x'?cz+u:cz+flip*0.2;spd.push(0.6+Math.random()*0.8)}
    var dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(pa,3));
    var dm=new THREE.PointsMaterial({color:0x5db3ff,size:0.11,transparent:true,opacity:0});var dr=new THREE.Points(dg,dm);root.add(dr);
    var fc=document.createElement('canvas');fc.width=64;fc.height=128;var fg=fc.getContext('2d');for(var s2=0;s2<26;s2++){fg.fillStyle='rgba(120,190,245,'+(0.25+Math.random()*0.5)+')';fg.fillRect(Math.random()*62,Math.random()*128,1.5+Math.random()*2,18+Math.random()*50)}
    var ft=new THREE.CanvasTexture(fc);ft.wrapS=ft.wrapT=THREE.RepeatWrapping;ft.repeat.set(Math.max(2,w/0.5),Math.max(1,h/1.2));
    var fm=new THREE.MeshBasicMaterial({map:ft,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
    var film=new THREE.Mesh(new THREE.PlaneGeometry(w,h),fm);film.position.set(cx+(axis==='x'?-flip*0.09:0),cy,cz+(axis==='z'?-flip*0.09:0));if(axis==='x')film.rotation.y=Math.PI/2;root.add(film);
    dyn.pads.push({m:m,drips:dr,dm:dm,fm:fm,ft:ft,spd:spd,y0:cy-h/2,y1:cy+h/2,N:N});
    dyn.src.push({axis:axis,cx:cx,cy:cy,cz:cz,w:w,h:h,flip:flip});
  }
  var padH=D.padH,fansPos=[],d=1.3;
  function endFans(){var dd2=Math.max(0.7,Math.min(1.3,(S.W-0.8)/(S.arr==='row'?S.fpp:Math.ceil(S.fpp/2))-0.9)),per=S.fpp,lo=S.arr==='row'?per:(S.arr==='tri'?Math.ceil(per/2):Math.floor(per/2)),hi=per-lo;
    for(var s=0;s<S.spans;s++){var zc=spanC(s),k=0;
      [[lo,S.arr==='row'?1.8:0.95],[hi,2.95]].forEach(function(r){var m=r[0];for(var i=0;i<m;i++){var zz=zc+(i-(m-1)/2)*Math.min(dd2+0.9,(S.W-0.8)/Math.max(m,1));fansPos.push({p:new THREE.Vector3(L/2+0.22,r[1],zz),ry:Math.PI/2,st:lay.stages>1?(k%lay.stages):0,d:dd2});k++}})}}
  if(lay.flow==='x'){addPad(-L/2-0.14,padH/2+0.2,0,W-0.6,padH,'x',-1);
    mkLabel('خلايا التبريد',new THREE.Vector3(-L/2-0.4,padH+0.6,0),'c');
    endFans();
    mkLabel('مراوح الشفط',new THREE.Vector3(L/2+1.2,4.1,0),'h');
  }else if(lay.flow==='z'){
    addPad(0,padH/2+0.2,-W/2-0.14,D.padLen,padH,'z',-1);mkLabel('خلايا التبريد',new THREE.Vector3(0,padH+0.7,-W/2-0.5),'c');
    for(var f2=0;f2<D.n;f2++){var xx=-L/2+2+(L-4)*(f2+0.5)/D.n;fansPos.push({p:new THREE.Vector3(xx,1.7,W/2+0.22),ry:0,st:Math.floor(f2*lay.stages/D.n)})}
    mkLabel('مراوح الشفط',new THREE.Vector3(0,3.9,W/2+0.6),'h');
  }else{
    var half=D.padArea/2,pl=Math.min(L-3,half/1.6);
    addPad(0,1.0,-W/2-0.14,pl,1.6,'z',-1);addPad(0,1.0,W/2+0.14,pl,1.6,'z',1);
    mkLabel('كروت',new THREE.Vector3(0,2.5,-W/2-0.5),'c');mkLabel('كروت',new THREE.Vector3(0,2.5,W/2+0.5),'c');
    endFans();
    mkLabel('مراوح الشفط',new THREE.Vector3(L/2+1.2,4.1,0),'h');
  }
  fansPos.forEach(function(fp){var fan=mkFan(fp.d||d);fan.g.position.copy(fp.p);fan.g.rotation.y=fp.ry;root.add(fan.g);fan.stage=fp.st;fan.pos=fp.p.clone();dyn.fans.push(fan)});
  /* مراوح التقليب */
  if(lay.haf){var nh=Math.max(S.spans,Math.round(L/10));for(var hf=0;hf<nh;hf++){
      var hx=-L/2+L*(hf+0.5)/nh,hz=spanC(hf%S.spans),hy=archY(hz)-0.55,fan=mkFan(0.55);fan.g.scale.set(1,1,1);fan.g.position.set(hx,hy,hz);fan.g.rotation.y=hf%2?-Math.PI/2:Math.PI/2;root.add(fan.g);dyn.haf.push(fan)}
    mkLabel('مراوح تقليب',new THREE.Vector3(0,hr+0.7,0),'h')}
  /* فتحات السقف */
  if(lay.vents){for(var sv=0;sv<S.spans;sv++)[-1,1].forEach(function(s){var piv=new THREE.Group(),zr=spanC(sv)+s*0.55,yr=archY(zr)+0.02;piv.position.set(0,yr,zr);
      var fl=new THREE.Mesh(new THREE.BoxGeometry(L*0.86,0.04,0.95),mat(0xb8d6cf,{transparent:true,opacity:0.8}));fl.position.z=s*0.5;piv.add(fl);root.add(piv);dyn.vents.push({piv:piv,s:s,a:0})});
    mkLabel('فتحات السقف',new THREE.Vector3(0,hr+1.1,0),'c')}
  /* جسيمات الهواء */
  var NP=reduce?240:520;dyn.NP=NP;dyn.pp=new Float32Array(NP*3);dyn.pc=new Float32Array(NP*3);dyn.pt=[];dyn.ps=[];dyn.pd=[];dyn.pk=[];
  var pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(dyn.pp,3));pg.setAttribute('color',new THREE.BufferAttribute(dyn.pc,3));
  dyn.pts=new THREE.Points(pg,new THREE.PointsMaterial({size:0.17,vertexColors:true,transparent:true,opacity:0.85,depthWrite:false}));root.add(dyn.pts);
  for(var k=0;k<NP;k++){dyn.pt.push(Math.random());dyn.ps.push(new THREE.Vector3());dyn.pd.push(new THREE.Vector3());dyn.pk.push(0.7+Math.random()*0.6);respawn(k,true)}
  dyn.floorT=0;
  setCam(S.cam,true);
}
function mkLabel(t,v,k){var el=document.createElement('div');el.className='cs-lbl '+(k||'');el.textContent=t;stage.appendChild(el);labels.push({el:el,v:v})}
function pickFan(){return dyn.fans.length?dyn.fans[Math.floor(Math.random()*dyn.fans.length)].pos:new THREE.Vector3(S.L/2,1.6,0)}
function respawn(k,init){
  var s=dyn.ps[k],d=dyn.pd[k],lay=cur(),vent=C.vent&&C.stage===0;
  if(!init)dyn.pt[k]=0;
  if(vent){s.set((Math.random()-0.5)*S.L*0.8,0.5+Math.random()*1.2,(Math.random()-0.5)*S.W*0.8);d.set(s.x+(Math.random()-0.5)*3,S.hr+2.5,(Math.random()-0.5)*1.5);return}
  var ps=dyn.src[Math.floor(Math.random()*dyn.src.length)];
  if(!ps){return}
  if(ps.axis==='x')s.set(ps.cx-1.2,0.5+Math.random()*ps.h,ps.cz+(Math.random()-0.5)*ps.w);
  else s.set(ps.cx+(Math.random()-0.5)*ps.w,0.5+Math.random()*ps.h*1.2,ps.cz+ps.flip*(-1.2));
  var f=pickFan();d.set(f.x-0.4,f.y+(Math.random()-0.5)*0.8,f.z+(Math.random()-0.5)*0.9);
}
function camAt(L,W,w){var fl=cur().flow,rr=Math.max(10,W*0.5);
  if(w==='fan')return fl==='z'?{th:Math.PI/2+0.4,ph:1.35,r:rr,tx:0,ty:2,tz:W/2}:{th:0.4,ph:1.35,r:rr,tx:L/2,ty:2,tz:0};
  return fl==='x'?{th:Math.PI-0.4,ph:1.35,r:rr,tx:-L/2,ty:1.6,tz:0}:{th:-Math.PI/2-0.4,ph:1.35,r:rr,tx:0,ty:1.6,tz:-W/2}}
function setCam(c,instant){
  S.cam=c;var L=S.L,W=totW(),r=Math.max(L,W*2.2);
  var g={iso:{th:-0.85,ph:1.0,r:r*1.05+16,tx:0,ty:1.5,tz:0},top:{th:-Math.PI/2,ph:0.06,r:r*1.1+14,tx:0,ty:0,tz:0},side:{th:-Math.PI/2,ph:1.45,r:r*1.0+14,tx:0,ty:1.5,tz:0},in:{th:Math.PI,ph:1.5,r:2,tx:L*0.28,ty:1.9,tz:0},fan:camAt(L,W,'fan'),pad:camAt(L,W,'pad')}[c];
  if(c==='in'){cam.goal={th:-Math.PI/2+Math.PI,ph:1.52,r:0.01,tx:-L/2+3,ty:1.9,tz:0,look:1}}
  else cam.goal=g;
  if(instant&&cam.goal){Object.assign(cam,cam.goal);cam.goal=null}
  document.querySelectorAll('#cams [data-c]').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.c===c)});
}
function placeCam(){
  var look=cam.look;
  if(cam.inside){camera.position.set(cam.tx,cam.ty,cam.tz);camera.lookAt(cam.tx+20,cam.ty-0.2,cam.tz);return}
  var sp=Math.sin(cam.ph);camera.position.set(cam.tx+cam.r*sp*Math.cos(cam.th),cam.ty+cam.r*Math.cos(cam.ph),cam.tz+cam.r*sp*Math.sin(cam.th));camera.lookAt(cam.tx,cam.ty,cam.tz);
}
/* تحريك الكاميرا ناحية الهدف */
function camStep(){
  if(!cam.goal)return;var g=cam.goal,k=0.12,done=true;
  ['th','ph','r','tx','ty','tz'].forEach(function(p){var dv=g[p]-cam[p];if(Math.abs(dv)>0.01)done=false;cam[p]+=dv*k});
  cam.inside=!!g.look;if(done){Object.assign(cam,g);cam.goal=null}
}
/* سحب وتكبير */
(function(){var pts={},last=0;
  stage.addEventListener('pointerdown',function(e){if(e.target.closest('button'))return;stage.setPointerCapture(e.pointerId);pts[e.pointerId]=[e.clientX,e.clientY]});
  stage.addEventListener('pointermove',function(e){if(!pts[e.pointerId])return;var p=pts[e.pointerId],ids=Object.keys(pts);
    if(ids.length===2){var o=pts[ids.filter(function(i){return i!=e.pointerId})[0]];var d0=Math.hypot(p[0]-o[0],p[1]-o[1]);pts[e.pointerId]=[e.clientX,e.clientY];var d1=Math.hypot(e.clientX-o[0],e.clientY-o[1]);cam.r=Math.max(6,Math.min(300,cam.r*d0/Math.max(1,d1)));return}
    if(cam.inside){cam.inside=false;cam.goal=null;setCam('iso',true)}
    cam.th+=(e.clientX-p[0])*0.008;cam.ph=Math.max(0.05,Math.min(1.5,cam.ph-(e.clientY-p[1])*0.006));pts[e.pointerId]=[e.clientX,e.clientY];cam.goal=null;
    document.querySelectorAll('#cams [data-c]').forEach(function(b){b.setAttribute('aria-pressed','false')})});
  var up=function(e){delete pts[e.pointerId]};stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);
  stage.addEventListener('wheel',function(e){e.preventDefault();cam.r=Math.max(6,Math.min(300,cam.r*(1+e.deltaY*0.001)));if(cam.inside){cam.inside=false;setCam('iso',true)}},{passive:false});
})();

/* ===== خريطة الحرارة ===== */
function heatColor(t){var st=[[18,[47,158,158]],[28,[231,225,200]],[36,[232,128,58]],[44,[194,59,43]]];t=Math.max(18,Math.min(44,t));
  for(var i=0;i<3;i++){if(t<=st[i+1][0]){var a=st[i],b=st[i+1],f=(t-a[0])/(b[0]-a[0]);return[0,1,2].map(function(k){return Math.round(a[1][k]+(b[1][k]-a[1][k])*f)})}}return st[3][1]}
function drawHeat(){
  var lay=cur(),c=dyn.hc,g=c.getContext('2d'),w=c.width,h=c.height,img=g.createImageData(w,h);
  var spread=(C.Vact>D.V*0.1)?Math.max(0.8,C.dT):1.5;if(lay.haf)spread*=0.55;
  for(var y=0;y<h;y++)for(var x=0;x<w;x++){
    var u=x/(w-1),v=y/(h-1),f=lay.flow==='x'?u:(lay.flow==='z'?v:0.5*u+0.5*(1-Math.abs(2*v-1)));
    var T=C.Ti+(f-0.5)*spread,col=heatColor(T),i=(y*w+x)*4;img.data[i]=col[0];img.data[i+1]=col[1];img.data[i+2]=col[2];img.data[i+3]=255}
  g.putImageData(img,0,0);dyn.ht.needsUpdate=true;
}

/* ===== حركة المشهد ===== */
var clock=new THREE.Clock(),acc=0;
function animate(){
  if(dead)return;raf=requestAnimationFrame(animate);
  var dt=Math.min(0.05,clock.getDelta());if(!host.offsetParent)return;
  if(S.playing){var dm=dt*S.speed*6;S.time+=dm;if(S.time>=1440){S.time-=1440;C.hist.length=0;C.lastRec=-99;C.kwh=0;C.water=0}step(dm);acc+=dt}
  else if(!C.env)step(0.001);
  camStep();if(S.rot&&!cam.inside&&!cam.goal)cam.th+=dt*0.15;placeCam();
  /* مراوح */
  dyn.fans.forEach(function(f){var on=f.stage<C.stage||(S.mode==='on');on=S.mode==='on'?true:(S.mode==='off'?false:f.stage<C.stage||(cur().stages===1&&C.stage>=1));
    f.omega+=((on?16:0)-f.omega)*Math.min(1,dt*2.2);f.rotor.rotation.z-=f.omega*dt;
    var kk=Math.min(1,f.omega/16);f.blur.material.opacity=0.3*kk;f.lamp.material.color.setHex(on?0x3ddc84:0xc23b2b);
    f.st.forEach(function(m){m.userData.t=(m.userData.t+dt*0.9*kk)%1;var t=m.userData.t;m.position.set(m.userData.x,m.userData.y,0.4+t*2.8);m.material.opacity=kk*0.6*(1-t)});
    f.sh.forEach(function(p){var tgt=on?1.25:0.04;p.rotation.x+=(tgt-p.rotation.x)*Math.min(1,dt*4)})});
  dyn.haf.forEach(function(f){f.omega+=((C.haf?18:0)-f.omega)*Math.min(1,dt*2);f.rotor.rotation.z-=f.omega*dt;f.blur.material.opacity=0.3*Math.min(1,f.omega/18);f.lamp.material.color.setHex(C.haf?0x3ddc84:0xc23b2b)});
  dyn.vents.forEach(function(v){v.a+=(((C.vent?0.62:0)-v.a))*Math.min(1,dt*1.6);v.piv.rotation.x=-v.s*v.a});
  /* كروت: ماية */
  dyn.pads.forEach(function(p){var w=C.pad?1:0;p.dm.opacity+=(w*0.9-p.dm.opacity)*Math.min(1,dt*3);p.fm.opacity+=(w*0.6-p.fm.opacity)*Math.min(1,dt*3);p.ft.offset.y-=dt*0.9*w;
    p.m.color.lerp(new THREE.Color(w?0x7fb2dc:0xffffff),Math.min(1,dt*2));
    var a=p.drips.geometry.attributes.position;for(var i=0;i<p.N;i++){var y=a.getY(i)-dt*p.spd[i]*(w?1.4:0);if(y<p.y0)y=p.y1;a.setY(i,y)}a.needsUpdate=true});
  /* جسيمات الهواء */
  var flow=S.air?Math.min(1,C.Vact/D.V):0,vent=C.vent&&C.stage===0;
  dyn.pts.visible=S.air&&(flow>0.08||vent);
  if(dyn.pts.visible){var pp=dyn.pp,pc=dyn.pc,rate=vent?0.18:Math.max(0.12,flow);
    for(var k=0;k<dyn.NP;k++){var t=dyn.pt[k]+dt*rate*dyn.pk[k]*0.5;if(t>=1){respawn(k);t=0}dyn.pt[k]=t;
      var s=dyn.ps[k],d=dyn.pd[k],e=t;pp[k*3]=s.x+(d.x-s.x)*e;pp[k*3+1]=s.y+(d.y-s.y)*e+Math.sin(Math.PI*e)*0.35;pp[k*3+2]=s.z+(d.z-s.z)*e;
      var warm=vent?e*0.6:Math.min(1,e*(C.dT/6+0.3));pc[k*3]=0.25+0.75*warm;pc[k*3+1]=0.7-0.25*warm;pc[k*3+2]=1-0.8*warm}
    dyn.pts.geometry.attributes.position.needsUpdate=true;dyn.pts.geometry.attributes.color.needsUpdate=true}
  dyn.floor.visible=S.heat;dyn.floorT+=dt;if(dyn.floorT>0.4){dyn.floorT=0;if(S.heat)drawHeat()}
  renderer.render(scene,camera);
  /* labels */
  var r=stage.getBoundingClientRect();labels.forEach(function(l){var v=l.v.clone().project(camera);if(v.z>1||v.z<-1){l.el.style.display='none';return}l.el.style.display='';l.el.style.left=((v.x+1)/2*r.width)+'px';l.el.style.top=((1-v.y)/2*r.height)+'px'});
  ui(dt);
}
function resize(){var r=stage.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix()}
var ro=new ResizeObserver(resize);ro.observe(stage);

/* ===== الواجهة ===== */
var uiT=0;
function hhmm(m){m=Math.floor(m);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
function ui(dt){
  uiT+=dt;if(uiT<0.15)return;uiT=0;var e=C.env||envAt(S.time/60),lay=cur(),nf=activeFans();
  $('#cs-fanNote').textContent=D.n>=D.nReq?'المراوح ('+D.n+') كفاية: المطلوب '+D.nReq+' بالقدرة دي':'تنبيه: المراوح ('+D.n+') أقل من المطلوب ('+D.nReq+') بالقدرة دي';
  $('#cs-hudTime').innerHTML='<b class="num">'+hhmm(S.time)+'</b> · برّه <b class="num">'+fmt(e.To,1)+'°</b>';
  $('#cs-hudState').innerHTML='جوه <b class="num" style="color:'+(C.Ti>=S.th[0].on?'var(--heat)':'var(--cool)')+'">'+fmt(C.Ti,1)+'°</b> · مراوح <b class="num">'+nf+'/'+D.n+'</b> · كروت '+(C.pad?'شغّالة':'مفصولة');
  $('#cs-time').value=Math.floor(S.time);$('#cs-oTime').textContent=hhmm(S.time);
  var k=[['حرارة جوه',fmt(C.Ti,1)+'°','hot'],['حرارة برّه',fmt(e.To,1)+'°',''],['بعد الكروت',fmt(C.sup,1)+'°','cold'],
    ['المراوح الشغّالة',nf+' / '+D.n,''],['الهواء',fmt(C.Vact/1000,0)+' ألف م³/س',''],['فرق الحرارة على الطول',fmt(Math.max(C.Vact>D.V*0.1?C.dT:1.5,0.1),1)+'°',''],
    ['استهلاك دلوقتي',fmt(C.kw,1)+' ك.و',''],['كهربا اليوم',fmt(C.kwh,0)+' ك.و.س',''],['مياه الكروت اليوم',fmt(C.water,0)+' لتر','']];
  $('#cs-kpis').innerHTML=k.map(function(x){return '<div class="cs-kpi '+x[2]+'"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>'}).join('');
  drawChart();
}
function drawChart(){
  var cv=$('#cs-chart'),dpr=Math.min(2,window.devicePixelRatio||1),w=cv.clientWidth,h=cv.clientHeight;if(!w)return;
  if(cv.width!==Math.round(w*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr)}
  var g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  var ml=30,mr=8,mt=8,mb=26,pw=w-ml-mr,ph=h-mt-mb-14,y0=14,y1=50;
  var X=function(m){return ml+pw*m/1440},Y=function(t){return mt+ph*(1-(t-y0)/(y1-y0))};
  var ink=css('--muted'),line=css('--line'),heat=css('--heat'),cool=css('--cool'),stg=css('--stage');
  g.font='11px '+css('--mono');g.fillStyle=ink;g.strokeStyle=line;g.lineWidth=1;g.textAlign='right';
  [20,30,40,50].forEach(function(t){g.beginPath();g.moveTo(ml,Y(t));g.lineTo(w-mr,Y(t));g.stroke();g.fillText(t+'°',ml-4,Y(t)+4)});
  g.textAlign='center';[0,6,12,18,24].forEach(function(hr){g.fillText(String(hr).padStart(2,'0'),X(hr*60),h-mb+14-14+12+ (14-14))});
  /* حدود التشغيل */
  g.setLineDash([4,4]);g.strokeStyle=stg;for(var i=0;i<nStages();i++){g.beginPath();g.moveTo(ml,Y(S.th[i].on));g.lineTo(w-mr,Y(S.th[i].on));g.stroke()}g.setLineDash([]);
  /* حرارة برّه */
  g.strokeStyle=ink;g.lineWidth=1.2;g.setLineDash([2,3]);g.beginPath();for(var m=0;m<=1440;m+=20){var t=envAt(m/60).To;m?g.lineTo(X(m),Y(t)):g.moveTo(X(m),Y(t))}g.stroke();g.setLineDash([]);
  /* مراحل */
  var by=mt+ph+4,bh=10,ns=nStages();
  C.hist.forEach(function(p,j){var nx=C.hist[j+1],x1=X(p.t),x2=nx?X(nx.t):X(S.time);if(p.st>0){g.fillStyle=stg;g.globalAlpha=0.25+0.75*p.st/ns;g.fillRect(x1,by,Math.max(1,x2-x1),bh);g.globalAlpha=1}
    if(p.pad){g.fillStyle=cool;g.fillRect(x1,by+bh+1,Math.max(1,x2-x1),3)}});
  /* حرارة جوه */
  g.strokeStyle=heat;g.lineWidth=2;g.beginPath();C.hist.forEach(function(p,j){j?g.lineTo(X(p.t),Y(p.Ti)):g.moveTo(X(p.t),Y(p.Ti))});g.stroke();
  g.strokeStyle=ink;g.lineWidth=1;g.beginPath();g.moveTo(X(S.time),mt);g.lineTo(X(S.time),mt+ph);g.stroke();
  g.fillStyle=ink;g.textAlign='left';g.fillText('مراوح',ml+2,by+bh-1);
}


  /* ===== ربط العناصر ===== */
  var lay0=cur();
  $('.cs-lname').textContent=lay0.name;$('.cs-ldesc').textContent=lay0.short;
  $('#cs-dims').textContent=S.L+' م × '+S.spans+' أسبان × '+S.W+' م · مراوح '+S.fpp+'/سبان';
  $('#cs-ths').innerHTML=S.th.slice(0,lay0.stages).map(function(t,i){return '<div class="cs-th">مرحلة '+(i+1)+': تشغيل عند <b class="num">'+t.on+'°</b> وفصل عند <b class="num">'+t.off+'°</b></div>'}).join('');
  function bindRange(id,key,out,suf){var el=$('#cs-'+id),o=$('#cs-'+out);el.value=S[key];var f=function(){S[key]=+el.value;o.textContent=el.value+suf};el.addEventListener('input',f);f()}
  bindRange('Tmax','Tmax','oTmax','°');bindRange('Tmin','Tmin','oTmin','°');bindRange('RH','RH','oRH','%');
  $('#cs-time').addEventListener('input',function(){S.time=+this.value;C.hist.length=0;C.lastRec=-99});
  function setMode(m){S.mode=m;host.querySelectorAll('#cs-qm [data-m]').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.m===m)})}
  host.querySelectorAll('#cs-qm [data-m]').forEach(function(b){b.addEventListener('click',function(){setMode(b.dataset.m)})});
  $('#cs-play').addEventListener('click',function(){S.playing=!S.playing;this.setAttribute('aria-pressed',S.playing);this.textContent=S.playing?'⏸ إيقاف':'▶ تشغيل'});
  host.querySelectorAll('[data-sp]').forEach(function(b){b.addEventListener('click',function(){S.speed=+b.dataset.sp;host.querySelectorAll('[data-sp]').forEach(function(x){x.setAttribute('aria-pressed',x===b)})})});
  host.querySelectorAll('#cs-cams [data-c]').forEach(function(b){b.addEventListener('click',function(){setCam(b.dataset.c)})});
  function tog(id,key){$(id).addEventListener('click',function(){S[key]=!S[key];this.setAttribute('aria-pressed',S[key])})}
  tog('#cs-tAir','air');tog('#cs-tHeat','heat');tog('#cs-tRot','rot');
  var mo=new MutationObserver(function(){build()});mo.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-palette']});
  var mq=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null,mqf=function(){setTimeout(function(){if(!dead)build()},50)};if(mq&&mq.addEventListener)mq.addEventListener('change',mqf);
  D=design(cur(),S);resize();build();resize();clock.getDelta();animate();
  if(opts.live&&opts.live.ti!=null){var lv=opts.live;C.Ti=lv.ti;if(lv.to!=null){S.Tmax=Math.max(S.Tmax,Math.round(lv.to));$('#cs-Tmax').value=S.Tmax;$('#cs-oTmax').textContent=S.Tmax+'°'}}
  return {setCam:setCam,S:S,C:C,build:build,destroy:function(){dead=true;try{cancelAnimationFrame(raf)}catch(e){}mo.disconnect();ro.disconnect();if(mq&&mq.removeEventListener)mq.removeEventListener('change',mqf);try{renderer.dispose();if(renderer.forceContextLoss)renderer.forceContextLoss()}catch(e){}host.classList.remove('cs-root');host.innerHTML=''}};

}
G.OrootsCooling={LAYOUTS:LAYOUTS.map(function(l){return {id:l.id,name:l.name,short:l.short,stages:l.stages}}),sane:sane,load:loadThree,mount:function(h,c,o){inst=mount(h,c,o);return inst},unmount:function(){if(inst){inst.destroy();inst=null}}};
if(typeof module!=='undefined')module.exports=G.OrootsCooling;
})(typeof window!=='undefined'?window:globalThis);
