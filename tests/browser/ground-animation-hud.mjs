import { renderGroundTokenHUD, appendAnimationHUD } from "../../module/token-ground-hud.mjs";
import { configureObjectMotion } from "../../module/applications/scene-object-motion-controls.mjs";
export async function runGroundAnimationHUDTests({ test, assert, equal }) {
    const saved={game:globalThis.game,canvas:globalThis.canvas};
    const dialog=foundry.applications.api.DialogV2;
    class Items extends Map { [Symbol.iterator](){return this.values();} }
    const requests=[],writes=[];
    const coins={id:"coins",type:"purse",name:"Pièces",system:{coinPile:true,coins:{gold:3}}};
    const bag={id:"bag",type:"purse",name:"Bourse",system:{coins:{gold:2}}};
    const make=(uuid,item)=>({uuid,type:"storage",system:{ground:true},items:new Items([[item.id,item]]),getFlag:()=>false,testUserPermission:()=>true});
    const source=make("Actor.coins",coins),target=make("Actor.bag",bag);
    const scene={id:"scene",tokens:new Items()};
    const token={id:"coins",documentName:"Token",uuid:"Scene.scene.Token.coins",actor:source,parent:scene,getFlag:()=>null,
        async setFlag(scope,key,value){writes.push({scope,key,value});}};
    const receiver={...token,id:"bag",uuid:"Scene.scene.Token.bag",actor:target};
    scene.tokens.set(token.id,token);scene.tokens.set(receiver.id,receiver);
    globalThis.game={user:{isGM:true,targets:new Set([{document:receiver}])},scenes:new Map([["scene",scene]]),
        users:{activeGM:{async query(channel,data){requests.push(data);return{count:1};}}}};
    globalThis.canvas={scene};
    const root=document.createElement("div");
    root.innerHTML='<div class="col left"><div class="elevation"></div></div><div class="col right"><button data-action="visibility"></button></div>';
    document.querySelector("main").replaceChildren(root);
    const app={document:token,object:{isOwner:true},render(){}};
    try {
        await test("ground currency HUD offers working whole pickup and split, followed by animation shortcuts",async()=>{
            renderGroundTokenHUD(app,root);
            equal([...root.querySelectorAll("[data-ground-action]")].map(button=>button.dataset.groundAction),["coinsAll","coinsPart","coinsSplit"]);
            equal([...root.querySelectorAll("[data-animation-action]")].map(button=>button.dataset.animationAction),["settings","play"]);
            const button=root.querySelector("[data-ground-action=coinsAll]");
            assert(button.querySelector(".fa-right-left"),"Whole pickup needs its transfer icon");
            button.click();
            await new Promise(resolve=>setTimeout(resolve,0));
            equal(requests.length,1);equal(requests[0].action,"coinAll");equal(requests[0].targetToken,receiver.uuid);
            assert(root.querySelector(".col.left > [data-action=visibility]"),"Eye must stay below elevation");
            bag.system.coinPile=true;
            renderGroundTokenHUD(app,root);
            root.querySelector("[data-ground-action=coinsAll]").click();
            await new Promise(resolve=>setTimeout(resolve,0));
            equal(requests.length,2);equal(requests[1].action,"coinAll");equal(requests[1].targetToken,receiver.uuid);
            coins.system.coinPile=false;
            renderGroundTokenHUD(app,root);
            root.querySelector("[data-ground-action=coinsAll]").click();
            await new Promise(resolve=>setTimeout(resolve,0));
            equal(requests.length,3);equal(requests[2].action,"coinAll");equal(requests[2].targetToken,receiver.uuid);
        });
        await test("animation settings read the rendered form and store direction, duration and offset",async()=>{
            foundry.applications.api.DialogV2={async wait(config){
                const form=document.createElement("form");form.innerHTML=config.content;
                document.querySelector("main").append(form);
                config.render(null,{element:form});
                form.elements["motion.duration"].value="0.5";
                form.elements["motion.offset"].value="180";
                assert(!form.elements["motion.offset"].disabled,"Directional offset must be editable");
                return config.buttons[0].callback(null,null,{element:form});
            }};
            await configureObjectMotion(token);
            equal(writes[0].value,{duration:0.5,rotation:"direction",offset:180,turns:1,direction:1});
        });
        await test("visual effect tiles expose settings and immediate launch controls",()=>{
            const tile={documentName:"Tile",getFlag:(_scope,key)=>key==="sceneObject"?{kind:"visualEffect"}:null};
            const host=document.createElement("div");host.innerHTML='<div class="col right"></div>';
            appendAnimationHUD({document:tile},host);
            equal([...host.querySelectorAll("button")].map(button=>button.dataset.animationAction),["settings","play"]);
        });
    } finally {
        foundry.applications.api.DialogV2=dialog;globalThis.game=saved.game;globalThis.canvas=saved.canvas;
    }
}
