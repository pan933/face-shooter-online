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
 {id:"brick",name:"レンガ",color:0xa64f43},{id:"glass",name:"ガラス",color:0x9bdce8,transparent:true},
 {id:"coal",name:"石炭鉱石",color:0x33383a},{id:"iron",name:"鉄鉱石",color:0xc18b65},{id:"gold",name:"金鉱石",color:0xe5c44b},{id:"diamond",name:"ダイヤ鉱石",color:0x53d7d1},{id:"chest",name:"宝箱",color:0x98602c},{id:"door",name:"ドア",color:0x9a6338},{id:"door_open",name:"開いたドア",color:0xc28b50,transparent:true},{id:"planks",name:"板材",color:0xb7824c},{id:"snow",name:"雪",color:0xe8f3fa},{id:"cobble",name:"丸石",color:0x6f777a}
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
let health=5,hunger=5,score=0,attackCooldown=0,worldSeed=73921,toolLevel=0;\nlet dayTime=0.18,dayCount=1;const cycleLength=360;let cycleLabel=null,sunSprite=null,moonSprite=null;
const inventory={grass:0,dirt:0,stone:0,wood:0,leaves:0,sand:0,brick:0,glass:0,coal:0,iron:0,gold:0,diamond:0,plank:0,stick:0,iron_ingot:0,gold_ingot:0,diamond_sword:0};
const animals=[];\nfunction emojiSprite(emoji,size=128){const canvas=document.createElement("canvas");canvas.width=canvas.height=size;const ctx=canvas.getContext("2d");ctx.font=`${size*.78}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(emoji,size/2,size/2+5);const tex=new THREE.CanvasTexture(canvas);const mat=new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false});const sp=new THREE.Sprite(mat);sp.scale.set(9,9,1);scene.add(sp);return sp;}\nsunSprite=emojiSprite("😎",160);moonSprite=emojiSprite("🌙",160);
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
  for(let y=0;y<=h;y++){
   const caveNoise=Math.sin(x*.19+y*.31)*Math.cos(z*.17-y*.23)+Math.sin((x-z+y)*.11);
   if(y>2&&y<h-2&&caveNoise>1.18)continue;
   let type=y===h?(beach?"sand":"grass"):y>=h-3?"dirt":"stone";
   if(type==="stone"&&y<h-2){const r=hash(x*31+y*7,z*29-y*11);if(y<6&&r>.992)type="diamond";else if(y<10&&r>.982)type="gold";else if(r>.955)type="iron";else if(r>.91)type="coal";}
   c.blocks.set(key(x,y,z),type);
  }
  if(hash(x+513,z-218)>.997&&h>6)c.blocks.set(key(x,h+1,z),"chest");
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
  list.forEach((p,i)=>{if(b.id==="door"||b.id==="door_open"){dummy.position.set(p[0]+.5,p[1]+.5,p[2]+.5);dummy.scale.set(b.id==="door_open"?.12:.82,1,.12);dummy.rotation.y=b.id==="door_open"?Math.PI/2:0;}else{dummy.position.set(p[0]+.5,p[1]+.5,p[2]+.5);dummy.scale.set(1,1,1);dummy.rotation.set(0,0,0);}dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
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
function saveWorld(){try{localStorage.setItem(SAVE_KEY,JSON.stringify({mode,edits:[...blockEdits],x:player.x,y:player.y,z:player.z,score,health,hunger,inventory,toolLevel}));toast("ワールドを保存したよ");}catch{toast("保存容量が足りないみたい");}}
function loadWorld(){try{const d=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");if(!d)return;mode=d.mode==="creative"?"creative":"survival";for(const e of d.edits||[])blockEdits.set(e[0],e[1]);if(Number.isFinite(d.x)){player.x=d.x;player.y=d.y;player.z=d.z;}score=d.score||0;health=d.health||5;hunger=d.hunger??5;Object.assign(inventory,d.inventory||{});toolLevel=d.toolLevel||0;}catch{}}
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
function spawnEnemy(x,z){const y=heightAt(x,z)+1;const g=new THREE.Group();const head=new THREE.Mesh(new THREE.BoxGeometry(.9,.9,.9),new THREE.MeshLambertMaterial({color:0xffc3a0}));head.position.y=1.55;g.add(head);applyFace(head);const body=new THREE.Mesh(new THREE.BoxGeometry(.72,.85,.42),new THREE.MeshLambertMaterial({color:hash(x,z)>.5?0x9e3030:0x593d9b}));body.position.y=.65;g.add(body);g.position.set(x+.5,y,z+.5);scene.add(g);const e={group:g,head,hp:2,maxHp:2,phase:hash(x+9,z+7)*6,hit:0,flash:0};\n const barCanvas=document.createElement("canvas");barCanvas.width=128;barCanvas.height=24;const barCtx=barCanvas.getContext("2d");const barTex=new THREE.CanvasTexture(barCanvas);const bar=new THREE.Sprite(new THREE.SpriteMaterial({map:barTex,transparent:true,depthWrite:false}));bar.scale.set(1.35,.25,1);bar.position.y=2.35;g.add(bar);e.bar={canvas:barCanvas,ctx:barCtx,texture:barTex};drawEnemyBar(e);enemies.push(e);}\nfunction drawEnemyBar(e){const {canvas,ctx,texture}=e.bar;if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#251414";ctx.fillRect(2,3,124,18);ctx.fillStyle=e.boss?"#ffb000":"#e94343";ctx.fillRect(4,5,120*Math.max(0,e.hp/e.maxHp),14);ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.strokeRect(2,3,124,18);texture.needsUpdate=true;}
function seedEnemies(){for(let i=0;i<12;i++){const a=i*Math.PI*2/12,r=13+hash(i,77)*18;spawnEnemy(Math.floor(player.x+Math.cos(a)*r),Math.floor(player.z+Math.sin(a)*r));}}
function spawnBoss(x,z){const before=enemies.length;spawnEnemy(x,z);const boss=enemies[before];boss.hp=12;boss.maxHp=12;boss.boss=true;drawEnemyBar(boss);boss.group.scale.setScalar(2.1);boss.group.children.forEach(m=>{if(m.material?.color)m.material.color.setHex(0x8b1d45);});}
function seedAnimals(){for(let i=0;i<8;i++){const a=i*Math.PI/4,r=7+hash(i+70,99)*16,x=Math.floor(player.x+Math.cos(a)*r),z=Math.floor(player.z+Math.sin(a)*r);const g=new THREE.Group(),fur=new THREE.MeshLambertMaterial({color:[0xf1eee2,0x9b7652,0x555555][i%3]});const body=new THREE.Mesh(new THREE.BoxGeometry(.9,.65,.48),fur);body.position.y=.65;g.add(body);const head=new THREE.Mesh(new THREE.BoxGeometry(.42,.42,.42),fur);head.position.set(0,1.12,.28);g.add(head);g.position.set(x+.5,heightAt(x,z)+1,z+.5);scene.add(g);animals.push({group:g,phase:hash(x,z)*8,homeX:x,homeZ:z});}}
function updateAnimals(dt){for(const a of animals){a.phase+=dt;const drift=Math.sin(a.phase*.25)*.7;a.group.position.x=a.homeX+.5+drift;a.group.position.z=a.homeZ+.5+Math.cos(a.phase*.2)*.7;a.group.position.y=heightAt(a.group.position.x,a.group.position.z)+1;}}
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
function targetBlock(){raycaster.setFromCamera(center,camera);raycaster.far=6;const all=[];for(const c of chunks.values())all.push(...c.meshes);const hit=raycaster.intersectObjects(all,false)[0];if(!hit)return null;const list=hit.object.userData.positions,p=list?.[hit.instanceId];if(!p)return null;const n=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);return {p,n,type:getBlock(p[0],p[1],p[2])};}
function targetEnemy(){raycaster.setFromCamera(center,camera);raycaster.far=28;const objs=enemies.map(e=>e.group);const hit=raycaster.intersectObjects(objs,true)[0];if(!hit)return null;return enemies.find(e=>e.group===hit.object.parent||e.group===hit.object.parent?.parent)||null;}
function attack(){if(attackCooldown>0)return;attackCooldown=toolLevel>0?0.18:0.32;const enemy=targetEnemy();if(enemy){enemy.hp-=inventory.diamond_sword>0?3:1;enemy.hit=.28;enemy.flash=.28;enemy.group.traverse(o=>{if(o.isMesh){o.userData.flashMats=[];const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(m.color){o.userData.flashMats.push([m,m.color.getHex()]);m.color.setHex(0xff1717);}}}});drawEnemyBar(enemy);score+=enemy.hp<=0?1:0;if(enemy.hp<=0){scene.remove(enemy.group);enemies.splice(enemies.indexOf(enemy),1);if(mode==="survival")health=Math.min(5,health+1);toast("顔面撃破！ +1");if(score>0&&score%5===0){spawnBoss(Math.floor(player.x+8),Math.floor(player.z+8));toast("ボス顔面が出現！！");}}else toast("ヒット！");updateHud();return;}
 const t=targetBlock();if(t){const [x,y,z]=t.p;if(t.type==="door"){setBlock(x,y,z,"door_open");toast("ドアを開けた！");return;}if(t.type==="door_open"){setBlock(x,y,z,"door");toast("ドアを閉めた！");return;}if(t.type==="chest"){setBlock(x,y,z,null);const loot=["iron","coal","gold","diamond","wood"];const item=loot[Math.floor(Math.random()*loot.length)];inventory[item]=(inventory[item]||0)+(item==="diamond"?1:3);updateInventory();toast("宝箱発見！ "+item+" を入手");return;}if(y>0){if(mode==="survival")inventory[t.type]=(inventory[t.type]||0)+1;setBlock(x,y,z,null);updateInventory();toast("ブロック採掘");}}
}
function place(){const t=targetBlock();if(!t)return;const x=t.p[0]+Math.round(t.n.x),y=t.p[1]+Math.round(t.n.y),z=t.p[2]+Math.round(t.n.z);if(getBlock(x,y,z))return;if(mode==="survival"&&(inventory[BLOCKS[selected].id]||0)<=0){toast("そのブロックを持っていないよ");return;}if(Math.abs(x-player.x)<.5&&Math.abs(z-player.z)<.5&&y>=player.y&&y<=player.y+1.8)return;setBlock(x,y,z,BLOCKS[selected].id);if(mode==="survival")inventory[BLOCKS[selected].id]--;updateInventory();}
function updateEnemies(dt){for(const e of enemies){e.phase+=dt;const dx=player.x-e.group.position.x,dz=player.z-e.group.position.z,dist=Math.hypot(dx,dz);if(mode==="survival"&&dist<17&&dist>1.4){e.group.position.x+=dx/dist*dt*.8;e.group.position.z+=dz/dist*dt*.8;}e.group.position.y=heightAt(e.group.position.x,e.group.position.z)+1+Math.sin(e.phase*2)*.08;e.group.rotation.y=Math.atan2(dx,dz);if(e.hit>0){e.hit-=dt;e.group.scale.setScalar(1.12);}else{e.group.scale.setScalar(1);if(e.flash>0){e.flash=0;e.group.traverse(o=>{for(const pair of (o.userData.flashMats||[]))pair[0].color.setHex(pair[1]);o.userData.flashMats=[];});}}if(mode==="survival"&&dist<1.35&&Math.random()<dt*.22){health=Math.max(0,health-1);updateHud();toast("顔面モンスターに接近された！");if(health===0){health=5;player.x=0;player.z=0;player.y=heightAt(0,0)+3;toast("リスポーン！");}}}}
function updateInventory(){const el=document.querySelector("#inventory");if(el)el.textContent="所持: "+Object.entries(inventory).filter(([k,v])=>v>0).map(([k,v])=>k+"×"+v).join(" / ");}
function craft(){const recipes=[
 {name:"木材→板材",need:{wood:1},give:{plank:4}},{name:"板材→棒",need:{plank:2},give:{stick:4}},
 {name:"石のツルハシ",need:{stone:3,stick:2},give:{tool:1}},{name:"鉄インゴット",need:{iron:3},give:{iron_ingot:1}},
 {name:"金インゴット",need:{gold:3},give:{gold_ingot:1}},{name:"ダイヤ剣",need:{diamond:2,stick:1},give:{diamond_sword:1}}
 ];const menu=document.querySelector("#craftMenu");menu.innerHTML="";recipes.forEach(r=>{const b=document.createElement("button");b.textContent=r.name+" ("+Object.entries(r.need).map(([k,v])=>k+"×"+v).join(", ")+")";b.onclick=()=>{if(!Object.entries(r.need).every(([k,v])=>(inventory[k]||0)>=v)){toast("素材が足りないよ");return;}for(const [k,v] of Object.entries(r.need))inventory[k]-=v;for(const [k,v] of Object.entries(r.give)){if(k==="tool")toolLevel=Math.min(1,toolLevel+1);else inventory[k]=(inventory[k]||0)+v;}updateInventory();toast("クラフト成功: "+r.name);};menu.appendChild(b);});menu.hidden=!menu.hidden;}
function toggleMode(){mode=mode==="survival"?"creative":"survival";updateHud();toast(mode==="creative"?"自由に飛べるよ":"サバイバル開始");}
function toggleCamera(){thirdPerson=!thirdPerson;document.querySelector("#cameraButton").textContent=thirdPerson?"一人称":"三人称";}
function start(){document.querySelector("#help").hidden=true;if(!isTouch)renderer.domElement.requestPointerLock?.();}
document.querySelector("#startButton").onclick=start;document.querySelector("#craftButton").onclick=craft;document.querySelector("#modeButton").onclick=toggleMode;document.querySelector("#cameraButton").onclick=toggleCamera;document.querySelector("#saveButton").onclick=saveWorld;
document.addEventListener("pointerlockchange",()=>pointerLocked=document.pointerLockElement===renderer.domElement);
document.addEventListener("mousemove",e=>{if(pointerLocked){yaw-=e.movementX*.0022;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0022,-1.4,1.4);}});
renderer.domElement.addEventListener("contextmenu",e=>e.preventDefault());renderer.domElement.addEventListener("mousedown",e=>{if(e.button===0&&pointerLocked)attack();if(e.button===2&&pointerLocked)place();});
document.addEventListener("keydown",e=>{keys.add(e.code);if(/^Digit[1-8]$/.test(e.code)){selected=Number(e.code.slice(-1))-1;renderHotbar();}if(e.code==="KeyV")toggleCamera();if(e.code==="KeyM")toggleMode();if(e.code==="KeyF")attack();if(e.code==="KeyE")place();if(["Space","ArrowUp","ArrowDown"].includes(e.code))e.preventDefault();});
document.addEventListener("keyup",e=>keys.delete(e.code));
document.querySelectorAll("[data-move]").forEach(b=>{const a=b.dataset.move;b.addEventListener("pointerdown",e=>{e.preventDefault();touchMove.add(a);b.setPointerCapture(e.pointerId);});["pointerup","pointercancel","lostpointercapture"].forEach(n=>b.addEventListener(n,()=>touchMove.delete(a)));});
document.querySelector("#mobileAttack").onclick=attack;document.querySelector("#mobilePlace").onclick=place;document.querySelector("#mobileJump").onpointerdown=()=>touchMove.add("jump");document.querySelector("#mobileJump").onpointerup=()=>touchMove.delete("jump");
let lookId=null,lx=0,ly=0;renderer.domElement.addEventListener("pointerdown",e=>{if(isTouch&&e.clientX>innerWidth*.4){lookId=e.pointerId;lx=e.clientX;ly=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);}});renderer.domElement.addEventListener("pointermove",e=>{if(e.pointerId===lookId){yaw-=(e.clientX-lx)*.006;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-ly)*.006,-1.4,1.4);lx=e.clientX;ly=e.clientY;}});renderer.domElement.addEventListener("pointerup",()=>lookId=null);renderer.domElement.addEventListener("pointercancel",()=>lookId=null);
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
loadWorld();player.y=Math.max(player.y,heightAt(player.x,player.z)+1.1);updateChunks(true);seedEnemies();seedAnimals();renderHotbar();updateHud();updateInventory();\ncycleLabel=document.createElement("div");cycleLabel.id="dayClock";cycleLabel.style.cssText="position:fixed;top:62px;left:12px;z-index:6;padding:6px 10px;border-radius:8px;background:#101b16bb;color:white;font:bold 13px system-ui;text-shadow:0 1px 3px #000;pointer-events:none";document.body.appendChild(cycleLabel);
function updateDayNight(dt){dayTime=(dayTime+dt/cycleLength)%1;if(dayTime<.002&&lastTime>0)dayCount++;const angle=dayTime*Math.PI*2-Math.PI/2;const daylight=Math.max(0,Math.sin(angle));const night=1-daylight;const sky=new THREE.Color().setRGB(.035+daylight*.48,.045+daylight*.66,.12+daylight*.78);scene.background.copy(sky);scene.fog.color.copy(sky);sun.intensity=.16+daylight*2.1;sun.color.setRGB(1,.72+daylight*.2,.55+daylight*.4);sun.position.set(Math.cos(angle)*70,Math.sin(angle)*75,25);sunSprite.position.set(Math.cos(angle)*55,Math.sin(angle)*48+18,-28);moonSprite.position.set(-Math.cos(angle)*55,-Math.sin(angle)*48+18,-28);sunSprite.visible=daylight>.08;moonSprite.visible=daylight<=.18;const amb=scene.children.find(o=>o.isHemisphereLight);if(amb)amb.intensity=.55+daylight*1.45;if(cycleLabel){const h=Math.floor(dayTime*24);cycleLabel.textContent=`${dayCount}日目 ${String(h).padStart(2,"0")}:00 ${daylight>.12?"☀ 昼":"🌙 夜"}`;}}\nfunction animate(now){requestAnimationFrame(animate);const dt=Math.min(.04,(now-lastTime)/1000||0);lastTime=now;attackCooldown=Math.max(0,attackCooldown-dt);movePlayer(dt);updateChunks();updateEnemies(dt);updateAnimals(dt);updateDayNight(dt);updateCamera();renderer.render(scene,camera);}
requestAnimationFrame(animate);addEventListener("beforeunload",()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify({mode,edits:[...blockEdits],x:player.x,y:player.y,z:player.z,score,health,hunger,inventory,toolLevel}));}catch{}});
