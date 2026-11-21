import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Stage 16 structured send runtime',()=>{test('declares modal runtime before shortcut handlers',()=>{const s=fs.readFileSync(path.join(__dirname,'..','extension.ts'),'utf8');const declaration=s.indexOf("const sendDialog=document.getElementById('send-dialog')");const use=s.indexOf("openStructuredSendDialog(target)");assert.ok(declaration>=0);assert.ok(use>declaration);assert.strictEqual((s.match(/const sendDialog=document\.getElementById\('send-dialog'\)/g)||[]).length,1);assert.match(s,/sendDialogError\.textContent=event\.data\.message/);});});
