import { parseScxml } from './scxml';
import { directChildren, findElementById, getAttribute, parseXmlSource, replaceRange, setSourceAttribute, XmlSourceElement } from './xmlSource';
export interface StateUpdate { oldId: string; id: string; kind: string; initial: boolean; parallel?: boolean; }
export interface TransitionUpdate { stateId: string; index: number; event: string; cond: string; targets: string; type?: '' | 'internal' | 'external'; }
export interface DoneDataUpdate { stateId: string; mode: 'none' | 'expr' | 'content' | 'params'; expression?: string; content?: string; params?: Array<{ name: string; expr?: string; location?: string }>; }

const stateTags = 'state|parallel|final|history';

function setAttribute(tag: string, name: string, value: string): string {
  const pattern = new RegExp(`(\\s${name}\\s*=\\s*)(["'])(.*?)\\2`, 'i');
  if (!value) { return tag.replace(pattern, ''); }
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return pattern.test(tag) ? tag.replace(pattern, `$1"${escaped}"`) : tag.replace(/\s*\/?>$/, match => ` ${name}="${escaped}"${match}`);
}

function findState(text: string, id: string): { start: number; openEnd: number; end: number; tag: string; kind: string; source: XmlSourceElement } | undefined {
  const source = findElementById(parseXmlSource(text), new Set(['state', 'parallel', 'final', 'history']), id);
  if (!source) { return undefined; }
  return { start: source.start, openEnd: source.openEnd, end: source.end, tag: text.slice(source.start, source.openEnd), kind: source.localName, source };
}
export function updateState(text: string, update: StateUpdate): string {
  let source = findElementById(parseXmlSource(text), new Set(['state', 'parallel', 'final', 'history']), update.oldId);
  if (!source) { throw new Error(`State ${update.oldId} was not found.`); }
  const requestedKind = update.parallel === true ? 'parallel' : update.parallel === false && source.localName === 'parallel' ? 'state' : update.kind;
  if (!/^(state|parallel|final|history)$/.test(requestedKind)) { throw new Error(`Unsupported state kind ${requestedKind}.`); }
  let result = setSourceAttribute(text, source, 'id', update.id.trim());
  source = findElementById(parseXmlSource(result), new Set(['state', 'parallel', 'final', 'history']), update.id.trim())!;
  if (requestedKind !== source.localName) {
    result = replaceElementName(result, source, requestedKind);
  }
  if (update.oldId !== update.id) { result = renameStateReferences(result, update.oldId, update.id); }
  return setInitialInOwningScope(result, update.id, update.initial);
}

function replaceElementName(text: string, element: XmlSourceElement, localName: string): string {
  const prefix = element.name.includes(':') ? element.name.slice(0, element.name.indexOf(':') + 1) : '';
  const qualified = prefix + localName;
  const openingNameStart = text.indexOf(element.name, element.start + 1);
  if (openingNameStart < 0 || openingNameStart >= element.openEnd) { throw new Error(`Unable to locate opening name for ${element.name}.`); }
  let result = replaceRange(text, openingNameStart, openingNameStart + element.name.length, qualified);
  if (!element.selfClosing) {
    const delta = qualified.length - element.name.length;
    const closingNameStart = element.closeStart + delta + result.slice(element.closeStart + delta, element.end + delta).indexOf(element.name);
    if (closingNameStart < element.closeStart + delta) { throw new Error(`Unable to locate closing name for ${element.name}.`); }
    result = replaceRange(result, closingNameStart, closingNameStart + element.name.length, qualified);
  }
  return result;
}
function renameStateReferences(text: string, oldId: string, newId: string): string {
  let result = text, changed = true;
  while (changed) {
    changed = false;
    for (const element of parseXmlSource(result).elements) {
      for (const name of ['initial', 'target']) {
        const attribute = getAttribute(element, name); if (!attribute) continue;
        const value = attribute.value.split(/\s+/).map(item => item === oldId ? newId : item).join(' ');
        if (value !== attribute.value) { result = setSourceAttribute(result, element, name, value); changed = true; break; }
      }
      if (changed) break;
      const event = getAttribute(element, 'event');
      if (event) { const value = event.value.split(/\s+/).map(item => item === `done.state.${oldId}` ? `done.state.${newId}` : item).join(' '); if (value !== event.value) { result = setSourceAttribute(result, element, 'event', value); changed = true; break; } }
      for (const name of ['cond', 'expr', 'location', 'array']) {
        const attribute = getAttribute(element, name); if (!attribute) continue;
        const pattern = new RegExp(`\\bIn\\(\\s*(['"])${escapeRegExp(oldId)}\\1\\s*\\)`, 'g');
        const value = attribute.value.replace(pattern, (_match, quote) => `In(${quote}${newId}${quote})`);
        if (value !== attribute.value) { result = setSourceAttribute(result, element, name, value); changed = true; break; }
      }
      if (changed) break;
    }
  }
  return result;
}

function setInitialInOwningScope(text: string, stateId: string, initial: boolean): string {
  const state = findState(text, stateId);
  if (!state) { throw new Error(`State ${stateId} was not found after updating it.`); }
  const parent = findImmediateParent(text, state);
  if (parent) {
    const parentState = findElementById(parseXmlSource(text), new Set(['state', 'parallel']), parent.id);
    if (!parentState) { throw new Error(`Parent state ${parent.id} was not found.`); }
    // A parallel activates every direct region. Its children do not compete for one initial slot.
    if (parentState.localName === 'parallel') { return text; }
    if (initial) { return setSourceAttribute(text, parentState, 'initial', stateId); }
    return getAttribute(parentState, 'initial')?.value === stateId ? setSourceAttribute(text, parentState, 'initial', '') : text;
  }
  const root = findRootElement(text);
  if (!root) { throw new Error('The SCXML root element was not found.'); }
  if (initial) { return setSourceAttribute(text, root, 'initial', stateId); }
  return getAttribute(root, 'initial')?.value === stateId ? setSourceAttribute(text, root, 'initial', '') : text;
}

export function updateTransition(text: string, update: TransitionUpdate): string {
  let result=text;
  for(const [name,value] of [['event',update.event.trim()],['cond',update.cond.trim()],['target',update.targets.trim()],['type',update.type==='internal'||update.type==='external'?update.type:'']] as Array<[string,string]>){
    const state=findElementById(parseXmlSource(result),new Set(['state','parallel','history']),update.stateId);
    const transition=state?directChildren(state,'transition')[update.index]:undefined;
    if(!transition)throw new Error(`Transition ${update.index+1} was not found in state ${update.stateId}.`);
    result=setSourceAttribute(result,transition,name,value);
  }
  assertTransitionSemantics(result);return result;
}
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function assertTransitionSemantics(text: string): void {
  const semanticErrors = parseScxml(text).errors.filter(error => /transition|multiple targets|internal transition|eventless transition cycle|history .*target/i.test(error));
  if (semanticErrors.length) { throw new Error(semanticErrors[0]); }
}
export interface NewState { id: string; kind: string; initial: boolean; }
export interface NewTransition { stateId: string; event: string; cond: string; targets: string; type?: '' | 'internal' | 'external'; }

