import * as vscode from 'vscode';
import { SkosSubject, SubjectHandler } from './subjecthandler';

let subjectHandler = new SubjectHandler();

export class SkosParser {
    parseTextDocument(document:vscode.TextDocument|undefined): { [id: string] : SkosSubject; }|undefined {
        if (!document){
            return {};
        }
        let text = document.getText();
        let raute = new RegExp("(?:("+directive+")|("+Sstring+")|\\#[^\\n]*)","g");
        let resttext = text.replace(raute, "$1$2");
    
        let turtledoc_match = new RegExp(turtleDoc);
        let match = turtledoc_match.exec(resttext);
        if (!(match && match[0] === resttext)){
            let notmatching = match && resttext.substr(match[0].length) || "";
            //console.log("Not matching: " + notmatching);
            return undefined;
        }
    
        let statements = this.getStatements(resttext);
        return this.appendSSS(document,statements);
    }
    
    private getStatements(s:string):StatementMatch[]{
        let result:StatementMatch[]=[];
        let lineStart = 1;
        let lineEnd = 0;
        let lastMatchIndex = 0, linesbetween = 0;
        let match;
        let triples_match = new RegExp(triples,"g");
        
        while (match = triples_match.exec(s)){
            linesbetween = s.substring(lastMatchIndex+1,match.index).split(/\r\n|\r|\n/).length-2;
            lineStart = lineStart + linesbetween + 1;
            lineEnd = lineStart + match[0].split(/\r\n|\r|\n/).length-2;
            lastMatchIndex = match.index;
            let toChar = match[0].length - Math.max(match[0].lastIndexOf("\r"),match[0].lastIndexOf("\n"));
    
            result.push({
                match:match[0],
                fromLine:lineStart,
                toLine:lineEnd,
                toChar:toChar
            });
        }
        return result;
    }
    
    private appendSSS(document:vscode.TextDocument,sms:StatementMatch[]):{ [id: string] : SkosSubject; }{
        let sss:{ [id: string] : SkosSubject; } = {};
        sms.forEach(sm => {
            let match = sm.match;
            let r_subject = new RegExp(subject_named,"g"), match_subject, s;
            let p;
            let r_object = new RegExp(object_named,"g"), match_object, o;
            let r_po = new RegExp(po_named,"g"), match_po, po;
            let literal,lang;
    
            if (match_subject = r_subject.exec(match)){
                if (new RegExp(blankNodePropertyList).exec(match)){
                    let d = new Date();
                    s = "_BLANK_"+d.getSeconds()+"_"+d.getMilliseconds();
                }
                else {
                    s = match_subject.groups && match_subject.groups["subject"] || "";
                }
    
                if (!sss[s]){
                    sss[s] = subjectHandler.getEmptySkosSubject(s);
                }
                sss[s].occurances.push({
                    location: new vscode.Location(
                        document.uri,
                        new vscode.Range(
                            new vscode.Position(sm.fromLine,0),
                            new vscode.Position(sm.toLine,sm.toChar)
                        )
                    ),
                    statement: match
                });
    
                while (match_po = r_po.exec(match.substr(s.length))){
                    p = match_po.groups && match_po.groups["predicate"];
                    po = match_po.groups && match_po.groups["objectList"];
                    while (match_po && match_po.groups && (match_object = r_object.exec(match_po.groups["objectList"]))){
                        o = match_object.groups && match_object.groups["object"] || "";
                        literal = match_object.groups && (match_object.groups["slq"] || match_object.groups["slsq"] || match_object.groups["sllq"] || match_object.groups["sllsq"]) || "";
                        lang = match_object.groups && match_object.groups["lang"];
    
                        if (p === "skos:prefLabel" && lang==="en"){
                            sss[s].label=literal;
                        }
                        else if (p === "skos:broader"){
                            sss[s].broader.push(o);
                        }
                        else if (p === "skos:narrower"){
                            sss[s].narrower.push(o);
                        }
                        else if (p === "skos:inScheme" || p === "skos:topConceptOf"){
                            sss[s].schemes.push(o);
                        }
                        else if (p === "skos:hasTopConcept") {
                            sss[s].topconcepts.push(o);
                        }
                        else if (p === "skos:member"){
                            sss[s].members.push(o);
                        }
                        else if (p === "skos:notation"){
                            sss[s].notations.push(literal);
                        }
                        else if ((p === "a" || p === "rdf:type")){
                            if (o as "skos:Concept"|"skos:ConceptScheme"){
                                sss[s].type = <"skos:Concept"|"skos:ConceptScheme">o;
                            }
                        }
                        match_object.groups = {};
                    }
                }
            }
        });
        return sss;
    }
}

