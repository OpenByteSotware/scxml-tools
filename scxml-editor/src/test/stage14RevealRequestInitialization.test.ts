import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Stage 14 reveal request initialization', () => {
  test('declares revealRequest before the first render callback uses it', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    const declaration = source.indexOf('let revealRequest: { stateId: string; transitionIndex?: number } | undefined;');
    const renderUse = source.indexOf('inlineChild ? document.uri : undefined, revealRequest);');
    const firstUpdate = source.indexOf('update();', renderUse);
    assert.ok(declaration >= 0, 'revealRequest declaration is missing');
    assert.ok(renderUse > declaration, 'revealRequest must be declared before renderPage uses it');
    assert.ok(firstUpdate > renderUse, 'the initial update must occur after the declaration');
    assert.strictEqual((source.match(/let revealRequest:/g) || []).length, 1);
  });
});