export function createState(text: string, state: NewState): string {
  const id=state.id.trim();if(!id)throw new Error('State ID is required.');if(findState(text,id))throw new Error(`State ${id} already exists.`);
  const root=findRootElement(text);if(!root)throw new Error('The SCXML root element was not found.');const kind=/^(state|parallel|final|history)$/.test(state.kind)?state.kind:'state';const base=indentationAt(text,root.start),indent=base+'  ';
  let result=root.selfClosing?replaceRange(text,root.start,root.openEnd,`${text.slice(root.start,root.openEnd).replace(/\/\s*>$/,'>')}\n${indent}<${kind} id="${escapeXml(id)}"/>\n${base}</${root.name}>`):replaceRange(text,root.closeStart,root.closeStart,`\n${indent}<${kind} id="${escapeXml(id)}"/>\n${base}`);
  if(state.initial)result=setSourceAttribute(result,findRootElement(result)!,'initial',id);return result;
}
export function deleteState(text:string,id:string):string{
  const state=findElementById(parseXmlSource(text),new Set(['state','parallel','final','history']),id);if(!state)throw new Error(`State ${id} was not found.`);let result=removeElementWithLeadingIndent(text,state),changed=true;
  while(changed){changed=false;for(const element of parseXmlSource(result).elements){const initial=getAttribute(element,'initial');if(initial?.value===id){result=setSourceAttribute(result,element,'initial','');changed=true;break;}if(element.localName==='transition'){const target=getAttribute(element,'target');if(target){const value=target.value.split(/\s+/).filter(item=>item&&item!==id).join(' ');if(value!==target.value){result=setSourceAttribute(result,element,'target',value);changed=true;break;}}}}}return result;
}
export function createTransition(text:string,transition:NewTransition):string{
  const state=findElementById(parseXmlSource(text),new Set(['state','parallel','history']),transition.stateId);if(!state)throw new Error(`State ${transition.stateId} was not found.`);let tag='<transition/>';tag=setAttribute(tag,'event',transition.event.trim());tag=setAttribute(tag,'cond',transition.cond.trim());tag=setAttribute(tag,'target',transition.targets.trim());tag=setAttribute(tag,'type',transition.type==='internal'||transition.type==='external'?transition.type:'');const base=indentationAt(text,state.start),indent=base+'  ';
  const changed=state.selfClosing?replaceRange(text,state.start,state.openEnd,`${text.slice(state.start,state.openEnd).replace(/\/\s*>$/,'>')}\n${indent}${tag}\n${base}</${state.name}>`):replaceRange(text,state.closeStart,state.closeStart,`\n${indent}${tag}\n${base}`);assertTransitionSemantics(changed);return changed;
}
export function deleteTransition(text:string,stateId:string,index:number):string{
  const state=findElementById(parseXmlSource(text),new Set(['state','parallel','history']),stateId);const transition=state?directChildren(state,'transition')[index]:undefined;if(!transition)throw new Error(`Transition ${index+1} was not found in state ${stateId}.`);return removeElementWithLeadingIndent(text,transition);
}
function escapeXml(value: string): string { return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }


function appendDirectChild(text: string, parentId: string, xml: string): string {
  const parent = findElementById(parseXmlSource(text), new Set(['state', 'parallel']), parentId);
  if (!parent) { throw new Error(`Parent state ${parentId} was not found.`); }
  const baseIndent = indentationAt(text, parent.start);
  const formatted = normalizeIndent(xml, baseIndent + '  ');
  if (parent.selfClosing) {
    const open = text.slice(parent.start, parent.openEnd).replace(/\/\s*>$/, '>');
    return replaceRange(text, parent.start, parent.openEnd, `${open}\n${formatted}\n${baseIndent}</${parent.name}>`);
  }
  return replaceRange(text, parent.closeStart, parent.closeStart, `\n${formatted}\n${baseIndent}`);
}

function appendRootChild(text: string, xml: string): string {
  const root = findRootElement(text);
  if (!root) { throw new Error('The SCXML root element was not found.'); }
  const baseIndent = indentationAt(text, root.start);
  const formatted = normalizeIndent(xml, baseIndent + '  ');
  if (root.selfClosing) {
    const open = text.slice(root.start, root.openEnd).replace(/\/\s*>$/, '>');
    return replaceRange(text, root.start, root.openEnd, `${open}\n${formatted}\n${baseIndent}</${root.name}>`);
  }
  return replaceRange(text, root.closeStart, root.closeStart, `\n${formatted}\n${baseIndent}`);
}

function removeStateInitialReference(text: string, ownerId: string | undefined, stateId: string): string {
  const owner = ownerId
    ? findElementById(parseXmlSource(text), new Set(['state', 'parallel']), ownerId)
    : findRootElement(text);
  return owner && getAttribute(owner, 'initial')?.value === stateId
    ? setSourceAttribute(text, owner, 'initial', '')
    : text;
}

export interface NewChildState { parentId: string; id: string; kind: string; initial: boolean; }

export function createChildState(text: string, child: NewChildState): string {
  const parent = findElementById(parseXmlSource(text), new Set(['state', 'parallel', 'final', 'history']), child.parentId);
  if (!parent) { throw new Error(`Parent state ${child.parentId} was not found.`); }
  if (getStateDepth(text, child.parentId) >= 64) { throw new Error('The editor supports a maximum state nesting depth of 64.'); }
  if (parent.localName === 'final' || parent.localName === 'history') { throw new Error(`${parent.localName} cannot contain child states.`); }
  const id = String(child.id ?? '').trim();
  if (!id) { throw new Error('Child state ID is required.'); }
  if (findState(text, id)) { throw new Error(`State ${id} already exists.`); }
  const kind = /^(state|parallel|final|history)$/.test(child.kind) ? child.kind : 'state';
  let result = appendDirectChild(text, child.parentId, `<${kind} id="${escapeXml(id)}"/>`);
  if (child.initial && parent.localName === 'state') {
    const refreshed = findElementById(parseXmlSource(result), new Set(['state']), child.parentId)!;
    result = setSourceAttribute(result, refreshed, 'initial', id);
  }
  return result;
}
export interface NewParallelRegion { parallelId: string; regionId: string; initialStateId: string; }

export function createParallelRegion(text: string, region: NewParallelRegion): string {
  const parallelId = String(region?.parallelId ?? '').trim();
  const parent = findElementById(parseXmlSource(text), new Set(['parallel']), parallelId);
  if (!parent) { throw new Error(`Parallel state ${parallelId} was not found.`); }
  const regionId = String(region?.regionId ?? '').trim(), initialId = String(region?.initialStateId ?? '').trim();
  if (!regionId || !initialId) { throw new Error('Region ID and initial state ID are required.'); }
  if (findState(text, regionId) || findState(text, initialId)) { throw new Error('Region and initial child IDs must be unique.'); }
  return appendDirectChild(text, parallelId, `<state id="${escapeXml(regionId)}" initial="${escapeXml(initialId)}">\n  <state id="${escapeXml(initialId)}"/>\n</state>`);
}

