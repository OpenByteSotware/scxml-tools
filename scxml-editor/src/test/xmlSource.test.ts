import * as assert from 'assert';
import { directChildren, findElementById, getAttribute, parseXmlSource, setSourceAttribute } from '../xmlSource';

suite('Stage 17 source-preserving XML tree', () => {
  const source = `<?xml version="1.0"?>\n<scxml xmlns="http://www.w3.org/2005/07/scxml">\n  <!-- keep <state id="fake"/> -->\n  <state id='real' custom="unchanged">\n    <![CDATA[<state id="alsoFake"/>]]>\n    <onentry><script><![CDATA[if (a < b) value = "</state>";]]></script></onentry>\n    <vendor:extension vendor:value="x"/>\n    <state id="child"/>\n  </state>\n</scxml>`;
  test('ignores comments, CDATA, and element-looking script text', () => {
    const doc = parseXmlSource(source);
    assert.ok(findElementById(doc, new Set(['state']), 'real'));
    assert.ok(findElementById(doc, new Set(['state']), 'child'));
    assert.strictEqual(findElementById(doc, new Set(['state']), 'fake'), undefined);
    assert.strictEqual(findElementById(doc, new Set(['state']), 'alsoFake'), undefined);
  });
  test('tracks direct children and foreign namespace elements', () => {
    const doc = parseXmlSource(source); const real = findElementById(doc, new Set(['state']), 'real')!;
    assert.deepStrictEqual(directChildren(real).map(item => item.name), ['onentry', 'vendor:extension', 'state']);
  });
  test('changes only the requested attribute value and preserves quote style elsewhere', () => {
    const doc = parseXmlSource(source); const real = findElementById(doc, new Set(['state']), 'real')!;
    const changed = setSourceAttribute(source, real, 'id', 'renamed');
    assert.strictEqual(changed.replace("id='renamed'", "id='real'"), source);
    assert.strictEqual(getAttribute(parseXmlSource(changed).elements.find(item => item.localName === 'state')!, 'custom')?.value, 'unchanged');
  });
});
