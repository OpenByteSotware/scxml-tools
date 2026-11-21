import * as acorn from 'acorn';
import { getAttribute, parseXmlSource, XmlSourceAttribute, XmlSourceElement } from './xmlSource';

export type DataModelProfile = 'null' | 'ecmascript' | 'xpath' | 'custom';
export interface ExpressionProblem { message: string; start: number; end: number; code: string; severity: 'error' | 'warning'; }

const expressionAttributes = new Set(['cond','expr','array','eventexpr','targetexpr','typeexpr','delayexpr','srcexpr']);
const locationAttributes = new Set(['location','idlocation','sendidexpr']);
const nullForbiddenElements = new Set(['datamodel','data','assign','foreach','script']);

function decodeXml(value: string): string {
  return value.replace(/&(?:lt|gt|amp|quot|apos|#\d+|#x[\da-fA-F]+);/g, entity => {
    if (entity === '&lt;') return '<'; if (entity === '&gt;') return '>'; if (entity === '&amp;') return '&';
    if (entity === '&quot;') return '"'; if (entity === '&apos;') return "'";
    const hex = entity.startsWith('&#x'); const number = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
  });
}
function attrProblem(attribute: XmlSourceAttribute, message: string, code: string, severity: 'error'|'warning'='error'): ExpressionProblem {
  return { message, start: attribute.valueStart, end: Math.max(attribute.valueStart + 1, attribute.valueEnd), code, severity };
}
function elementProblem(element: XmlSourceElement, message: string, code: string, severity: 'error'|'warning'='error'): ExpressionProblem {
  return { message, start: element.start, end: element.openEnd, code, severity };
}
function nearestScxml(element: XmlSourceElement): XmlSourceElement | undefined {
  let current: XmlSourceElement | undefined = element;
  while (current && current.localName !== 'scxml') current = current.parent;
  return current;
}
function profileFor(root: XmlSourceElement): { profile: DataModelProfile; name: string } {
  const raw = (getAttribute(root,'datamodel')?.value || 'null').trim().toLowerCase();
  if (!raw || raw === 'null') return { profile:'null', name:'null' };
  if (raw === 'ecmascript' || raw === 'javascript') return { profile:'ecmascript', name:raw };
  if (raw === 'xpath') return { profile:'xpath', name:raw };
  return { profile:'custom', name:raw };
}
function acornMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s*\(\d+:\d+\)\s*$/, '');
}
function parseExpression(value: string): unknown {
  const source = decodeXml(value);
  const node = acorn.parseExpressionAt(source,0,{ecmaVersion:2020});
  if (source.slice((node as {end:number}).end).trim()) throw new SyntaxError('Unexpected text after expression');
  return node;
}
function isAssignable(node: any): boolean {
  if (!node) return false;
  if (node.type === 'Identifier') return true;
  if (node.type === 'MemberExpression') return !node.optional && isAssignable(node.object);
  return false;
}
function validateEcmascriptAttribute(element: XmlSourceElement, attribute: XmlSourceAttribute, out: ExpressionProblem[]): void {
  try {
    const node = parseExpression(attribute.value);
    if (locationAttributes.has(attribute.name) && !isAssignable(node)) {
      out.push(attrProblem(attribute, `${element.localName}@${attribute.name} must be an assignable ECMAScript location.`, 'datamodel.ecmascript.location'));
    }
  } catch (error) {
    out.push(attrProblem(attribute, `Invalid ECMAScript ${attribute.name}: ${acornMessage(error)}.`, locationAttributes.has(attribute.name) ? 'datamodel.ecmascript.location' : 'datamodel.ecmascript.expression'));
  }
}
function scriptText(text: string, element: XmlSourceElement): string {
  if (element.selfClosing) return '';
  const raw = text.slice(element.openEnd, element.closeStart).trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw);
  return cdata ? cdata[1] : decodeXml(raw);
}
function validateEcmascriptElement(text: string, element: XmlSourceElement, out: ExpressionProblem[]): void {
  for (const attribute of element.attributes) {
    if (expressionAttributes.has(attribute.name) || locationAttributes.has(attribute.name)) validateEcmascriptAttribute(element,attribute,out);
  }
  if (element.localName === 'foreach') {
    for (const name of ['item','index']) {
      const attribute = getAttribute(element,name); if (!attribute) continue;
      try { if (!isAssignable(parseExpression(attribute.value))) out.push(attrProblem(attribute, `foreach@${name} must be an assignable ECMAScript location.`, 'datamodel.ecmascript.location')); }
      catch (error) { out.push(attrProblem(attribute, `Invalid ECMAScript ${name}: ${acornMessage(error)}.`, 'datamodel.ecmascript.location')); }
    }
  }
  if (element.localName === 'script' && !getAttribute(element,'src')) {
    const source = scriptText(text,element);
    if (source) try { acorn.parse(source,{ecmaVersion:2020,allowReturnOutsideFunction:true}); }
    catch (error) { out.push(elementProblem(element, `Invalid ECMAScript script: ${acornMessage(error)}.`, 'datamodel.ecmascript.script')); }
  }
}
function tokenizeNullCondition(value: string): string[] | undefined {
  const tokens: string[]=[]; let rest=decodeXml(value).trim();
  const pattern=/^(?:\s+|In\s*\(\s*(?:'[^']+'|"[^"]+")\s*\)|true\b|false\b|&&|\|\||!|\(|\))/;
  while(rest){const match=pattern.exec(rest);if(!match)return undefined;if(!/^\s+$/.test(match[0]))tokens.push(match[0]);rest=rest.slice(match[0].length);}
  return tokens;
}
function validateNullCondition(attribute: XmlSourceAttribute, stateIds: Set<string>, out: ExpressionProblem[]): void {
  const tokens=tokenizeNullCondition(attribute.value);
  if(!tokens?.length){out.push(attrProblem(attribute,'The null data model permits only boolean operators, true/false, and In("stateId") in conditions.','datamodel.null.condition'));return;}
  for(const token of tokens){const match=/^In\s*\(\s*(['"])([^'"]+)\1\s*\)$/.exec(token);if(match&&!stateIds.has(match[2]))out.push(attrProblem(attribute,`In() references missing state ${match[2]}.`,'datamodel.null.stateReference'));}
}
function validateNullElement(element: XmlSourceElement, stateIds: Set<string>, out: ExpressionProblem[]): void {
  if (nullForbiddenElements.has(element.localName)) out.push(elementProblem(element, `<${element.localName}> is not available with the null data model.`, 'datamodel.null.unsupportedElement'));
  for (const attribute of element.attributes) {
    if (attribute.name === 'cond') validateNullCondition(attribute,stateIds,out);
    else if (expressionAttributes.has(attribute.name) || locationAttributes.has(attribute.name)) out.push(attrProblem(attribute, `${element.localName}@${attribute.name} is not available with the null data model.`, 'datamodel.null.unsupportedExpression'));
  }
}
export function validateDataModelExpressions(text: string): ExpressionProblem[] {
  const document=parseXmlSource(text); if(document.problems.length)return [];
  const out:ExpressionProblem[]=[];
  const stateIds=new Set(document.elements.filter(item=>['state','parallel','final','history'].includes(item.localName)).map(item=>getAttribute(item,'id')?.value).filter((value):value is string=>Boolean(value)));
  const roots=document.elements.filter(item=>item.localName==='scxml');
  for(const root of roots){const details=profileFor(root);if(details.profile==='xpath')out.push(elementProblem(root,'XPath data-model expressions are recognized but deep XPath syntax validation is not available yet.','datamodel.xpath.unvalidated','warning'));else if(details.profile==='custom')out.push(elementProblem(root,`Data model ${details.name} is processor-defined; expression syntax cannot be validated by the editor.`,'datamodel.custom.unvalidated','warning'));}
  for(const element of document.elements){const root=nearestScxml(element);if(!root)continue;const {profile}=profileFor(root);if(profile==='null')validateNullElement(element,stateIds,out);else if(profile==='ecmascript')validateEcmascriptElement(text,element,out);}
  return out;
}
