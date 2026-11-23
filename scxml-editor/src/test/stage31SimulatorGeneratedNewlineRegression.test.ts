import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Stage 31 simulator generated newline regression',()=>{
 test('double escapes trace newline inside the outer webview template',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','extension.ts'),'utf8');
  const start=source.indexOf("document.getElementById('simulator-trace').textContent");
  assert.ok(start>=0);
  const statement=source.slice(start,source.indexOf(';',start)+1);
  assert.ok(statement.includes(String.raw`.join('\\n')`),statement);
  assert.ok(!statement.includes(String.raw`.join('\n')`),statement);
 });
});
