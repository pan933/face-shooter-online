import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

const root = document.querySelector("#game");
const toastEl = document.querySelector("#toast");
const hintEl = document.querySelector("#hint");
const modeLabel = document.querySelector("#modeLabel");
const hotbarEl = document.querySelector("#hotbar");
const isTouch = matchMedia("(pointer: coarse)").matches;
const SAVE_KEY = "facecraft-world-v1";
const SIZE = 30;
const BLOCKS = [
  {id:"grass",name:"草ブロック",color:0x65a844},
  {id:"dirt",name:"土",color:0x8b5a35},
  {id:"stone",name:"石",color:0x858b8d},
  {id:"wood",name:"木材",color:0x9b6a3c},
  {id:"leaves",name:"葉っぱ",color:0x397b3c},
  {id:"sand",name:"砂",color:0xd8c27a}
];
let selected = 0;
let mode = "survival";
let thirdPerson = false;
let pointerLocked = false;
let yaw = 0, pitch = 0;
let velocityY = 0, grounded = false;
let health = 5, hunger = 5;
let lastTime = performance.now();
const keys = new Set();
const moveTouch = new Set();
const blocks = new Map();
const meshes = new Map();
const meshMaps = new Map();
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0,0);
const clock = new THREE.Clock();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91c5e8);
scene.fog = new THREE.Fog(0x91c5e8, 24, 65);
const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 150);
const renderer = new THREE.WebGLRenderer({antialias:!isTouch, powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.35 : 1.8));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !isTouch;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd9efff,0x63734c,2.0));
const sun = new THREE.DirectionalLight(0xfff0d1,2.2);
sun.position.set(-25,40,20);
sun.castShadow = !isTouch;
sun.shadow.mapSize.set(1024,1024);
scene.add(sun);

const materials = new Map(BLOCKS.map(b=>[b.id,new THREE.MeshLambertMaterial({color:b.color})]));
const cubeGeo = new THREE.BoxGeometry(1,1,1);
const keyOf=(x,y,z)=>`${x},${y},${z}`;
const parseKey=k=>k.split(",").map(Number);
const getBlock=(x,y,z)=>blocks.get(keyOf(x,y,z));
const setBlock=(x,y,z,type)=>{ if(type) blocks.set(keyOf(x,y,z),type); else blocks.delete(keyOf(x,y,z)); };
const inBounds=(x,z)=>x>=-SIZE/2&&x<SIZE/2&&z>=-SIZE/2&&z<SIZE/2;

function terrainHeight(x,z){
  const wave=Math.sin(x*.31)*1.25+Math.cos(z*.27)*1.15+Math.sin((x+z)*.18)*.9;
  return Math.max(2,Math.min(8,Math.floor(4+wave)));
}
function addTree(x,z,base){
  const trunk=3+(Math.abs(x*7+z*3)%2);
  for(let y=1;y<=trunk;y++) setBlock(x,base+y,z,"wood");
  for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) for(let dy=trunk-1;dy<=trunk+2;dy++){
    if(Math.abs(dx)+Math.abs(dz)+(dy===trunk+2?1:0)<=4 && !getBlock(x+dx,base+dy,z+dz)) setBlock(x+dx,base+dy,z+dz,"leaves");
  }
}
function generateWorld(){
  blocks.clear();
  for(let x=-SIZE/2;x<SIZE/2;x++) for(let z=-SIZE/2;z<SIZE/2;z++){
    const h=terrainHeight(x,z);
    for(let y=0;y<=h;y++) setBlock(x,y,z,y===h?"grass":y>=h-2?"dirt":"stone");
    if((Math.abs(x*13+z*17)%71===0)&&Math.abs(x)>3&&Math.abs(z)>3) addTree(x,z,h);
  }
  // Spawn clearing
  for(let x=-2;x<=2;x++) for(let z=-2;z<=2;z++){
    const h=terrainHeight(x,z);
    for(let y=h+1;y<h+6;y++) setBlock(x,y,z,null);
  }
}
function rebuildMeshes(){
  for(const mesh of meshes.values()){scene.remove(mesh);mesh.dispose?.();}
  meshes.clear(); meshMaps.clear();
  const grouped=new Map(BLOCKS.map(b=>[b.id,[]]));
  for(const [key,type] of blocks){const [x,y,z]=parseKey(key);grouped.get(type)?.push({x,y,z,key});}
  const dummy=new THREE.Object3D();
  for(const b of BLOCKS){
    const list=grouped.get(b.id); if(!list.length) continue;
    const inst=new THREE.InstancedMesh(cubeGeo,materials.get(b.id),list.length);
    inst.userData.blockType=b.id;
    list.forEach((p,i)=>{dummy.position.set(p.x+.5,p.y+.5,p.z+.5);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);});
    inst.instanceMatrix.needsUpdate=true;
    inst.castShadow=!isTouch; inst.receiveShadow=true;
    scene.add(inst); meshes.set(b.id,inst); meshMaps.set(b.id,list);
  }
}
function showToast(msg){
  toastEl.textContent=msg;toastEl.classList.add("show");
  clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toastEl.classList.remove("show"),1600);
}
function renderHotbar(){
  hotbarEl.innerHTML="";
  BLOCKS.forEach((b,i)=>{
    const el=document.createElement("button");el.className="slot"+(i===selected?" selected":"");
    el.title=b.name;el.innerHTML=`<span class="swatch" style="background:#${b.color.toString(16).padStart(6,"0")}"></span><small>${i+1}</small>`;
    el.addEventListener("click",()=>{selected=i;renderHotbar();});
    hotbarEl.appendChild(el);
  });
}
function updateModeUI(){
  modeLabel.textContent=mode==="survival"?"サバイバル":"クリエイティブ";
  document.querySelector("#health").style.opacity=mode==="survival"?"1":".25";
  document.querySelector("#hunger").style.opacity=mode==="survival"?"1":".25";
  document.querySelector("#modeButton").textContent=mode==="survival"?"クリエイティブへ":"サバイバルへ";
}
function saveWorld(){
  try{
    const data={mode,blocks:[...blocks.entries()]};
    localStorage.setItem(SAVE_KEY,JSON.stringify(data));
    showToast("ワールドをこの端末に保存したよ");
  }catch(e){showToast("保存できなかった（容量を確認してね）");}
}
function loadWorld(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);if(!raw)return false;
    const data=JSON.parse(raw);
    if(!Array.isArray(data.blocks))return false;
    blocks.clear();
    for(const [k,v] of data.blocks) if(BLOCKS.some(b=>b.id===v))blocks.set(k,v);
    mode=data.mode==="creative"?"creative":"survival";
    return true;
  }catch{return false;}
}
generateWorld();
if(!loadWorld()) showToast("新しいワールドを生成したよ");
rebuildMeshes();renderHotbar();updateModeUI();