export interface NewHistoryState { parentId: string; id: string; historyType: 'shallow' | 'deep'; defaultTarget?: string; }
export interface HistoryUpdate { id: string; historyType: 'shallow' | 'deep'; defaultTarget?: string; }
export function createHistoryState(text: string, history: NewHistoryState): string {
  const parentId = String(history.parentId ?? '').trim(), id = String(history.id ?? '').trim();
  const type = history.historyType === 'deep' ? 'deep' : 'shallow', target = String(history.defaultTarget ?? '').trim();
  if (!parentId || !id) { throw new Error('History parent and ID are required.'); }
  if (findState(text, id)) { throw new Error(`State ${id} already exists.`); }
  const parent = findElementById(parseXmlSource(text), new Set(['state', 'parallel']), parentId);
  if (!parent) { throw new Error(`History parent ${parentId} was not found.`); }
  if (target && !findState(text, target)) { throw new Error(`Default history target ${target} was not found.`); }
  const body = target ? `\n  <transition target="${escapeXml(target)}"/>\n` : '';
  return appendDirectChild(text, parentId, `<history id="${escapeXml(id)}" type="${type}">${body}</history>`);
}
export function updateHistoryState(text: string, update: HistoryUpdate): string {
  let history = findElementById(parseXmlSource(text), new Set(['history']), update.id);
  if (!history) throw new Error(`History ${update.id} was not found.`);
  let result = setSourceAttribute(text, history, 'type', update.historyType === 'deep' ? 'deep' : 'shallow');
  history = findElementById(parseXmlSource(result), new Set(['history']), update.id)!;
  const target = String(update.defaultTarget ?? '').trim();
  if (target && !findState(result, target)) throw new Error(`Default history target ${target} was not found.`);
  const transition = directChildren(history, 'transition')[0];
  if (transition) return setSourceAttribute(result, transition, 'target', target);
  if (!target) return result;
  const baseIndent = indentationAt(result, history.start), indent = baseIndent + '  ';
  if (history.selfClosing) { const open=result.slice(history.start,history.openEnd).replace(/\/\s*>$/,'>'); return replaceRange(result,history.start,history.openEnd,`${open}\n${indent}<transition target="${escapeXml(target)}"/>\n${baseIndent}</${history.name}>`); }
  return replaceRange(result,history.closeStart,history.closeStart,`\n${indent}<transition target="${escapeXml(target)}"/>\n${baseIndent}`);
}
export function getStateDepth(text: string, id: string): number {
  const state=findElementById(parseXmlSource(text),new Set(['state','parallel','final','history']),id);
  if(!state) throw new Error(`State ${id} was not found.`);
  let depth=0,parent=state.parent; while(parent){if(['state','parallel','final','history'].includes(parent.localName))depth++;parent=parent.parent;} return depth;
}
export interface ReparentStateRequest { stateId: string; newParentId?: string; }

export function reparentState(text: string, request: ReparentStateRequest): string {
  const stateId = String(request.stateId ?? '').trim(), newParentId = String(request.newParentId ?? '').trim();
  if (!stateId) { throw new Error('State ID is required.'); }
  if (stateId === newParentId) { throw new Error('A state cannot contain itself.'); }
  const document = parseXmlSource(text);
  const source = findElementById(document, new Set(['state', 'parallel', 'final', 'history']), stateId);
  if (!source) { throw new Error(`State ${stateId} was not found.`); }
  const destination = newParentId ? findElementById(document, new Set(['state', 'parallel']), newParentId) : undefined;
  if (newParentId && !destination) { throw new Error(`Destination state ${newParentId} was not found or cannot contain children.`); }
  if (destination && destination.start >= source.start && destination.end <= source.end) { throw new Error('A state cannot be moved into one of its descendants.'); }
  if (destination && getStateDepth(text, newParentId) >= 64) { throw new Error('The editor supports a maximum state nesting depth of 64.'); }
  let oldParent = source.parent;
  while (oldParent && !['state', 'parallel'].includes(oldParent.localName)) { oldParent = oldParent.parent; }
  const oldParentId = oldParent ? getAttribute(oldParent, 'id')?.value : undefined;
  if ((oldParentId ?? '') === newParentId) { return text; }
  const sourceXml = text.slice(source.start, source.end);
  let result = removeElementWithLeadingIndent(text, source);
  result = removeStateInitialReference(result, oldParentId, stateId);
  return newParentId ? appendDirectChild(result, newParentId, sourceXml) : appendRootChild(result, sourceXml);
}
function normalizeIndent(xml: string, indent: string): string {
  const lines = xml.split(/\r?\n/);
  const nonBlank = lines.filter(line => line.trim().length > 0);
  const common = nonBlank.length ? Math.min(...nonBlank.map(line => line.match(/^[ \t]*/)?.[0].length ?? 0)) : 0;
  return lines.map(line => indent + line.slice(Math.min(common, line.length))).join('\n');
}

function findImmediateParent(text: string, source: { start: number; end: number }): { id: string; start: number; end: number } | undefined {
  const document = parseXmlSource(text);
  const element = document.elements.find(item => item.start === source.start && item.end === source.end);
  let parent = element?.parent;
  while (parent && !['state', 'parallel', 'final', 'history'].includes(parent.localName)) { parent = parent.parent; }
  const id = parent ? getAttribute(parent, 'id')?.value : undefined;
  return parent && id ? { id, start: parent.start, end: parent.end } : undefined;
}

function findRootElement(text: string): XmlSourceElement | undefined {
  return parseXmlSource(text).roots.find(element => element.localName === 'scxml');
}

function findScopeElement(text: string, scopeId?: string): XmlSourceElement | undefined {
  return scopeId ? findElementById(parseXmlSource(text), new Set(['state', 'parallel']), scopeId) : findRootElement(text);
}

function directChildOf(text: string, scope: XmlSourceElement, localName: string, index = 0): XmlSourceElement | undefined {
  return directChildren(scope, localName)[index];
}

function indentationAt(text: string, offset: number): string {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  return text.slice(lineStart, offset).match(/^[ \t]*/)?.[0] ?? '';
}

