import * as assert from 'assert';
import { createStructuredCancelXml, createStructuredSendXml } from '../editorEdits';
suite('Stage 23 structured communication actions',()=>{
 test('builds cancel variants',()=>{assert.strictEqual(createStructuredCancelXml({mode:'literal',value:'timer'}),'<cancel sendid="timer"/>');assert.strictEqual(createStructuredCancelXml({mode:'expression',value:'timerId'}),'<cancel sendidexpr="timerId"/>');});
 test('builds ordered params and content',()=>{const x=createStructuredSendXml({eventMode:'literal',event:'submit',targetMode:'none',typeMode:'none',idMode:'none',delayMode:'none',params:[{name:'payload',mode:'expr',value:'request'},{name:'result',mode:'location',value:'target'}]});assert.match(x,/param name="payload" expr="request"/);assert.match(x,/param name="result" location="target"/);assert.match(createStructuredSendXml({eventMode:'literal',event:'submit',targetMode:'none',typeMode:'none',idMode:'none',delayMode:'none',contentMode:'expression',content:'payload'}),/content expr="payload"/);});
 test('rejects params plus content',()=>assert.throws(()=>createStructuredSendXml({eventMode:'literal',event:'submit',targetMode:'none',typeMode:'none',idMode:'none',delayMode:'none',params:[{name:'x',mode:'expr',value:'1'}],contentMode:'expression',content:'x'}),/cannot combine/));
});
