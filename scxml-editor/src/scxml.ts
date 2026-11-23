import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { getAttribute, parseXmlSource, XmlSourceElement } from './xmlSource';
import { CustomDataModelProfiles, validateDataModelExpressions } from './expressionValidation';

export type StateKind = 'state' | 'parallel' | 'final' | 'history';
export type ScxmlProblemSeverity = 'error' | 'warning';
export interface ScxmlProblem { message: string; startOffset: number; endOffset: number; severity: ScxmlProblemSeverity; code: string; }
export interface Transition { event?: string; cond?: string; type?: 'internal' | 'external'; targets: string[]; }
export interface InitialTransition { target?: string; cond?: string; explicit: boolean; }
export interface DataDeclaration { id: string; mode: 'expr' | 'src' | 'content'; value: string; }
export interface DoneData { mode: 'none' | 'expr' | 'content' | 'params'; expression?: string; content?: string; params?: Array<{ name: string; expr?: string; location?: string }>; }
export interface StateNode {
  id: string;
  kind: StateKind;
  initial?: string;
  initialTransition?: InitialTransition;
  historyType?: 'shallow' | 'deep';
  doneData?: DoneData;
  children: StateNode[];
  transitions: Transition[];
  dataModel?: DataDeclaration[];
}
export interface ScxmlModel {
  name?: string;
  version?: string;
  namespace?: string;
  initial?: string;
  initialTransition?: InitialTransition;
  datamodel?: string;
  binding?: string;
  xmlBase?: string;
  dataModel?: DataDeclaration[];
  states: StateNode[];
  ids: Set<string>;
  errors: string[];
  problems: ScxmlProblem[];
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', preserveOrder: false, trimValues: false });
const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const readDataDeclarations = (raw: any): DataDeclaration[] => {
  const model = asArray<any>(raw?.datamodel)[0];
  return asArray<any>(model?.data).map(item => item?.['@_expr'] !== undefined
    ? { id: String(item?.['@_id'] ?? ''), mode: 'expr', value: String(item['@_expr']) }
    : item?.['@_src'] !== undefined
      ? { id: String(item?.['@_id'] ?? ''), mode: 'src', value: String(item['@_src']) }
      : { id: String(item?.['@_id'] ?? ''), mode: 'content', value: String(item?.['#text'] ?? '') });
};

function readInitial(raw: any): InitialTransition | undefined {
  const initial = asArray<any>(raw?.initial)[0];
  if (!initial) { return undefined; }
  const transitions = asArray<any>(initial.transition);
  const transition = transitions[0];
  return { target: transition?.['@_target'], cond: transition?.['@_cond'], explicit: true };
}


function collectStateSemantics(states: StateNode[]) {
  const byId = new Map<string, StateNode>();
  const parentById = new Map<string, StateNode | undefined>();
  const descendantsById = new Map<string, Set<string>>();
  const walk = (state: StateNode, parent?: StateNode): Set<string> => {
    byId.set(state.id, state); parentById.set(state.id, parent);
    const descendants = new Set<string>();
    state.children.forEach(child => { descendants.add(child.id); walk(child, state).forEach(id => descendants.add(id)); });
    descendantsById.set(state.id, descendants); return descendants;
  };
  states.forEach(state => walk(state));
  return { byId, parentById, descendantsById };
}
function ancestorChain(id: string, parentById: Map<string, StateNode | undefined>): StateNode[] {
  const result: StateNode[] = []; let current = parentById.get(id);
  while (current) { result.push(current); current = parentById.get(current.id); }
  return result;
}
function isDescendant(id: string, ancestorId: string, descendantsById: Map<string, Set<string>>): boolean { return descendantsById.get(ancestorId)?.has(id) ?? false; }
function nearestParallelRegion(id: string, parallelId: string, parentById: Map<string, StateNode | undefined>): string | undefined {
  let current = parentById.get(id); let childId = id;
  while (current) { if (current.id === parallelId) { return childId; } childId = current.id; current = parentById.get(current.id); }
  return undefined;
}
function validateTargetSet(source: StateNode, transition: Transition, semantics: ReturnType<typeof collectStateSemantics>, errors: string[]): void {
  const targets = transition.targets;
  [...new Set(targets.filter((target, index) => targets.indexOf(target) !== index))].forEach(target => errors.push(`State ${source.id} transition contains duplicate target ${target}.`));
  if (transition.type === 'internal') {
    if (source.kind !== 'state' || !source.children.length) { errors.push(`State ${source.id} uses an internal transition but is not a compound state.`); }
    targets.filter(target => !isDescendant(target, source.id, semantics.descendantsById)).forEach(target => errors.push(`Internal transition from ${source.id} must target a descendant; ${target} is outside its hierarchy.`));
  }
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const left = targets[i], right = targets[j]; if (left === right) { continue; }
    if (isDescendant(left, right, semantics.descendantsById) || isDescendant(right, left, semantics.descendantsById)) { errors.push(`Transition from ${source.id} cannot target both ancestor and descendant states ${left} and ${right}.`); continue; }
    const rightAncestors = new Set(ancestorChain(right, semantics.parentById).map(item => item.id));
    const commonParallel = ancestorChain(left, semantics.parentById).find(item => item.kind === 'parallel' && rightAncestors.has(item.id));
    if (!commonParallel) { errors.push(`Transition from ${source.id} has incompatible multiple targets ${left} and ${right}; targets must occupy different regions of a common parallel state.`); continue; }
    const leftRegion = nearestParallelRegion(left, commonParallel.id, semantics.parentById), rightRegion = nearestParallelRegion(right, commonParallel.id, semantics.parentById);
    if (!leftRegion || !rightRegion || leftRegion === rightRegion) { errors.push(`Transition from ${source.id} targets ${left} and ${right} in the same region of parallel state ${commonParallel.id}.`); }
  }
}
function detectUnconditionalEventlessCycles(states: StateNode[], errors: string[]): void {
  const graph = new Map<string, string[]>(); const add = (state: StateNode): void => { graph.set(state.id, state.transitions.filter(t => !t.event && !t.cond && t.targets.length === 1).map(t => t.targets[0])); state.children.forEach(add); }; states.forEach(add);
  const visiting = new Set<string>(), visited = new Set<string>();
  const dfs = (id: string, path: string[]): void => { if (visiting.has(id)) { const start = path.indexOf(id); errors.push(`Unconditional eventless transition cycle: ${[...path.slice(start), id].join(' -> ')}.`); return; } if (visited.has(id)) return; visiting.add(id); path.push(id); (graph.get(id) ?? []).forEach(next => { if (graph.has(next)) dfs(next, path); }); path.pop(); visiting.delete(id); visited.add(id); };
  graph.forEach((_targets, id) => dfs(id, []));
}