function removeElementWithLeadingIndent(text: string, element: XmlSourceElement): string {
  let start = element.start;
  while (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\t')) { start--; }
  if (start > 0 && text[start - 1] === '\n') { start--; }
  return replaceRange(text, start, element.end, '');
}

export interface RootPropertiesUpdate {
  name?: string;
  version: string;
  namespace: string;
  datamodel?: string;
  binding?: string;
  xmlBase?: string;
  initialTarget?: string;
  explicitInitial: boolean;
  initialCond?: string;
}

export interface ExplicitInitialUpdate {
  scopeId?: string;
  target: string;
  cond?: string;
  explicit: boolean;
}

export function updateRootProperties(text: string, update: RootPropertiesUpdate): string {
  const root = findRootElement(text);
  if (!root) { throw new Error('The SCXML root element was not found.'); }
  const target = String(update.initialTarget ?? '').trim();
  if (target && !findState(text, target)) { throw new Error(`Initial target ${target} was not found.`); }
  let result = text;
  const attributes: Array<[string, string]> = [
    ['version', update.version.trim() || '1.0'],
    ['xmlns', update.namespace.trim() || 'http://www.w3.org/2005/07/scxml'],
    ['name', String(update.name ?? '').trim()],
    ['datamodel', String(update.datamodel ?? '').trim()],
    ['binding', String(update.binding ?? '').trim()],
    ['xml:base', String(update.xmlBase ?? '').trim()],
    ['initial', update.explicitInitial ? '' : target]
  ];
  // Reparse after each splice because source offsets change while preserving all untouched bytes.
  for (const [name, value] of attributes) {
    const current = findRootElement(result);
    if (!current) { throw new Error('The SCXML root element was lost while updating attributes.'); }
    result = setSourceAttribute(result, current, name, value);
  }
  return setExplicitInitialElement(result, undefined, target, String(update.initialCond ?? '').trim(), update.explicitInitial);
}
export function updateExplicitInitial(text: string, update: ExplicitInitialUpdate): string {
  const target = String(update.target ?? '').trim();
  if (!target) { throw new Error('Initial transition target is required.'); }
  if (!findState(text, target)) { throw new Error(`Initial target ${target} was not found.`); }
  return setExplicitInitialElement(text, update.scopeId, target, String(update.cond ?? '').trim(), update.explicit);
}

function setExplicitInitialElement(text: string, scopeId: string | undefined, target: string, cond: string, explicit: boolean): string {
  let result = text;
  let scope = findScopeElement(result, scopeId);
  if (!scope) { throw new Error(scopeId ? `State ${scopeId} was not found.` : 'The SCXML root element was not found.'); }
  result = setSourceAttribute(result, scope, 'initial', explicit ? '' : target);
  scope = findScopeElement(result, scopeId)!;
  const existing = directChildOf(result, scope, 'initial');
  if (!explicit) { return existing ? removeElementWithLeadingIndent(result, existing) : result; }
  if (!target) { throw new Error('Explicit initial transition requires a target.'); }
  let transition = '<transition/>';
  transition = setAttribute(transition, 'target', target);
  transition = setAttribute(transition, 'cond', cond);
  const parentIndent = indentationAt(result, scope.start);
  const element = `${parentIndent}  <initial>\n${parentIndent}    ${transition}\n${parentIndent}  </initial>`;
  if (existing) { return replaceRange(result, existing.start, existing.end, element); }
  if (scope.selfClosing) {
    const open = result.slice(scope.start, scope.openEnd).replace(/\/\s*>$/, '>');
    return replaceRange(result, scope.start, scope.openEnd, `${open}\n${element}\n${parentIndent}</${scope.name}>`);
  }
  return replaceRange(result, scope.openEnd, scope.openEnd, `\n${element}`);
}
export type ExecutableContentLocation = 'onentry' | 'onexit' | 'transition';
export interface ExecutableContentUpdate {
  stateId: string;
  location: ExecutableContentLocation;
  transitionIndex?: number;
  xml: string;
}

const executableElementNames = new Set(['raise', 'log', 'assign', 'script', 'if', 'elseif', 'else', 'foreach', 'send', 'cancel', 'param', 'content']);

export function readExecutableContent(text: string, stateId: string, location: ExecutableContentLocation, transitionIndex = 0): string {
  const state = findElementById(parseXmlSource(text), new Set(['state', 'parallel', 'final', 'history']), stateId);
  if (!state) { throw new Error(`State ${stateId} was not found.`); }
  const owner = location === 'transition' ? directChildren(state, 'transition')[transitionIndex] : directChildren(state, location)[0];
  return owner ? text.slice(owner.openEnd, owner.closeStart).trim() : '';
}

export function updateExecutableContent(text: string, update: ExecutableContentUpdate): string {
  const state = findElementById(parseXmlSource(text), new Set(['state', 'parallel', 'final', 'history']), update.stateId);
  if (!state) { throw new Error(`State ${update.stateId} was not found.`); }
  if (state.localName === 'history' && update.location !== 'transition') { throw new Error('History states do not support onentry or onexit content.'); }
  const xml = String(update.xml ?? '').trim();
  validateExecutableFragment(xml);
  if (update.location === 'transition') {
    const transition = directChildren(state, 'transition')[update.transitionIndex ?? 0];
    if (!transition) { throw new Error(`Transition ${(update.transitionIndex ?? 0) + 1} was not found in the selected state.`); }
    return replaceElementBody(text, transition, xml);
  }
  const existing = directChildren(state, update.location)[0];
  if (existing) {
    if (!xml) { return removeElementWithLeadingIndent(text, existing); }
    return replaceElementBody(text, existing, xml);
  }
  if (!xml) { return text; }
  return insertExecutableBlock(text, state, update.location, xml);
}

function replaceElementBody(text: string, element: XmlSourceElement, xml: string): string {
  const openTag = text.slice(element.start, element.openEnd);
  if (!xml) {
    const empty = openTag.replace(/\/\s*>$/, '>').replace(/>$/, '/>');
    return replaceRange(text, element.start, element.end, empty);
  }
  const indent = indentationAt(text, element.start);
  const normalizedOpen = openTag.replace(/\/\s*>$/, '>');
  return replaceRange(text, element.start, element.end, `${normalizedOpen}\n${indentFragment(xml, indent + '  ')}\n${indent}</${element.name}>`);
}

function insertExecutableBlock(text: string, state: XmlSourceElement, location: 'onentry' | 'onexit', xml: string): string {
  const baseIndent = indentationAt(text, state.start);
  const block = `${baseIndent}  <${location}>\n${indentFragment(xml, baseIndent + '    ')}\n${baseIndent}  </${location}>`;
  if (state.selfClosing) {
    const open = text.slice(state.start, state.openEnd).replace(/\/\s*>$/, '>');
    return replaceRange(text, state.start, state.openEnd, `${open}\n${block}\n${baseIndent}</${state.name}>`);
  }
  if (location === 'onentry') { return replaceRange(text, state.openEnd, state.openEnd, `\n${block}`); }
  return replaceRange(text, state.closeStart, state.closeStart, `\n${block}\n${baseIndent}`);
}

function validateExecutableFragment(xml: string): void {
  if (!xml) { return; }
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '');
  const tags = [...withoutComments.matchAll(/<\/?([A-Za-z_][\w:.-]*)\b[^>]*>/g)];
  if (!tags.length) { throw new Error('Executable content must contain SCXML action elements.'); }
  for (const tag of tags) {
    const name = tag[1].includes(':') ? tag[1] : tag[1].toLowerCase();
    if (!tag[0].startsWith('</') && !executableElementNames.has(name) && !name.includes(':')) {
      throw new Error(`Executable content supports raise, log, assign, script, if, elseif, else, foreach, send, cancel, param, content, and namespaced extension actions; found ${tag[1]}.`);
    }
  }
  const stack: string[] = [];
  for (const tag of tags) {
    const closing = tag[0].startsWith('</');
    const selfClosing = /\/\s*>$/.test(tag[0]);
    const name = tag[1];
    if (closing) {
      if (stack.pop() !== name) { throw new Error(`Executable content has a mismatched closing tag: ${name}.`); }
    } else if (!selfClosing) { stack.push(name); }
  }
  if (stack.length) { throw new Error(`Executable content has an unclosed element: ${stack[stack.length - 1]}.`); }
  for (const match of withoutComments.matchAll(/<raise\b([^>]*)\/?\s*>/gi)) {
    if (!/\bevent\s*=/.test(match[1])) { throw new Error('raise requires an event attribute.'); }
  }
  for (const match of withoutComments.matchAll(/<assign\b([^>]*)\/?\s*>/gi)) {
    if (!/\blocation\s*=/.test(match[1])) { throw new Error('assign requires a location attribute.'); }
  }
  for (const match of withoutComments.matchAll(/<script\b([^>]*)\/?\s*>/gi)) {
    const source = /\bsrc\s*=/.test(match[1]);
    if (source && !/\/\s*>$/.test(match[0])) { throw new Error('A script with src must not also contain inline script content.'); }
  }
  for (const match of withoutComments.matchAll(/<if\b([^>]*)>/gi)) {
    if (!/\bcond\s*=/.test(match[1])) { throw new Error('if requires a cond attribute.'); }
    if (/\/\s*>$/.test(match[0])) { throw new Error('if must contain executable content and use a closing if element.'); }
  }
  for (const match of withoutComments.matchAll(/<elseif\b([^>]*)\/?\s*>/gi)) {
    if (!/\bcond\s*=/.test(match[1])) { throw new Error('elseif requires a cond attribute.'); }
    if (!/\/\s*>$/.test(match[0])) { throw new Error('elseif must be empty and self-closing.'); }
  }
  for (const match of withoutComments.matchAll(/<else\b([^>]*)\/?\s*>/gi)) {
    if (!/\/\s*>$/.test(match[0])) { throw new Error('else must be empty and self-closing.'); }
  }
  for (const match of withoutComments.matchAll(/<foreach\b([^>]*)>/gi)) {
    if (!/\barray\s*=/.test(match[1])) { throw new Error('foreach requires an array attribute.'); }
    if (!/\bitem\s*=/.test(match[1])) { throw new Error('foreach requires an item attribute.'); }
    if (/\/\s*>$/.test(match[0])) { throw new Error('foreach must contain executable content and use a closing foreach element.'); }
  }
  for (const match of withoutComments.matchAll(/<send\b([^>]*)>/gi)) {
    const attrs = match[1];
    validateExclusiveAttributePair(attrs, 'event', 'eventexpr', 'send');
    validateExclusiveAttributePair(attrs, 'target', 'targetexpr', 'send');
    validateExclusiveAttributePair(attrs, 'type', 'typeexpr', 'send');
    validateExclusiveAttributePair(attrs, 'id', 'idlocation', 'send');
    validateExclusiveAttributePair(attrs, 'delay', 'delayexpr', 'send');
    if (!/\bevent(?:expr)?\s*=/.test(attrs)) { throw new Error('send requires event or eventexpr.'); }
  }
  for (const match of withoutComments.matchAll(/<cancel\b([^>]*)\/?\s*>/gi)) {
    const attrs = match[1];
    validateExclusiveAttributePair(attrs, 'sendid', 'sendidexpr', 'cancel');
    if (!/\bsendid(?:expr)?\s*=/.test(attrs)) { throw new Error('cancel requires sendid or sendidexpr.'); }
    if (!/\/\s*>$/.test(match[0])) { throw new Error('cancel must be empty and self-closing.'); }
  }
  for (const match of withoutComments.matchAll(/<param\b([^>]*)\/?\s*>/gi)) {
    const attrs = match[1];
    if (!/\bname\s*=/.test(attrs)) { throw new Error('param requires a name attribute.'); }
    validateExclusiveAttributePair(attrs, 'expr', 'location', 'param');
    if (!/\b(?:expr|location)\s*=/.test(attrs)) { throw new Error('param requires expr or location.'); }
    if (!/\/\s*>$/.test(match[0])) { throw new Error('param must be empty and self-closing.'); }
  }
  validateSendChildren(withoutComments);
  validateConditionalPlacement(withoutComments);
}



