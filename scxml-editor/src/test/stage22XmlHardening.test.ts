import * as assert from 'assert';
import { parseXmlSource } from '../xmlSource';
import { validateScxmlSource } from '../scxml';
import { updateState } from '../editorEdits';

suite('Stage 22 XML source hardening', () => {
  test('reports malformed source with exact parser problems', () => {
    assert.ok(parseXmlSource('<scxml><state></scxml>').problems.some(item => item.code === 'xml.mismatchedClose'));
    assert.ok(parseXmlSource('<scxml><!-- missing').problems.some(item => item.code === 'xml.unterminated'));
    assert.ok(parseXmlSource('<scxml a="1" a="2"/>').problems.some(item => item.code === 'xml.duplicateAttribute'));
    assert.ok(parseXmlSource('<scxml/><scxml/>').problems.some(item => item.code === 'xml.multipleRoots'));
    assert.ok(validateScxmlSource('<scxml><state></scxml>').some(item => item.code === 'xml.mismatchedClose'));
  });
  test('converts the exact nested state closing name', () => {
    const source = `<scxml><state id="outer"><state id="inner"><state id="same"/></state><state id="sibling"/></state></scxml>`;
    const changed = updateState(source, { oldId: 'inner', id: 'inner', kind: 'parallel', initial: false });
    assert.match(changed, /<parallel id="inner"><state id="same"\/><\/parallel>/);
    assert.match(changed, /<state id="outer">[\s\S]*<state id="sibling"\/>[\s\S]*<\/state>/);
  });
  test('preserves a qualified prefix during kind conversion', () => {
    const source = `<scxml:scxml><scxml:state id="work"><scxml:state id="child"/></scxml:state></scxml:scxml>`;
    const changed = updateState(source, { oldId: 'work', id: 'work', kind: 'parallel', initial: false });
    assert.match(changed, /<scxml:parallel id="work">/);
    assert.match(changed, /<\/scxml:parallel>/);
  });
  test('sets nested initial through the parsed parent attribute', () => {
    const source = `<scxml><state id='parent' vendor:keep="yes"><state id="one"/><state id="two"/></state></scxml>`;
    const changed = updateState(source, { oldId: 'two', id: 'two', kind: 'state', initial: true });
    assert.match(changed, /<state id='parent' vendor:keep="yes" initial="two">/);
  });
  test('schema validation ignores fake elements in comments and CDATA', () => {
    const source = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"><!-- <bogus/> --><![CDATA[<state bogus="x"/>]]><state id="ok"/></scxml>`;
    const problems = validateScxmlSource(source);
    assert.ok(!problems.some(item => /bogus/.test(item.message)));
  });
});
