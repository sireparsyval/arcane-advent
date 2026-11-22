import test from "node:test";
import assert from "node:assert/strict";
import { transferVisuals, transferTileData, animateInventoryTransfer } from "../module/inventory-transfer-animation.mjs";
import { objectMotionPlan } from "../module/scene-object-motion.mjs";
import { projectileAppearance } from "../module/scene-projectiles.mjs";
const scene={id:"scene",width:2000,height:2000,grid:{size:100}};
const donor={documentName:"Token",parent:scene,x:100,y:100,width:1,height:1,elevation:0,levels:new Set(["floor"])};
const receiver={...donor,x:500};
const dagger={_id:"dagger",type:"weapon",name:"Dague",system:{groundTokenImage:"dagger.png",groundTokenSize:1.25,imageAngleOffset:45}};
test("transfers have one visual per independent root, not one per content item",()=>{
    const bag={_id:"bag",type:"container",system:{containerId:null}};
    const child={...dagger,system:{...dagger.system,containerId:"bag"}};
    const coin={type:"purse",system:{coinPile:true,coins:{gold:2}}};
    assert.deepEqual(transferVisuals({creates:[bag,child],visuals:[coin]}),[bag,coin]);
});
test("a 0.25s transfer uses the real item appearance and compensates intrinsic angle",()=>{
    const tile=transferTileData(dagger,donor,receiver,{clock:()=>1000,id:()=>"visual"});
    const flight=tile.flags["arcane-advent"].objectMotion;
    assert.equal(flight.duration,250); assert.equal(tile.texture.src,"dagger.png"); assert.equal(tile.width,125);
    assert.deepEqual(flight.from,{x:150,y:150}); assert.deepEqual(flight.to,{x:550,y:150});
    assert.equal(projectileAppearance(flight,1275).rotation,-135);
    assert.equal(tile.flags["arcane-advent"].transferVisual.expiresAt,6400);
    assert.equal(transferTileData(dagger,{...donor,hidden:true},receiver,{clock:()=>0,id:()=>"x"}).hidden,true);
});
test("intrinsic angle is compensated for direction, never for locked rotation or character tokens",()=>{
    const inventory={type:"storage",items:[{system:dagger.system}]};
    const token={...donor,actor:inventory,rotation:12};
    const points=[{x:150,y:150},{x:550,y:150}];
    assert.equal(objectMotionPlan(token,points,{rotation:"direction"},{clock:()=>0,id:()=>"x"}).rotation,225);
    assert.equal(objectMotionPlan(token,points,{rotation:"locked"},{clock:()=>0,id:()=>"x"}).rotation,12);
    assert.equal(objectMotionPlan({...token,actor:{type:"character",items:inventory.items}},points,{rotation:"direction"},{clock:()=>0,id:()=>"x"}).rotation,270);
});
test("transient visuals are deleted after travel and never create inventory documents",async()=>{
    const inventory={uuid:"Actor.source"},created=[],removed=[];
    const localScene={...scene,tiles:new Map(),tokens:[],
        async createEmbeddedDocuments(type,data){assert.equal(type,"Tile");created.push(...data);return data.map((source,i)=>{const tile={id:String(i),...source};this.tiles.set(tile.id,tile);return tile;});},
        async deleteEmbeddedDocuments(type,ids){assert.equal(type,"Tile");removed.push(...ids);for(const id of ids)this.tiles.delete(id);}};
    const giver={...donor,parent:localScene,actor:inventory},target={...receiver,parent:localScene};
    localScene.tokens.push(giver,target);
    globalThis.foundry={utils:{randomID:()=>"flight"}};
    globalThis.game={time:{serverTime:1000}};
    await animateInventoryTransfer(inventory,target,{creates:[dagger]});
    assert.equal(created.length,1);assert.deepEqual(removed,["0"]);assert.equal(localScene.tiles.size,0);
});

test("scenery tiles compensate the copied intrinsic angle, independent of inventory tokens",()=>{
    const tile={documentName:"Tile",parent:scene,x:150,y:150,width:100,height:100,rotation:0,
        getFlag:(_scope,key)=>key==="sceneObject"?{imageAngleOffset:45}:null};
    const result=objectMotionPlan(tile,[{x:150,y:150},{x:550,y:150}],{rotation:"direction"},{clock:()=>0,id:()=>"x"});
    assert.equal(result.rotation,225);
});
