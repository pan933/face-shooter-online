import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import {app,db,firebaseConfigError} from '../js/firebase-config.js';
import {getStorage,ref,getDownloadURL} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-storage.js';
import {doc,getDoc} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const view=document.querySelector('#view'),status=document.querySelector('#status');
const scene=new THREE.Scene();scene.background=new THREE.Color('#d2e2ec');
const camera=new THREE.PerspectiveCamera(42,view.clientWidth/view.clientHeight,.1,100);camera.position.set(0,8,18);camera.lookAt(0,3,0);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(view.clientWidth,view.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;view.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff,0x607080,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-6,12,10);light.castShadow=true;scene.add(light);
const mat=(c,o={})=>new THREE.MeshStandardMaterial({color:c,roughness:.65,...o});
function mesh(g,m,x,y,z,parent=scene){let o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
function box(w,h,d,c,x,y,z){return mesh(new THREE.BoxGeometry(w,h,d),mat(c),x,y,z)}
// cabinet exterior
box(11,.5,9,'#243b4b',0,0,0);box(10.6,.15,8.5,'#c8d9e4',0,.32,0);
box(11,.5,.5,'#344c5c',0,7.3,-4.25);box(11,.5,.5,'#344c5c',0,7.3,4.25);
box(.5,7.3,9,'#344c5c',-5.25,3.8,0);box(.5,7.3,9,'#344c5c',5.25,3.8,0);
const glass=mat('#b5e3f2',{transparent:true,opacity:.15});mesh(new THREE.BoxGeometry(10.4,6.4,.04),glass,0,3.8,4.0);mesh(new THREE.BoxGeometry(10.4,6.4,.04),glass,0,3.8,-4.0);mesh(new THREE.BoxGeometry(.04,6.4,8),glass,5,3.8,0);mesh(new THREE.BoxGeometry(.04,6.4,8),glass,-5,3.8,0);
box(10,.18,8,'#657e90',0,1.05,0);box(10,.12,8,'#d5e1e8',0,1.2,0);
for(let i=0;i<6;i++)box(9.8,.035,.035,'#edf7fc',0,1.35+i*.75,-3.8);
const rail=box(10,.42,.72,'#253c4d',0,6.85,-1.5);box(10,.08,.16,'#718b9b',0,7.08,-1.5);
const trolley=new THREE.Group();scene.add(trolley);
mesh(new THREE.BoxGeometry(1.8,.65,1.5),mat('#a9bdca'),0,0,0,trolley);mesh(new THREE.BoxGeometry(1.35,.22,1.15),mat('#dce8ef'),0,-.32,0,trolley);
const dropRig=new THREE.Group();scene.add(dropRig);
const cable=mesh(new THREE.CylinderGeometry(.035,.035,1,10),mat('#283b48'),0,0,0,dropRig);
const claw=new THREE.Group();dropRig.add(claw);
// visible claw body and three independently articulated metal prongs
mesh(new THREE.SphereGeometry(.22,20,16),mat('#cddbe4'),0,0,0,claw);
let fingers=[];
for(let i=0;i<3;i++){const angle=i*2*Math.PI/3;const pivot=new THREE.Group();pivot.position.set(Math.cos(angle)*.25,-.08,Math.sin(angle)*.25);claw.add(pivot);mesh(new THREE.CapsuleGeometry(.09,.8,8,12),mat('#758b9a'),0,-.42,0,pivot);fingers.push(pivot)}
let faces=[];let storage=null;try{if(firebaseConfigError)throw firebaseConfigError;if(!app||!db)throw new Error('Firebase共通設定が初期化されていません');storage=getStorage(app);const snap=await getDoc(doc(db,'adminSettings','gameplay'));if(!snap.exists())throw new Error('adminSettings/gameplay ドキュメントがありません');const data=snap.data();if(!Array.isArray(data.gachaFaces))throw new Error('gachaFaces が配列ではありません');faces=data.gachaFaces.filter(f=>f&&typeof f==='object'&&!f.excludeFromGacha&&!f.exchangeOnly);if(!faces.length)throw new Error('取得した gachaFaces が0件です（交換専用・排出停止を除いた結果）');msg('Firestore取得成功：'+faces.length+'件。景品を配置しています…');console.info('[UFO catcher] raw faces',data.gachaFaces);}catch(e){console.error('[UFO catcher] gachaFaces取得エラー',e);status.textContent='景品読み込み失敗: '+(e?.message||e?.code||String(e));}
const colors=['#d5a27e','#95b9da','#c2a1d5','#d9c278','#8fc6b2','#df9db5'];
function nameOf(f){return f?.name||f?.title||f?.faceName||f?.displayName||'景品'}
function urlOf(f){for(const k of ['imageUrl','imageURL','photoURL','photoUrl','faceUrl','faceImage','image','url','img','iconUrl','thumbnail','picture','imagePath','photo','src','avatar','avatarUrl']){const v=f?.[k];if(typeof v==='string'&&v.trim())return v.trim()}return ''}
async function resolveUrl(f){let u=urlOf(f);if(!u)return '';if(/^https?:|^data:image/i.test(u))return u;if(!storage)return '';try{return await getDownloadURL(ref(storage,u))}catch(e){console.warn('[UFO catcher] Storage URL変換失敗:',u,e);return ''}}
function fallbackTexture(label){const c=document.createElement('canvas');c.width=c.height=512;let ctx=c.getContext('2d');ctx.fillStyle='#f7e0c9';ctx.fillRect(0,0,512,512);ctx.fillStyle='#394b5a';ctx.font='bold 54px sans-serif';ctx.textAlign='center';ctx.fillText(label.slice(0,10),256,275);return new THREE.CanvasTexture(c)}
function plush(f,i){const g=new THREE.Group(),col=colors[i%colors.length];mesh(new THREE.SphereGeometry(.62,28,20),mat(col),0,0,0,g).scale.set(1,1,.86);for(const side of [-1,1])mesh(new THREE.SphereGeometry(.2,16,12),mat(col),side*.4,.42,0,g);const disk=mesh(new THREE.CircleGeometry(.43,36),new THREE.MeshBasicMaterial({map:fallbackTexture(nameOf(f)),side:THREE.DoubleSide}),0,.04,.54,g);resolveUrl(f).then(u=>{if(!u)return;new THREE.TextureLoader().load(u,t=>{t.colorSpace=THREE.SRGBColorSpace;disk.material.map=t;disk.material.needsUpdate=true},undefined,e=>console.warn('face image failed',u,e))});g.userData.face=f;g.userData.label=nameOf(f);g.position.set((i%3-1)*2.1,1.95,Math.floor(i/3)*1.8-1.5);scene.add(g);return g}
const prizes=faces.slice(0,6).map(plush);if(!prizes.length)status.textContent='景品データが空です。管理設定の gachaFaces を確認してください。';else{status.textContent='景品 '+prizes.length+'個を配置しました。横位置から調整';console.info('[UFO catcher] prizes placed',prizes.length);}
// chute at rear-right corner
box(2,.25,1.5,'#1c2d3a',3.7,.7,3.1);box(1.9,.08,1.35,'#9bb2c0',3.7,.85,3.1);box(2,.5,.12,'#283d4c',3.7,1.05,2.4);
let x=3.7,z=3.1,y=5.6,coins=100,won=0,busy=false,phase='x',held=null;const minX=-4.1,maxX=4.1,minZ=-3.25,maxZ=2.1;
function pose(){trolley.position.set(x,6.85,z);dropRig.position.set(x,0,z);const cableTop=6.55,cableBottom=y+.25;const length=Math.max(.1,cableTop-cableBottom);cable.position.set(0,(cableTop+cableBottom)/2,0);cable.scale.y=length;claw.position.set(0,y,0)}
pose();function msg(s){status.textContent=s}function coinsUI(){document.querySelector('#coins').textContent=coins}
function move(dx,dz){if(busy)return;x=Math.max(minX,Math.min(maxX,x+dx));z=Math.max(minZ,Math.min(maxZ,z+dz));pose()}
function controls(id,dx,dz){const el=document.getElementById(id);let repeat=null,active=false;function stop(){if(!active)return;active=false;if(repeat){clearInterval(repeat);repeat=null}if(phase==='x'&&dx){phase='z';msg('横位置をロック！ 奥・手前を調整して離してください')}else if(phase==='z'&&dz){phase='ready';msg('奥行きをロック！「つかむ」を押してプレイ')} }el.addEventListener('pointerdown',e=>{e.preventDefault();if(busy||phase==='ready'||phase==='grab'||(phase==='x'&&dz)||(phase==='z'&&dx))return;active=true;try{el.setPointerCapture(e.pointerId)}catch{}move(dx,dz);repeat=setInterval(()=>move(dx,dz),75)});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>el.addEventListener(ev,stop))}
controls('left',-.16,0);controls('right',.16,0);controls('forward',0,-.16);controls('backward',0,.16);
function cam(a){camera.position.set(Math.sin(a)*18,8.3,Math.cos(a)*18);camera.lookAt(0,3.2,0)}[['front',0],['rightview',Math.PI/2],['backview',Math.PI],['leftview',-Math.PI/2]].forEach(([id,a])=>document.getElementById(id).onclick=()=>cam(a));
function tween(target,duration,done){const start={x,y,z},t0=performance.now();function f(t){let q=Math.min(1,(t-t0)/duration),e=q*q*(3-2*q);x=start.x+(target.x-start.x)*e;y=start.y+(target.y-start.y)*e;z=start.z+(target.z-start.z)*e;pose();if(q<1)requestAnimationFrame(f);else done()}requestAnimationFrame(f)}
function close(v){fingers.forEach((p,i)=>{p.rotation.z=v?(i===0?-.55:.55):0;p.rotation.x=v?(i===1?.5:-.2):0})}
function nearest(){return prizes.filter(p=>!p.userData.caught).sort((a,b)=>Math.hypot(a.position.x-x,a.position.z-z)-Math.hypot(b.position.x-x,b.position.z-z))[0]}
function finish(){held=null;busy=false;phase='outlet';x=3.7;z=3.1;pose();msg('排出口に到着！次のプレイを開始してください')}
document.getElementById('grab').onclick=()=>{if(busy)return;if(phase!=='ready'){msg(phase==='x'?'横方向を調整して離してください':'奥・手前を調整して離してください');return}if(coins<10){msg('コイン不足');return}busy=true;phase='grab';coins-=10;coinsUI();let prize=nearest(),hit=prize&&Math.hypot(prize.position.x-x,prize.position.z-z)<1.05;msg('下降中…');close(false);tween({x,y:1.45,z},950,()=>{close(true);msg('つかみ動作…');setTimeout(()=>{if(hit){held=prize;prize.userData.caught=true;scene.remove(prize);claw.add(prize);prize.position.set(0,-.55,0);prize.scale.setScalar(.58);msg('景品をつかんだ！')}else msg('惜しい！');tween({x,y:5.35,z},900,()=>{msg(held?'排出口へ移動…':'空のアームで排出口へ移動…');const startX=x,startZ=z;let t=0;function route(){t=Math.min(1,t+.015);const e=t*t*(3-2*t);x=startX+(3.7-startX)*e;z=startZ+(3.1-startZ)*e;pose();if(t<1)requestAnimationFrame(route);else{if(held){claw.remove(held);scene.add(held);held.position.set(3.7,.9,3.1);held.scale.setScalar(.65);const badge=document.createElement('div');badge.className='mini';badge.textContent='🎁';badge.title=held.userData.label;document.getElementById('owned').append(badge);document.querySelector('#count').textContent=++won;msg('GET！ '+held.userData.label)}else{msg('つかめませんでした。排出口まで移動しました');}close(false);finish()}}route()})},420)})};
function resize(){camera.aspect=view.clientWidth/view.clientHeight;camera.updateProjectionMatrix();renderer.setSize(view.clientWidth,view.clientHeight)}new ResizeObserver(resize).observe(view);function loop(){requestAnimationFrame(loop);renderer.render(scene,camera)}loop();
// Realistic lightweight physics: inertia, collisions, bounce and slip
const physicsPrizes=prizes.map(p=>{p.userData.caught=false;p.userData.v=new THREE.Vector3();p.userData.grip=.25+Math.random()*.75;p.userData.mass=.8+Math.random()*1.4;return p});let physLast=performance.now(),physicsHeld=null,heldOffset=new THREE.Vector3(),slipTimer=0;
function physTick(){const dt=Math.min(.035,(performance.now()-physLast)/1000);physLast=performance.now();for(let i=0;i<physicsPrizes.length;i++){const a=physicsPrizes[i];if(a.userData.caught||a===physicsHeld)continue;const v=a.userData.v;v.y-=9.2*dt;a.position.addScaledVector(v,dt);if(a.position.y<1.72){a.position.y=1.72;if(v.y<0)v.y=-v.y*(.12+Math.random()*.16);v.x*=.91;v.z*=.91;}const bnd=4.35;if(Math.abs(a.position.x)>bnd){a.position.x=Math.sign(a.position.x)*bnd;v.x*=-.35}if(Math.abs(a.position.z)>3.65){a.position.z=Math.sign(a.position.z)*3.65;v.z*=-.35}a.rotation.x+=v.z*dt*.8;a.rotation.z+=v.x*dt*.8;for(let j=i+1;j<physicsPrizes.length;j++){const b=physicsPrizes[j];if(b.userData.caught||b===physicsHeld)continue;let dx=b.position.x-a.position.x,dz=b.position.z-a.position.z,d=Math.hypot(dx,dz);if(d>0&&d<1.02){let q=(1.02-d)/2,nx=dx/d,nz=dz/d;a.position.x-=nx*q;b.position.x+=nx*q;a.userData.v.x-=nx*.6;b.userData.v.x+=nx*.6;a.userData.v.z-=nz*.6;b.userData.v.z+=nz*.6}}}if(physicsHeld){physicsHeld.position.copy(claw.getWorldPosition(new THREE.Vector3())).add(heldOffset);slipTimer+=dt;let load=physicsHeld.userData.mass*(1+Math.abs(Math.sin(performance.now()/240))*.28),grip=physicsHeld.userData.grip;if(slipTimer>1&&Math.random()<Math.max(.01,(load-grip*2.2)*.1)){let p=physicsHeld;physicsHeld=null;held=null;p.userData.caught=false;p.userData.v.set((Math.random()-.5)*2,-1.4,(Math.random()-.5)*2);claw.remove(p);scene.add(p);p.scale.setScalar(1);msg('掴みが滑った！ 景品が落下…')}}requestAnimationFrame(physTick)}requestAnimationFrame(physTick);
document.getElementById('grab').onclick=()=>{
 if(busy)return;
 if(phase!=='ready'){msg(phase==='x'?'横方向を調整して離してください':'奥・手前を調整して離してください');return}
 if(coins<10){msg('コイン不足');return}
 busy=true;phase='grab';coins-=10;coinsUI();
 const candidate=nearest();
 const valid=candidate&&Math.hypot(candidate.position.x-x,candidate.position.z-z)<1.15&&candidate.position.y<2.8;
 const sx=x,sz=z;
 close(false);msg('下降中…');
 tween({x:sx,y:1.35,z:sz},1050,()=>{
   close(true);msg('爪を閉じています…');
   setTimeout(()=>{
     let success=false;
     if(valid&&!candidate.userData.caught){
       const dist=Math.hypot(candidate.position.x-x,candidate.position.z-z);
       const score=Math.max(0,1-dist/1.35)*(.55+candidate.userData.grip*.45);
       if(Math.random()<score*.82){
         physicsHeld=candidate;held=candidate;candidate.userData.caught=true;
         claw.add(candidate);candidate.position.set(0,-.55,0);candidate.scale.setScalar(.58);
         heldOffset.set(0,-.55,0);slipTimer=0;success=true;
         msg('掴み成功！ゆっくり上昇…');
       }else{
         candidate.userData.v.x+=(Math.random()-.5)*1.2;
         candidate.userData.v.z+=(Math.random()-.5)*1.2;
         candidate.userData.v.y=.65;msg('掴めませんでした…上昇中');
       }
     }else msg('掴めませんでした…上昇中');
     // Explicit lift phase with a guarded callback; do not wait on a status-only step.
     const liftStartY=y,liftEndY=5.35,liftStart=performance.now(),liftDuration=1400;
     function liftFrame(now){
       const q=Math.min(1,(now-liftStart)/liftDuration),e=q*q*(3-2*q);
       y=liftStartY+(liftEndY-liftStartY)*e;
       claw.rotation.y=Math.sin(q*Math.PI*2)*.12;
       pose();
       if(q<1)requestAnimationFrame(liftFrame);
       else{
         claw.rotation.y=0;msg(success?'景品を揺らしながら排出口へ運びます…':'排出口へ移動中…');
         let t=0,routeX=x,routeZ=z;
         function route(){
           t=Math.min(1,t+.012);const ee=t*t*(3-2*t);
           x=routeX+(3.7-routeX)*ee;z=routeZ+(3.1-routeZ)*ee;
           pose();claw.rotation.y=Math.sin(t*Math.PI*5)*.09;
           if(t<1)requestAnimationFrame(route);
           else{
             claw.rotation.y=0;
             if(physicsHeld){
               const p=physicsHeld;physicsHeld=null;held=null;claw.remove(p);scene.add(p);
               p.userData.caught=true;p.position.set(3.7,1.5,3.1);
               p.userData.v.set((Math.random()-.5)*.3,-.3,(Math.random()-.5)*.3);p.scale.setScalar(.65);
               const badge=document.createElement('div');badge.className='mini';badge.textContent='🎁';badge.title=p.userData.label;
               document.getElementById('owned').append(badge);document.querySelector('#count').textContent=++won;msg('GET！ '+p.userData.label);
             }else msg('獲得失敗');
             close(false);finish();
           }
         }route();
       }
     }requestAnimationFrame(liftFrame);
   },650);
 });
};

// Outlet flow: after each attempt, wait for the player to start the next round at the prize chute.
const outletStart=document.createElement('button');
outletStart.id='outletStart';outletStart.type='button';outletStart.textContent='排出口：次のプレイを開始';outletStart.style.cssText='display:block;width:100%;margin:12px auto;padding:14px;border-radius:14px;border:2px solid #79d5ff;background:linear-gradient(135deg,#174e70,#277fa5);color:white;font-weight:800;font-size:1.05rem;';
outletStart.disabled=true;document.querySelector('.machine').insertBefore(outletStart,document.querySelector('.collection'));
let awaitingOutletStart=false;
const previousFinish=finish;
finish=function(){held=null;busy=false;phase='outlet';x=3.7;z=3.1;pose();awaitingOutletStart=true;outletStart.disabled=false;msg('排出口に到着！景品を取り出して「次のプレイを開始」を押してください');};
outletStart.addEventListener('click',()=>{if(!awaitingOutletStart)return;awaitingOutletStart=false;outletStart.disabled=true;phase='x';x=0;z=-1.4;pose();msg('次のプレイ開始！横位置を長押しして調整');});
