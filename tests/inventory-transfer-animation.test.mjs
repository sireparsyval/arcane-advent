import test from "node:test";
import assert from "node:assert/strict";
import { inventoryForDocument } from "../module/storage-inventory.mjs";
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

test("returning the same item resolves the new sender and current token positions, not its original owner", async () => {
    const raviel={uuid:"Actor.raviel"},ziggy={uuid:"Actor.ziggy"},created=[];
    const localScene={...scene,tiles:new Map(),tokens:[],
        async createEmbeddedDocuments(type,data){
            assert.equal(type,"Tile");created.push(...data);
            return data.map((source,index)=>{const tile={id:String(index),...source};
                for(const key of ["x","y","width","height"])tile[key]=Math.round(tile[key]);
                this.tiles.set(tile.id,tile);return tile;});
        },
        async deleteEmbeddedDocuments(_type,ids){for(const id of ids)this.tiles.delete(id);}
    };
    const ravielToken={...donor,parent:localScene,actor:raviel,width:0.85,height:0.85};
    const ziggyToken={...receiver,parent:localScene,actor:ziggy};
    localScene.tokens.push(ravielToken,ziggyToken);
    globalThis.foundry={utils:{randomID:()=>"handoff"}};
    globalThis.game={time:{serverTime:1000}};
    const plan={creates:[dagger]};
    await animateInventoryTransfer(raviel,ziggyToken,plan);
    ziggyToken.x=700; // Moving after reception must also affect the return path.
    await animateInventoryTransfer(ziggy,ravielToken,plan);
    const outward=created[0].flags["arcane-advent"].objectMotion;
    const returning=created[1].flags["arcane-advent"].objectMotion;
    assert.deepEqual(outward.from,{x:143,y:143});assert.deepEqual(outward.to,{x:550,y:150});
    assert.deepEqual(returning.from,{x:750,y:150});assert.deepEqual(returning.to,{x:143,y:143});
    assert.equal(localScene.tiles.size,0);
});

test("ground objects and whole containers launch from their proxy token, not a controlled character or the common storage model",async()=>{
    class Tokens extends Map { [Symbol.iterator](){return this.values();} }
    for(const type of ["object","container"]){
        const created=[],removed=[];
        const localScene={...scene,tiles:new Map(),tokens:new Tokens(),
            async createEmbeddedDocuments(kind,data){
                assert.equal(kind,"Tile");created.push(...data);
                return data.map((source,i)=>{const tile={id:String(i),...source};this.tiles.set(tile.id,tile);return tile;});
            },
            async deleteEmbeddedDocuments(kind,ids){assert.equal(kind,"Tile");removed.push(...ids);for(const id of ids)this.tiles.delete(id);}
        };
        const storage={id:"ground",uuid:"Item.ground",documentName:"Item",type:"storage",system:{ground:true}};
        globalThis.game={time:{serverTime:1000},items:new Map([[storage.id,storage]])};
        globalThis.foundry={utils:{randomID:()=>"ground-handoff"}};
        const source=inventoryForDocument(storage);
        const target={...receiver,id:"recipient",parent:localScene,width:0.85,height:0.85,actor:{uuid:"Actor.raviel"},controlled:true};
        const ground={...donor,id:"ground",parent:localScene,x:800,y:600,width:1.25,height:1.25,
            actor:{uuid:"Scene.scene.Token.ground.Actor.common-model",type:"storage"},
            getFlag:(_scope,key)=>key==="storageItemId"?storage.id:null};
        localScene.tokens.set(target.id,target);localScene.tokens.set(ground.id,ground);
        const root={_id:"root",name:type,type,system:{containerId:null,groundTokenSize:type==="container"?1.5:1.25}};
        const contents={...dagger,system:{...dagger.system,containerId:root._id}};
        await animateInventoryTransfer(source,target,{creates:type==="container"?[root,contents]:[root]});
        assert.equal(created.length,1,"A whole container and its contents must travel as one visual");
        const flight=created[0].flags["arcane-advent"].objectMotion;
        assert.deepEqual(flight.from,{x:863,y:663});assert.deepEqual(flight.to,{x:543,y:143});
        assert.equal(flight.duration,250);assert.deepEqual(removed,["0"]);assert.equal(localScene.tiles.size,0);
    }
});
