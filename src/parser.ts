import * as vscode from 'vscode';
import { SkosResource, SubjectHandler } from './subjecthandler';

export class SkosParser {
    subjectHandler:SubjectHandler;
    constructor(subjectHandler?:SubjectHandler){
        this.subjectHandler=subjectHandler||new SubjectHandler();
    }

    prefixes:{[id:string]:Prefix[]}={};

    parseTextDocument(document:vscode.TextDocument|undefined): { [id: string] : SkosResource; }|undefined {
        if (!document){
            return undefined;
        }
        let text = document.getText();
        let raute = new RegExp("(?:("+IRIREF+"|"+Sstring+")|\\#[^\\n]*)","g");
        let resttext = text.replace(raute, "$1");
    
        /* Causes stack overflow for large documents.
        let turtledoc_match = new RegExp(turtleDoc);
        let match = turtledoc_match.exec(resttext);
        if (!(match && match[0] === resttext)){
            let notmatching = match && resttext.substr(match[0].length) || "";
            console.log("Not matching: " + notmatching);
            return undefined;
        }*/
    
        this.setPrefixes(document,resttext);
        let statements = this.getStatements(document,resttext);
        return this.appendSSS(document,statements);
    }

    getPrefixes(document:vscode.TextDocument):Prefix[];
    getPrefixes(uri:vscode.Uri):Prefix[];
    getPrefixes(fsPath:string):Prefix[];
    getPrefixes(arg:any):Prefix[]{
        if (typeof arg === "string"){
            return this.prefixes[arg];
        }
        else if ((arg as vscode.Uri).fsPath){
            return this.prefixes[(arg as vscode.Uri).fsPath];
        }
        else if ((arg as vscode.TextDocument).uri){
            return this.prefixes[(arg as vscode.TextDocument).uri.fsPath];
        }
        return [];
    }

    getPrefix(iriref:string,document:vscode.TextDocument):string;
    getPrefix(iriref:string,uri:vscode.Uri):string;
    getPrefix(iriref:string,fsPath:string):string;
    getPrefix(iriref:string,arg:any):string{
        let prefix = this.getPrefixes(arg).filter(p => p.long === iriref);
        return prefix[0]?.short;
    }

    getSkosPrefix(document:vscode.TextDocument):string;
    getSkosPrefix(uri:vscode.Uri):string;
    getSkosPrefix(fsPath:string):string;
    getSkosPrefix(arg:any):string{
        let prefix = this.getPrefixes(arg).filter(p => p.long === iridefs.skosBase);
        return prefix[0]?.short;
    }
    
    setPrefixes(document:vscode.TextDocument,s:string){
        let match:RegExpExecArray|null;
        let result:Prefix[]=[];
        let prefix_match = new RegExp(prefixID,"g");
        while (match = prefix_match.exec(s)){
            if (match && match.groups && match.groups["short"] && match.groups["long"]){
                result.push({
                    short: match.groups["short"],
                    long: match.groups["long"]
                });
            }
        }
        this.prefixes[document.uri.fsPath] = result;
    }

    private getStatements(document:vscode.TextDocument,s:string):LocatedText[]{
        let result:LocatedText[]=[];
        let tempmatch;
        let triples_match = new RegExp(triples,"g");

        let locatedDocumentText:LocatedText = {
            location: new vscode.Location(
                document.uri,
                new vscode.Range(
                    new vscode.Position(0,0),
                    new vscode.Position(document.lineCount-1,document.lineAt(document.lineCount-1).range.end.character)
                )
            ),
            text:s
        };
        
        while (tempmatch = triples_match.exec(s)){        
            //extend statement location till next dot
            let textBeforeDot = s.substring(tempmatch.index+tempmatch[0].length,s.indexOf(".",tempmatch.index+tempmatch[0].length));
            let linesplit = textBeforeDot.split(/\r\n|\r|\n/);
            let location = this.getLocationOfMatchWithinLocatedText(locatedDocumentText,tempmatch);
            location = new vscode.Location(location.uri,new vscode.Range(
                location.range.start,
                new vscode.Position(
                    location.range.end.line+linesplit.length-1,
                    linesplit.length===1 ? location.range.end.character+linesplit[0].length : linesplit[linesplit.length-1].length
                )
            ));
            result.push({
                location:location,
                text:tempmatch[0]
            });
        }
        return result;
    }

    private getLocationOfMatchWithinLocatedText(lt:LocatedText,match:RegExpExecArray|string,offset?:number):vscode.Location{
        let matchtext = "";
        let matchindex = 0;
        if (typeof match === "string"){
            matchtext = match;
            matchindex = lt.text.indexOf(match);
        }
        else if ((match as RegExpExecArray).length){
            matchtext = match[0];
            matchindex = match.index;
        }
        let linesBefore = lt.text.substr(0,matchindex+(offset||0)).split(/\r\n|\r|\n/);
        let startLinePos = lt.location.range.start.line + linesBefore.length -1;
        let fromChar = linesBefore[linesBefore.length-1].length;
        if (linesBefore.length === 1){ fromChar += lt.location.range.start.character; }
        let linesWithin = matchtext.split(/\r\n|\r|\n/);
        let endLinePos = startLinePos + linesWithin.length -1;
        let toChar = linesWithin.length === 1 ? fromChar + matchtext.length : linesWithin[linesWithin.length-1].length;
        return new vscode.Location(lt.location.uri,new vscode.Range(new vscode.Position(startLinePos,fromChar),new vscode.Position(endLinePos,toChar)));
    }

