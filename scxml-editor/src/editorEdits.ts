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
  const found = findState(text, update.oldId); if (!found) { throw new Error(`State ${update.oldId} was not found.`); }
  let openTag = setAttribute(found.tag, 'id', update.id.trim());
  const requestedKind = update.parallel === true
    ? 'parallel'
    : update.parallel === false && found.kind === 'parallel'
      ? 'state'
      : update.kind;
  if (requestedKind && requestedKind !== found.kind) {
    openTag = openTag.replace(new RegExp(`^<${found.kind}\\b`, 'i'), `<${requestedKind}`);
  }
  let result = text.slice(0, found.start) + openTag + text.slice(found.openEnd);
  if (requestedKind && requestedKind !== found.kind && found.end > found.openEnd) {
    const delta = openTag.length - found.tag.length;
    const closeStart = result.lastIndexOf(`</${found.kind}>`, found.end + delta);
    if (closeStart >= 0) {
      result = result.slice(0, closeStart) + `</${requestedKind}>` + result.slice(closeStart + found.kind.length + 3);
    }
  }
  if (update.oldId !== update.id) { result = renameStateReferences(result, update.oldId, update.id); }
  result = setInitialInOwningScope(result, update.id, update.initial);
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
    const parentState = findState(text, parent.id);
    if (!parentState) { throw new Error(`Parent state ${parent.id} was not found.`); }
    // A parallel activates every direct region. Its children do not compete for one initial slot.
    if (parentState.kind === 'parallel') { return text; }
    const changed = initial
      ? setAttribute(parentState.tag, 'initial', stateId)
      : parentState.tag.replace(new RegExp(`(\\sinitial\\s*=\\s*)(["'])${escapeRegExp(stateId)}\\2`, 'i'), '');
    return text.slice(0, parentState.start) + changed + text.slice(parentState.openEnd);
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

export interface NewChildState { parentId: string; id: string; kind: string; initial: boolean; }

export function createChildState(text: string, child: NewChildState): string {
  const parent = findState(text, child.parentId);
  if (!parent) { throw new Error(`Parent state ${child.parentId} was not found.`); }
  const depth = getStateDepth(text, child.parentId);
  if (depth >= 64) { throw new Error('The editor supports a maximum state nesting depth of 64.'); }
  if (parent.kind === 'final' || parent.kind === 'history') { throw new Error(`${parent.kind} cannot contain child states.`); }
  const id = child.id.trim();
  if (!id) { throw new Error('Child state ID is required.'); }
  if (findState(text, id)) { throw new Error(`State ${id} already exists.`); }
  const kind = /^(state|parallel|final|history)$/.test(child.kind) ? child.kind : 'state';
  const parentLine = text.lastIndexOf('\n', parent.start) + 1;
  const parentIndent = text.slice(parentLine, parent.start).match(/^[ \t]*/)?.[0] ?? '';
  const childIndent = parentIndent + '  ';
  let openTag = parent.tag;
  if (child.initial && parent.kind === 'state') { openTag = setAttribute(openTag, 'initial', id); }
  const childElement = `${childIndent}<${kind} id="${escapeXml(id)}"/>`;
  if (/\/\s*>$/.test(parent.tag)) {
    openTag = openTag.replace(/\/\s*>$/, '>');
    return text.slice(0, parent.start) + `${openTag}\n${childElement}\n${parentIndent}</${parent.kind}>` + text.slice(parent.openEnd);
  }
  return text.slice(0, parent.start) + openTag + text.slice(parent.openEnd, parent.end - (`</${parent.kind}>`).length) + `\n${childElement}\n${parentIndent}` + text.slice(parent.end - (`</${parent.kind}>`).length);
}

export interface NewParallelRegion { parallelId: string; regionId: string; initialStateId: string; }