const player={x:.5,y:terrainHeight(0,0)+1.01,z:.5};
camera.position.set(player.x,player.y+0.62,player.z);
function solidAt(x,y,z){return !!getBlock(Math.floor(x),Math.floor(y),Math.floor(z));}
function collides(px,py,pz){
  const r=.29, h=1.75;
  return solidAt(px-r,py,pz-r)||solidAt(px+r,py,pz-r)||solidAt(px-r,py,pz+r)||solidAt(px+r,py,pz+r)||
    solidAt(px-r,py+h,pz-r)||solidAt(px+r,py+h,pz-r)||solidAt(px-r,py+h,pz+r)||solidAt(px+r,py+h,pz+r);
}
function movePlayer(dt){
  const forward=(keys.has("KeyW")||moveTouch.has("forward")?1:0)-(keys.has("KeyS")||moveTouch.has("back")?1:0);
  const side=(keys.has("KeyD")||moveTouch.has("right")?1:0)-(keys.has("KeyA")||moveTouch.has("left")?1:0);
  const speed=(mode==="creative"?8:5.2)*dt;
  const dir=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const delta=dir.multiplyScalar(forward).add(right.multiplyScalar(side));
  if(delta.lengthSq()>0)delta.normalize().multiplyScalar(speed);
  const nx=player.x+delta.x,nz=player.z+delta.z;
  if(!collides(nx,player.y,player.z))player.x=nx;
  if(!collides(player.x,player.y,nz))player.z=nz;
  if(mode==="creative"){
    if(keys.has("Space")||moveTouch.has("jump"))player.y+=speed;
    if(keys.has("ShiftLeft"))player.y-=speed;
    velocityY=0;grounded=false;
  }else{
    velocityY-=20*dt;
    const ny=player.y+velocityY*dt;
    if(!collides(player.x,ny,player.z)){player.y=ny;grounded=false;}
    else{if(velocityY<0)grounded=true;velocityY=0;}
    if((keys.has("Space")||moveTouch.has("jump"))&&grounded){velocityY=8;grounded=false;}
    if(player.y< -10){player.y=terrainHeight(0,0)+3;health=Math.max(1,health-1);showToast("高いところから落ちた！");}
  }
}
function updateCamera(){
  const target=new THREE.Vector3(player.x,player.y+1.55,player.z);
  if(!thirdPerson){
    camera.position.copy(target);
    camera.rotation.order="YXZ";camera.rotation.y=yaw;camera.rotation.x=pitch;
  }else{
    const distance=5.2;
    const offset=new THREE.Vector3(Math.sin(yaw)*distance,2.1+Math.sin(pitch)*1.5,Math.cos(yaw)*distance);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  }
}
function getTarget(){
  raycaster.setFromCamera(center,camera);raycaster.far=6;
  const hits=raycaster.intersectObjects([...meshes.values()],false);
  if(!hits.length)return null;
  const hit=hits[0],list=meshMaps.get(hit.object.userData.blockType);
  const p=list?.[hit.instanceId];if(!p)return null;
  const normal=hit.face?.normal?.clone()||new THREE.Vector3(0,1,0);
  normal.transformDirection(hit.object.matrixWorld);
  return {block:p,normal};
}
function breakBlock(){
  const target=getTarget();if(!target)return;
  const {x,y,z}=target.block;
  if(y===0){showToast("一番下のブロックは壊せないよ");return;}
  setBlock(x,y,z,null);rebuildMeshes();
}
function placeBlock(){
  const target=getTarget();if(!target)return;
  const n=target.normal, x=target.block.x+Math.round(n.x),y=target.block.y+Math.round(n.y),z=target.block.z+Math.round(n.z);
  if(getBlock(x,y,z))return;
  if(x>=player.x-.45&&x<=player.x+.45&&z>=player.z-.45&&z<=player.z+.45&&y>=player.y&&y<=player.y+1.8)return;
  setBlock(x,y,z,BLOCKS[selected].id);rebuildMeshes();
}
function toggleCamera(){thirdPerson=!thirdPerson;document.querySelector("#cameraButton").textContent=thirdPerson?"一人称":"三人称";showToast(thirdPerson?"三人称視点":"一人称視点");}
function toggleMode(){mode=mode==="survival"?"creative":"survival";updateModeUI();showToast(mode==="creative"?"クリエイティブモード":"サバイバルモード");}
function startGame(){
  document.querySelector("#help").style.display="none";
  if(!isTouch)renderer.domElement.requestPointerLock?.();
  hintEl.textContent=isTouch?"左側で移動・右側をスワイプ":"Escでマウス解除";
}
document.querySelector("#startButton").addEventListener("click",startGame);
document.querySelector("#modeButton").addEventListener("click",toggleMode);
document.querySelector("#cameraButton").addEventListener("click",toggleCamera);
document.querySelector("#saveButton").addEventListener("click",saveWorld);
document.addEventListener("pointerlockchange",()=>{pointerLocked=document.pointerLockElement===renderer.domElement;});
document.addEventListener("mousemove",e=>{if(!pointerLocked)return;yaw-=e.movementX*.0022;pitch=Math.max(-1.45,Math.min(1.45,pitch-e.movementY*.0022));});
renderer.domElement.addEventListener("click",()=>{if(!isTouch&&!pointerLocked&&document.querySelector("#help").style.display==="none")renderer.domElement.requestPointerLock?.();});
renderer.domElement.addEventListener("contextmenu",e=>e.preventDefault());
renderer.domElement.addEventListener("mousedown",e=>{if(!pointerLocked)return;if(e.button===0)breakBlock();if(e.button===2)placeBlock();});
document.addEventListener("keydown",e=>{
  keys.add(e.code);
  if(/^Digit[1-6]$/.test(e.code)){selected=Number(e.code.slice(-1))-1;renderHotbar();}
  if(e.code==="KeyV")toggleCamera();if(e.code==="KeyM")toggleMode();
  if(["Space","ArrowUp","ArrowDown"].includes(e.code))e.preventDefault();
});
document.addEventListener("keyup",e=>keys.delete(e.code));
document.querySelectorAll("[data-move]").forEach(btn=>{
  const action=btn.dataset.move;
  btn.addEventListener("pointerdown",e=>{e.preventDefault();moveTouch.add(action);btn.setPointerCapture(e.pointerId);});
  ["pointerup","pointercancel","lostpointercapture"].forEach(ev=>btn.addEventListener(ev,()=>moveTouch.delete(action)));
});
document.querySelector("#mobileJump").addEventListener("pointerdown",()=>moveTouch.add("jump"));
document.querySelector("#mobileJump").addEventListener("pointerup",()=>moveTouch.delete("jump"));
document.querySelector("#mobileBreak").addEventListener("click",breakBlock);
document.querySelector("#mobilePlace").addEventListener("click",placeBlock);
let lookPointer=null,lastLookX=0,lastLookY=0;
renderer.domElement.addEventListener("pointerdown",e=>{if(!isTouch||e.clientX<innerWidth*.42)return;lookPointer=e.pointerId;lastLookX=e.clientX;lastLookY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener("pointermove",e=>{if(lookPointer!==e.pointerId)return;yaw-=(e.clientX-lastLookX)*.006;pitch=Math.max(-1.4,Math.min(1.4,pitch-(e.clientY-lastLookY)*.006));lastLookX=e.clientX;lastLookY=e.clientY;});
renderer.domElement.addEventListener("pointerup",e=>{if(lookPointer===e.pointerId)lookPointer=null;});
renderer.domElement.addEventListener("pointercancel",()=>lookPointer=null);
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

function animate(now){
  requestAnimationFrame(animate);
  const dt=Math.min(.04,(now-lastTime)/1000||0);lastTime=now;
  movePlayer(dt);updateCamera();
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
addEventListener("beforeunload",()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify({mode,blocks:[...blocks.entries()]}));}catch{}});