function validateExclusiveAttributePair(attrs: string, literal: string, expression: string, element: string): void {
  if (new RegExp(`\\b${literal}\\s*=`).test(attrs) && new RegExp(`\\b${expression}\\s*=`).test(attrs)) {
    throw new Error(`${element} cannot define both ${literal} and ${expression}.`);
  }
}

function validateSendChildren(xml: string): void {
  for (const match of xml.matchAll(/<send\b[^>]*>([\s\S]*?)<\/send\s*>/gi)) {
    const body = match[1];
    const contentCount = (body.match(/<content\b/gi) || []).length;
    const paramCount = (body.match(/<param\b/gi) || []).length;
    if (contentCount > 1) { throw new Error('send may contain at most one content element.'); }
    if (contentCount && paramCount) { throw new Error('send cannot contain both content and param elements.'); }
  }
}

function validateConditionalPlacement(xml: string): void {
  const tokenPattern = /<\/?([A-Za-z_][\w:.-]*)\b[^>]*>/g;
  const stack: Array<{ name: string; elseSeen: boolean }> = [];
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(xml))) {
    const token = match[0];
    const name = match[1].toLowerCase();
    const closing = token.startsWith('</');
    const selfClosing = /\/\s*>$/.test(token);
    if (closing) { stack.pop(); continue; }
    if (name === 'elseif' || name === 'else') {
      const parentIf = [...stack].reverse().find(entry => entry.name === 'if');
      if (!parentIf || stack[stack.length - 1] !== parentIf) { throw new Error(`${name} must be a direct child of if.`); }
      if (parentIf.elseSeen) { throw new Error(`${name} cannot appear after else.`); }
      if (name === 'else') { parentIf.elseSeen = true; }
      continue;
    }
    if (!selfClosing) { stack.push({ name, elseSeen: false }); }
  }
}



function indentFragment(xml: string, indent: string): string {
  const lines = xml.trim().split(/\r?\n/);
  const nonBlank = lines.filter(line => line.trim());
  const common = nonBlank.length ? Math.min(...nonBlank.map(line => line.match(/^[ \t]*/)?.[0].length ?? 0)) : 0;
  return lines.map(line => indent + line.slice(Math.min(common, line.length))).join('\n');
}

export function readDoneData(text: string, stateId: string): DoneDataUpdate {
  const state = findElementById(parseXmlSource(text), new Set(['final']), stateId);
  if (!state) { return { stateId, mode: 'none' }; }
  const done = directChildOf(text, state, 'donedata');
  if (!done) { return { stateId, mode: 'none' }; }
  const content = directChildOf(text, done, 'content');
  if (content) {
    const expr = getAttribute(content, 'expr')?.value;
    return expr !== undefined ? { stateId, mode: 'expr', expression: expr } : { stateId, mode: 'content', content: text.slice(content.openEnd, content.closeStart).trim() };
  }
  const params = directChildren(done, 'param').map(param => ({ name: getAttribute(param, 'name')?.value || '', expr: getAttribute(param, 'expr')?.value, location: getAttribute(param, 'location')?.value }));
  return params.length ? { stateId, mode: 'params', params } : { stateId, mode: 'none' };
}

