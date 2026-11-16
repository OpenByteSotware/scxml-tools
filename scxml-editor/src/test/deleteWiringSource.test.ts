import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('State and history deletion wiring', () => {
  test('uses a webview dialog and keyboard deletion instead of browser confirm', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /id="delete-dialog"/);
    assert.match(source, /const requestDeleteState=/);
    assert.match(source, /requestDeleteTransition/);
    assert.match(source, /event\.key==='Delete'\|\|event\.key==='Backspace'/);
    assert.match(source, /node\.dataset\.kind==='history'\?'Delete history':'Delete state'/);
    assert.doesNotMatch(source, /confirm\('Delete state/);
    assert.doesNotMatch(source, /confirm\('Delete this transition/);
  });
});
