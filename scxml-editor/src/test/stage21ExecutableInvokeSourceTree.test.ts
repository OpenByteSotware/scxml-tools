import * as assert from 'assert';
import { readExecutableContent, readInvokeNavigationTargets, readInvokes, updateExecutableContent, updateInvokes } from '../editorEdits';

suite('Stage 21 source-preserving executable content and invokes', () => {
  test('updates only direct onentry and preserves nested lookalikes', () => {
    const source = `<scxml><state id="a"><vendor:wrapper><onentry><raise event="fake"/></onentry></vendor:wrapper><!--keep--><onentry><log expr="old"/></onentry><state id="child"><onentry><raise event="child"/></onentry></state></state></scxml>`;
    const changed = updateExecutableContent(source, { stateId: 'a', location: 'onentry', xml: `<raise event="real"/>` });
    assert.match(changed, /<vendor:wrapper><onentry><raise event="fake"\/><\/onentry><\/vendor:wrapper>/);
    assert.match(changed, /<!--keep-->[\s\S]*<onentry>[\s\S]*<raise event="real"\/>/);
    assert.match(changed, /<state id="child"><onentry><raise event="child"\/>/);
    assert.strictEqual(readExecutableContent(changed, 'a', 'onentry'), `<raise event="real"/>`);
  });
  test('updates exact transition body while preserving attributes and neighboring payload transitions', () => {
    const source = `<scxml><state id="a"><content><transition event="fake"><log expr="fake"/></transition></content><transition event='go' target='b'><vendor:old/></transition></state><state id="b"/></scxml>`;
    const changed = updateExecutableContent(source, { stateId: 'a', location: 'transition', transitionIndex: 0, xml: `<log expr="real"/>` });
    assert.match(changed, /<transition event="fake"><log expr="fake"\/><\/transition>/);
    assert.match(changed, /<transition event='go' target='b'>[\s\S]*<log expr="real"\/>[\s\S]*<\/transition>/);
  });
  test('replaces only direct invokes and preserves inline nested invokes and extensions', () => {
    const source = `<scxml><state id="owner"><vendor:keep/><invoke id="one"><content><scxml><state id="nested"><invoke id="nestedInvoke" src="nested.scxml"/></state></scxml></content></invoke><!--between--><invoke id="two" src="two.scxml"/></state></scxml>`;
    const replacement = `<invoke id="replacement" src="replacement.scxml"/>`;
    const changed = updateInvokes(source, { stateId: 'owner', xml: replacement });
    assert.match(changed, /<vendor:keep\/>/);
    assert.match(changed, /<!--between-->/);
    assert.doesNotMatch(changed, /id="one"|id="two"|nestedInvoke/);
    assert.match(changed, /id="replacement" src="replacement.scxml"/);
    assert.strictEqual(readInvokes(changed, 'owner').replace(/\s+/g, ''), replacement.replace(/\s+/g, ''));
  });
  test('discovers direct external and inline invoke targets without nested leakage', () => {
    const source = `<scxml><state id="owner"><invoke id="inline"><content><!--keep--><scxml version="1.0"><state id="child"><invoke id="nested" src="nested.scxml"/></state></scxml></content></invoke><invoke id="external" src="child.scxml"/></state></scxml>`;
    const targets = readInvokeNavigationTargets(source, 'owner');
    assert.deepStrictEqual(targets.map(item => item.id), ['inline', 'external']);
    assert.match(targets[0].inlineScxml || '', /^<scxml[\s\S]*<\/scxml>$/);
    assert.strictEqual(targets[1].src, 'child.scxml');
  });
  test('validates invoke param and finalize using direct children', () => {
    const base = `<scxml><state id="owner"/></scxml>`;
    assert.throws(() => updateInvokes(base, { stateId: 'owner', xml: `<invoke><param name="x" expr="1" location="y"/></invoke>` }), /exactly one/);
    assert.throws(() => updateInvokes(base, { stateId: 'owner', xml: `<invoke><finalize><raise/></finalize></invoke>` }), /event attribute/);
  });
});
