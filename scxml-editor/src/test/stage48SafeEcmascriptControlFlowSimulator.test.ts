import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';
const run=(script:string,data='<data id="result" expr="0"/>')=>new ScxmlSimulator(`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel>${data}</datamodel><state id="a"><onentry><script><![CDATA[${script}]]></script></onentry></state></scxml>`).initialize().snapshot;
suite('Stage 48 safe ECMAScript control flow',()=>{
 test('supports switch selection and fallthrough',()=>{const r=run(`var value=2; switch(value){case 1:result=1;break;case 2:result=2;case 3:result+=3;break;default:result=9;}`);assert.strictEqual(r.dataModel.result,5);});
 test('supports safe for-in over own enumerable properties',()=>{const r=run(`var key='';for(key in model){result+=model[key];}`,'<data id="result" expr="0"/><data id="model" expr="{a:2,b:3}"/>');assert.strictEqual(r.dataModel.result,5);assert.strictEqual(r.dataModel.key,'b');});
 test('supports throw catch and finally',()=>{const r=run(`try{throw 'failed';}catch(error){result=error;}finally{result=result+'!';}`,'<data id="result" expr="\'\'"/>');assert.strictEqual(r.dataModel.result,'failed!');});
 test('supports safe delete without prototype access',()=>{const r=run(`delete model.remove;result=('remove' in model)?1:2;`,'<data id="result" expr="0"/><data id="model" expr="{keep:1,remove:2}"/>');assert.strictEqual(r.dataModel.result,2);assert.deepStrictEqual(r.dataModel.model,{keep:1});});
 test('rejects prototype-sensitive member access',()=>{const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="model" expr="{}"/></datamodel><state id="a"><onentry><script>model.constructor;</script></onentry><transition event="error.execution" target="failed"/></state><state id="failed"/></scxml>`;assert.deepStrictEqual(new ScxmlSimulator(xml).initialize().snapshot.active,['failed']);});
});
