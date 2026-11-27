import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getFirestore,doc,getDoc} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
const cfg={apiKey:"AIzaSyDHJ3y-FPSztLkj3VXIPWyKK7sFSW4rqgc",authDomain:"face-61ed1.firebaseapp.com",projectId:"face-61ed1",appId:"1:152576028995:web:f268b370966ff4a714fff6"};
const root=document.getElementById('view'),status=document.getElementById('status');
const scene=new THREE.Scene();scene.background=new THREE.Color('#a9c3d0');scene.fog=new THREE.Fog('#a9c3d0',26,55);
const camera=new THREE.PerspectiveCamera(39,root.clientWidth/root.clientHeight,.1,100);
let viewAngle=0;function cameraPose(){camera.position.set(Math.sin(viewAngle)*18,8.6,Math.cos(viewAngle)*18);camera.lookAt(0,3.15,0)}cameraPose();
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(root.clientWidth,root.clientHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;root.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xeaf6ff,0x526170,2.1));const key=new THREE.DirectionalLight(0xfff4df,3.2);key.position.set(-8,14,9);key.castShadow=true;key.shadow.mapSize.set(1024,1024);scene.add(key);
const mat=(c,o={})=>new THREE.MeshStandardMaterial({color:c,roughness:.5,...o});
function mesh(g,m,x,y,z,p=scene){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;p.add(o);return o}
function box(w,h,d,c,x,y,z,p=scene,o={}){return mesh(new THREE.BoxGeometry(w,h,d),mat(c,o),x,y,z,p)}
// Cabinet, base, transparent-ish viewing panels and bright interior
box(11.3,.5,9.3,'#263744',0,0,0);box(10.7,.16,8.65,'#d8e2e7',0,.32,0);
box(11.2,7.5,.42,'#293744',0,4,-4.5);box(11.2,7.5,.42,'#293744',0,4,4.5);box(.42,7.5,9.2,'#293744',-5.4,4,0);box(.42,7.5,9.2,'#293744',5.4,4,0);
const glassMat=mat('#b6e6f5',{transparent:true,opacity:.17,metalness:.1,roughness:.12});
mesh(new THREE.BoxGeometry(10.45,6.7,.06),glassMat,0,3.9,4.26);mesh(new THREE.BoxGeometry(10.45,6.7,.06),glassMat,0,3.9,-4.26);
mesh(new THREE.BoxGeometry(.06,6.7,8.4),glassMat,5.12,3.9,0);mesh(new THREE.BoxGeometry(.06,6.7,8.4),glassMat,-5.12,3.9,0);
box(10.45,.2,8.2,'#455b6b',0,1.1,0);box(10.4,.12,8.1,'#b5c8d2',0,1.22,0);
for(let i=0;i<6;i++)box(10.1,.045,.05,'#c6d8e1',0,1.35+i*.85,-3.95);
box(10,.32,.5,'#354451',0,6.9,-1.55);box(.5,.32,8,'#354451',0,6.9,0);
const carriage=new THREE.Group();scene.add(carriage);box(1.15,.5,1.15,'#788f9f',0,6.35,0,carriage);box(.9,.13,.8,'#d4e0e6',0,6.03,0,carriage);
const cable=mesh(new THREE.CylinderGeometry(.045,.045,1,12),mat('#3d4650'),0,5.8,0,carriage);
const claw=new THREE.Group();carriage.add(claw);mesh(new THREE.SphereGeometry(.32,24,20),mat('#dce5ea',{metalness:.35}),0,0,0,claw);
const fingers=[];for(let i=0;i<3;i++){const pivot=new THREE.Group();pivot.position.set(Math.cos(i*2*Math.PI/3)*.17,-.12,Math.sin(i*2*Math.PI/3)*.17);claw.add(pivot);mesh(new THREE.CapsuleGeometry(.08,.62,8,12),mat('#93a9b7',{metalness:.5}),0,-.35,0,pivot);pivot.userData.i=i;fingers.push(pivot)}
let faces=[];try{const db=getFirestore(initializeApp(cfg)),snap=await getDoc(doc(db,'adminSettings','gameplay'));faces=Array.isArray(snap.data()?.gachaFaces)?snap.data().gachaFaces:[]}catch(e){console.error(e);status.textContent='顔データの読み込みに失敗しました。Firebase接続を確認してください。'}
function faceName(f){return f?.name||f?.title||f?.faceName||'顔キャラ'}
function imageURL(f){for(const k of ['imageUrl','imageURL','photoURL','photoUrl','faceUrl','image','url','img','iconUrl','thumbnail','picture','imagePath']){const v=f?.[k];if(typeof v==='string'&&/^https?:\/\//i.test(v.trim()))return v.trim()}return null}
function emojiTexture(e){const c=document.createElement('canvas');c.width=c.height=512;const q=c.getContext('2d');q.fillStyle='#f4d9bd';q.fillRect(0,0,512,512);q.font='300px serif';q.textAlign='center';q.textBaseline='middle';q.fillText(e||'🧸',256,270);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
function textureFor(f){const u=imageURL(f);if(!u)return emojiTexture(f?.emoji||f?.icon||'🧸');return new THREE.TextureLoader().load(u,t=>{t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true},undefined,e=>console.warn('image load error',u,e))}
const plushes=[],colors=['#e6ad8b','#a9c8e5','#c5a6d7','#e3c67f','#9ecdbd','#e4a9bf','#b3b6e0'];
const catalog=faces.slice(0,20);if(!catalog.length)status.textContent='景品カタログが空です。管理画面の gachaFaces を確認してください。';
catalog.forEach((f,i)=>{const g=new THREE.Group(),col=colors[i%colors.length];mesh(new THREE.SphereGeometry(.62,32,24),mat(col),0,0,0,g).scale.set(1,1,.86);for(const s of [-1,1])mesh(new THREE.SphereGeometry(.19,16,12),mat(col),s*.4,.42,.02,g);mesh(new THREE.TorusGeometry(.48,.018,8,40),mat('#fff',{transparent:true,opacity:.45}),0,0,.08,g);
const faceTex=textureFor(f);mesh(new THREE.CircleGeometry(.4,40),new THREE.MeshBasicMaterial({map:faceTex,side:THREE.DoubleSide}),0,.05,.53,g);
g.userData.face=f;g.userData.label=faceName(f);g.position.set((i%5-2)*1.72,1.8,Math.floor(i/5)*1.65-2.7);scene.add(g);plushes.push(g)});
 // Prize chute and its visible lip
box(2.1,.25,1.5,'#1f2b38',3.75,.65,3.15);box(1.95,.08,1.35,'#8aa5b5',3.75,.83,3.15);box(2,.55,.12,'#243746',3.75,1.05,2.45);box(.12,.55,1.5,'#243746',2.75,1.05,3.15);box(.12,.55,1.5,'#243746',4.75,1.05,3.15);
let x=0,z=-1.5,y=5.45,coins=100,won=0,busy=false,held=null,phase='x';const minX=-4.15,maxX=4.15,minZ=-3.4,maxZ=2.35;
function pose(){carriage.position.set(x,0,z);cable.position.set(0,(6.08+y)/2,0);cable.scale.y=Math.max(.12,6.08-y);claw.position.set(0,y-6.03,0)}
pose();
function updateCoins(){document.getElementById('coins').textContent=coins}
function say(s){status.textContent=s}
function stepAxis(dx,dz){if(busy)return;if(phase==='x'&&dz!==0)return;if(phase==='z'&&dx!==0)return;x=Math.max(minX,Math.min(maxX,x+dx));z=Math.max(minZ,Math.min(maxZ,z+dz));pose()}
function moveButton(id,dx,dz){const el=document.getElementById(id);let timer=null,started=false;const stop=()=>{if(!timer)return;clearInterval(timer);timer=null;if(started){started=false;if(phase==='x'&&dx!==0){phase='z';say('横位置決定！ 次は奥・手前を長押し');}else if(phase==='z'&&dz!==0){phase='grab';say('位置決定！ 自動で下降・つかみ・上昇します');startSequence()}}};el.addEventListener('pointerdown',e=>{e.preventDefault();if(busy||phase==='grab'||(phase==='x'&&dz!==0)||(phase==='z'&&dx!==0))return;try{el.setPointerCapture(e.pointerId)}catch{}started=true;stepAxis(dx,dz);timer=setInterval(()=>stepAxis(dx,dz),55)});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>el.addEventListener(ev,stop))}
moveButton('left',-.13,0);moveButton('right',.13,0);moveButton('forward',0,-.13);moveButton('backward',0,.13);
for(const[id,a]of[['front',0],['rightview',Math.PI/2],['backview',Math.PI],['leftview',-Math.PI/2]])document.getElementById(id)?.addEventListener('click',()=>{viewAngle=a;cameraPose()});
function tween(target,dur,cb){const from={x,y,z},start=performance.now();function frame(now){const t=Math.min(1,(now-start)/dur),e=t*t*(3-2*t);x=from.x+(target.x-from.x)*e;y=from.y+(target.y-from.y)*e;z=from.z+(target.z-from.z)*e;pose();if(t<1)requestAnimationFrame(frame);else cb()}requestAnimationFrame(frame)}
function closeClaw(v){fingers.forEach((p,i)=>{p.rotation.z=v?(i===0?-.65:.65):0;p.rotation.x=v?(i===1?.65:-.25):0})}
function closest(){return plushes.filter(p=>!p.userData.got).sort((a,b)=>Math.hypot(a.position.x-x,a.position.z-z)-Math.hypot(b.position.x-x,b.position.z-z))[0]}
function startSequence(){if(busy)return;busy=true;if(coins<10){say('コイン不足です');busy=false;phase='x';return}coins-=10;updateCoins();const p=closest(),success=p&&Math.hypot(p.position.x-x,p.position.z-z)<.95;closeClaw(false);say('アーム下降中…');tween({x,y:1.55,z},1000,()=>{closeClaw(true);say('爪を閉じています…');setTimeout(()=>{if(success){held=p;p.userData.got=true;scene.remove(p);claw.add(p);p.position.set(0,-.55,0);p.scale.setScalar(.58);say('景品をつかんだ！')}else say('掴めませんでした…');tween({x,y:5.2,z},900,()=>{if(held){say('排出口へ搬送中…');const item=held,startX=x,startZ=z;let t=0;function route(){t=Math.min(1,t+.012);const e=t*t*(3-2*t);x=startX+(3.75-startX)*e;z=startZ+(3.15-startZ)*e;pose();if(t<1)requestAnimationFrame(route);else{claw.remove(item);scene.add(item);item.position.set(3.75,.85,3.15);item.scale.setScalar(.7);item.rotation.set(.4,.7,.2);const badge=document.createElement('div');badge.className='mini';badge.textContent=item.userData.face?.emoji||'🧸';badge.title=item.userData.label;document.getElementById('owned').append(badge);document.getElementById('count').textContent=++won;say('GET! '+item.userData.label);held=null;finish()}}route()}else{closeClaw(false);say('残念！ 次のプレイ');finish()}})},380)})}
function finish(){busy=false;phase='x';say('次のプレイ：横を長押しして位置調整')}
document.getElementById('grab')?.addEventListener('click',()=>{if(phase==='x')say('まず横方向を長押しして離してください');else if(phase==='z')say('次は奥・手前方向を長押しして離してください')});
function resize(){camera.aspect=root.clientWidth/root.clientHeight;camera.updateProjectionMatrix();renderer.setSize(root.clientWidth,root.clientHeight)}new ResizeObserver(resize).observe(root);function loop(){requestAnimationFrame(loop);renderer.render(scene,camera)}loop();
