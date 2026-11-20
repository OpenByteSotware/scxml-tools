import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Stage 6 send and cancel UI', () => {
  test('offers safe send and cancel snippets in all action editors', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /data-snippet="send">\+ send/);
    assert.match(source, /data-snippet="cancel">\+ cancel/);
    assert.match(source, /<send event=/);
    assert.match(source, /<cancel sendid=/);
    const start = source.indexOf('const actionSnippetValue=');
    const end = source.indexOf(";document.querySelectorAll('.action-snippets button')", start);
    assert.ok(!source.slice(start, end).includes('</script>'));
  });
});