interface StatementMatch {
	match:string;
	fromLine:number;
	toLine:number;
	toChar:number;
}

export const hw = `[\\u0009\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]`; //horizontal whitespace

export const PN_LOCAL_ESC 			= `\\\\[_~.!$&'()*+,;=/?#@%-]`;
export const HEX					= `[0-9A-Fa-f]`;
export const PERCENT				= `%${HEX}${HEX}`;
export const PLX 					= `(?:${PERCENT}|${PN_LOCAL_ESC})`;
export const PN_CHARS_BASE			= `[A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD]`; //\\u10000-\\uEFFFF ausgelassen
export const PN_CHARS_U			= `(?:${PN_CHARS_BASE}|_)`;
export const PN_CHARS				= `(?:${PN_CHARS_U}|-|[0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040])`;
export const PN_PREFIX				= `${PN_CHARS_BASE}(?:(?:${PN_CHARS}|\\.)*${PN_CHARS})?`;
export const PN_LOCAL				= `(?:${PN_CHARS_U}|:|[0-9]|${PLX})(?:(?:${PN_CHARS}|\\.|:|${PLX})*(?:${PN_CHARS}|:|${PLX}))?`;
export const WS 					= `(?:\\u0020|\\u0009\\u000D\\u000A)`;
export const ANON					= `\\[${WS}*\\]`;
export const ECHAR					= `\\\\[tbnrf\\"'\\\\]`;
export const UCHAR					= `(?:\\\\u${HEX}${HEX}${HEX}${HEX}|\\\\U${HEX}${HEX}${HEX}${HEX}${HEX}${HEX}${HEX}${HEX})`;
export const STRING_LITERAL_LONG_QUOTE = `\\"\\"\\"(?:(?:\\"|\\"\\")?(?:[^\\"\\\\]|${ECHAR}|${UCHAR}))*\\"\\"\\"`;
export const STRING_LITERAL_LONG_SINGLE_QUOTE = `'''(?:(?:'|'')?(?:[^'\\\\]|${ECHAR}|${UCHAR}))*'''`;
export const STRING_LITERAL_SINGLE_QUOTE = `'(?:[^\\u0022\\u005C\\u000A\\u000D]|${ECHAR}|${UCHAR})*'`;
export const STRING_LITERAL_QUOTE	= `\\"(?:[^\\u0022\\u005C\\u000A\\u000D]|${ECHAR}|${UCHAR})*\\"`;
export const EXPONENT				= `[eE][+-]?[0-9]+`;
export const DOUBLE				= `[+-]?(?:[0-9]+\\.[0-9]*${EXPONENT}|\\.[0-9]+${EXPONENT}|[0-9]+${EXPONENT})`;
export const DECIMAL				= `[+-]?[0-9]*\\.[0-9]+`;
export const INTEGER				= `[+-]?[0-9]+`;
export const LANGTAG				= `@[a-zA-Z]+(?:-[a-zA-Z0-9]+)*`;
export const BLANK_NODE_LABEL		= `_:(?:${PN_CHARS_U}|[0-9])(?:(?:${PN_CHARS}|\\.)*${PN_CHARS})?`;
export const PNAME_NS				= `(?:${PN_PREFIX})?:`;
export const PHNAME_LN				= `${PNAME_NS}${PN_LOCAL}`;
export const IRIREF				= `\\<(?:[^\\u0000-\\u0020<>"{}|^\`\\\\]|${UCHAR})*\\>`;