export function updateDoneData(text: string, update: DoneDataUpdate): string {
  const document = parseXmlSource(text);
  const state = findElementById(document, new Set(['final']), update.stateId);
  if (!state) { throw new Error(`Final state ${update.stateId} was not found.`); }
  let inner = '';
  if (update.mode === 'expr') {
    const expression = String(update.expression ?? '').trim(); if (!expression) { throw new Error('Done-data expression is required.'); }
    inner = `<content expr="${escapeXml(expression)}"/>`;
  } else if (update.mode === 'content') {
    const content = String(update.content ?? '').trim(); if (!content) { throw new Error('Done-data inline content is required.'); }
    inner = `<content>${content}</content>`;
  } else if (update.mode === 'params') {
    const params = update.params ?? []; if (!params.length) { throw new Error('At least one done-data parameter is required.'); }
    inner = params.map(param => {
      const name = String(param.name ?? '').trim(), expr = String(param.expr ?? '').trim(), location = String(param.location ?? '').trim();
      if (!name) { throw new Error('Each done-data parameter requires a name.'); }
      if ((expr ? 1 : 0) + (location ? 1 : 0) !== 1) { throw new Error(`Done-data parameter ${name} requires exactly one of expr or location.`); }
      return `<param name="${escapeXml(name)}" ${expr ? `expr="${escapeXml(expr)}"` : `location="${escapeXml(location)}"`}/>`;
    }).join('\n');
  }
  const existing = directChildOf(text, state, 'donedata');
  let result = existing ? removeElementWithLeadingIndent(text, existing) : text;
  if (update.mode === 'none') { return result; }
  const refreshed = findElementById(parseXmlSource(result), new Set(['final']), update.stateId)!;
  const parentIndent = indentationAt(result, refreshed.start), indent = parentIndent + '  ';
  const block = `${indent}<donedata>\n${indentFragment(inner, indent + '  ')}\n${indent}</donedata>`;
  if (refreshed.selfClosing) {
    const open = result.slice(refreshed.start, refreshed.openEnd).replace(/\/\s*>$/, '>');
    return replaceRange(result, refreshed.start, refreshed.openEnd, `${open}\n${block}\n${parentIndent}</${refreshed.name}>`);
  }
  return replaceRange(result, refreshed.closeStart, refreshed.closeStart, `\n${block}\n${parentIndent}`);
}
export interface DataDeclarationUpdate { id: string; mode: 'expr' | 'src' | 'content'; value: string; }
export interface DataModelUpdate { scopeId?: string; declarations: DataDeclarationUpdate[]; }

export function readDataModel(text: string, scopeId?: string): DataDeclarationUpdate[] {
  const scope = findScopeElement(text, scopeId); if (!scope) { return []; }
  const model = directChildOf(text, scope, 'datamodel'); if (!model) { return []; }
  return directChildren(model, 'data').map(data => {
    const id = getAttribute(data, 'id')?.value || '', expr = getAttribute(data, 'expr')?.value, src = getAttribute(data, 'src')?.value;
    return expr !== undefined ? { id, mode: 'expr' as const, value: expr } : src !== undefined ? { id, mode: 'src' as const, value: src } : { id, mode: 'content' as const, value: text.slice(data.openEnd, data.closeStart).trim() };
  });
}

export function updateDataModel(text: string, update: DataModelUpdate): string {
  const declarations = update.declarations ?? [], seen = new Set<string>();
  for (const item of declarations) {
    const id = String(item.id ?? '').trim(), value = String(item.value ?? '').trim();
    if (!id) { throw new Error('Every data declaration requires an ID.'); }
    if (seen.has(id)) { throw new Error(`Duplicate data ID in this scope: ${id}.`); } seen.add(id);
    if (!/^[A-Za-z_][\w.-]*$/.test(id)) { throw new Error(`Data ID ${id} is not a valid XML identifier.`); }
    if (!value) { throw new Error(`Data declaration ${id} requires an expression, source, or inline content.`); }
  }
  const scope = findScopeElement(text, update.scopeId);
  if (!scope) { throw new Error(update.scopeId ? `State ${update.scopeId} was not found.` : 'The SCXML root element was not found.'); }
  const existing = directChildOf(text, scope, 'datamodel');
  let result = existing ? removeElementWithLeadingIndent(text, existing) : text;
  if (!declarations.length) { return result; }
  const refreshed = findScopeElement(result, update.scopeId)!;
  const parentIndent = indentationAt(result, refreshed.start), indent = parentIndent + '  ';
  const items = declarations.map(item => {
    const id = escapeXml(item.id.trim()), value = String(item.value).trim();
    if (item.mode === 'expr') { return `${indent}  <data id="${id}" expr="${escapeXml(value)}"/>`; }
    if (item.mode === 'src') { return `${indent}  <data id="${id}" src="${escapeXml(value)}"/>`; }
    return `${indent}  <data id="${id}">${value}</data>`;
  }).join('\n');
  const block = `${indent}<datamodel>\n${items}\n${indent}</datamodel>`;
  if (refreshed.selfClosing) {
    const open = result.slice(refreshed.start, refreshed.openEnd).replace(/\/\s*>$/, '>');
    return replaceRange(result, refreshed.start, refreshed.openEnd, `${open}\n${block}\n${parentIndent}</${refreshed.name}>`);
  }
  return replaceRange(result, refreshed.openEnd, refreshed.openEnd, `\n${block}`);
}
export interface InvokeUpdate { stateId: string; xml: string; }

export function readInvokes(text: string, stateId: string): string {
  const state = findElementById(parseXmlSource(text), new Set(['state', 'parallel']), stateId);
  if (!state) { return ''; }
  return directChildren(state, 'invoke').map(item => text.slice(item.start, item.end).trim()).join('\n');
}

export function updateInvokes(text: string, update: InvokeUpdate): string {
  const state = findElementById(parseXmlSource(text), new Set(['state', 'parallel', 'final', 'history']), update.stateId);
  if (!state) { throw new Error(`State ${update.stateId} was not found.`); }
  if (state.localName === 'history' || state.localName === 'final') { throw new Error(`${state.localName} states cannot contain invoke elements.`); }
  const xml = String(update.xml ?? '').trim();
  validateInvokeFragment(xml);
  let result = text;
  const invokes = directChildren(state, 'invoke');
  for (const invoke of [...invokes].reverse()) { result = removeElementWithLeadingIndent(result, invoke); }
  if (!xml) { return result; }
  const refreshed = findElementById(parseXmlSource(result), new Set(['state', 'parallel']), update.stateId)!;
  const baseIndent = indentationAt(result, refreshed.start);
  const formatted = normalizeIndent(xml, baseIndent + '  ');
  if (refreshed.selfClosing) {
    const open = result.slice(refreshed.start, refreshed.openEnd).replace(/\/\s*>$/, '>');
    return replaceRange(result, refreshed.start, refreshed.openEnd, `${open}\n${formatted}\n${baseIndent}</${refreshed.name}>`);
  }
  return replaceRange(result, refreshed.closeStart, refreshed.closeStart, `\n${formatted}\n${baseIndent}`);
}

