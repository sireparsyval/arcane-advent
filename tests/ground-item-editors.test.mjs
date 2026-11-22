import test from "node:test";
import assert from "node:assert/strict";
class Sheet {
    async _prepareContext(){ return { editable:this.isEditable }; }
    _canRender(){ return undefined; }
    render(){ this.rendered=true; }
}
globalThis.foundry={applications:{sheets:{ActorSheetV2:Sheet,ItemSheetV2:Sheet},api:{HandlebarsApplicationMixin:Base=>Base}}};
const {ArcaneStorageItemSheet}=await import("../module/applications/actor/storage-sheet.mjs");
const {ArcaneInventoryItemSheet}=await import("../module/applications/item/inventory-item-sheet.mjs");
const {inventoryForDocument}=await import("../module/storage-inventory.mjs");
class Item {
    constructor(source){ this._source=structuredClone(source); for(const key of ["properties","damageTypes","zones"]) if(Array.isArray(this._source.system[key])) this._source.system[key]=new Set(this._source.system[key]); }
    get id(){return this._source._id;} get type(){return this._source.type;} get name(){return this._source.name;}
    get system(){return this._source.system;} toObject(){return structuredClone(this._source);}
    updateSource(source){this._source=structuredClone(source);}
    get sheet(){ if(!this.editor){this.editor=new ArcaneInventoryItemSheet();this.editor.document=this;}return this.editor; }
}
globalThis.CONFIG={Item:{documentClass:Item}};
function fixture(entries) {
    const doc={documentName:"Item",id:"ground",uuid:"Item.ground",type:"storage",name:"Sol",isOwner:true,
        system:{ground:true,contents:entries},getFlag(){return false;},testUserPermission(){return true;}};
    const source=inventoryForDocument(doc);
    const token={documentName:"Token",actor:source};
    const scene={tokens:[token]};
    globalThis.game={user:{isGM:true,viewedScene:"scene"},scenes:new Map([["scene",scene]])};
    const sheet=new ArcaneStorageItemSheet();sheet.document=doc;
    return{doc,source,sheet};
}
const entry=(id,type,system={})=>({_id:id,type,name:id,system:{quantity:1,weight:1,containerId:null,...system}});
test("double-click delegates isolated equipment and stacks to their full editor with transfer actions",async()=>{
    for(const type of ["weapon","protection","shield","accessory","object","purse"]){
        const system=type==="weapon"?{properties:[],damageTypes:[]}:type==="protection"?{zones:[]}:type==="purse"?{coins:{}}:{};
        const env=fixture([entry("one",type,system)]),item=env.source.items.get("one");
        assert.equal(env.sheet._canRender({}),false);
        assert.equal(item.sheet.rendered,true);
        assert.equal(item.sheet._canRender({}),undefined);
        const ctx=await item.sheet._prepareContext({});
        assert.ok(ctx.groundActions.some(action=>action.action==="take"));
        assert.equal(ctx.isObject,type==="object");assert.equal(ctx.canGroundTransfer,true);
    }
});
test("observers may transfer but cannot edit ground equipment, and locked storage refuses access",async()=>{
    const env=fixture([entry("one","shield")]);env.doc.isOwner=false;game.user.isGM=false;
    const editor=env.source.items.get("one").sheet;
    assert.equal(editor.isEditable,false);assert.equal(editor._canRender({}),undefined);
    assert.equal((await editor._prepareContext({})).canGroundTransfer,true);
    env.doc.system.locked=true;
    assert.equal(editor._canRender({}),false);assert.equal(editor.isEditable,false);
});
test("a principal ground container displays only its contents at the correct depth and remains transferable",async()=>{
    const env=fixture([entry("sling","container"),entry("inner","container",{containerId:"sling"}),entry("dagger","shield",{containerId:"inner"})]);
    assert.equal(env.sheet._canRender({}),undefined);
    const ctx=await env.sheet._prepareContext({});
    assert.deepEqual(ctx.rows.map(row=>[row.id,row.depth]),[["inner",0],["dagger",1]]);
    assert.equal(ctx.canTakeStorage,true);
    env.source.items.get("sling").system.fixedOnScene=true;
    assert.equal((await env.sheet._prepareContext({})).canTakeStorage,false);
});
