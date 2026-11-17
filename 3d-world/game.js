import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

const root=document.querySelector("#game");
const toastEl=document.querySelector("#toast");
const isTouch=matchMedia("(pointer: coarse)").matches;
const SAVE_KEY="facecraft-infinite-v2";
const CHUNK=16, RENDER_DISTANCE=isTouch?2:3, WORLD_HEIGHT=30;
const BLOCKS=[
 {id:"grass",name:"草",color:0x68a94b},{id:"dirt",name:"土",color:0x8b5a35},
 {id:"stone",name:"石",color:0x858b8d},{id:"wood",name:"木",color:0x9b6a3c},
 {id:"leaves",name:"葉",color:0x397b3c},{id:"sand",name:"砂",color:0xd8c27a},
 {id:"brick",name:"レンガ",color:0xa64f43},{id:"glass",name:"ガラス",color:0x9bdce8,transparent:true}
];
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x8dc9ed);
scene.fog=new THREE.Fog(0x8dc9ed,45,125);
const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.1,220);
const renderer=new THREE.WebGLRenderer({antialias:!isTouch,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,isTouch?1.25:1.6));
renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.shadowMap.enabled=!isTouch;root.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xd9efff,0x596b43,2));
const sun=new THREE.DirectionalLight(0xffedce,2.1);sun.position.set(-30,60,20);sun.castShadow=!isTouch;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
const cubeGeo=new THREE.BoxGeometry(1,1,1);
const materials=new Map(BLOCKS.map(b=>[b.id,new THREE.MeshLambertMaterial({color:b.color,transparent:!!b.transparent,opacity:b.transparent?.48:1})]));
const chunks=new Map(),blockEdits=new Map(),keys=new Set(),touchMove=new Set(),enemies=[];
const raycaster=new THREE.Raycaster(),center=new THREE.Vector2(0,0);
let selected=0,mode="survival",thirdPerson=false,yaw=0,pitch=0,velocityY=0,grounded=false,pointerLocked=false,lastTime=performance.now(),lastChunk="";
let health=5,hunger=5,score=0,attackCooldown=0,worldSeed=73921;
const player={x:.5,y:8,z:.5};
const faceUrl="https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063262/face2.png";
let faceTexture=null;
new THREE.TextureLoader().load(faceUrl,t=>{t.colorSpace=THREE.SRGBColorSpace;faceTexture=t;enemies.forEach(e=>applyFace(e.head));});
const key=(x,y,z)=>`${x},${y},${z}`;
const parse=k=>k.split(",").map(Number);
const chunkKey=(cx,cz)=>`${cx},${cz}`;
const chunkOf=n=>Math.floor(n/CHUNK);
const hash=(x,z)=>{let n=Math.imul(x,374761393)+Math.imul(z,668265263)+worldSeed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
function heightAt(x,z){const wave=Math.sin(x*.045)*3+Math.cos(z*.052)*2.5+Math.sin((x+z)*.027)*3;return Math.max(3,Math.min(17,Math.floor(8+wave)));}
function getChunk(cx,cz){return chunks.get(chunkKey(cx,cz));}
function getBlock(x,y,z){const c=getChunk(chunkOf(x),chunkOf(z));return c?.blocks.get(key(x,y,z))||null;}
function setBlock(x,y,z,type){const c=getChunk(chunkOf(x),chunkOf(z));if(!c)return false;const k=key(x,y,z);if(type)c.blocks.set(k,type);else c.blocks.delete(k);blockEdits.set(k,type||"__air");rebuildChunk(c);return true;}
function generateChunk(cx,cz){
 const id=chunkKey(cx,cz),c={id,cx,cz,blocks:new Map(),meshes:[]};
 const startX=cx*CHUNK,startZ=cz*CHUNK;
 for(let x=startX;x<startX+CHUNK;x++)for(let z=startZ;z<startZ+CHUNK;z++){
  const h=heightAt(x,z),beach=h<=6;
  for(let y=0;y<=h;y++)c.blocks.set(key(x,y,z),y===h?(beach?"sand":"grass"):y>=h-3?"dirt":"stone");
  if(x-startX>=2&&x-startX<CHUNK-2&&z-startZ>=2&&z-startZ<CHUNK-2&&hash(x,z)>.965&&hash(x+91,z-37)>.45){
   const trunk=3+Math.floor(hash(x-4,z+8)*3);
   for(let y=1;y<=trunk;y++)c.blocks.set(key(x,h+y,z),"wood");
   for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=trunk-1;dy<=trunk+2;dy++){
    if(Math.abs(dx)+Math.abs(dz)+(dy===trunk+2?1:0)<=4&&!c.blocks.has(key(x+dx,h+dy,z+dz)))c.blocks.set(key(x+dx,h+dy,z+dz),"leaves");
   }
  }
 }
 for(const [k,v] of blockEdits){const [x,y,z]=parse(k);if(chunkOf(x)===cx&&chunkOf(z)===cz){if(v==="__air")c.blocks.delete(k);else c.blocks.set(k,v);}}
 chunks.set(id,c);rebuildChunk(c);return c;
}
function rebuildChunk(c){
 for(const m of c.meshes)scene.remove(m);c.meshes.length=0;
 const groups=new Map(BLOCKS.map(b=>[b.id,[]]));
 for(const [k,type] of c.blocks){const p=parse(k);groups.get(type)?.push(p);}
 const dummy=new THREE.Object3D();
 for(const b of BLOCKS){const list=groups.get(b.id);if(!list.length)continue;
  const mesh=new THREE.InstancedMesh(cubeGeo,materials.get(b.id),list.length);mesh.userData={blockType:b.id,chunkId:c.id,positions:list};
  list.forEach((p,i)=>{dummy.position.set(p[0]+.5,p[1]+.5,p[2]+.5);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
  mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=!isTouch;mesh.receiveShadow=true;scene.add(mesh);c.meshes.push(mesh);
 }
}
function updateChunks(force=false){
 const cx=chunkOf(player.x),cz=chunkOf(player.z),stamp=chunkKey(cx,cz);
 if(!force&&stamp===lastChunk)return;lastChunk=stamp;
 const wanted=new Set();
 for(let x=cx-RENDER_DISTANCE;x<=cx+RENDER_DISTANCE;x++)for(let z=cz-RENDER_DISTANCE;z<=cz+RENDER_DISTANCE;z++){
  const id=chunkKey(x,z);wanted.add(id);if(!chunks.has(id))generateChunk(x,z);
 }
 for(const [id,c] of chunks){if(!wanted.has(id)){for(const m of c.meshes)scene.remove(m);chunks.delete(id);}}
 document.querySelector("#worldInfo").textContent=`読み込み中 ${chunks.size}チャンク`;
}
function saveWorld(){try{localStorage.setItem(SAVE_KEY,JSON.stringify({mode,edits:[...blockEdits],x:player.x,y:player.y,z:player.z,score,health,hunger}));toast("ワールドを保存したよ");}catch{toast("保存容量が足りないみたい");}}
function loadWorld(){try{const d=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");if(!d)return;mode=d.mode==="creative"?"creative":"survival";for(const e of d.edits||[])blockEdits.set(e[0],e[1]);if(Number.isFinite(d.x)){player.x=d.x;player.y=d.y;player.z=d.z;}score=d.score||0;health=d.health||5;hunger=d.hunger??5;}catch{}}
function toast(s){toastEl.textContent=s;toastEl.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>toastEl.classList.remove("show"),1500);}
function renderHotbar(){const el=document.querySelector("#hotbar");el.innerHTML="";BLOCKS.forEach((b,i)=>{const n=document.createElement("button");n.className="slot"+(i===selected?" selected":"");n.title=b.name;n.innerHTML=`<i style="background:#${b.color.toString(16).padStart(6,"0")}"></i><small>${i+1}</small>`;n.onclick=()=>{selected=i;renderHotbar();};el.appendChild(n);});}
function updateHud(){document.querySelector("#health").textContent="❤ ".repeat(Math.max(0,health));document.querySelector("#hunger").textContent="● ".repeat(Math.max(0,hunger));document.querySelector("#score").textContent=`顔面撃破 ${score}`;document.querySelector("#modeLabel").textContent=mode==="survival"?"サバイバル":"クリエイティブ";document.querySelector("#modeButton").textContent=mode==="survival"?"クリエイティブへ":"サバイバルへ";}
function applyFace(mesh){if(!faceTexture)return;mesh.material=[new THREE.MeshLambertMaterial({color:0xffc7a0}),new THREE.MeshLambertMaterial({color:0xffc7a0}),new THREE.MeshLambertMaterial({color:0xffc7a0}),new THREE.MeshLambertMaterial({color:0xffc7a0}),new THREE.MeshLambertMaterial({map:faceTexture}),new THREE.MeshLambertMaterial({color:0xffc7a0})];}
function makeAvatar(){
 const g=new THREE.Group(),shirt=new THREE.MeshLambertMaterial({color:0x315b9a}),pants=new THREE.MeshLambertMaterial({color:0x303b4b});
 const body=new THREE.Mesh(new THREE.BoxGeometry(.62,.78,.34),shirt);body.position.y=.95;g.add(body);
 const head=new THREE.Mesh(new THREE.BoxGeometry(.62,.62,.62),new THREE.MeshLambertMaterial({color:0xffc7a0}));head.position.y=1.68;g.add(head);applyFace(head);
 for(const s of [-1,1]){const arm=new THREE.Mesh(new THREE.BoxGeometry(.24,.72,.28),shirt);arm.position.set(s*.44,.98,0);g.add(arm);const leg=new THREE.Mesh(new THREE.BoxGeometry(.27,.72,.3),pants);leg.position.set(s*.17,.36,0);g.add(leg);}scene.add(g);return g;
}
const avatar=makeAvatar();
function spawnEnemy(x,z){const y=heightAt(x,z)+1;const g=new THREE.Group();const head=new THREE.Mesh(new THREE.BoxGeometry(.9,.9,.9),new THREE.MeshLambertMaterial({color:0xffc3a0}));head.position.y=1.55;g.add(head);applyFace(head);const body=new THREE.Mesh(new THREE.BoxGeometry(.72,.85,.42),new THREE.MeshLambertMaterial({color:hash(x,z)>.5?0x9e3030:0x593d9b}));body.position.y=.65;g.add(body);g.position.set(x+.5,y,z+.5);scene.add(g);const e={group:g,head,hp:2,phase:hash(x+9,z+7)*6,hit:0};enemies.push(e);}
function seedEnemies(){for(let i=0;i<12;i++){const a=i*Math.PI*2/12,r=13+hash(i,77)*18;spawnEnemy(Math.floor(player.x+Math.cos(a)*r),Math.floor(player.z+Math.sin(a)*r));}}
function solidAt(x,y,z){return !!getBlock(Math.floor(x),Math.floor(y),Math.floor(z));}
function collides(x,y,z){const r=.28,h=1.72;return solidAt(x-r,y,z-r)||solidAt(x+r,y,z-r)||solidAt(x-r,y,z+r)||solidAt(x+r,y,z+r)||solidAt(x-r,y+h,z-r)||solidAt(x+r,y+h,z-r)||solidAt(x-r,y+h,z+r)||solidAt(x+r,y+h,z+r);}
function movePlayer(dt){
 const f=(keys.has("KeyW")||touchMove.has("forward")?1:0)-(keys.has("KeyS")||touchMove.has("back")?1:0),s=(keys.has("KeyD")||touchMove.has("right")?1:0)-(keys.has("KeyA")||touchMove.has("left")?1:0);
 const speed=(mode==="creative"?9:5.3)*dt,dir=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),d=dir.multiplyScalar(f).add(right.multiplyScalar(s));if(d.lengthSq())d.normalize().multiplyScalar(speed);
 if(!collides(player.x+d.x,player.y,player.z))player.x+=d.x;if(!collides(player.x,player.y,player.z+d.z))player.z+=d.z;
 if(mode==="creative"){if(keys.has("Space")||touchMove.has("jump"))player.y+=speed;if(keys.has("ShiftLeft")||touchMove.has("down"))player.y-=speed;velocityY=0;}
 else{velocityY-=21*dt;const ny=player.y+velocityY*dt;if(!collides(player.x,ny,player.z)){player.y=ny;grounded=false;}else{if(velocityY<0)grounded=true;velocityY=0;}if((keys.has("Space")||touchMove.has("jump"))&&grounded){velocityY=8;grounded=false;}if(player.y< -8){player.y=heightAt(player.x,player.z)+3;health=Math.max(1,health-1);updateHud();}}
}
function updateCamera(){avatar.position.set(player.x,player.y,player.z);avatar.rotation.y=yaw+Math.PI;avatar.visible=thirdPerson;const target=new THREE.Vector3(player.x,player.y+1.55,player.z);if(!thirdPerson){camera.position.copy(target);camera.rotation.order="YXZ";camera.rotation.y=yaw;camera.rotation.x=pitch;}else{camera.position.copy(target).add(new THREE.Vector3(Math.sin(yaw)*5,2+Math.sin(pitch)*1.5,Math.cos(yaw)*5));camera.lookAt(target);}}
function targetBlock(){raycaster.setFromCamera(center,camera);raycaster.far=6;const all=[];for(const c of chunks.values())all.push(...c.meshes);const hit=raycaster.intersectObjects(all,false)[0];if(!hit)return null;const list=hit.object.userData.positions,p=list?.[hit.instanceId];if(!p)return null;const n=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);return {p,n};}
function targetEnemy(){raycaster.setFromCamera(center,camera);raycaster.far=28;const objs=enemies.map(e=>e.group);const hit=raycaster.intersectObjects(objs,true)[0];if(!hit)return null;return enemies.find(e=>e.group===hit.object.parent||e.group===hit.object.parent?.parent)||null;}
function attack(){if(attackCooldown>0)return;attackCooldown=.32;const enemy=targetEnemy();if(enemy){enemy.hp--;enemy.hit=.16;score+=enemy.hp<=0?1:0;if(enemy.hp<=0){scene.remove(enemy.group);enemies.splice(enemies.indexOf(enemy),1);if(mode==="survival")health=Math.min(5,health+1);toast("顔面撃破！ +1");}else toast("ヒット！");updateHud();return;}
 const t=targetBlock();if(t){const [x,y,z]=t.p;if(y>0){setBlock(x,y,z,null);toast("ブロック破壊");}}
}
function place(){const t=targetBlock();if(!t)return;const x=t.p[0]+Math.round(t.n.x),y=t.p[1]+Math.round(t.n.y),z=t.p[2]+Math.round(t.n.z);if(getBlock(x,y,z))return;if(Math.abs(x-player.x)<.5&&Math.abs(z-player.z)<.5&&y>=player.y&&y<=player.y+1.8)return;setBlock(x,y,z,BLOCKS[selected].id);}
function updateEnemies(dt){for(const e of enemies){e.phase+=dt;const dx=player.x-e.group.position.x,dz=player.z-e.group.position.z,dist=Math.hypot(dx,dz);if(mode==="survival"&&dist<17&&dist>1.4){e.group.position.x+=dx/dist*dt*.8;e.group.position.z+=dz/dist*dt*.8;}e.group.position.y=heightAt(e.group.position.x,e.group.position.z)+1+Math.sin(e.phase*2)*.08;e.group.rotation.y=Math.atan2(dx,dz);if(e.hit>0){e.hit-=dt;e.group.scale.setScalar(1.12);}else e.group.scale.setScalar(1);if(mode==="survival"&&dist<1.35&&Math.random()<dt*.22){health=Math.max(0,health-1);updateHud();toast("顔面モンスターに接近された！");if(health===0){health=5;player.x=0;player.z=0;player.y=heightAt(0,0)+3;toast("リスポーン！");}}}}
function toggleMode(){mode=mode==="survival"?"creative":"survival";updateHud();toast(mode==="creative"?"自由に飛べるよ":"サバイバル開始");}
function toggleCamera(){thirdPerson=!thirdPerson;document.querySelector("#cameraButton").textContent=thirdPerson?"一人称":"三人称";}
function start(){document.querySelector("#help").hidden=true;if(!isTouch)renderer.domElement.requestPointerLock?.();}
document.querySelector("#startButton").onclick=start;document.querySelector("#modeButton").onclick=toggleMode;document.querySelector("#cameraButton").onclick=toggleCamera;document.querySelector("#saveButton").onclick=saveWorld;
document.addEventListener("pointerlockchange",()=>pointerLocked=document.pointerLockElement===renderer.domElement);
document.addEventListener("mousemove",e=>{if(pointerLocked){yaw-=e.movementX*.0022;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0022,-1.4,1.4);}});
renderer.domElement.addEventListener("contextmenu",e=>e.preventDefault());renderer.domElement.addEventListener("mousedown",e=>{if(e.button===0&&pointerLocked)attack();if(e.button===2&&pointerLocked)place();});
document.addEventListener("keydown",e=>{keys.add(e.code);if(/^Digit[1-8]$/.test(e.code)){selected=Number(e.code.slice(-1))-1;renderHotbar();}if(e.code==="KeyV")toggleCamera();if(e.code==="KeyM")toggleMode();if(e.code==="KeyF")attack();if(e.code==="KeyE")place();if(["Space","ArrowUp","ArrowDown"].includes(e.code))e.preventDefault();});
document.addEventListener("keyup",e=>keys.delete(e.code));
document.querySelectorAll("[data-move]").forEach(b=>{const a=b.dataset.move;b.addEventListener("pointerdown",e=>{e.preventDefault();touchMove.add(a);b.setPointerCapture(e.pointerId);});["pointerup","pointercancel","lostpointercapture"].forEach(n=>b.addEventListener(n,()=>touchMove.delete(a)));});
document.querySelector("#mobileAttack").onclick=attack;document.querySelector("#mobilePlace").onclick=place;document.querySelector("#mobileJump").onpointerdown=()=>touchMove.add("jump");document.querySelector("#mobileJump").onpointerup=()=>touchMove.delete("jump");
let lookId=null,lx=0,ly=0;renderer.domElement.addEventListener("pointerdown",e=>{if(isTouch&&e.clientX>innerWidth*.4){lookId=e.pointerId;lx=e.clientX;ly=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);}});renderer.domElement.addEventListener("pointermove",e=>{if(e.pointerId===lookId){yaw-=(e.clientX-lx)*.006;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-ly)*.006,-1.4,1.4);lx=e.clientX;ly=e.clientY;}});renderer.domElement.addEventListener("pointerup",()=>lookId=null);renderer.domElement.addEventListener("pointercancel",()=>lookId=null);
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
loadWorld();player.y=Math.max(player.y,heightAt(player.x,player.z)+1.1);updateChunks(true);seedEnemies();renderHotbar();updateHud();
function animate(now){requestAnimationFrame(animate);const dt=Math.min(.04,(now-lastTime)/1000||0);lastTime=now;attackCooldown=Math.max(0,attackCooldown-dt);movePlayer(dt);updateChunks();updateEnemies(dt);updateCamera();renderer.render(scene,camera);}
requestAnimationFrame(animate);addEventListener("beforeunload",()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify({mode,edits:[...blockEdits],x:player.x,y:player.y,z:player.z,score,health,hunger}));}catch{}});