export function createParallelRegion(text: string, region: NewParallelRegion): string {
  const parallelId = String(region?.parallelId ?? '').trim();
  const parent = findState(text, parallelId);
  if (!parent) { throw new Error(`Parallel state ${parallelId} was not found.`); }
  if (parent.kind !== 'parallel') { throw new Error(`${parallelId} is not a parallel state.`); }
  const regionId = String(region?.regionId ?? '').trim();
  const initialId = String(region?.initialStateId ?? '').trim();
  if (!regionId || !initialId) { throw new Error('Region ID and initial state ID are required.'); }
  if (findState(text, regionId)) { throw new Error(`State ${regionId} already exists.`); }
  if (findState(text, initialId)) { throw new Error(`State ${initialId} already exists.`); }
  const parentLine = text.lastIndexOf('\n', parent.start) + 1;
  const parentIndent = text.slice(parentLine, parent.start).match(/^[ \t]*/)?.[0] ?? '';
  const regionIndent = parentIndent + '  ';
  const childIndent = regionIndent + '  ';
  const element = `${regionIndent}<state id="${escapeXml(regionId)}" initial="${escapeXml(initialId)}">\n${childIndent}<state id="${escapeXml(initialId)}"/>\n${regionIndent}</state>`;
  if (/\/\s*>$/.test(parent.tag)) {
    const open = parent.tag.replace(/\/\s*>$/, '>');
    return text.slice(0, parent.start) + `${open}\n${element}\n${parentIndent}</parallel>` + text.slice(parent.openEnd);
  }
  const close = `</parallel>`;
  const closeStart = parent.end - close.length;
  return text.slice(0, closeStart) + `\n${element}\n${parentIndent}` + text.slice(closeStart);
}


export interface NewHistoryState { parentId: string; id: string; historyType: 'shallow' | 'deep'; defaultTarget?: string; }
export interface HistoryUpdate { id: string; historyType: 'shallow' | 'deep'; defaultTarget?: string; }

export function createHistoryState(text: string, history: NewHistoryState): string {
  const parentId = String(history.parentId ?? '').trim();
  const id = String(history.id ?? '').trim();
  const type = history.historyType === 'deep' ? 'deep' : 'shallow';
  const target = String(history.defaultTarget ?? '').trim();
  if (!parentId || !id) { throw new Error('History parent and ID are required.'); }
  if (findState(text, id)) { throw new Error(`State ${id} already exists.`); }
  const parent = findState(text, parentId);
  if (!parent) { throw new Error(`History parent ${parentId} was not found.`); }
  if (parent.kind !== 'state' && parent.kind !== 'parallel') { throw new Error('History may only be added to state or parallel containers.'); }
  if (target && !findState(text, target)) { throw new Error(`Default history target ${target} was not found.`); }
  const parentLine = text.lastIndexOf('\n', parent.start) + 1;
  const parentIndent = text.slice(parentLine, parent.start).match(/^[ \t]*/)?.[0] ?? '';
  const indent = parentIndent + '  ';
  const transition = target ? `\n${indent}  <transition target="${escapeXml(target)}"/>\n${indent}` : '';
  const element = `${indent}<history id="${escapeXml(id)}" type="${type}">${transition}</history>`;
  if (/\/\s*>$/.test(parent.tag)) {
    const open = parent.tag.replace(/\/\s*>$/, '>');
    return text.slice(0, parent.start) + `${open}\n${element}\n${parentIndent}</${parent.kind}>` + text.slice(parent.openEnd);
  }
  const close = `</${parent.kind}>`; const closeStart = parent.end - close.length;
  return text.slice(0, closeStart) + `\n${element}\n${parentIndent}` + text.slice(closeStart);
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
  const stateId = String(request.stateId ?? '').trim();
  const newParentId = String(request.newParentId ?? '').trim();
  if (!stateId) { throw new Error('State ID is required.'); }
  if (stateId === newParentId) { throw new Error('A state cannot contain itself.'); }

  const source = findState(text, stateId);
  if (!source) { throw new Error(`State ${stateId} was not found.`); }
  const parent = newParentId ? findState(text, newParentId) : undefined;
  if (newParentId && !parent) { throw new Error(`Destination state ${newParentId} was not found.`); }
  if (parent && (parent.kind === 'final' || parent.kind === 'history')) { throw new Error(`${parent.kind} cannot contain child states.`); }
  if (parent && parent.start >= source.start && parent.end <= source.end) { throw new Error('A state cannot be moved into one of its descendants.'); }
  if (parent && getStateDepth(text, newParentId) >= 64) { throw new Error('The editor supports a maximum state nesting depth of 64.'); }

  const oldParent = findImmediateParent(text, source);
  if ((oldParent?.id ?? '') === newParentId) { return text; }

  let removeStart = source.start;
  while (removeStart > 0 && (text[removeStart - 1] === ' ' || text[removeStart - 1] === '\t')) { removeStart--; }
  if (removeStart > 0 && text[removeStart - 1] === '\n') { removeStart--; }
  let removeEnd = source.end;
  if (removeEnd < text.length && text[removeEnd] === '\r') { removeEnd++; }
  if (removeEnd < text.length && text[removeEnd] === '\n') { removeEnd++; }

  const sourceXml = text.slice(source.start, source.end);
  let without = text.slice(0, removeStart) + text.slice(removeEnd);
  if (oldParent) {
    const refreshedOldParent = findState(without, oldParent.id);
    if (refreshedOldParent) {
      const changedTag = refreshedOldParent.tag.replace(new RegExp(`(\\sinitial\\s*=\\s*)(["'])${escapeRegExp(stateId)}\\2`, 'i'), '');
      without = without.slice(0, refreshedOldParent.start) + changedTag + without.slice(refreshedOldParent.openEnd);
    }
  } else {
    const root = /<scxml\b[^>]*>/i.exec(without);
    if (root) {
      const changed = root[0].replace(new RegExp(`(\\sinitial\\s*=\\s*)(["'])${escapeRegExp(stateId)}\\2`, 'i'), '');
      without = without.slice(0, root.index) + changed + without.slice(root.index + root[0].length);
    }
  }

  if (!newParentId) {
    const rootClose = without.lastIndexOf('</scxml>');
    if (rootClose < 0) { throw new Error('The SCXML closing element was not found.'); }
    const normalized = normalizeIndent(sourceXml, '  ');
    const separator = rootClose > 0 && without[rootClose - 1] === '\n' ? '' : '\n';
    return without.slice(0, rootClose) + separator + normalized + '\n' + without.slice(rootClose);
  }

  const destination = findState(without, newParentId);
  if (!destination) { throw new Error(`Destination state ${newParentId} was not found after moving the source.`); }
  const parentLine = without.lastIndexOf('\n', destination.start) + 1;
  const parentIndent = without.slice(parentLine, destination.start).match(/^[ \t]*/)?.[0] ?? '';
  const normalized = normalizeIndent(sourceXml, parentIndent + '  ');

  if (/\/\s*>$/.test(destination.tag)) {
    const open = destination.tag.replace(/\/\s*>$/, '>');
    const replacement = `${open}\n${normalized}\n${parentIndent}</${destination.kind}>`;
    return without.slice(0, destination.start) + replacement + without.slice(destination.openEnd);
  }
  const close = `</${destination.kind}>`;
  const closeStart = destination.end - close.length;
  return without.slice(0, closeStart) + `${normalized}\n${parentIndent}` + without.slice(closeStart);
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
  const state = findState(text, stateId);
  if (!state) { throw new Error(`State ${stateId} was not found.`); }
  const body = text.slice(state.openEnd, state.end - (state.end > state.openEnd ? (`</${state.kind}>`).length : 0));
  if (location === 'transition') {
    const transition = findDirectChildElement(body, 'transition', transitionIndex);
    return transition ? transition.inner.trim() : '';
  }
  const block = findDirectChildElement(body, location, 0);
  return block ? block.inner.trim() : '';
}

