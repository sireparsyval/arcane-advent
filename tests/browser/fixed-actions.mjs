import { dockDialogActions, formDialog } from "../../module/applications/form-interactions.mjs";

export async function runFixedActionTests({ test, assert, equal }) {
    // Native v14 frame geometry. Load production templates and system styles;
    // leave Handlebars markers inert so all conditional sections add overflow.
    const style = document.createElement("style");
    style.textContent = `.aa-footer-fixture { display:flex; flex-direction:column; position:relative; width:520px; height:360px; box-sizing:border-box; }
    .aa-footer-fixture * { box-sizing:border-box; }
    .aa-footer-fixture .window-header { flex:0 0 36px; }
    .aa-footer-fixture .window-content { display:flex; flex:1; flex-direction:column; padding:16px; overflow:hidden; }
    .aa-footer-fixture .standard-form { display:flex; flex-direction:column; gap:12px; }
    .aa-footer-fixture .form-footer { display:flex; flex-direction:row; gap:8px; }
    .aa-footer-fixture button { min-height:32px; }
    .aa-footer-fixture fieldset { min-width:0; }`;
    document.head.append(style);
    const fixture = html => {
        const frame = document.createElement("form");
        frame.className = "application aa-fixed-actions arcane-advent aa-footer-fixture";
        frame.innerHTML = '<header class="window-header">Menu</header><div class="window-content">'+html+'</div>';
        document.body.append(frame); return frame;
    };
    const visibleFooter = frame => {
        const footer = frame.querySelector(".form-footer").getBoundingClientRect();
        const outer = frame.getBoundingClientRect();
        assert(footer.top >= outer.top && footer.bottom <= outer.bottom + 1, "Footer must fit inside the window");
        return footer.top;
    };
    for (const name of ["inventory-item", "scenery", "glyph"]) await test(name+" editor keeps native submit and actions outside its scrolling body", async () => {
        const html = (await (await fetch('/templates/item/'+name+'-sheet.hbs')).text())
            .replace(/{{#\*inline[\s\S]*?{{\/inline}}/g, '').replace(/{{[\s\S]*?}}/g, '');
        const frame = fixture(html);
        try {
            const content = frame.querySelector(".aa-menu-content"), footer = frame.querySelector(".form-footer");
            assert(footer.parentElement === content.parentElement, "Footer and content share a shell");
            assert(!content.contains(footer), "Action footer must not be in scrollable content");
            const input = document.createElement("input"); input.name = "footer-test"; input.value = "kept";
            const spacer = document.createElement("div"); spacer.style.height = "1600px"; content.append(input,spacer);
            for (const height of [360,240,600]) {
                frame.style.height = height+'px'; content.scrollTop=0;
                assert(content.scrollHeight > content.clientHeight, "Body must overflow");
                const top=visibleFooter(frame);content.scrollTop=500;
                equal(visibleFooter(frame),top);
                equal(frame.scrollTop,0);equal(frame.querySelector('.window-content').scrollTop,0);
            }
            assert(input.form === frame, "Input retains native form");equal(new FormData(frame).get("footer-test"),"kept");
            let submits=0;frame.addEventListener("submit",event=>{event.preventDefault();submits++;});
            frame.noValidate=true;footer.querySelector('[type="submit"]').click();equal(submits,1);
        } finally { frame.remove(); }
    });
    await test("transfer shortcuts stay with footer actions and retain their handlers and form ownership", () => {
        const frame=fixture('<form></form>');
        // A native Dialog has a form inside a non-form frame.
        frame.remove();
        const app=document.createElement('section');app.className='application aa-fixed-actions aa-footer-fixture';
        app.innerHTML='<header class="window-header">Transférer</header><div class="window-content"><form class="dialog-form standard-form"><div class="dialog-content standard-form"><div style="height:1600px"></div><input name="amount" value="2"><div class="aa-transfer-selection"><button type="button">Tout sélectionner</button></div></div><footer class="form-footer"><button type="button">Annuler</button><button type="submit">Transférer</button></footer></form></div>';
        document.body.append(app);
        try {
            const selection=app.querySelector('.aa-transfer-selection'),form=app.querySelector('form');let clicks=0;
            selection.firstElementChild.addEventListener('click',()=>clicks++);
            dockDialogActions(app);dockDialogActions(app);
            assert(selection.parentElement === form, "Selection stays in form");assert(selection.nextElementSibling === app.querySelector('footer'), "Selection sits above actions");
            equal(app.querySelectorAll('.aa-transfer-selection').length,1);selection.firstElementChild.click();equal(clicks,1);
            assert(selection.firstElementChild.form === form, "Selection button retains form");equal(new FormData(form).get('amount'),'2');
            const top=visibleFooter(app),selectionTop=selection.getBoundingClientRect().top;
            app.querySelector('.dialog-content').scrollTop=900;
            equal(visibleFooter(app),top);equal(selection.getBoundingClientRect().top,selectionTop);
            assert(app.querySelector('.dialog-content').clientHeight>0,'Body retains scrolling space');
        } finally {app.remove();}
    });
    await test("every dialog factory opts in before render without altering custom classes or external dialogs", async () => {
        const previous=foundry.applications.api.DialogV2;
        class Dialog extends EventTarget { constructor(options){super();this.options=options;} }
        const configs=[];for(const method of ['wait','prompt','confirm'])Dialog[method]=options=>{configs.push(options);return 42;};
        foundry.applications.api.DialogV2=Dialog;
        try {
            const options={classes:['custom-dialog']};const created=formDialog.create(options);
            equal(created.options.classes,['custom-dialog','aa-fixed-actions']);equal(options.classes,['custom-dialog']);
            for(const method of ['wait','prompt','confirm'])equal(await formDialog[method](options),42);
            for(const config of configs)equal(config.classes,['custom-dialog','aa-fixed-actions']);
            equal(new Dialog({classes:['external']}).options.classes,['external']);
        } finally {foundry.applications.api.DialogV2=previous;}
    });
    await test("weapon projection fields preserve hidden rotation values across save and mode changes", async () => {
        const {motionFields,bindMotionFields,readMotionFields}=await import("../../module/applications/scene-object-motion-controls.mjs");
        const form=document.createElement('form');
        form.innerHTML=motionFields({duration:2.5,rotation:'direction',offset:45,turns:3,direction:-1},'system.projection');
        document.body.append(form);
        try {
            bindMotionFields(form,'system.projection');
            const mode=form.elements['system.projection.rotation'];
            equal(form.querySelector('[data-motion-continuous]').hidden,true);
            equal(form.elements['system.projection.turns'].disabled,true);
            equal(readMotionFields(form,{prefix:'system.projection'}),{duration:2.5,rotation:'direction',offset:45,turns:3,direction:-1});
            mode.value='continuous';mode.dispatchEvent(new Event('change'));
            equal(form.querySelector('[data-motion-direction]').hidden,true);
            equal(form.querySelector('[data-motion-continuous]').hidden,false);
            equal(readMotionFields(form,{prefix:'system.projection'}).offset,45);
            mode.value='locked';mode.dispatchEvent(new Event('change'));
            equal(readMotionFields(form,{prefix:'system.projection'}).turns,3);
            // Existing scene animation menus retain their default field prefix.
            form.innerHTML=motionFields({duration:1.5,rotation:'direction',offset:90});
            bindMotionFields(form);equal(readMotionFields(form).duration,1.5);equal(readMotionFields(form).offset,90);
        } finally {form.remove();}
    });
    style.remove();
}