function validateInvokeFragment(xml: string): void {
  if (!xml) { return; }
  const wrapped = `<scope>${xml}</scope>`;
  const document = parseXmlSource(wrapped);
  const scope = document.roots[0];
  if (!scope || scope.localName !== 'scope') { throw new Error('Invocation content could not be parsed.'); }
  const nonWhitespace = wrapped.slice(scope.openEnd, scope.closeStart);
  const invokes = directChildren(scope, 'invoke');
  if (!invokes.length) { throw new Error('Invocation content must contain one or more invoke elements.'); }
  let cursor = scope.openEnd;
  for (const invoke of invokes) {
    if (wrapped.slice(cursor, invoke.start).trim()) { throw new Error('Invocation content must contain only invoke elements and whitespace.'); }
    cursor = invoke.end;
    validateInvokeElement(wrapped, invoke);
  }
  if (wrapped.slice(cursor, scope.closeStart).trim() || !nonWhitespace.trim()) { throw new Error('Invocation content must contain only invoke elements and whitespace.'); }
}

function validateInvokeElement(text: string, invoke: XmlSourceElement): void {
  const has = (name: string) => getAttribute(invoke, name) !== undefined;
  for (const [literal, expression] of [['id','idlocation'],['type','typeexpr'],['src','srcexpr']]) {
    if (has(literal) && has(expression)) { throw new Error(`invoke cannot define both ${literal} and ${expression}.`); }
  }
  const content = directChildren(invoke, 'content');
  const finalize = directChildren(invoke, 'finalize');
  if (content.length > 1) { throw new Error('invoke may contain at most one content element.'); }
  if (finalize.length > 1) { throw new Error('invoke may contain at most one finalize element.'); }
  if (content.length && (has('src') || has('srcexpr'))) { throw new Error('invoke cannot combine src or srcexpr with content.'); }
  for (const param of directChildren(invoke, 'param')) {
    if (!getAttribute(param, 'name')) { throw new Error('invoke param requires name.'); }
    const expr = getAttribute(param, 'expr'), location = getAttribute(param, 'location');
    if ((expr ? 1 : 0) + (location ? 1 : 0) !== 1) { throw new Error('invoke param requires exactly one of expr or location.'); }
  }
  for (const block of finalize) { validateExecutableFragment(text.slice(block.openEnd, block.closeStart)); }
}

export interface InvokeNavigationTarget {
  index: number;
  id?: string;
  src?: string;
  inlineScxml?: string;
  label: string;
}

export function readInvokeNavigationTargets(text: string, stateId: string): InvokeNavigationTarget[] {
  const state = findElementById(parseXmlSource(text), new Set(['state', 'parallel']), stateId);
  if (!state) { return []; }
  return directChildren(state, 'invoke').map((invoke, index) => {
    const id = getAttribute(invoke, 'id')?.value;
    const src = getAttribute(invoke, 'src')?.value;
    const content = directChildren(invoke, 'content')[0];
    const inline = content ? directChildren(content).find(child => child.localName === 'scxml') : undefined;
    const inlineScxml = inline ? text.slice(inline.start, inline.end) : undefined;
    return { index, id, src, inlineScxml, label: id || src || `invoke ${index + 1}` };
  });
}

export interface InitialTransitionActionsUpdate {
  scopeId?: string;
  xml: string;
}

export function readInitialTransitionActions(text: string, scopeId?: string): string {
  const scope = findScopeElement(text, scopeId); if (!scope) { return ''; }
  const initial = directChildOf(text, scope, 'initial'); if (!initial) { return ''; }
  const transition = directChildOf(text, initial, 'transition');
  return transition ? text.slice(transition.openEnd, transition.closeStart).trim() : '';
}

export function updateInitialTransitionActions(text: string, update: InitialTransitionActionsUpdate): string {
  const xml = String(update.xml ?? '').trim(); validateExecutableFragment(xml);
  const scope = findScopeElement(text, update.scopeId);
  if (!scope) { throw new Error(update.scopeId ? `State ${update.scopeId} was not found.` : 'The SCXML root element was not found.'); }
  const initial = directChildOf(text, scope, 'initial');
  if (!initial) { throw new Error('Create an explicit initial transition before editing its executable actions.'); }
  const transition = directChildOf(text, initial, 'transition');
  if (!transition) { throw new Error('The explicit initial transition was not found.'); }
  const openTag = text.slice(transition.start, transition.openEnd);
  if (!xml) {
    const emptyTag = openTag.replace(/\/\s*>$/, '>').replace(/>$/, '/>');
    return replaceRange(text, transition.start, transition.end, emptyTag);
  }
  const indent = indentationAt(text, transition.start), normalizedOpen = openTag.replace(/\/\s*>$/, '>');
  return replaceRange(text, transition.start, transition.end, `${normalizedOpen}\n${indentFragment(xml, indent + '  ')}\n${indent}</${transition.name}>`);
}
export interface InlineInvokeContentUpdate { stateId: string; invokeIndex: number; scxml: string; }

export function updateInlineInvokeContent(text: string, update: InlineInvokeContentUpdate): string {
  const state = findElementById(parseXmlSource(text), new Set(['state', 'parallel']), update.stateId);
  if (!state) { throw new Error(`State ${update.stateId} was not found.`); }
  const invoke = directChildren(state, 'invoke')[update.invokeIndex];
  if (!invoke) { throw new Error(`Invoke ${update.invokeIndex + 1} was not found in state ${update.stateId}.`); }
  const scxml = String(update.scxml ?? '').trim();
  const replacementRoot = findRootElement(scxml);
  if (!replacementRoot || replacementRoot.start !== 0 || replacementRoot.end !== scxml.length) { throw new Error('Inline invoke content must be one complete scxml element.'); }
  const content = directChildOf(text, invoke, 'content');
  if (!content) { throw new Error('The selected invoke does not contain inline content.'); }
  const nested = directChildren(content).find(child => child.localName === 'scxml');
  if (!nested) { throw new Error('The selected invoke content does not contain inline SCXML.'); }
  return replaceRange(text, nested.start, nested.end, scxml);
}
export interface StructuredSendAction {
  eventMode: 'literal' | 'expression'; event: string;
  targetMode: 'none' | 'literal' | 'expression'; target?: string;
  typeMode: 'none' | 'literal' | 'expression'; type?: string;
  idMode: 'none' | 'literal' | 'location'; id?: string;
  delayMode: 'none' | 'literal' | 'expression'; delay?: string;
  namelist?: string;
  params?: Array<{ name: string; mode: 'expr' | 'location'; value: string }>;
  contentMode?: 'none' | 'expression' | 'inline';
  content?: string;
}

