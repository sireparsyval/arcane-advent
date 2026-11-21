import test from "node:test";
import assert from "node:assert/strict";
import { objectMotionPlan, objectCenter, motionSettings, registerObjectMotion } from "../module/scene-object-motion.mjs";
import { projectileAppearance, projectileFrame } from "../module/scene-projectiles.mjs";
const scene={width:2000,height:1500,grid:{size:100,distance:1}};
const doc={documentName:"Token",parent:scene,x:100,y:100,width:1,height:1,rotation:45};
const points=[{x:150,y:150},{x:550,y:150},{x:550,y:550}];
const make=settings=>objectMotionPlan(doc,points,settings,{clock:()=>1000,id:()=>"motion"});
test("ground objects use their center, persist their final top-left position and follow waypoints",()=>{
    assert.deepEqual(objectCenter(doc),{x:150,y:150});
    const result=make({duration:2}),flight=result["flags.arcane-advent.objectMotion"];
    assert.equal(result.x,500);assert.equal(result.y,500);assert.equal(result.rotation,45);
    assert.deepEqual(projectileFrame(flight,flight.startedAt+1000),{x:550,y:150,progress:.5,done:false});
});
test("rotation can stay locked, face the movement with an offset or complete a number of turns",()=>{
    const direction=make({duration:2,rotation:"direction",offset:180});assert.equal(direction.rotation,180);
    const flight=make({duration:2,rotation:"continuous",turns:2,direction:-1})["flags.arcane-advent.objectMotion"];
    assert.equal(projectileAppearance(flight,flight.startedAt+1000).rotation,-315);
    assert.equal(projectileAppearance(flight,flight.startedAt+2000).rotation,-675);
    assert.equal(make({duration:2,rotation:"continuous",turns:2,direction:-1}).rotation,45);
});
test("motion rejects stale origins, off-scene destinations and invalid settings before mutation",()=>{
    assert.throws(()=>objectMotionPlan(doc,[{x:1,y:1},{x:500,y:500}]),/déplacé/);
    assert.throws(()=>objectMotionPlan(doc,[{x:150,y:150},{x:1999,y:1499}],{},{clock:()=>1000,id:()=>"test"}),/scène/);
    for(const input of [{rotation:"bad"},{turns:-1},{direction:0},{offset:Infinity}])assert.throws(()=>motionSettings(input),/invalides/);
    assert.throws(()=>make({duration:0}),/durée/);
});

test("ground-token rendering follows the shared clock and restores position on completion",()=>{
    const hooks=new Map(),ticks=new Set(),position=()=>({set(x,y){this.x=x;this.y=y;}});
    globalThis.Hooks={on:(name,fn)=>hooks.set(name,fn),once(){}};
    globalThis.CONFIG={queries:{}};globalThis.game={time:{serverTime:1150},users:{activeGM:{isSelf:true}}};
    const parent={...scene,id:"scene",tokens:new Map()},plan=make({duration:2,rotation:"continuous",turns:1});
    const flight=plan["flags.arcane-advent.objectMotion"];
    const token={...doc,parent,id:"ground",uuid:"Scene.scene.Token.ground",...plan,object:{position:position(),mesh:{position:position()}},
        getFlag:()=>flight,update(){return Promise.resolve();}};
    parent.tokens.set(token.id,token);
    globalThis.canvas={ready:true,scene:parent,app:{ticker:{add:fn=>ticks.add(fn),remove:fn=>ticks.delete(fn)}}};
    registerObjectMotion();hooks.get("drawToken")({document:token});
    assert.equal(token.object.position.x,100);assert.equal(token.object.mesh.position.x,150);
    game.time.serverTime=2150;for(const tick of ticks)tick();
    assert.equal(token.object.position.x,500);assert.equal(token.object.position.y,100);assert.equal(token.object.mesh.position.x,550);
    game.time.serverTime=3150;for(const tick of ticks)tick();
    assert.equal(ticks.size,0);assert.equal(token.object.position.y,500);assert.equal(token.object.mesh.position.y,550);
});