const SCXML_NAMESPACE = 'http://www.w3.org/2005/07/scxml';
const SCXML_PROCESSOR_URI = 'http://www.w3.org/TR/scxml/';
const SCXML_PROCESSOR_ALIAS = 'scxml';
function isScxmlProcessorType(value:string):boolean{return value===SCXML_PROCESSOR_ALIAS||value===SCXML_PROCESSOR_URI;}
function isIoTarget(value:string):boolean{return value==='#_internal'||value==='#_parent'||/^#_scxml_[A-Za-z_][\w.-]*$/.test(value)||/^#_[A-Za-z_][\w.-]*$/.test(value)||isUri(value);}

const KNOWN = new Set(['scxml','state','parallel','final','history','transition','initial','onentry','onexit','raise','if','elseif','else','foreach','log','datamodel','data','assign','donedata','content','param','script','send','cancel','invoke','finalize']);
const EXECUTABLE = new Set(['raise','if','foreach','log','assign','script','send','cancel']);
const CHILDREN: Record<string,Set<string>> = {
 scxml:new Set(['initial','datamodel','script','state','parallel','final']),
 state:new Set(['onentry','onexit','transition','initial','state','parallel','final','history','datamodel','invoke']),
 parallel:new Set(['onentry','onexit','transition','state','parallel','final','history','datamodel','invoke']),
 final:new Set(['onentry','onexit','donedata']), history:new Set(['transition']), initial:new Set(['transition']),
 datamodel:new Set(['data']), donedata:new Set(['content','param']), send:new Set(['content','param']),
 invoke:new Set(['content','param','finalize']), finalize:EXECUTABLE, onentry:EXECUTABLE, onexit:EXECUTABLE,
 transition:EXECUTABLE, if:new Set([...EXECUTABLE,'elseif','else']), foreach:EXECUTABLE
};
const ATTRS: Record<string,Set<string>> = {
 scxml:new Set(['xmlns','version','initial','name','datamodel','binding','xml:base']),
 state:new Set(['id','initial']), parallel:new Set(['id']), final:new Set(['id']), history:new Set(['id','type']),
 transition:new Set(['event','cond','target','type']), initial:new Set(['id']), raise:new Set(['event']),
 if:new Set(['cond']), elseif:new Set(['cond']), else:new Set(), foreach:new Set(['array','item','index']),
 log:new Set(['label','expr']), datamodel:new Set(), data:new Set(['id','src','expr']),
 assign:new Set(['location','expr','type','attr']), donedata:new Set(), content:new Set(['expr']),
 param:new Set(['name','expr','location']), script:new Set(['src']),
 send:new Set(['event','eventexpr','target','targetexpr','type','typeexpr','id','idlocation','delay','delayexpr','namelist']),
 cancel:new Set(['sendid','sendidexpr']), invoke:new Set(['id','idlocation','type','typeexpr','src','srcexpr','autoforward','namelist']),
 finalize:new Set(), onentry:new Set(), onexit:new Set()
};
const REQUIRED: Record<string,string[]> = { scxml:['version'],state:['id'],parallel:['id'],final:['id'],history:['id'],raise:['event'],if:['cond'],elseif:['cond'],foreach:['array','item'],data:['id'],assign:['location'],param:['name'] };
function problem(message:string,startOffset:number,endOffset:number,code:string,severity:ScxmlProblemSeverity='error'):ScxmlProblem{return{message,startOffset:Math.max(0,startOffset),endOffset:Math.max(startOffset+1,endOffset),severity,code};}
function lineColumnToOffset(text:string,line:number,column:number):number{let o=0;for(let n=1;n<line;n++){const x=text.indexOf('\n',o);if(x<0)return text.length;o=x+1;}return Math.min(text.length,o+Math.max(0,column-1));}
function findTextRange(text:string,token:string):[number,number]{const i=text.indexOf(token);return i>=0?[i,i+Math.max(1,token.length)]:[0,1];}
function attributeRange(element: XmlSourceElement, name: string): [number, number] {
  const attribute = getAttribute(element, name);
  return attribute ? [attribute.start, attribute.end] : [element.start, element.openEnd];
}
function bodyText(text: string, element: XmlSourceElement): string {
  if (element.selfClosing) return '';
  let body = text.slice(element.openEnd, element.closeStart);
  for (const child of [...element.children].reverse()) {
    body = body.slice(0, child.start - element.openEnd) + body.slice(child.end - element.openEnd);
  }
  return body.replace(/<!--[\s\S]*?-->/g, '').trim();
}
function namespaceInScope(element: XmlSourceElement, prefix: string): string | undefined {
  let current: XmlSourceElement | undefined = element;
  const attributeName = prefix ? `xmlns:${prefix}` : 'xmlns';
  while (current) { const value = getAttribute(current, attributeName)?.value; if (value !== undefined) return value; current = current.parent; }
  return prefix === 'xml' ? 'http://www.w3.org/XML/1998/namespace' : undefined;
}
function isXmlId(value: string): boolean { return /^[A-Za-z_][\w.-]*$/.test(value); }
function isUri(value: string): boolean { try { new URL(value, 'file:///scxml/'); return !/\s/.test(value); } catch { return false; } }
function isDelay(value: string): boolean { return /^(?:\d+(?:\.\d+)?)(?:ms|s)$/.test(value); }
function validateScxmlTree(text: string, root: XmlSourceElement, out: ScxmlProblem[]): void {
  const add = (message: string, element: XmlSourceElement, code: string, attribute?: string): void => {
    const [start, end] = attribute ? attributeRange(element, attribute) : [element.start, element.openEnd]; out.push(problem(message,start,end,code));
  };
  const ids = new Map<string, XmlSourceElement>();
  const invokeIds = new Map<string, XmlSourceElement>();
  const order: Record<string,string[][]> = {
    scxml:[['datamodel'],['script'],['initial'],['state','parallel','final']],
    state:[['onentry'],['onexit'],['transition'],['initial'],['state','parallel','final','history'],['datamodel'],['invoke']],
    parallel:[['onentry'],['onexit'],['transition'],['state','parallel','final','history'],['datamodel'],['invoke']],
    final:[['onentry'],['onexit'],['donedata']], invoke:[['param'],['content'],['finalize']],
    send:[['param'],['content']], donedata:[['param'],['content']]
  };
  const pair = (element: XmlSourceElement, literal: string, expression: string): void => {
    if (getAttribute(element,literal) && getAttribute(element,expression)) add(`<${element.localName}> cannot define both ${literal} and ${expression}.`,element,'schema.exclusiveAttribute',literal);
  };
  const requireOne = (element: XmlSourceElement, names: string[]): void => {
    const count=names.filter(name=>getAttribute(element,name)).length;
    if(count!==1)add(`<${element.localName}> requires exactly one of ${names.join(' or ')}.`,element,'schema.attributeChoice');
  };
  const validateOrder = (element: XmlSourceElement): void => {
    const groups=order[element.localName]; if(!groups)return; let highest=-1;
    for(const child of element.children){if(child.name.includes(':'))continue;const index=groups.findIndex(group=>group.includes(child.localName));if(index<0)continue;if(index<highest)add(`<${child.localName}> is out of order inside <${element.localName}>.`,child,'schema.ordering');else highest=index;}
  };
  const visit=(element:XmlSourceElement):void=>{
    const local=element.localName, qualified=element.name.includes(':');
    const elementPrefix=qualified?element.name.slice(0,element.name.indexOf(':')):'';
    if(qualified&&!namespaceInScope(element,elementPrefix))add(`Namespace prefix ${elementPrefix} is not declared.`,element,'schema.namespacePrefix');
    for(const attribute of element.attributes){if(attribute.name.includes(':')&&!attribute.name.startsWith('xmlns:')){const prefix=attribute.name.slice(0,attribute.name.indexOf(':'));if(!namespaceInScope(element,prefix))out.push(problem(`Namespace prefix ${prefix} is not declared.`,attribute.start,attribute.end,'schema.namespacePrefix'));}}
    if(!qualified&&!KNOWN.has(local)){add(`Unknown SCXML element <${local}>.`,element,'schema.unknownElement');element.children.forEach(visit);return;}
    if(!qualified){
      const parent=element.parent?.localName;if(parent&&CHILDREN[parent]&&!CHILDREN[parent].has(local))add(`<${local}> is not allowed as a child of <${parent}>.`,element,'schema.child');
      for(const attribute of element.attributes){if(!attribute.name.startsWith('xmlns')&&!attribute.name.includes(':')&&ATTRS[local]&&!ATTRS[local].has(attribute.name))out.push(problem(`Attribute ${attribute.name} is not allowed on <${local}>.`,attribute.start,attribute.end,'schema.attribute'));}
      for(const required of REQUIRED[local]??[]){if(!getAttribute(element,required))add(`<${local}> requires attribute ${required}.`,element,'schema.requiredAttribute');}
      validateOrder(element);
      const id=getAttribute(element,'id')?.value;if(id!==undefined){if(!isXmlId(id))add(`ID ${id} is not a valid XML identifier.`,element,'schema.id','id');else if(ids.has(id))add(`Duplicate ID ${id}.`,element,'schema.duplicateId','id');else ids.set(id,element);}
      if(local==='send'){
        pair(element,'event','eventexpr');pair(element,'target','targetexpr');pair(element,'type','typeexpr');pair(element,'id','idlocation');pair(element,'delay','delayexpr');requireOne(element,['event','eventexpr']);
        const delay=getAttribute(element,'delay')?.value;if(delay&&!isDelay(delay))add('send delay must use a non-negative number followed by ms or s.',element,'schema.delay','delay');
        const target=getAttribute(element,'target')?.value;if(target&&!isIoTarget(target))add('send target must be a URI or an SCXML target.',element,'io.target','target');
        const type=getAttribute(element,'type')?.value;if(type&&type!==SCXML_PROCESSOR_ALIAS&&!isUri(type))add('send type must be scxml or an I/O processor URI.',element,'io.processorType','type');
      }
      if(local==='invoke'){const invokeId=getAttribute(element,'id')?.value;if(invokeId){if(invokeIds.has(invokeId))add(`Duplicate invoke ID ${invokeId}.`,element,'semantic.duplicateInvokeId','id');else invokeIds.set(invokeId,element);}}
      const children=(name:string)=>element.children.filter(child=>!child.name.includes(':')&&child.localName===name);
      if(local==='invoke'){
        pair(element,'id','idlocation');pair(element,'type','typeexpr');pair(element,'src','srcexpr');
        const auto=getAttribute(element,'autoforward')?.value;if(auto&&auto!=='true'&&auto!=='false')add('invoke autoforward must be true or false.',element,'schema.boolean','autoforward');
        const src=getAttribute(element,'src')?.value;if(src&&!isUri(src))add('invoke src must be a valid URI reference.',element,'schema.uri','src');
        const type=getAttribute(element,'type')?.value;if(type&&type!==SCXML_PROCESSOR_ALIAS&&!isUri(type))add('invoke type must be scxml or an absolute/relative processor URI.',element,'io.processorType','type');
        const namelist=getAttribute(element,'namelist')?.value;if(namelist&&!namelist.split(/\s+/).every(isXmlId))add('invoke namelist must contain valid identifiers.',element,'schema.namelist','namelist');
        if(children('content').length>1)add('<invoke> may contain at most one content.',element,'schema.cardinality');if(children('finalize').length>1)add('<invoke> may contain at most one finalize.',element,'schema.cardinality');if(children('content').length&&(getAttribute(element,'src')||getAttribute(element,'srcexpr')))add('<invoke> cannot combine src or srcexpr with content.',element,'schema.contentConflict');
        const inline=children('content')[0]?.children.find(child=>child.localName==='scxml');
        if(inline&&type&&!isScxmlProcessorType(type))add('Inline SCXML content requires invoke type scxml or the SCXML processor URI.',element,'invoke.inlineType','type');
        if(inline&&src)add('Inline SCXML content cannot be combined with invoke src.',element,'schema.contentConflict','src');
      }
      if(local==='donedata'){if(children('content').length>1)add('<donedata> may contain at most one content.',element,'schema.cardinality');if(children('content').length&&children('param').length)add('<donedata> cannot combine content with param.',element,'schema.contentConflict');}
      if(local==='script'){const src=getAttribute(element,'src')?.value;if(src&&!isUri(src))add('script src must be a valid URI reference.',element,'schema.uri','src');if(src&&bodyText(text,element))add('<script> cannot combine src with inline script content.',element,'schema.contentConflict','src');}
      if(local==='assign'&&getAttribute(element,'type')&&getAttribute(element,'attr')){ /* both are jointly allowed for XML data models */ }
      if(local==='raise'||local==='send'){const event=getAttribute(element,'event')?.value;if(event&&(!/^[A-Za-z_][\w.-]*$/.test(event)||event==='*'||event.endsWith('.*')||/\s/.test(event)))add(`${local} event must be one concrete event name.`,element,'schema.eventName','event');}
      if(local==='if'){
        const branches=element.children.filter(child=>!child.name.includes(':')&&(child.localName==='elseif'||child.localName==='else'));let elseSeen=false;
        for(const branch of branches){if(elseSeen)add(`<${branch.localName}> cannot appear after <else>.`,branch,'schema.ordering');if(branch.localName==='else')elseSeen=true;}
      }
      if((local==='elseif'||local==='else')&&element.parent?.localName!=='if')add(`<${local}> must be a direct child of <if>.`,element,'schema.parent');
    }
    element.children.forEach(visit);
  };
  visit(root);
  // Resolve IDREF/IDREFS after all IDs have been collected.
  const checkRef=(element:XmlSourceElement,name:string,directOwner?:XmlSourceElement):void=>{const attribute=getAttribute(element,name);if(!attribute)return;for(const id of attribute.value.split(/\s+/).filter(Boolean)){if(!ids.has(id))out.push(problem(`${name} references missing ID ${id}.`,attribute.start,attribute.end,'schema.missingReference'));else if(directOwner&&ids.get(id)?.parent!==directOwner)out.push(problem(`${name} target ${id} must be a direct child.`,attribute.start,attribute.end,'schema.referenceScope'));}};
  for(const element of root.children.length||root.localName==='scxml'?[root,...root.children]:[root]){void element;}
  const all=[root];for(let index=0;index<all.length;index++)all.push(...all[index].children);
  for(const element of all){
    if(element.name.includes(':'))continue;
    if(element.localName==='scxml'||element.localName==='state')checkRef(element,'initial',element);
    if(element.localName==='transition'){
      checkRef(element,'target',element.parent?.localName==='initial'?element.parent.parent:undefined);
      const event=getAttribute(element,'event');
      if(event){for(const descriptor of event.value.split(/\s+/).filter(Boolean)){
        if(descriptor.startsWith('done.state.')){const id=descriptor.slice('done.state.'.length);if(!ids.has(id))out.push(problem(`Transition references missing completion state ${id}.`,event.start,event.end,'semantic.missingStateCompletion'));}
        if(descriptor.startsWith('done.invoke.')){const id=descriptor.slice('done.invoke.'.length);if(!invokeIds.has(id))out.push(problem(`Transition references missing invoke completion ${id}.`,event.start,event.end,'semantic.missingInvokeCompletion'));}
      }}
    }
    if(element.localName==='send'){
      const target=getAttribute(element,'target');
      if(target?.value.startsWith('#_')&&!['#_internal','#_parent'].includes(target.value)&&!target.value.startsWith('#_scxml_')){
        const invokeId=target.value.slice(2);if(!invokeIds.has(invokeId))out.push(problem(`Send target references missing invoke ID ${invokeId}.`,target.start,target.end,'io.missingInvokeTarget'));
      }
    }
  }
}

export function validateScxmlSource(text:string,profiles:CustomDataModelProfiles={}):ScxmlProblem[]{
 const source=parseXmlSource(text);
 if(source.problems.length)return source.problems.map(item=>problem(item.message,item.start,item.end,item.code));
 const valid=XMLValidator.validate(text);if(valid!==true){const at=lineColumnToOffset(text,valid.err.line,valid.err.col);return[problem(`XML: ${valid.err.msg}`,at,at+1,'xml.syntax')];}
 const roots=source.roots.filter(item=>item.localName==='scxml');
 if(roots.length!==1)return[problem('The document must contain exactly one scxml root element.',0,Math.max(1,text.length),'schema.root')];
 const out:ScxmlProblem[]=[];validateScxmlTree(text,roots[0],out);out.push(...validateDataModelExpressions(text,profiles).map(item=>problem(item.message,item.start,item.end,item.code,item.severity)));return out;
}

interface NormativeTransitionInfo { source:StateNode; transition:Transition; index:number; depth:number; order:number; domain?:StateNode; exitSet:Set<string>; }
function normativeDepth(id:string,parents:Map<string,StateNode|undefined>):number{let n=0,p=parents.get(id);while(p){n++;p=parents.get(p.id);}return n;}
function leastCommonCompoundAncestor(ids:string[],parents:Map<string,StateNode|undefined>):StateNode|undefined{if(!ids.length)return undefined;const chains=ids.map(id=>ancestorChain(id,parents));return chains[0].find(candidate=>candidate.kind!=='parallel'&&chains.every(chain=>chain.some(item=>item.id===candidate.id)));}
function transitionDomain(source:StateNode,transition:Transition,semantics:ReturnType<typeof collectStateSemantics>):StateNode|undefined{if(!transition.targets.length)return undefined;if(transition.type==='internal'&&source.kind==='state'&&source.children.length&&transition.targets.every(target=>isDescendant(target,source.id,semantics.descendantsById)))return source;return leastCommonCompoundAncestor([source.id,...transition.targets],semantics.parentById);}
function normativeDescendantOrSelf(id:string,ancestor:string,semantics:ReturnType<typeof collectStateSemantics>):boolean{return id===ancestor||isDescendant(id,ancestor,semantics.descendantsById);}
function computeExitSet(domain:StateNode|undefined,all:StateNode[],semantics:ReturnType<typeof collectStateSemantics>):Set<string>{return domain?new Set(all.filter(state=>normativeDescendantOrSelf(state.id,domain.id,semantics)).map(state=>state.id)):new Set();}
function descriptorMatches(left:string,right:string):boolean{const match=(d:string,e:string)=>d==='*'||(d.endsWith('.*')?(e===d.slice(0,-2)||e.startsWith(d.slice(0,-1))):(e===d||e.startsWith(d+'.')));return left.split(/\s+/).filter(Boolean).some(a=>right.split(/\s+/).filter(Boolean).some(b=>match(a,b)||match(b,a)));}
function validateNormativeTransitions(states:StateNode[],messages:string[]):void{
 const semantics=collectStateSemantics(states),all:StateNode[]=[];const collect=(state:StateNode):void=>{all.push(state);state.children.forEach(collect);};states.forEach(collect);const infos:NormativeTransitionInfo[]=[];let order=0;
 for(const source of all)source.transitions.forEach((transition,index)=>{const domain=transitionDomain(source,transition,semantics);infos.push({source,transition,index,depth:normativeDepth(source.id,semantics.parentById),order:order++,domain,exitSet:computeExitSet(domain,all,semantics)});});
 for(const info of infos){if(info.transition.targets.length&&!info.domain)messages.push(`Transition ${info.index+1} from ${info.source.id} has no legal transition domain.`);if(info.transition.type==='internal'&&info.domain?.id!==info.source.id)messages.push(`Internal transition ${info.index+1} from ${info.source.id} is not confined to descendants of its source.`);}
 for(let i=0;i<infos.length;i++)for(let j=i+1;j<infos.length;j++){const a=infos[i],b=infos[j];if(!a.transition.event||!b.transition.event||!descriptorMatches(a.transition.event,b.transition.event))continue;const related=normativeDescendantOrSelf(a.source.id,b.source.id,semantics)||normativeDescendantOrSelf(b.source.id,a.source.id,semantics);if(related){const deeper=a.depth>b.depth?a:b,other=deeper===a?b:a;messages.push(`Transition ${deeper.index+1} from ${deeper.source.id} preempts matching ancestor transition ${other.index+1} from ${other.source.id} by source depth.`);}else if([...a.exitSet].some(id=>b.exitSet.has(id))){const first=a.order<b.order?a:b,second=first===a?b:a;messages.push(`Transition ${first.index+1} from ${first.source.id} wins document-order conflict with transition ${second.index+1} from ${second.source.id}.`);}}
 for(const source of all){const first=source.transitions.findIndex(item=>!item.event&&!item.cond);if(first>=0&&first<source.transitions.length-1)messages.push(`Unconditional eventless transition ${first+1} from ${source.id} makes later transitions in the same source unreachable during stabilization.`);}
}

function validateReachability(states: StateNode[], rootInitial: string | undefined, errors: string[]): void {
  const all = new Map<string, StateNode>();
  const parent = new Map<string, StateNode | undefined>();
  const add = (state: StateNode, owner?: StateNode): void => { all.set(state.id, state); parent.set(state.id, owner); state.children.forEach(child => add(child, state)); };
  states.forEach(state => add(state));
  const reachable = new Set<string>(); const queue: string[] = [];
  const enter = (id: string): void => {
    if (reachable.has(id) || !all.has(id)) return;
    reachable.add(id); queue.push(id);
    const state = all.get(id)!;
    if (state.kind === 'parallel') state.children.filter(child => child.kind !== 'history').forEach(child => enter(child.id));
    else if (state.initial) String(state.initial).split(/\s+/).filter(Boolean).forEach(enter);
  };
  if (rootInitial) enter(rootInitial); else states[0] && enter(states[0].id);
  while (queue.length) {
    const id = queue.shift()!; const state = all.get(id)!;
    state.transitions.flatMap(item => item.targets).forEach(enter);
  }
  all.forEach((state, id) => { if (state.kind !== 'history' && !reachable.has(id)) errors.push(`State ${id} is unreachable from the initial configuration.`); });
  all.forEach(state => {
    if ((state.kind === 'state' || state.kind === 'parallel') && state.children.length && !state.initial && state.kind !== 'parallel') {
      errors.push(`Compound state ${state.id} has no initial child.`);
    }
    if (state.kind === 'parallel') {
      state.children.filter(region => region.kind === 'state').forEach(region => {
        const descendants: StateNode[] = []; const collect = (item: StateNode): void => { descendants.push(item); item.children.forEach(collect); }; collect(region);
        if (!descendants.some(item => item.kind === 'final')) errors.push(`Parallel region ${region.id} has no final state and cannot complete normally.`);
      });
    }
  });
}


export function parseScxml(text: string, profiles: CustomDataModelProfiles = {}): ScxmlModel {
  const sourceProblems = validateScxmlSource(text, profiles);
  const errors: string[] = sourceProblems.map(item => item.message);
  const valid = XMLValidator.validate(text);
  if (valid !== true) {
    return { states: [], ids: new Set(), errors, problems: sourceProblems };
  }
  let root: any;
  try { root = parser.parse(text)?.scxml; } catch (error) {
    const p = problem(`Unable to parse SCXML: ${String(error)}`,0,1,'xml.parse'); return { states: [], ids: new Set(), errors: [p.message], problems: [p] };
  }
  if (!root) { const p = problem('The document must contain an <scxml> root element.',0,Math.max(1,text.length),'schema.root'); return { states: [], ids: new Set(), errors: [p.message], problems: [p] }; }

  const ids = new Set<string>();
  const duplicates = new Set<string>();
  const validateData = (items: DataDeclaration[], scope: string): void => {
    const seen = new Set<string>();
    items.forEach(item => {
      if (!item.id) { errors.push(`${scope} contains data without an id.`); }
      else if (seen.has(item.id)) { errors.push(`${scope} contains duplicate data id ${item.id}.`); }
      else { seen.add(item.id); }
      if (!item.value.trim()) { errors.push(`Data ${item.id || '(unnamed)'} requires expr, src, or inline content.`); }
    });
  };
  validateData(readDataDeclarations(root), 'SCXML datamodel');
  const readState = (raw: any, kind: StateKind, fallback: string): StateNode => {
    const id = raw?.['@_id'] || fallback;
    if (ids.has(id)) { duplicates.add(id); } else { ids.add(id); }
    const children: StateNode[] = [];
    for (const childKind of ['state', 'parallel', 'final', 'history'] as StateKind[]) {
      asArray(raw?.[childKind]).forEach((child, index) => children.push(readState(child, childKind, `${id}.${childKind}${index + 1}`)));
    }
    const transitions: Transition[] = asArray<any>(raw?.transition).map((transition: any): Transition => {
      const rawType = transition?.['@_type'];
      const type: Transition['type'] = rawType === 'internal' || rawType === 'external' ? rawType : undefined;
      return {
        event: transition?.['@_event'], cond: transition?.['@_cond'], type,
        targets: String(transition?.['@_target'] ?? '').split(/\s+/).filter(Boolean)
      };
    });
    const explicitInitial = readInitial(raw);
    const rawDone = kind === 'final' ? asArray<any>(raw?.donedata)[0] : undefined;
    const rawContent = rawDone ? asArray<any>(rawDone.content)[0] : undefined;
    const rawParams = rawDone ? asArray<any>(rawDone.param) : [];
    const doneData: DoneData | undefined = !rawDone ? undefined : rawContent
      ? (rawContent['@_expr'] !== undefined ? { mode: 'expr', expression: rawContent['@_expr'] } : { mode: 'content', content: String(rawContent['#text'] ?? '') })
      : rawParams.length ? { mode: 'params', params: rawParams.map((param: any) => ({ name: param['@_name'] ?? '', expr: param['@_expr'], location: param['@_location'] })) } : { mode: 'none' };
    return {
      id, kind,
      initial: explicitInitial?.target || raw?.['@_initial'],
      initialTransition: explicitInitial,
      historyType: kind === 'history' ? (raw?.['@_type'] === 'deep' ? 'deep' : 'shallow') : undefined,
      doneData,
      children, transitions, dataModel: readDataDeclarations(raw)
    };
  };

  const states: StateNode[] = [];
  for (const kind of ['state', 'parallel', 'final', 'history'] as StateKind[]) {
    asArray(root[kind]).forEach((state, index) => states.push(readState(state, kind, `${kind}${index + 1}`)));
  }
  // Structural, lexical, reference, and data-model diagnostics are owned exclusively by
  // validateScxmlSource(). The model pass below performs only cross-state behavioral analysis.
  const behavioralMessages: string[] = [];
  const semantics = collectStateSemantics(states);
  const visit = (state: StateNode, depth = 0): void => {
    state.transitions.forEach(transition => validateTargetSet(state, transition, semantics, behavioralMessages));
    if (depth > 64) behavioralMessages.push(`State ${state.id} exceeds the supported nesting depth of 64.`);
    if (state.kind === 'parallel') {
      if (state.children.length < 2) behavioralMessages.push(`Parallel state ${state.id} should contain at least two regions.`);
      state.children.forEach(region => {
        if (region.kind !== 'state') behavioralMessages.push(`Parallel state ${state.id} region ${region.id} must be a state.`);
        if (!region.initial && region.children.length > 0) behavioralMessages.push(`Parallel region ${region.id} should define an initial child.`);
      });
    }
    if (state.kind === 'history') {
      const owner = semantics.parentById.get(state.id);
      if (owner && state.transitions[0]) state.transitions[0].targets.forEach(target => {
        const legal = state.historyType === 'deep' ? isDescendant(target, owner.id, semantics.descendantsById) : owner.children.some(child => child.id === target && child.kind !== 'history');
        if (!legal) behavioralMessages.push(`${state.historyType === 'deep' ? 'Deep' : 'Shallow'} history ${state.id} default target ${target} is outside its legal ${owner.id} scope.`);
      });
    }
    state.children.forEach(child => visit(child, depth + 1));
  };
  states.forEach(state => visit(state));
  detectUnconditionalEventlessCycles(states, behavioralMessages);
  validateNormativeTransitions(states, behavioralMessages);
  const rootInitial = readInitial(root);
  const effectiveRootInitial = rootInitial?.target || root['@_initial'];
  validateReachability(states, effectiveRootInitial, behavioralMessages);
  const semanticProblems = [...new Set(behavioralMessages)].map(message => {
    const token = /(?:state|region|history|target)\s+([A-Za-z_][\w.-]*)/i.exec(message)?.[1];
    const range: [number,number] = token ? findTextRange(text, token) : [0, Math.max(1, Math.min(text.length, 8))];
    const severity: ScxmlProblemSeverity = /should contain|should define|cycle|unreachable|has no initial child|cannot complete normally|preempts matching ancestor|document-order conflict/i.test(message) ? 'warning' : 'error';
    const code = /preempts matching ancestor/.test(message) ? 'behavior.depthPriority' : /document-order conflict/.test(message) ? 'behavior.documentOrder' : /transition domain/.test(message) ? 'behavior.transitionDomain' : /later transitions.*unreachable/.test(message) ? 'behavior.eventlessDominance' : /unreachable/.test(message) ? 'behavior.unreachable' : /eventless transition cycle/.test(message) ? 'behavior.eventlessCycle' : /internal transition/.test(message) ? 'behavior.internalTransition' : /multiple targets|same region|ancestor and descendant/.test(message) ? 'behavior.targetSet' : /history/.test(message) ? 'behavior.historyTarget' : /parallel/.test(message) ? 'behavior.parallel' : /nesting depth/.test(message) ? 'behavior.depth' : 'behavior.validation';
    return problem(message, range[0], range[1], code, severity);
  });
  const problems = [...sourceProblems, ...semanticProblems];
  const allErrors = problems.map(item => item.message);
  const version = root['@_version'];
  const namespace = root['@_xmlns'];
  const binding = root['@_binding'];
  return {
    name: root['@_name'], version, namespace, dataModel: readDataDeclarations(root),
    initial: effectiveRootInitial, initialTransition: rootInitial,
    datamodel: root['@_datamodel'], binding, xmlBase: root['@_xml:base'],
    states, ids, errors: allErrors, problems
  };
}
