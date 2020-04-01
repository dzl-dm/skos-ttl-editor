import * as vscode from 'vscode';
import { SkosResource, SkosResourceHandler } from './skosresourcehandler';

export class SkosParser {
    skosResourceHandler:SkosResourceHandler;
    constructor(skosResourceHandler:SkosResourceHandler){
        this.skosResourceHandler=skosResourceHandler;
    }

    prefixes:{[id:string]:Prefix[]}={};

    async parseTextDocument(options:{
        document:vscode.TextDocument|undefined, 
        ranges?:vscode.Range[],
        withprogress?:{
            progress:vscode.Progress<{
                message?: string | undefined;
                increment?: number | undefined;
            }>,
            ticks:number
        }
    }): Promise<{
        [id: string]: SkosResource;
    } | undefined> {
        if (!options.document){
            return undefined;
        }
        let statementTicks = Math.floor((options.withprogress?.ticks||0) / 3);
        let statementsPromise = this.getStatements({
            document:options.document,
            ranges: options.ranges,
            withprogress: options.withprogress?{
                progress: options.withprogress.progress,
                ticks: statementTicks
            }:undefined
        });
        this.setPrefixes(options.document,this.removeComments(options.document.getText()).text);
    
        let promiseResolve:(value?: {
            [id: string]: SkosResource;
        } | PromiseLike<{
            [id: string]: SkosResource;
        } | undefined> | undefined) => void;
        let result = new Promise<{
            [id: string]: SkosResource;
        } | undefined>((resolve,reject) => {
            promiseResolve = resolve;
        });

        statementsPromise.then(statements => {
            if (statements === undefined){
                promiseResolve(undefined);
            }
            this.appendSSS({
                document: <vscode.TextDocument>options.document,
                sms: <LocatedText[]>statements,
                withprogress: options.withprogress?{
                    progress: options.withprogress.progress,
                    ticks: options.withprogress.ticks - statementTicks
                }:undefined
            }).then(promiseResolve);
        });
        return result;
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

    private removeComments(s:string):{
        text: string,
        comment_offsets: {
            start: number,
            end: number
        }[]
    }{
        let raute = new RegExp("(?:("+IRIREF+"|"+Sstring+")|(\\#[^\\n]*))","g");
        let resulttext = "";
        let result_comment_offsets:{
            start: number,
            end: number
        }[] = [];
        let match;
        let lastindex = 0;
        while(match = raute.exec(s)){
            resulttext += s.substring(lastindex,match.index);
            if (match[1]){
                resulttext += match[1];
            }
            lastindex=match.index+match[0].length;
            if (match[2]){
                result_comment_offsets.push({start:match.index,end:lastindex});
            }
        }
        resulttext+=s.substr(lastindex);
        return {
            text:resulttext,
            comment_offsets: result_comment_offsets
        };
    }

    wait = async (ms:number) => await new Promise((resolve) => { setTimeout(() => { resolve(); }, ms); });
    private async getStatements(options:{
        document:vscode.TextDocument,
        ranges?:vscode.Range[],
        withprogress?:{
            progress:vscode.Progress<{
                message?: string | undefined;
                increment?: number | undefined;
            }>,
            ticks:number
        }
    }):Promise<LocatedText[]>{         
        let result:LocatedText[]=[];
        let tempmatch;
        let triples_match = new RegExp(triples,"g");

        if (!options.ranges){
            options.ranges = [new vscode.Range(
                new vscode.Position(0,0),
                new vscode.Position(options.document.lineCount-1,options.document.lineAt(options.document.lineCount-1).range.end.character)
            )];
        }

        let progressTodo = options.ranges.map(range => options.document.offsetAt(range.end)-options.document.offsetAt(range.start)).reduce((prev,curr)=>prev+=curr,0);
        let progressDone = 0;
        for (let i = 0; i < options.ranges.length; i++){
            let range = options.ranges[i];
            let s = options.document.getText(range);
            let comment_removal = this.removeComments(s);
            let range_offset = options.document.offsetAt(range.start);
            let docLength = s.length;
            let loadprogress = 0;
            let counter = 0;
            while (tempmatch = triples_match.exec(comment_removal.text)){    
                //get offsets in text with removed comments
                let dot_offset = comment_removal.text.indexOf(".",tempmatch.index+tempmatch[0].length);
                if (dot_offset === -1){ dot_offset = tempmatch.index+tempmatch[0].length; }
                let start_offset = range_offset+tempmatch.index;
                let end_offset = range_offset+dot_offset;
                //adding all comment lengths to get the real offsets
                for (let i = 0; i < comment_removal.comment_offsets.length; i++){
                    if (comment_removal.comment_offsets[i].start < start_offset){
                        start_offset += comment_removal.comment_offsets[i].end - comment_removal.comment_offsets[i].start;
                    }
                    if (comment_removal.comment_offsets[i].start < end_offset){
                        end_offset += comment_removal.comment_offsets[i].end - comment_removal.comment_offsets[i].start;
                    }
                }
                let match_range = new vscode.Range(
                    options.document.positionAt(start_offset),
                    options.document.positionAt(end_offset)
                );
                let location = new vscode.Location(options.document.uri,match_range);
                result.push({
                    location:location,
                    documentOffset:{
                        start: start_offset,
                        end: end_offset
                    },
                    text:tempmatch[0]
                });
                
                if (options.withprogress !== undefined && counter%100 === 0){
                    let progressdiff = Math.ceil((options.withprogress.ticks*(tempmatch.index+progressDone))/progressTodo) - loadprogress;
                    options.withprogress.progress.report({ increment: progressdiff });
                    await this.wait(0);
                    loadprogress += progressdiff;
                }
                counter++;
            }
            if (options.withprogress !== undefined){
                progressDone += docLength;
                let progressdiff = Math.ceil((options.withprogress.ticks*progressDone)/progressTodo) - loadprogress;
                options.withprogress.progress.report({ increment: progressdiff });
                await this.wait(0);
                loadprogress += progressdiff;
            }
        }
        return(result);
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
    
    private async appendSSS(options: {
        document:vscode.TextDocument,
        sms:LocatedText[],
        withprogress?:{
            progress:vscode.Progress<{
                message?: string | undefined;
                increment?: number | undefined;
            }>,
            ticks:number
        }
    }):Promise<{
        [id: string]: SkosResource;
    }>{
        let sss:{ [id: string] : SkosResource; } = {};
        let prefixes = this.prefixes[options.document.uri.fsPath];
        let loadprogress = 0;
        for (let i = 0; i < options.sms.length; i++){
            let p;
            let r_object = new RegExp(object_named,"g"), match_object, o;
            let r_po = new RegExp(po_named,"g"), match_po, po;
            let literal,lang;
            let r_subject = new RegExp(subject_named,"g"), match_subject, s;
    
            if (match_subject = r_subject.exec(options.sms[i].text)){
                if (new RegExp(blankNodePropertyList).exec(options.sms[i].text)){
                    let d = new Date();
                    s = "_BLANK_"+d.getSeconds()+"_"+d.getMilliseconds();
                }
                else {
                    s = match_subject.groups && match_subject.groups["subject"] || "";
                    s = this.resolvePrefix(s,prefixes)||s;
                }
    
                if (!sss[s]){
                    sss[s] = this.skosResourceHandler.getEmptySkosSubject({
                        text: s,
                        locations: []
                    });
                }
                let conceptLocation = this.getLocationOfMatchWithinLocatedText(options.sms[i],s);
                sss[s].concept.locations?.push({
                    location:conceptLocation,
                    documentOffset: {
                        start: options.document.offsetAt(conceptLocation.range.start),
                        end: options.document.offsetAt(conceptLocation.range.end)
                    },
                });
                let location = new vscode.Location(
                    options.document.uri,
                    options.sms[i].location.range
                );
                sss[s].occurances.push({
                    location: location,
                    documentOffset: {
                        start: options.document.offsetAt(location.range.start),
                        end: options.document.offsetAt(location.range.end)
                    }
                });
                let offset = match_subject[0].length;
                while (match_po = r_po.exec(options.sms[i].text.substr(offset))){
                    p = match_po.groups && match_po.groups["predicate"];
                    if (!p){continue;}
                    po = match_po.groups && match_po.groups["objectList"];
                    if (!po){continue;}
                    while (match_po && match_po.groups && (match_object = r_object.exec(match_po.groups["objectList"]))){
                        o = match_object.groups && match_object.groups["object"] || "";
                        literal = match_object.groups && (match_object.groups["slq"] || match_object.groups["slsq"] || match_object.groups["sllq"] || match_object.groups["sllsq"]);
                        lang = match_object.groups && match_object.groups["lang"];
    
                        let po_location = this.getLocationOfMatchWithinLocatedText(options.sms[i],match_po,offset);
                        let predicateLocation = this.getLocationOfMatchWithinLocatedText({
                            location:po_location,
                            documentOffset:{
                                start: options.document.offsetAt(po_location.range.start),
                                end: options.document.offsetAt(po_location.range.end)
                            },
                            text:match_po[0]
                        },p);
                        let objectLocation = this.getLocationOfMatchWithinLocatedText({
                            location:po_location,
                            documentOffset:{
                                start: options.document.offsetAt(po_location.range.start),
                                end: options.document.offsetAt(po_location.range.end)
                            },
                            text:match_po[0]
                        },o); 

                        sss[s].statements.push({
                            location: po_location,
                            documentOffset:{
                                start: options.document.offsetAt(po_location.range.start),
                                end: options.document.offsetAt(po_location.range.end)
                            },
                            text: match_po[0],
                            predicate: {
                                location: predicateLocation,
                                documentOffset:{
                                    start: options.document.offsetAt(predicateLocation.range.start),
                                    end: options.document.offsetAt(predicateLocation.range.end)
                                },
                                text: this.resolvePrefix(p,prefixes)||p
                            },
                            object: {
                                location: objectLocation,
                                documentOffset:{
                                    start: options.document.offsetAt(objectLocation.range.start),
                                    end: options.document.offsetAt(objectLocation.range.end)
                                },
                                text: this.resolvePrefix(o,prefixes)||o,
                                lang: lang,
                                literal: literal
                            }
                        });
                        match_object.groups = {};
                    }
                }
            }
            
            if (options.withprogress !== undefined && i%100 === 0){
                let progressdiff = Math.ceil((options.withprogress.ticks*i)/options.sms.length) - loadprogress;
                options.withprogress.progress.report({ increment: progressdiff });
                await this.wait(0);
                loadprogress += progressdiff;
            }
        }
        if (options.withprogress !== undefined){
            let progressdiff = options.withprogress.ticks - loadprogress;
            options.withprogress.progress.report({ increment: progressdiff });
            await this.wait(0);
        }
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
    documentOffset:{
        start:number;
        end:number;
    };
    text:string; 
}

export interface LocatedSubject {
    locations?:{
        location:vscode.Location;        
        documentOffset:{
            start:number;
            end:number;
        };
    }[];
    text:string;
}

export interface LocatedPredicateObject extends LocatedText {
    predicate: LocatedText;
    object: LocatedObject;
}

export interface LocatedObject extends LocatedText {
    literal?:string;
    lang?:string;
    type?:string;
}

export interface Prefix {
    short: string;
    long: string;
}