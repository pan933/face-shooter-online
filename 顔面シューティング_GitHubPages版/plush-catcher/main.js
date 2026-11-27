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
const rail=box(10,.3,.55,'#253c4d',0,6.85,-1.5);const carriage=new THREE.Group();scene.add(carriage);
mesh(new THREE.BoxGeometry(1.2,.5,1.1),mat('#a9bdca'),0,0,0,carriage);mesh(new THREE.BoxGeometry(.8,.16,.8),mat('#dce8ef'),0,-.3,0,carriage);
const cable=mesh(new THREE.CylinderGeometry(.035,.035,1,10),mat('#283b48'),0,0,0,carriage);
const claw=new THREE.Group();carriage.add(claw);mesh(new THREE.SphereGeometry(.28,20,16),mat('#cddbe4'),0,0,0,claw);let fingers=[];
for(let i=0;i<3;i++){let pivot=new THREE.Group();pivot.position.set(Math.cos(i*2*Math.PI/3)*.2,-.1,Math.sin(i*2*Math.PI/3)*.2);claw.add(pivot);mesh(new THREE.CapsuleGeometry(.07,.65,6,10),mat('#758b9a'),0,-.34,0,pivot);fingers.push(pivot)}
let faces=[];let storage=null;try{if(firebaseConfigError)throw firebaseConfigError;if(!app||!db)throw new Error('Firebase共通設定が初期化されていません');storage=getStorage(app);const snap=await getDoc(doc(db,'adminSettings','gameplay'));if(!snap.exists())throw new Error('adminSettings/gameplay ドキュメントがありません');const data=snap.data();if(!Array.isArray(data.gachaFaces))throw new Error('gachaFaces が配列ではありません');faces=data.gachaFaces.filter(f=>f&&typeof f==='object'&&!f.excludeFromGacha&&!f.exchangeOnly);if(!faces.length)throw new Error('取得した gachaFaces が0件です（交換専用・排出停止を除いた結果）');msg('Firestore取得成功：'+faces.length+'件。景品を配置しています…');console.info('[UFO catcher] raw faces',data.gachaFaces);}catch(e){console.error('[UFO catcher] gachaFaces取得エラー',e);status.textContent='景品読み込み失敗: '+(e?.message||e?.code||String(e));}
const colors=['#d5a27e','#95b9da','#c2a1d5','#d9c278','#8fc6b2','#df9db5'];
function nameOf(f){return f?.name||f?.title||f?.faceName||f?.displayName||'景品'}
function urlOf(f){for(const k of ['imageUrl','imageURL','photoURL','photoUrl','faceUrl','faceImage','image','url','img','iconUrl','thumbnail','picture','imagePath','photo','src','avatar','avatarUrl']){const v=f?.[k];if(typeof v==='string'&&v.trim())return v.trim()}return ''}
async function resolveUrl(f){let u=urlOf(f);if(!u)return '';if(/^https?:|^data:image/i.test(u))return u;if(!storage)return '';try{return await getDownloadURL(ref(storage,u))}catch(e){console.warn('[UFO catcher] Storage URL変換失敗:',u,e);return ''}}
function fallbackTexture(label){const c=document.createElement('canvas');c.width=c.height=512;let ctx=c.getContext('2d');ctx.fillStyle='#f7e0c9';ctx.fillRect(0,0,512,512);ctx.fillStyle='#394b5a';ctx.font='bold 54px sans-serif';ctx.textAlign='center';ctx.fillText(label.slice(0,10),256,275);return new THREE.CanvasTexture(c)}
function plush(f,i){const g=new THREE.Group(),col=colors[i%colors.length];mesh(new THREE.SphereGeometry(.62,28,20),mat(col),0,0,0,g).scale.set(1,1,.86);for(const side of [-1,1])mesh(new THREE.SphereGeometry(.2,16,12),mat(col),side*.4,.42,0,g);const disk=mesh(new THREE.CircleGeometry(.43,36),new THREE.MeshBasicMaterial({map:fallbackTexture(nameOf(f)),side:THREE.DoubleSide}),0,.04,.54,g);resolveUrl(f).then(u=>{if(!u)return;new THREE.TextureLoader().load(u,t=>{t.colorSpace=THREE.SRGBColorSpace;disk.material.map=t;disk.material.needsUpdate=true},undefined,e=>console.warn('face image failed',u,e))});g.userData.face=f;g.userData.label=nameOf(f);g.position.set((i%5-2)*1.65,1.95,Math.floor(i/5)*1.35-2.4);scene.add(g);return g}
const prizes=faces.slice(0,30).map(plush);if(!prizes.length)status.textContent='景品データが空です。管理設定の gachaFaces を確認してください。';else{status.textContent='景品 '+prizes.length+'個を配置しました。横位置から調整';console.info('[UFO catcher] prizes placed',prizes.length);}
// chute at rear-right corner
box(2,.25,1.5,'#1c2d3a',3.7,.7,3.1);box(1.9,.08,1.35,'#9bb2c0',3.7,.85,3.1);box(2,.5,.12,'#283d4c',3.7,1.05,2.4);
let x=0,z=-1.4,y=5.6,coins=100,won=0,busy=false,phase='x',held=null;const minX=-4.1,maxX=4.1,minZ=-3.25,maxZ=2.1;
function pose(){carriage.position.set(x,0,z);cable.position.set(0,(6.15+y)/2,0);cable.scale.y=Math.max(.15,6.15-y);claw.position.set(0,y-6.15,0)}
pose();function msg(s){status.textContent=s}function coinsUI(){document.querySelector('#coins').textContent=coins}
function move(dx,dz){if(busy)return;x=Math.max(minX,Math.min(maxX,x+dx));z=Math.max(minZ,Math.min(maxZ,z+dz));pose()}
function controls(id,dx,dz){const el=document.getElementById(id);let repeat=null,active=false;function stop(){if(!active)return;active=false;if(repeat){clearInterval(repeat);repeat=null}if(phase==='x'&&dx){phase='z';msg('横位置をロック！ 奥・手前を調整して離してください')}else if(phase==='z'&&dz){phase='ready';msg('奥行きをロック！「つかむ」を押してプレイ')} }el.addEventListener('pointerdown',e=>{e.preventDefault();if(busy||phase==='ready'||phase==='grab'||(phase==='x'&&dz)||(phase==='z'&&dx))return;active=true;try{el.setPointerCapture(e.pointerId)}catch{}move(dx,dz);repeat=setInterval(()=>move(dx,dz),75)});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>el.addEventListener(ev,stop))}
controls('left',-.16,0);controls('right',.16,0);controls('forward',0,-.16);controls('backward',0,.16);
function cam(a){camera.position.set(Math.sin(a)*18,8.3,Math.cos(a)*18);camera.lookAt(0,3.2,0)}[['front',0],['rightview',Math.PI/2],['backview',Math.PI],['leftview',-Math.PI/2]].forEach(([id,a])=>document.getElementById(id).onclick=()=>cam(a));
function tween(target,duration,done){const start={x,y,z},t0=performance.now();function f(t){let q=Math.min(1,(t-t0)/duration),e=q*q*(3-2*q);x=start.x+(target.x-start.x)*e;y=start.y+(target.y-start.y)*e;z=start.z+(target.z-start.z)*e;pose();if(q<1)requestAnimationFrame(f);else done()}requestAnimationFrame(f)}
function close(v){fingers.forEach((p,i)=>{p.rotation.z=v?(i===0?-.7:.7):0;p.rotation.x=v?(i===1?.65:-.25):0})}
function nearest(){return prizes.filter(p=>!p.userData.caught).sort((a,b)=>Math.hypot(a.position.x-x,a.position.z-z)-Math.hypot(b.position.x-x,b.position.z-z))[0]}
function finish(){held=null;busy=false;phase='x';x=0;z=-1.4;pose();msg('次のプレイ：横位置から調整')}
document.getElementById('grab').onclick=()=>{if(busy)return;if(phase!=='ready'){msg(phase==='x'?'横方向を調整して離してください':'奥・手前を調整して離してください');return}if(coins<10){msg('コイン不足');return}busy=true;phase='grab';coins-=10;coinsUI();let prize=nearest(),hit=prize&&Math.hypot(prize.position.x-x,prize.position.z-z)<1.05;msg('下降中…');close(false);tween({x,y:1.45,z},950,()=>{close(true);msg('つかみ動作…');setTimeout(()=>{if(hit){held=prize;prize.userData.caught=true;scene.remove(prize);claw.add(prize);prize.position.set(0,-.55,0);prize.scale.setScalar(.58);msg('景品をつかんだ！')}else msg('惜しい！');tween({x,y:5.35,z},900,()=>{if(!held){close(false);finish();return}msg('排出口へ移動…');const startX=x,startZ=z;let t=0;function route(){t=Math.min(1,t+.015);const e=t*t*(3-2*t);x=startX+(3.7-startX)*e;z=startZ+(3.1-startZ)*e;pose();if(t<1)requestAnimationFrame(route);else{claw.remove(held);scene.add(held);held.position.set(3.7,.9,3.1);held.scale.setScalar(.65);const badge=document.createElement('div');badge.className='mini';badge.textContent='🎁';badge.title=held.userData.label;document.getElementById('owned').append(badge);document.querySelector('#count').textContent=++won;msg('GET！ '+held.userData.label);close(false);finish()}}route()})},420)})};
function resize(){camera.aspect=view.clientWidth/view.clientHeight;camera.updateProjectionMatrix();renderer.setSize(view.clientWidth,view.clientHeight)}new ResizeObserver(resize).observe(view);function loop(){requestAnimationFrame(loop);renderer.render(scene,camera)}loop();