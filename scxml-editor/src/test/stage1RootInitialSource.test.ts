import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Stage 1 document properties and initial transitions', () => {
  test('wires root and explicit initial editors', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /SCXML document properties/);
    assert.match(source, /Document Properties/);
    assert.match(source, /updateRootProperties/);
    assert.match(source, /updateExplicitInitial/);
    assert.match(source, /Use explicit &lt;initial&gt; transition/);
  });
});