export const Blanknode				= `(?:${BLANK_NODE_LABEL}|${ANON})`;
export const PrefixedName			= `(?:${PHNAME_LN}|${PNAME_NS})`;
export const iri 					= `(?:${IRIREF}|${PrefixedName})`;
export const Sstring				= `(?:${STRING_LITERAL_LONG_SINGLE_QUOTE}|${STRING_LITERAL_LONG_QUOTE}|${STRING_LITERAL_QUOTE}|${STRING_LITERAL_SINGLE_QUOTE})`;
export const BooleanLiteral		= `(?:true|false)`;
export const RDFLiteral			= `${Sstring}(?:${LANGTAG}|\\^\\^${iri})?`;
export const NumericLiteral		= `(?:${INTEGER}|${DECIMAL}|${DOUBLE})`;
export const literal				= `(?:${RDFLiteral}|${NumericLiteral}|${BooleanLiteral})`;
export const predicate				= `${iri}`;
export const verb					= `(?:${predicate}|a)`;
export const collection 			= `\\((?:${iri}|${Blanknode}|${literal})*\\)`; // left out collection nesting causing recursion
export const object				= `(?:${iri}|${Blanknode}|${collection}|${literal})`; //left out blankNodePropertyList causing recursion
export const subject				= `(?:${iri}|${Blanknode}|${collection})`;
export const objectList			= `${object}(?:\\s*,\\s*${object})*`;
export const predicateObjectList 	= `${verb}\\s*${objectList}(?:\\s*;\\s*(?:${verb}\\s*${objectList})?)*`;
export const blankNodePropertyList = `\\[\\s*${predicateObjectList}\\s*\\]`;
export const triples 				= `(?:${subject}\\s+${predicateObjectList}|${blankNodePropertyList}(?:\\s+${predicateObjectList})?)`;
export const sparqlPrefix 			= `PREFIX\\s+${PNAME_NS}\\s+${IRIREF}`;
export const sparqlBase 			= `BASE\\s+${IRIREF}`;
export const base 					= `@base\\s+${IRIREF}\\s*\\.`;
export const prefixID 				= `@prefix\\s+${PNAME_NS}\\s+${IRIREF}\\s*\\.`;
export const directive 			= `(?:${prefixID}|${base}|${sparqlPrefix}|${sparqlBase})`;
export const statement 			= `(?:${directive}|${triples}\\s*\\.)`;
export const turtleDoc 			= `(?:\\s*${statement}\\s*)*`;

export const STRING_LITERAL_LONG_QUOTE_named = `\\"\\"\\"(?<sllq>(?:(?:\\"|\\"\\")?(?:[^\\"\\\\]|${ECHAR}|${UCHAR}))*)\\"\\"\\"`;
export const STRING_LITERAL_LONG_SINGLE_QUOTE_named = `'''(?<sllsq>(?:(?:'|'')?(?:[^'\\\\]|${ECHAR}|${UCHAR}))*)'''`;
export const STRING_LITERAL_SINGLE_QUOTE_named = `'(?<slsq>(?:[^\\u0022\\u005C\\u000A\\u000D]|${ECHAR}|${UCHAR})*)'`;
export const STRING_LITERAL_QUOTE_named	= `\\"(?<slq>(?:[^\\u0022\\u005C\\u000A\\u000D]|${ECHAR}|${UCHAR})*)\\"`;
export const Sstring_named			= `(?:${STRING_LITERAL_QUOTE_named}|${STRING_LITERAL_SINGLE_QUOTE_named}|${STRING_LITERAL_LONG_SINGLE_QUOTE_named}|${STRING_LITERAL_LONG_QUOTE_named})`;
export const LANGTAG_named			= `@(?<lang>[a-zA-Z]+(?:-[a-zA-Z0-9]+)*)`;
export const RDFLiteral_named		= `${Sstring_named}(?:${LANGTAG_named}|\\^\\^(?<type>${iri}))?`;
export const literal_named			= `(?:${RDFLiteral_named}|${NumericLiteral}|${BooleanLiteral})`;
export const subject_named			= `(?<subject>${iri}|${Blanknode}|${collection})`;
export const predicate_named		= `(?<predicate>${predicate}|a)`;
export const object_named			= `(?<object>(?:${iri}|${Blanknode}|${collection}|${literal_named}))`;
export const po_named 				= `${predicate_named}\\s+(?<objectList>${objectList})`;