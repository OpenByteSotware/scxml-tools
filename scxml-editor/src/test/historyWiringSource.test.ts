import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('History creation wiring', () => {
  test('connects dialog, webview command, and host edit handlers', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /const openHistoryDialog=/);
    assert.match(source, /const submitHistory=/);
    assert.match(source, /command:'createHistoryState'/);
    assert.match(source, /message\.command === 'createHistoryState'/);
    assert.match(source, /applyDocumentText\(document, createHistoryState/);
    assert.match(source, /message\.command === 'updateHistoryState'/);
  });
});
