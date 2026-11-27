import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getFirestore,doc,getDoc} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
const cfg={apiKey:"AIzaSyDHJ3y-FPSztLkj3VXIPWyKK7sFSW4rqgc",authDomain:"face-61ed1.firebaseapp.com",projectId:"face-61ed1",appId:"1:152576028995:web:f268b370966ff4a714fff6"};
const root=document.getElementById('view'),status=document.getElementById('status'),scene=new THREE.Scene();scene.background=new THREE.Color('#b7cbd6');scene.fog=new THREE.Fog('#b7cbd6',22,45);
const camera=new THREE.PerspectiveCamera(40,root.clientWidth/root.clientHeight,.1,100);let viewAngle=0;
function cameraPose(){camera.position.set(Math.sin(viewAngle)*17,8.3,Math.cos(viewAngle)*17);camera.lookAt(0,3.2,0)}cameraPose();
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(root.clientWidth,root.clientHeight);renderer.shadowMap.enabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;root.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff,0x6d7480,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-8,12,8);light.castShadow=true;scene.add(light);
const mat=(c,opts={})=>new THREE.MeshStandardMaterial({color:c,roughness:.45,...opts});
function mesh(geo,m,x,y,z,parent=scene){const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
function box(w,h,d,c,x,y,z,parent=scene,opts={}){return mesh(new THREE.BoxGeometry(w,h,d),mat(c,opts),x,y,z,parent)}
// Cabinet shell, floor and trim
box(11.2,.45,9.2,'#242e3b',0,0,0);box(10.6,.18,8.6,'#d5dbe2',0,.32,0);
box(11.2,7.4,.42,'#293542',0,4,-4.5);box(11.2,7.4,.42,'#293542',0,4,4.5);box(.42,7.4,9.2,'#293542',-5.4,4,0);box(.42,7.4,9.2,'#293542',5.4,4,0);
box(10.2,6.7,.12,'#7d99a8',0,3.9,-4.25);box(10.2,6.7,.12,'#7d99a8',0,3.9,4.25);
const glass=mat('#c4e6ef',{transparent:true,opacity:.12,metalness:.1});box(10.4,6.7,.08,glass.color,0,3.9,4.3,scene,{transparent:true,opacity:.13});
box(10.5,.2,8.2,'#394c5d',0,1.15,0);box(10.5,.14,8.2,'#a6b9c5',0,1.27,0);
for(let i=0;i<5;i++){box(10,.06,.06,'#b9cbd5',0,1.4+i*.9,-3.9)}
// overhead bridge and gantry rail
box(10,.35,.5,'#394552',0,6.9,-1.5);box(.5,.35,8,'#394552',0,6.9,0);
const carriage=new THREE.Group();scene.add(carriage);box(1.1,.55,1.2,'#6d8495',0,6.35,0,carriage);box(.9,.12,.85,'#b5c6d0',0,6.02,0,carriage);
// Suspension, claw body, three hinged arms
const cable=mesh(new THREE.CylinderGeometry(.045,.045,1,12),mat('#3b4149'),0,5.8,0,carriage);const claw=new THREE.Group();carriage.add(claw);
mesh(new THREE.SphereGeometry(.33,24,20),mat('#d7e0e5',{metalness:.5}),0,0,0,claw);const fingers=[];
for(let i=0;i<3;i++){const pivot=new THREE.Group();pivot.position.set(Math.cos(i*2*Math.PI/3)*.18,-.08,Math.sin(i*2*Math.PI/3)*.18);claw.add(pivot);const finger=mesh(new THREE.CapsuleGeometry(.09,.62,8,12),mat('#8fa6b4',{metalness:.45}),0,-.35,0,pivot);finger.rotation.z=.3;pivot.userData.finger=finger;pivot.userData.index=i; fingers.push(pivot)}
let faces=[];try{const db=getFirestore(initializeApp(cfg)),snap=await getDoc(doc(db,'adminSettings','gameplay'));faces=Array.isArray(snap.data()?.gachaFaces)?snap.data().gachaFaces:[]}catch(e){console.error('catalog',e);status.textContent='キャラクター取得に失敗: Firebase設定/権限を確認'}if(!faces.length)faces=[{name:'テスト景品',emoji:'🧸'}];
function urlOf(f){for(const k of ['imageUrl','imageURL','photoURL','photoUrl','faceUrl','image','url','img','iconUrl','thumbnail','picture'])if(typeof f?.[k]==='string'&&f[k].trim())return f[k].trim();return null}
function texture(f){const u=urlOf(f);if(!u)return emojiTexture(f.emoji||f.icon||'🧸');const t=new THREE.Texture();new THREE.TextureLoader().load(u,v=>{v.colorSpace=THREE.SRGBColorSpace;t.copy(v);t.needsUpdate=true},undefined,e=>{console.warn('face texture load failed',u,e);t.dispose()});return t}
function emojiTexture(e){const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,512,512);ctx.font='360px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(e,256,270);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
// Plushes are soft-looking spheres with an image badge, ears and seam-like details
const plushes=[],colors=['#e8a889','#a8c8e9','#c6a8df','#e6c87f','#9dcdbd','#e5a9c0'];
faces.slice(0,18).forEach((f,i)=>{const g=new THREE.Group(),color=colors[i%colors.length];mesh(new THREE.SphereGeometry(.65,32,24),mat(color),0,0,0,g).scale.set(1,1,.84);const badge=mesh(new THREE.CircleGeometry(.42,40),new THREE.MeshBasicMaterial({map:texture(f),side:THREE.DoubleSide}),0,.05,.53,g);for(const s of [-1,1])mesh(new THREE.SphereGeometry(.2,16,12),mat(color),s*.42,.46,.04,g);const seam=mesh(new THREE.TorusGeometry(.5,.018,8,36),mat('#fff',{transparent:true,opacity:.45}),0,0,.1,g);seam.rotation.x=.2;g.position.set((Math.random()*8-4),1.85,Math.random()*6-3);g.userData.face=f;g.userData.label=f.name||f.title||'景品';scene.add(g);plushes.push(g)});
// catcher chute at front-right corner
box(2.3,.3,1.5,'#1f2b38',3.8,.7,3.25);box(2.1,.1,1.3,'#7f9eaf',3.8,.9,3.25);box(2.2,.7,.12,'#243746',3.8,1.1,2.5);box(.12,.7,1.5,'#243746',2.7,1.1,3.25);box(.12,.7,1.5,'#243746',4.9,1.1,3.25);
let x=0,z=-1.5,y=5.4,coins=100,won=0,busy=false,held=null;const minX=-4.3,maxX=4.3,minZ=-3.5,maxZ=2.5;
function pose(){carriage.position.x=x;carriage.position.z=z;carriage.position.y=0;cable.position.set(0,(6.05+y)/2,0);cable.scale.y=Math.max(.1,6.05-y);claw.position.set(0,y-6.02,0)}
pose();
function step(dx,dz){if(busy)return;x=Math.max(minX,Math.min(maxX,x+dx));z=Math.max(minZ,Math.min(maxZ,z+dz));pose()}
const buttons=[['left',-.14,0],['right',.14,0],['forward',0,-.14],['backward',0,.14]];
for(const[id,dx,dz]of buttons){const el=document.getElementById(id);let interval=null;function stop(){if(interval){clearInterval(interval);interval=null}}el.addEventListener('pointerdown',e=>{e.preventDefault();if(busy)return;try{el.setPointerCapture(e.pointerId)}catch{}step(dx,dz);stop();interval=setInterval(()=>step(dx,dz),65)});['pointerup','pointercancel','pointerleave','lostpointercapture'].forEach(ev=>el.addEventListener(ev,stop))}
for(const[id,a]of[['front',0],['rightview',Math.PI/2],['backview',Math.PI],['leftview',-Math.PI/2]])document.getElementById(id)?.addEventListener('click',()=>{viewAngle=a;cameraPose()});
function tween(target,dur,cb){const from={x,y,z},time=performance.now();function frame(now){const t=Math.min(1,(now-time)/dur),e=t*t*(3-2*t);x=from.x+(target.x-from.x)*e;y=from.y+(target.y-from.y)*e;z=from.z+(target.z-from.z)*e;pose();if(t<1)requestAnimationFrame(frame);else cb()}requestAnimationFrame(frame)}
function closeClaw(v){fingers.forEach((p,i)=>{p.rotation.z=v?(i===0?-.65:.65):0;p.rotation.x=v?(i===1?.65:-.25):0})}
function nearest(){return plushes.filter(p=>!p.userData.got).sort((a,b)=>Math.hypot(a.position.x-x,a.position.z-z)-Math.hypot(b.position.x-x,b.position.z-z))[0]}
function updateCoin(){document.getElementById('coins').textContent=coins}
function grab(){if(busy)return;if(coins<10){status.textContent='コインが足りません';return}busy=true;coins-=10;updateCoin();status.textContent='下降しています…';const p=nearest(),hit=p&&Math.hypot(p.position.x-x,p.position.z-z)<.9&&p.position.y<2.8;closeClaw(false);tween({x,y:1.55,z},1100,()=>{closeClaw(true);status.textContent='爪を閉じています…';setTimeout(()=>{if(hit){held=p;p.userData.got=true;scene.remove(p);claw.add(p);p.position.set(0,-.55,0);p.scale.setScalar(.62);status.textContent='景品を掴みました'}else status.textContent='掴めませんでした';tween({x,y:5.25,z},950,()=>{if(held){status.textContent='景品排出口へ搬送中…';const p=held;let t=0;function route(){t=Math.min(1,t+.018);const ease=t*t*(3-2*t);x=x*(1-ease)+3.8*ease;z=z*(1-ease)+3.25*ease;pose();p.position.set(0,-.5,0);if(t<1)requestAnimationFrame(route);else{claw.remove(p);scene.add(p);p.position.set(3.8,.7,3.25);p.rotation.set(Math.random(),Math.random(),Math.random());p.scale.setScalar(.7);const item=document.createElement('div');item.className='mini';item.textContent=p.userData.face.emoji||'🧸';item.title=p.userData.label;document.getElementById('owned').append(item);document.getElementById('count').textContent=++won;status.textContent='GET! '+p.userData.label;held=null;closeClaw(false);busy=false}}route()}else{closeClaw(false);status.textContent='もう一度挑戦！';busy=false}})},450)})}
document.getElementById('grab').addEventListener('click',grab);
function resize(){camera.aspect=root.clientWidth/root.clientHeight;camera.updateProjectionMatrix();renderer.setSize(root.clientWidth,root.clientHeight)}new ResizeObserver(resize).observe(root);function loop(){requestAnimationFrame(loop);renderer.render(scene,camera)}loop();