import * as assert from 'assert';
import { validateScxmlSource } from '../scxml';
import { updateExplicitInitial, updateRootProperties } from '../editorEdits';
const wrap=(body:string,attrs='')=>`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" ${attrs}>${body}</scxml>`;
const codes=(xml:string)=>validateScxmlSource(xml).map(item=>item.code);
suite('Stage 55 context-sensitive initial and history transitions',()=>{
 test('rejects event condition type and missing target on initial transitions',()=>{const result=codes(wrap(`<initial><transition event="go" cond="ready" type="external"/></initial><state id="a"/>`));for(const code of ['schema.eventless','schema.unconditional','schema.transitionContext','schema.requiredTarget'])assert.ok(result.includes(code),code);});
 test('rejects event and condition on history default transitions',()=>{const result=codes(wrap(`<state id="owner"><history id="h"><transition event="go" cond="ready" target="child"/></history><state id="child"/></state>`));assert.ok(result.includes('schema.eventless'));assert.ok(result.includes('schema.unconditional'));});
 test('reports initial attribute and explicit child conflict',()=>assert.ok(codes(wrap(`<initial><transition target="a"/></initial><state id="a"/>`,'initial="a"')).includes('schema.initialConflict')));
 test('accepts descendant multi-target initial configurations across parallel regions',()=>{const result=validateScxmlSource(wrap(`<initial><transition target="a1 b1"/></initial><parallel id="p"><state id="a"><state id="a1"/></state><state id="b"><state id="b1"/></state></parallel>`));assert.ok(!result.some(item=>item.code==='schema.referenceScope'||item.code==='schema.missingReference'),JSON.stringify(result));});
 test('rejects an initial target outside its owning compound state',()=>assert.ok(codes(wrap(`<state id="owner"><initial><transition target="outside"/></initial><state id="inside"/></state><state id="outside"/>`)).includes('schema.referenceScope')));
 test('editor authoring never emits an initial condition',()=>{const root=updateRootProperties(wrap(`<state id="a"/>`),{version:'1.0',namespace:'http://www.w3.org/2005/07/scxml',initialTarget:'a',explicitInitial:true,initialCond:'forbidden'});assert.doesNotMatch(root,/<transition[^>]*cond=/);const nested=updateExplicitInitial(wrap(`<state id="owner"><state id="child"/></state>`),{scopeId:'owner',target:'child',cond:'forbidden',explicit:true});assert.doesNotMatch(nested,/<transition[^>]*cond=/);});
});
