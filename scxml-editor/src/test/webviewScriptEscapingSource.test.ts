import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Generated webview script safety', () => {
  test('does not embed an HTML script closing token inside the webview program', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    const snippetStart = source.indexOf('const actionSnippetValue=');
    const snippetEnd = source.indexOf(";document.querySelectorAll('.action-snippets button')", snippetStart);
    const snippet = source.slice(snippetStart, snippetEnd);
    assert.ok(snippet.includes("'<scr'+'ipt>"));
    assert.ok(snippet.includes("</scr'+'ipt>'"));
    assert.ok(snippet.includes('\\\\n  // script body\\\\n'));
    assert.ok(!snippet.includes('</script>'));
  });
});
