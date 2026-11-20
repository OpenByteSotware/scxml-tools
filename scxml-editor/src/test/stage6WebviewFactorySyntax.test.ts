import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Stage 6 generated action factory syntax', () => {
  test('closes the if snippet string before the foreach ternary branch', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    const start = source.indexOf('const actionSnippetValue=');
    const end = source.indexOf(";document.querySelectorAll('.action-snippets button')", start);
    const factory = source.slice(start, end);
    assert.ok(factory.includes("\\\\n</if>':kind==='foreach'?"));
    assert.ok(!factory.includes("\\\\n</if>:kind==='foreach'?"));
    assert.ok(factory.includes(":kind==='send'?"));
    assert.ok(factory.endsWith("'<cancel sendid=\"sendId\"/>'"));
  });
});
