import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Stage 3 executable control flow UI', () => {
  test('offers safe if and foreach snippets without an embedded script closing token', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /data-snippet="if">\+ if/);
    assert.match(source, /data-snippet="foreach">\+ foreach/);
    assert.match(source, /<elseif cond=/);
    assert.match(source, /<else\/>/);
    const start = source.indexOf('const actionSnippetValue=');
    const end = source.indexOf(";document.querySelectorAll('.action-snippets button')", start);
    assert.ok(!source.slice(start, end).includes('</script>'));
  });
});