    private modifyLocation(location:vscode.Location,modification:{lineFrom:number,charFrom:number,lineTo:number,charTo:number}):vscode.Location{
        return new vscode.Location(location.uri,
            new vscode.Range(
                new vscode.Position(location.range.start.line+modification.lineFrom,location.range.start.character+modification.charFrom),
                new vscode.Position(location.range.end.line+modification.lineTo,location.range.end.character+modification.charTo)
            )
        );
    }

    resolvePrefix(iri:string,document:vscode.TextDocument):string|undefined;
    resolvePrefix(iri:string,prefixes:Prefix[]):string|undefined;
    resolvePrefix(iri:string,arg:any):string|undefined{
        let prefixes:Prefix[] = [];
        if ((arg as vscode.TextDocument).uri) {
            prefixes = this.prefixes[(arg as vscode.TextDocument).uri.fsPath];
        }
        else {
            prefixes = arg;
        }
        if (iri === "a"){return iridefs.type;}
        let matchingPrefix = prefixes.filter(p => iri.startsWith(p.short));
        if (matchingPrefix.length>0) {
            let prefix = matchingPrefix[0];
            let end = iri.substr(prefix.short.length);
            return prefix.long.substr(0,prefix.long.length-1)+end+">";
        }
    }

    applyPrefix(iriref:string,document:vscode.TextDocument):string|undefined;
    applyPrefix(iriref:string,prefixes:Prefix[]):string|undefined;
    applyPrefix(iriref:string,arg:any):string|undefined{
        let prefixes:Prefix[] = [];
        if ((arg as vscode.TextDocument).uri) {
            prefixes = this.prefixes[(arg as vscode.TextDocument).uri.fsPath];
        }
        else {
            prefixes = arg;
        }
        let matchingPrefix = prefixes.filter(p => iriref.startsWith(p.long.substring(0,p.long.length-1)));
        if (matchingPrefix.length>0){
            let prefix = matchingPrefix[0];
            let result = iriref.replace(prefix.long.substring(0,prefix.long.length-1),prefix.short);
            return result.substr(0,result.length-1);
        }
    }

    applyPrefixesOnText(text:string,document:vscode.TextDocument):string|undefined;
    applyPrefixesOnText(text:string,prefixes:Prefix[]):string|undefined;
    applyPrefixesOnText(text:string,arg:any):string|undefined{
        let regex = new RegExp(IRIREF,"g");
        let match;
        let result = text;
        while (match = regex.exec(text)){
            let iriref = match[0];
            let iri = this.applyPrefix(iriref,arg)||iriref;
            result = result.replace(iriref,iri);
        }
        return result;
    }
    
    private appendSSS(document:vscode.TextDocument,sms:LocatedText[]):{ [id: string] : SkosResource; }{
        let sss:{ [id: string] : SkosResource; } = {};
        let prefixes = this.prefixes[document.uri.fsPath];
        sms.forEach(sm => {
            let match = sm.text;
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
                    s = this.resolvePrefix(s,prefixes)||s;
                }
    
                if (!sss[s]){
                    sss[s] = this.subjectHandler.getEmptySkosSubject({
                        text: s,
                        locations: []
                    });
                }
                sss[s].concept.locations?.push(this.getLocationOfMatchWithinLocatedText(sm,s));
                let location = new vscode.Location(
                    document.uri,
                    sm.location.range
                );
                sss[s].occurances.push({
                    location: location,
                    statement: match
                });
                let offset = match_subject[0].length;
                while (match_po = r_po.exec(match.substr(offset))){
                    p = match_po.groups && match_po.groups["predicate"];
                    if (!p){return;}
                    po = match_po.groups && match_po.groups["objectList"];
                    if (!po){return;}
                    while (match_po && match_po.groups && (match_object = r_object.exec(match_po.groups["objectList"]))){
                        o = match_object.groups && match_object.groups["object"] || "";
                        literal = match_object.groups && (match_object.groups["slq"] || match_object.groups["slsq"] || match_object.groups["sllq"] || match_object.groups["sllsq"]);
                        lang = match_object.groups && match_object.groups["lang"];
    
                        let po_location = this.getLocationOfMatchWithinLocatedText(sm,match_po,offset);
                        let predicateLocation = this.getLocationOfMatchWithinLocatedText({location:po_location,text:match_po[0]},p);
                        let objectLocation = this.getLocationOfMatchWithinLocatedText({location:po_location,text:match_po[0]},o); 

                        sss[s].statements.push({
                            location: po_location,
                            text: match_po[0],
                            predicate: {
                                location: predicateLocation,
                                text: this.resolvePrefix(p,prefixes)||p
                            },
                            object: {
                                location: objectLocation,
                                text: this.resolvePrefix(o,prefixes)||o,
                                lang: lang,
                                literal: literal
                            }
                        });
                        match_object.groups = {};
                    }
                }
            }
        });
        return sss;
    }
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
export const predicateObjectList 	= `${verb}\\s*${objectList}(?:\\s*;(?:\\s*${verb}\\s*${objectList})?)*`;
export const blankNodePropertyList = `\\[\\s*${predicateObjectList}\\s*\\]`;
export const triples 				= `(?:${subject}\\s+${predicateObjectList}|${blankNodePropertyList}(?:\\s+${predicateObjectList})?)`;
export const sparqlPrefix 			= `PREFIX\\s+${PNAME_NS}\\s+${IRIREF}`;
export const sparqlBase 			= `BASE\\s+${IRIREF}`;
export const base 					= `@base\\s+${IRIREF}\\s*\\.`;
export const prefixID 				= `@prefix\\s+(?<short>${PNAME_NS})\\s+(?<long>${IRIREF})\\s*\\.`;
export const directive 			= `(?:${prefixID}|${base}|${sparqlPrefix}|${sparqlBase})`;
export const statement 			= `(?:${directive}|${triples}\\s*\\.)`;
export const turtleDoc 			= `(?:\\s*${statement}\\s*)*`;