export function createStructuredSendXml(action: StructuredSendAction): string {
  const event = String(action.event ?? '').trim();
  if (!event) { throw new Error('Send event or event expression is required.'); }
  if (action.eventMode === 'literal') {
    if (/\s/.test(event) || event === '*' || event.endsWith('.*') || !/^[A-Za-z_][\w.-]*$/.test(event)) {
      throw new Error('A literal send event must be one concrete event name.');
    }
  }
  let tag = '<send/>';
  tag = setAttribute(tag, action.eventMode === 'expression' ? 'eventexpr' : 'event', event);
  const applyChoice = (mode: string, value: string | undefined, literal: string, expression: string): void => {
    const normalized = String(value ?? '').trim();
    if (mode !== 'none' && !normalized) { throw new Error(`Send ${literal} value is required for the selected mode.`); }
    if (mode === 'literal') { tag = setAttribute(tag, literal, normalized); }
    else if (mode === 'expression' || mode === 'location') { tag = setAttribute(tag, expression, normalized); }
  };
  applyChoice(action.targetMode, action.target, 'target', 'targetexpr');
  applyChoice(action.typeMode, action.type, 'type', 'typeexpr');
  applyChoice(action.idMode, action.id, 'id', 'idlocation');
  applyChoice(action.delayMode, action.delay, 'delay', 'delayexpr');
  tag = setAttribute(tag, 'namelist', String(action.namelist ?? '').trim().replace(/\s+/g, ' '));
  const params = action.params ?? [];
  const contentMode = action.contentMode ?? 'none';
  const content = String(action.content ?? '').trim();
  if (params.length && contentMode !== 'none') { throw new Error('Send cannot combine parameters with content.'); }
  const children: string[] = [];
  for (const param of params) {
    const name = String(param.name ?? '').trim(), value = String(param.value ?? '').trim();
    if (!name || !value) { throw new Error('Each send parameter requires a name and value.'); }
    if (!/^[A-Za-z_][\w.-]*$/.test(name)) { throw new Error(`Send parameter name ${name} is not a valid identifier.`); }
    children.push(`<param name="${escapeXml(name)}" ${param.mode === 'location' ? 'location' : 'expr'}="${escapeXml(value)}"/>`);
  }
  if (contentMode !== 'none') {
    if (!content) { throw new Error('Send content is required for the selected content mode.'); }
    children.push(contentMode === 'expression' ? `<content expr="${escapeXml(content)}"/>` : `<content>${content}</content>`);
  }
  return children.length ? `${tag.replace(/\/\s*>$/, '>')}\n  ${children.join('\n  ')}\n</send>` : tag;
}

export interface StructuredCancelAction { mode: 'literal' | 'expression'; value: string; }
export function createStructuredCancelXml(action: StructuredCancelAction): string {
  const value = String(action.value ?? '').trim();
  if (!value) { throw new Error('Cancel send ID or expression is required.'); }
  let tag = '<cancel/>';
  tag = setAttribute(tag, action.mode === 'expression' ? 'sendidexpr' : 'sendid', value);
  return tag;
}

export interface StructuredInvokeAction {
  idMode: 'none'|'literal'|'location'; id?: string;
  typeMode: 'none'|'literal'|'expression'; type?: string;
  sourceMode: 'none'|'src'|'expression'|'inline'; source?: string;
  autoforward?: boolean; namelist?: string;
  params?: Array<{name:string;mode:'expr'|'location';value:string}>;
  finalize?: string;
}
export function createStructuredInvokeXml(action: StructuredInvokeAction): string {
  let tag='<invoke/>';
  const setChoice=(mode:string,value:string|undefined,literal:string,expression:string):void=>{const normalized=String(value??'').trim();if(mode!=='none'&&!normalized)throw new Error(`Invoke ${literal} value is required.`);if(mode==='literal'||mode==='src')tag=setAttribute(tag,literal,normalized);else if(mode==='expression'||mode==='location')tag=setAttribute(tag,expression,normalized);};
  setChoice(action.idMode,action.id,'id','idlocation');
  setChoice(action.typeMode,action.type,'type','typeexpr');
  if(action.sourceMode==='src'||action.sourceMode==='expression')setChoice(action.sourceMode,action.source,'src','srcexpr');
  tag=setAttribute(tag,'autoforward',action.autoforward?'true':'');
  tag=setAttribute(tag,'namelist',String(action.namelist??'').trim().replace(/\s+/g,' '));
  const children:string[]=[];
  for(const param of action.params??[]){const name=String(param.name??'').trim(),value=String(param.value??'').trim();if(!name||!value)throw new Error('Each invoke parameter requires a name and value.');if(!/^[A-Za-z_][\w.-]*$/.test(name))throw new Error(`Invoke parameter name ${name} is invalid.`);children.push(`<param name="${escapeXml(name)}" ${param.mode==='location'?'location':'expr'}="${escapeXml(value)}"/>`);}
  if(action.sourceMode==='inline'){const source=String(action.source??'').trim();const root=parseXmlSource(source).roots.find(item=>item.localName==='scxml');if(!root||root.start!==0||root.end!==source.length)throw new Error('Inline invoke source must be one complete scxml element.');children.push(`<content>${source}</content>`);if(action.typeMode==='none')tag=setAttribute(tag,'type','scxml');}
  const finalize=String(action.finalize??'').trim();if(finalize){validateExecutableFragment(finalize);children.push(`<finalize>\n${indentFragment(finalize,'  ')}\n</finalize>`);}
  return children.length?`${tag.replace(/\/\s*>$/,'>')}\n${indentFragment(children.join('\n'),'  ')}\n</invoke>`:tag;
}

export interface ExecutableActionItem { xml: string; }
export function readStructuredExecutableContent(text:string,stateId:string,location:ExecutableContentLocation,transitionIndex=0):ExecutableActionItem[]{
  const state=findElementById(parseXmlSource(text),new Set(['state','parallel','final','history']),stateId);if(!state)throw new Error(`State ${stateId} was not found.`);
  const owner=location==='transition'?directChildren(state,'transition')[transitionIndex]:directChildren(state,location)[0];if(!owner)return [];
  return directChildren(owner).map(child=>({xml:text.slice(child.start,child.end)}));
}
export function serializeStructuredExecutableContent(items:ExecutableActionItem[]):string{
  const xml=(items??[]).map(item=>String(item?.xml??'').trim()).filter(Boolean).join('\n');validateExecutableFragment(xml);return xml;
}
export function updateStructuredExecutableContent(text:string,update:Omit<ExecutableContentUpdate,'xml'>&{items:ExecutableActionItem[]}):string{
  return updateExecutableContent(text,{...update,xml:serializeStructuredExecutableContent(update.items)});
}
export function moveStructuredExecutableAction(text:string,update:{stateId:string;location:ExecutableContentLocation;transitionIndex?:number;index:number;direction:-1|1}):string{
  const items=readStructuredExecutableContent(text,update.stateId,update.location,update.transitionIndex??0);const target=update.index+update.direction;
  if(update.index<0||update.index>=items.length||target<0||target>=items.length)throw new Error('Executable action cannot be moved beyond the action list.');
  [items[update.index],items[target]]=[items[target],items[update.index]];
  return updateStructuredExecutableContent(text,{stateId:update.stateId,location:update.location,transitionIndex:update.transitionIndex,items});
}
export function deleteStructuredExecutableAction(text:string,update:{stateId:string;location:ExecutableContentLocation;transitionIndex?:number;index:number}):string{
  const items=readStructuredExecutableContent(text,update.stateId,update.location,update.transitionIndex??0);if(update.index<0||update.index>=items.length)throw new Error('Executable action was not found.');items.splice(update.index,1);
  return updateStructuredExecutableContent(text,{stateId:update.stateId,location:update.location,transitionIndex:update.transitionIndex,items});
}