export function updateExecutableContent(text: string, update: ExecutableContentUpdate): string {
  const state = findState(text, update.stateId);
  if (!state) { throw new Error(`State ${update.stateId} was not found.`); }
  if (state.kind === 'history' && update.location !== 'transition') { throw new Error('History states do not support onentry or onexit content.'); }
  const xml = String(update.xml ?? '').trim();
  validateExecutableFragment(xml);
  if (update.location === 'transition') {
    return replaceTransitionExecutableContent(text, state, update.transitionIndex ?? 0, xml);
  }
  return replaceStateExecutableBlock(text, state, update.location, xml);
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

function replaceStateExecutableBlock(text: string, state: ReturnType<typeof findState> & {}, location: 'onentry' | 'onexit', xml: string): string {
  const close = `</${state.kind}>`;
  if (/\/\s*>$/.test(state.tag)) {
    if (!xml) { return text; }
    const lineStart = text.lastIndexOf('\n', state.start) + 1;
    const indent = text.slice(lineStart, state.start).match(/^[ \t]*/)?.[0] ?? '';
    const open = state.tag.replace(/\/\s*>$/, '>');
    const block = formatExecutableBlock(location, xml, indent + '  ');
    return text.slice(0, state.start) + `${open}\n${block}\n${indent}${close}` + text.slice(state.openEnd);
  }
  const bodyStart = state.openEnd;
  const bodyEnd = state.end - close.length;
  const body = text.slice(bodyStart, bodyEnd);
  const existing = findDirectChildElement(body, location, 0);
  if (existing) {
    const start = bodyStart + existing.start;
    if (!xml) { return text.slice(0, start) + text.slice(bodyStart + existing.end); }
    const lineStart = text.lastIndexOf('\n', start) + 1;
    const indent = text.slice(lineStart, start).match(/^[ \t]*/)?.[0] ?? '';
    const replacement = formatExecutableBlock(location, xml, indent);
    return text.slice(0, start) + replacement + text.slice(bodyStart + existing.end);
  }
  if (!xml) { return text; }
  const lineStart = text.lastIndexOf('\n', state.start) + 1;
  const parentIndent = text.slice(lineStart, state.start).match(/^[ \t]*/)?.[0] ?? '';
  const block = formatExecutableBlock(location, xml, parentIndent + '  ');
  return location === 'onentry'
    ? text.slice(0, bodyStart) + `\n${block}` + text.slice(bodyStart)
    : text.slice(0, bodyEnd) + `\n${block}\n${parentIndent}` + text.slice(bodyEnd);
}

function replaceTransitionExecutableContent(text: string, state: ReturnType<typeof findState> & {}, transitionIndex: number, xml: string): string {
  const close = state.end > state.openEnd ? `</${state.kind}>` : '';
  const bodyStart = state.openEnd;
  const bodyEnd = state.end - close.length;
  const body = text.slice(bodyStart, bodyEnd);
  const transition = findDirectChildElement(body, 'transition', transitionIndex);
  if (!transition) { throw new Error(`Transition ${transitionIndex + 1} was not found in the selected state.`); }
  const absoluteStart = bodyStart + transition.start;
  const original = text.slice(absoluteStart, bodyStart + transition.end);
  const openTag = /^<transition\b[^>]*>/i.exec(original)?.[0];
  if (!openTag) { throw new Error('Transition opening element was not found.'); }
  if (!xml) {
    const emptyTag = openTag.replace(/>$/, '/>');
    return text.slice(0, absoluteStart) + emptyTag + text.slice(bodyStart + transition.end);
  }
  const lineStart = text.lastIndexOf('\n', absoluteStart) + 1;
  const indent = text.slice(lineStart, absoluteStart).match(/^[ \t]*/)?.[0] ?? '';
  const normalizedOpen = openTag.replace(/\/\s*>$/, '>');
  const content = indentFragment(xml, indent + '  ');
  const replacement = `${normalizedOpen}\n${content}\n${indent}</transition>`;
  return text.slice(0, absoluteStart) + replacement + text.slice(bodyStart + transition.end);
}

function formatExecutableBlock(location: 'onentry' | 'onexit', xml: string, indent: string): string {
  return `${indent}<${location}>\n${indentFragment(xml, indent + '  ')}\n${indent}</${location}>`;
}

function indentFragment(xml: string, indent: string): string {
  const lines = xml.trim().split(/\r?\n/);
  const nonBlank = lines.filter(line => line.trim());
  const common = nonBlank.length ? Math.min(...nonBlank.map(line => line.match(/^[ \t]*/)?.[0].length ?? 0)) : 0;
  return lines.map(line => indent + line.slice(Math.min(common, line.length))).join('\n');
}

function findDirectChildElement(body: string, name: string, requestedIndex: number): { start: number; end: number; inner: string } | undefined {
  const document = parseXmlSource(`<scope>${body}</scope>`);
  const scope = document.roots[0];
  const element = scope ? directChildren(scope, name)[requestedIndex] : undefined;
  if (!element) { return undefined; }
  const offset = '<scope>'.length;
  return { start: element.start - offset, end: element.end - offset, inner: document.text.slice(element.openEnd, element.closeStart) };
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
  const state = findState(text, stateId);
  if (!state || state.kind === 'history' || state.kind === 'final') { return ''; }
  const close = state.end > state.openEnd ? `</${state.kind}>` : '';
  const bodyEnd = state.end - close.length;
  const body = text.slice(state.openEnd, bodyEnd);
  return findDirectInvokeElements(body).map(item => item.xml.trim()).join('\n');
}

export function updateInvokes(text: string, update: InvokeUpdate): string {
  const state = findState(text, update.stateId);
  if (!state) { throw new Error(`State ${update.stateId} was not found.`); }
  if (state.kind === 'history' || state.kind === 'final') { throw new Error(`${state.kind} states cannot contain invoke elements.`); }
  const xml = String(update.xml ?? '').trim();
  validateInvokeFragment(xml);
  const close = state.end > state.openEnd ? `</${state.kind}>` : '';
  const bodyStart = state.openEnd, bodyEnd = state.end - close.length;
  const body = text.slice(bodyStart, bodyEnd);
  const invokes = findDirectInvokeElements(body);
  let result = text;
  for (const invoke of [...invokes].reverse()) {
    result = result.slice(0, bodyStart + invoke.start) + result.slice(bodyStart + invoke.end);
  }
  if (!xml) { return result; }
  const refreshed = findState(result, update.stateId)!;
  const lineStart = result.lastIndexOf('\n', refreshed.start) + 1;
  const parentIndent = result.slice(lineStart, refreshed.start).match(/^[ \t]*/)?.[0] ?? '';
  const formatted = indentFragment(xml, parentIndent + '  ');
  if (/\/\s*>$/.test(refreshed.tag)) {
    const open = refreshed.tag.replace(/\/\s*>$/, '>');
    return result.slice(0, refreshed.start) + `${open}\n${formatted}\n${parentIndent}</${refreshed.kind}>` + result.slice(refreshed.openEnd);
  }
  const insertion = refreshed.end - (`</${refreshed.kind}>`).length;
  return result.slice(0, insertion) + `\n${formatted}\n${parentIndent}` + result.slice(insertion);
}

function validateInvokeFragment(xml: string): void {
  if (!xml) { return; }
  const items = findDirectInvokeElements(xml);
  if (!items.length || items.map(item => item.xml).join('').replace(/\s+/g, '') !== xml.replace(/\s+/g, '')) {
    throw new Error('Invocation content must contain only one or more invoke elements.');
  }
  for (const item of items) {
    const open = /^<invoke\b([^>]*)>/i.exec(item.xml);
    if (!open) { throw new Error('Invalid invoke element.'); }
    const attrs = open[1];
    validateExclusiveAttributePair(attrs, 'id', 'idlocation', 'invoke');
    validateExclusiveAttributePair(attrs, 'type', 'typeexpr', 'invoke');
    validateExclusiveAttributePair(attrs, 'src', 'srcexpr', 'invoke');
    const body = item.xml.slice(open[0].length, item.xml.toLowerCase().lastIndexOf('</invoke>'));
    const contentCount = (body.match(/<content\b/gi) || []).length;
    const finalizeCount = (body.match(/<finalize\b/gi) || []).length;
    if (contentCount > 1) { throw new Error('invoke may contain at most one content element.'); }
    if (finalizeCount > 1) { throw new Error('invoke may contain at most one finalize element.'); }
    if (contentCount && /\bsrc(?:expr)?\s*=/.test(attrs)) { throw new Error('invoke cannot combine src or srcexpr with content.'); }
    for (const param of body.matchAll(/<param\b([^>]*)\/?\s*>/gi)) {
      if (!/\bname\s*=/.test(param[1])) { throw new Error('invoke param requires name.'); }
      validateExclusiveAttributePair(param[1], 'expr', 'location', 'invoke param');
      if (!/\b(?:expr|location)\s*=/.test(param[1])) { throw new Error('invoke param requires expr or location.'); }
    }
    for (const finalize of body.matchAll(/<finalize\b[^>]*>([\s\S]*?)<\/finalize\s*>/gi)) {
      validateExecutableFragment(finalize[1]);
    }
  }
}

function findDirectInvokeElements(body: string): Array<{ start: number; end: number; xml: string }> {
  const document = parseXmlSource(`<scope>${body}</scope>`);
  const scope = document.roots[0];
  const offset = '<scope>'.length;
  return scope ? directChildren(scope, 'invoke').map(element => ({ start: element.start - offset, end: element.end - offset, xml: document.text.slice(element.start, element.end) })) : [];
}
export interface InvokeNavigationTarget {
  index: number;
  id?: string;
  src?: string;
  inlineScxml?: string;
  label: string;
}

export function readInvokeNavigationTargets(text: string, stateId: string): InvokeNavigationTarget[] {
  const xml = readInvokes(text, stateId);
  if (!xml) { return []; }
  return findDirectInvokeElements(xml).map((item, index) => {
    const open = /^<invoke\b([^>]*)>/i.exec(item.xml);
    const attrs = open?.[1] ?? '';
    const id = readInvokeAttribute(attrs, 'id');
    const src = readInvokeAttribute(attrs, 'src');
    const content = /<content\b[^>]*>([\s\S]*?)<\/content\s*>/i.exec(item.xml)?.[1] ?? '';
    const inlineScxml = /<scxml\b[\s\S]*<\/scxml\s*>/i.exec(content)?.[0];
    return { index, id, src, inlineScxml, label: id || src || `invoke ${index + 1}` };
  });
}

function readInvokeAttribute(attrs: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(attrs)?.[2];
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
  return tag;
}
