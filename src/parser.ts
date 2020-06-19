import * as vscode from 'vscode';
import { skosResourceManager, SkosResource, SkosPredicateObject, SkosPredicate, SkosObject, prefixManager, SkosObjectType, Prefix } from './skosresourcehandler';
import { Occurence } from './skosresourcehandler';
import { isNumber } from 'util';

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
export const predicateObjectList 	= `${verb}\\s+${objectList}(?:\\s*;(?:\\s*${verb}\\s*${objectList})?)*`;
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
export const subject_named			= `((?<iri>${iri})|(?<blanknode>${Blanknode})|${collection})`;
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



let r_raute = new RegExp("(?:("+IRIREF+"|"+Sstring+")|(\\#[^\\n]*))","g");
interface RemoveCommentsResult {
    text: string;
    comment_offsets: {
        start: number,
        end: number
    }[];
}
export function removeComments(s:string):RemoveCommentsResult{
    r_raute.lastIndex=-1;
    let resulttext = "";
    let result_comment_offsets:{
        start: number,
        end: number
    }[] = [];
    let match;
    let lastindex = 0;
    while(match = r_raute.exec(s)){
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

export function applyPrefixesOnText(text:string,document:vscode.TextDocument):string|undefined{
    let r_iriref = new RegExp(IRIREF,"g");
    let match;
    let result = text;
    r_iriref.lastIndex=-1;
    while (match = r_iriref.exec(text)){
        let iriref = match[0];
        let iri = prefixManager.apply(document.uri,iriref)||iriref;
        result = result.replace(iriref,iri);
    }
    return result;
}

export async function parseTextDocument(options:{
    document:vscode.TextDocument|undefined, 
    callbackIfPrefixChanged?:()=>void,
    ranges?:vscode.Range[],
    progressReport?:(percentage:number,message?:string)=>Promise<any>
}): Promise<SkosResource[]> {
    if (!options.document){
        return [];
    }    
    
    let prefixChange = !setPrefixes(options.document,removeComments(options.document.getText()).text);
    if (prefixChange) {
        //if prefixes have changed then parse whole document
        if (options.callbackIfPrefixChanged){
            options.callbackIfPrefixChanged();
        }
        options.ranges = undefined;
    }

    let parsedResources:SkosResource[]=[];
    let getRangeOptions = {
        document:options.document,
        lastIndex: -1, 
        ranges:options.ranges
    }, range:vscode.Range|undefined;
    while (range = getNextRange(getRangeOptions)){
        let offset_start = options.document.offsetAt(range.start);
        let offset_end = options.document.offsetAt(range.end);
        let occ = new Occurence(
            options.document.uri,
            {
                start:offset_start,
                end:offset_end
            }
        );
        await occ.init();
        let triplesOccurences = await occ.getSubOccurencesOfMatchAndGroups(new RegExp(triples+"(\\s|\\r|\\n)*\\.","g"));
        let predicateObjectRegexp = new RegExp(po_named,"g");
        let objectRegexp = new RegExp(object_named,"g");
        let iriRegexp = new RegExp("^"+iri+"$");
        for (let i = 0; i < triplesOccurences.length; i++){
            let triplesoccurence = triplesOccurences[i];
            //get subject id occurences
            let subjectOccurences = await triplesoccurence.matchOccurence.getSubOccurencesOfMatchAndGroups(new RegExp(subject_named),true);
            if (subjectOccurences.length===0){
                continue;
            }            

            //determine subject id
            let subjectId="";
            if (subjectOccurences[0].groupsOccurences["blanknode"]){
                let d = new Date();
                subjectId = "_BLANK_"+d.getSeconds()+"_"+d.getMilliseconds();
            } else {
                subjectId = subjectOccurences[0].groupsOccurences["iri"].getText();
                subjectId = prefixManager.resolve((<vscode.TextDocument>options.document).uri,subjectId)||subjectId;
            }

            //get/generate resource in/from resource manager
            let resource = skosResourceManager.resources[subjectId];
            if (!resource){
                resource = new SkosResource(subjectId);
                skosResourceManager.addResource(resource);
            }
            parsedResources.push(resource);

            //add occurences to resource
            if (subjectOccurences[0].groupsOccurences["iri"]){
                resource.idOccurences.push(subjectOccurences[0].groupsOccurences["iri"]);
            }                
            resource.occurences.push(triplesoccurence.matchOccurence);

            //get predicate objectlist occurences
            let subjectLength = subjectOccurences[0].matchOccurence.documentOffset.end - subjectOccurences[0].matchOccurence.documentOffset.start;
            predicateObjectRegexp.lastIndex = subjectLength;
            let predicateObjectOccurences = await triplesoccurence.matchOccurence.getSubOccurencesOfMatchAndGroups(predicateObjectRegexp);
            for (let predicateObjectOccurence of predicateObjectOccurences) {
                if (!predicateObjectOccurence.groupsOccurences["objectList"] || !predicateObjectOccurence.groupsOccurences["predicate"]){return [];}
                //get object occurences
                objectRegexp.lastIndex=-1;
                let objectOccurences = await predicateObjectOccurence.groupsOccurences["objectList"].getSubOccurencesOfMatchAndGroups(objectRegexp);

                //add occurences to resource
                for (let objectOccurence of objectOccurences){
                    let skosObject = await new SkosObject(objectOccurence.matchOccurence.document.uri,objectOccurence.matchOccurence.documentOffset).init();
                    //lang object slq slsq sllq sllsq
                    skosObject.lang = objectOccurence.groupsOccurences["lang"];
                    skosObject.literal = objectOccurence.groupsOccurences["slq"]
                        || objectOccurence.groupsOccurences["slsq"]
                        || objectOccurence.groupsOccurences["sllq"]
                        || objectOccurence.groupsOccurences["sllsq"];
                    if (skosObject.literal){skosObject.type=SkosObjectType.Literal;}
                    else {
                        let object = objectOccurence.matchOccurence.getText();
                        if (isNumber(object)){skosObject.type=SkosObjectType.Numeric;}
                        else if (object === "true" || object === "false"){skosObject.type=SkosObjectType.Boolean;}
                        else if (iriRegexp.exec(object)){skosObject.type=SkosObjectType.Iri;}
                    }
                    resource.predicateObjects.push(await new SkosPredicateObject(
                        predicateObjectOccurence.matchOccurence.document.uri,
                        predicateObjectOccurence.matchOccurence.documentOffset,
                        await new SkosPredicate(
                            predicateObjectOccurence.groupsOccurences["predicate"].document.uri,
                            predicateObjectOccurence.groupsOccurences["predicate"].documentOffset
                        ).init(),
                        skosObject
                    ).init());
                }
            }

            //progress update                
            if (options.progressReport !== undefined && (i%100 === 0 || i === triplesOccurences.length-1 )){
                let progressPerRange = 100/(options.ranges && options.ranges.length || 1);
                let rangeProgress = getRangeOptions.lastIndex*progressPerRange;
                let triplesProgress = progressPerRange*i/triplesOccurences.length;
                await options.progressReport(rangeProgress+triplesProgress,options.document.uri.fsPath);
            }
        }
    }

    return parsedResources.filter((value,index,array)=>index===array.indexOf(value));
}

export function getNextRange(getRangeOptions:{
    document:vscode.TextDocument,
    lastIndex:number,
    ranges?:vscode.Range[]
}):vscode.Range|undefined{
    getRangeOptions.lastIndex++;
    if (getRangeOptions.lastIndex === 0 && !getRangeOptions.ranges){
        return new vscode.Range(
            new vscode.Position(0,0),
            new vscode.Position(getRangeOptions.document.lineCount-1,getRangeOptions.document.lineAt(getRangeOptions.document.lineCount-1).range.end.character)
        );
    }
    if (getRangeOptions.ranges && getRangeOptions.lastIndex < getRangeOptions.ranges.length){
        return getRangeOptions.ranges[getRangeOptions.lastIndex];
    }
}
    

export function setPrefixes(document:vscode.TextDocument,s:string):boolean{
    let r_prefix = new RegExp(prefixID,"g");
    let match:RegExpExecArray|null;
    r_prefix.lastIndex=-1;
    let newPrefixes:Prefix[]=[];
    while (match = r_prefix.exec(s)){
        if (match && match.groups && match.groups["short"] && match.groups["long"]){
            newPrefixes.push({uri:document.uri, short: match.groups["short"], long: match.groups["long"]});
        }
    }    
    return prefixManager.setPrefixes(document.uri, newPrefixes);
}