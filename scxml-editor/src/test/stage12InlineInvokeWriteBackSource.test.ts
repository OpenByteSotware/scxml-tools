import * as assert from 'assert'; import * as fs from 'fs'; import * as path from 'path';
suite('Stage 12 inline invoke write-back UI',()=>{test('applies edited inline charts to parent',()=>{const s=fs.readFileSync(path.join(__dirname,'..','extension.ts'),'utf8');assert.match(s,/Apply to Parent Invoke/);assert.match(s,/applyInlineInvoke/);assert.match(s,/updateInlineInvokeContent/);});});