export const STRING_LITERAL_LONG_QUOTE_named = `\\"\\"\\"(?<sllq>(?:(?:\\"|\\"\\")?(?:[^\\"\\\\]|${ECHAR}|${UCHAR}))*)\\"\\"\\"`;
export const STRING_LITERAL_LONG_SINGLE_QUOTE_named = `'''(?<sllsq>(?:(?:'|'')?(?:[^'\\\\]|${ECHAR}|${UCHAR}))*)'''`;
export const STRING_LITERAL_SINGLE_QUOTE_named = `'(?<slsq>(?:[^\\u0022\\u005C\\u000A\\u000D]|${ECHAR}|${UCHAR})*)'`;
export const STRING_LITERAL_QUOTE_named	= `\\"(?<slq>(?:[^\\u0022\\u005C\\u000A\\u000D]|${ECHAR}|${UCHAR})*)\\"`;
export const Sstring_named			= `(?:${STRING_LITERAL_LONG_SINGLE_QUOTE_named}|${STRING_LITERAL_LONG_QUOTE_named}|${STRING_LITERAL_QUOTE_named}|${STRING_LITERAL_SINGLE_QUOTE_named})`;
export const LANGTAG_named			= `@(?<lang>[a-zA-Z]+(?:-[a-zA-Z0-9]+)*)`;
export const RDFLiteral_named		= `${Sstring_named}(?:${LANGTAG_named}|\\^\\^(?<type>${iri}))?`;
export const literal_named			= `(?:${RDFLiteral_named}|${NumericLiteral}|${BooleanLiteral})`;
export const subject_named			= `(?<subject>${iri}|${Blanknode}|${collection})`;
export const predicate_named		= `(?<predicate>${predicate}|a)`;
export const object_named			= `(?<object>(?:${iri}|${Blanknode}|${collection}|${literal_named}))`;
export const po_named 				= `${predicate_named}\\s+(?<objectList>${objectList})`;

export const skosReference= "http://www.w3.org/2004/02/skos/core#";

export const iridefs = {
    skosBase: "<http://www.w3.org/2004/02/skos/core#>",
    concept: "<http://www.w3.org/2004/02/skos/core#Concept>",
    conceptScheme: "<http://www.w3.org/2004/02/skos/core#ConceptScheme>",
    collection: "<http://www.w3.org/2004/02/skos/core#Collection>",
    prefLabel: "<http://www.w3.org/2004/02/skos/core#prefLabel>",
    broader: "<http://www.w3.org/2004/02/skos/core#broader>",
    narrower: "<http://www.w3.org/2004/02/skos/core#narrower>",
    member: "<http://www.w3.org/2004/02/skos/core#member>",
    type: "<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>",
    topConceptOf: "<http://www.w3.org/2004/02/skos/core#topConceptOf>",
    notation: "<http://www.w3.org/2004/02/skos/core#notation>",
    hasTopConcept: "<http://www.w3.org/2004/02/skos/core#hasTopConcept>",
    inScheme: "<http://www.w3.org/2004/02/skos/core#inScheme>"
};

export interface LocatedText {
    location:vscode.Location;
    text:string; 
}

export interface LocatedSubject {
    locations?:vscode.Location[];
    text:string;
}

export interface LocatedPredicateObject extends LocatedText {
    predicate: LocatedPredicate;
    object: LocatedObject;
}

export interface LocatedPredicate extends LocatedText {
    location:vscode.Location;
    text:string;
}

export interface LocatedObject extends LocatedText {
    location:vscode.Location;
    text:string;
    literal?:string;
    lang?:string;
    type?:string;
}

export interface Prefix {
    short: string;
    long: string;
}