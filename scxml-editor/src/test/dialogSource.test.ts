import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Dialog cancellation source', () => {
  test('cancel buttons bypass required form validation and explicitly close dialogs', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /id=\"cancel-state\" type=\"button\"/);
    assert.match(source, /id=\"cancel-region\" type=\"button\"/);
    assert.match(source, /id=\"cancel-transition\" type=\"button\"/);
    assert.match(source, /closeStateDialog/);
    assert.match(source, /stateDialog\.addEventListener\('cancel'/);
  });
});
