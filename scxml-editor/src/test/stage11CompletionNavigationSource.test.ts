import * as assert from 'assert'; import * as fs from 'fs'; import * as path from 'path';
suite('Stage 11 completion navigation UI',()=>{test('links completion events',()=>{const s=fs.readFileSync(path.join(__dirname,'..','extension.ts'),'utf8');assert.match(s,/class="completion-link"/);assert.match(s,/goToCompletionSource/);assert.match(s,/done\.state\./);assert.match(s,/done\.invoke\./);});});
