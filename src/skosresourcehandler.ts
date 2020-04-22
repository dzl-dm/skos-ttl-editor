import * as vscode from 'vscode';
import { SkosNode, iconDefinitions, IconDefinition } from './skosnode';
import { iridefs, removeComments } from './parser';
import { sortLocations, turtleDocuments, TurtleDocument, adjustOccurence } from './documenthandler';
import { asyncForeach } from './extension';
import { performance } from 'perf_hooks';

class SkosResourceManager {
    resources:SkosResourceList={};

    addResource = (resource:SkosResource) => {
        this.resources[resource.id]=resource;
    }

    addNonexistingReferencedResource = (id:string):SkosResource => {
        this.resources[id]=new SkosResource(id);
        return this.resources[id];
    }

    async evaluatePredicateObjects(resources:SkosResource[],progressReport?:(percentage:number,message?:string)=>Promise<any>)  {
        let counter=0;
        for (let resource of resources){
            resource.evaluatePredicateObjects();
            counter++;
            if (progressReport && (counter%100===0 || counter === resources.length)){
                await progressReport(counter/resources.length*100);
            }
        }
    }

    removeIntersectingOccurences(occurences:Occurence[]):SkosResource[]{
        let result:SkosResource[]=[];
        Object.keys(this.resources).forEach(key => {
            let resource = this.resources[key];
            for (let i = resource.occurences.length-1; i >=0; i--){
                let occurence = resource.occurences[i];
                if (!occurence){continue;}
                occurences.forEach(o => {
                    if (occurence.document.uri.fsPath === o.document.uri.fsPath){
                        //TODO: replace intersection function
                        if (occurence.location().range.intersection(o.location().range)){
                            result.push(resource);
                            resource.removeIntersectingoccurences([o.location()]);
                        }
                    }
                });
            }
        });
        return result;
    }

    resetResourceEvaluations(resources:SkosResource[]):void{
        for (let resource of resources){
            resource.resetEvaluations();
        }
    }

    removeResourcesWithoutOccurenceOrReference(){
        Object.keys(this.resources).forEach(key => {
            let resource = this.resources[key];
            if (resource.occurences.length === 0 && resource.references.length === 0){
                delete this.resources[key];
            }
        });
    }

    getNewLocationsToParseByChangeEvents(changeEvents:vscode.TextDocumentChangeEvent[]):vscode.Location[]{
        let result:vscode.Location[]=[];
        for (let changeEvent of changeEvents){
            for (let contentChange of changeEvent.contentChanges){
                let minOffset = 0;
                let maxOffset = turtleDocuments.get(changeEvent.document.uri).text?.length||0;
                Object.keys(this.resources).map(key => this.resources[key]).forEach(resource => {
                    resource.occurences.forEach(occurence => {
                        if (occurence.document.uri === changeEvent.document.uri){
                            if (occurence.documentOffset.end <= contentChange.rangeOffset
                                && occurence.documentOffset.end > minOffset){
                                    minOffset = occurence.documentOffset.end;
                                }
                            if (occurence.documentOffset.start >= contentChange.rangeOffset+contentChange.text.length
                                && occurence.documentOffset.start < maxOffset){
                                    maxOffset = occurence.documentOffset.start;
                                }
                        }
                    });
                });
                result.push(new vscode.Location(changeEvent.document.uri,new vscode.Range(changeEvent.document.positionAt(minOffset),changeEvent.document.positionAt(maxOffset))));
            }
        }
        return sortLocations(result);
    }

    adjustLocations(changeEvents: vscode.TextDocumentChangeEvent[]){
        Object.keys(this.resources).forEach(key => this.resources[key].adjustLocations(changeEvents));
    }

    getResource(o: SkosObject):SkosResource{
        let text = o.getText();
        text = prefixManager.resolve(o.document.uri,text) || text;
        return text && this.resources[text] || this.addNonexistingReferencedResource(text);
    }

    getIntersectionResources(uri:vscode.Uri,range:vscode.Range):SkosResource[]{
        return Object.keys(this.resources)
            .map(key => this.resources[key])
            .filter(resource => {
                for(let occurence of resource.occurences){
                    if (occurence.document.uri === uri && occurence.location().range.intersection(range)){
                        return true;
                    }
                }
                return false;
            });
    }
}

export const skosResourceManager = new SkosResourceManager();

interface SkosResourceList {[id: string] : SkosResource;}

export class SkosResource {
    id:string;
    types:SkosSubjectType[]=[];
    idOccurences:Occurence[]=[];
    notations:SkosObject[]=[];
    occurences:Occurence[]=[];
    description = new vscode.MarkdownString("");
    predicateObjects:SkosPredicateObject[]=[];
    treeNode:SkosNode|undefined;
    references:SkosReference[]=[];
    constructor(id:string){
        this.id = id;
    }

    resetEvaluations(){
        for (let i = this.references.length-1; i >=0; i--){
            let reference = this.references[i];
            if (reference.external){continue;}
            let toRemove = reference.resource.references.filter(r2 => r2.predicateObject === reference.predicateObject && r2.external === true);
            if (toRemove.length>0){
                reference.resource.references.splice(reference.resource.references.indexOf(toRemove[0]),1);
            }
            this.references.splice(i,1);
        }
        this.types=[];
        this.description= new vscode.MarkdownString("");
    }

    schemeMembers():SkosResource[]{
        return this.references.filter(reference => 
            reference.external && reference.predicateObject.predicate.type === SkosPredicateType.InScheme
            || !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.HasTopConcept
        ).map(reference => reference.resource).filter((value,index,array)=>array.indexOf(value)===index);
    }
    inScheme(scheme:SkosResource):boolean{
        return this.references.filter(reference => 
            !reference.external && reference.resource === scheme && reference.predicateObject.predicate.type === SkosPredicateType.InScheme
            || reference.external && reference.resource === this && reference.predicateObject.predicate.type === SkosPredicateType.HasTopConcept
        ).length > 0;
    }
    narrowers():SkosResource[]{
        return this.narrowerReferences().map(reference => reference.resource).filter((value,index,array)=>array.indexOf(value)===index);
    }
    narrowerReferences():SkosReference[]{
        return this.references.filter(r => !r.external && r.predicateObject.predicate.type === SkosPredicateType.Narrower 
            || !r.external && r.predicateObject.predicate.type === SkosPredicateType.Member
            || r.external && r.predicateObject.predicate.type === SkosPredicateType.Broader);
    }
    broaders():SkosResource[]{
        return this.broaderReferences().map(reference => reference.resource).filter((value,index,array)=>array.indexOf(value)===index);
    }
    broaderReferences():SkosReference[]{
        return this.references.filter(r => !r.external && r.predicateObject.predicate.type === SkosPredicateType.Broader 
            || r.external && r.predicateObject.predicate.type === SkosPredicateType.Narrower
            || r.external && r.predicateObject.predicate.type === SkosPredicateType.Member);
    }
    parents():SkosResource[]{
        return this.references.filter(r => !r.external && [SkosPredicateType.Broader,SkosPredicateType.InScheme].includes(r.predicateObject.predicate.type)
            || r.external && [SkosPredicateType.Narrower,SkosPredicateType.HasTopConcept,SkosPredicateType.Member].includes(r.predicateObject.predicate.type))
            .map(reference => reference.resource).filter((value,index,array)=>array.indexOf(value)===index);
    }

    addReference(po:SkosPredicateObject, resource:SkosResource, iconDefinition?:IconDefinition){
        this.references.push({
            resource,
            external:false,
            predicateObject:po,
            iconDefinition
        });
        if (resource === this){return;}
        resource.references.push({
            resource: this,
            external: true,
            predicateObject:po,
            iconDefinition
        });
    }

    evaluatePredicateObjects(){
        this.predicateObjects.forEach(po => {
            if (!po.predicate || !po.object) {return;}
            let predicateText = po.predicate.getPrefixResolvedText();
            let objectText = po.object.getPrefixResolvedText();
            //icon evaluation
            let iconDefinition:IconDefinition|undefined;
            iconDefinitions.forEach(definition => {
                let definitionPredicates=definition.rule.predicate && (Array.isArray(definition.rule.predicate) && definition.rule.predicate || [definition.rule.predicate]);
                if (definition.rule.subject && definition.rule.subject !== this.id){return;}
                if (definition.rule.predicate && !definitionPredicates?.includes(predicateText)){return;}
                if (definition.rule.object && definition.rule.object !== objectText){return;}
                if (definition.target === "subject"){
                    this.addReference(po,this,definition);
                } else if (definition.target === "object"){
                    iconDefinition = definition;
                }
            });

            po.predicate.evaluateType(predicateText);
            if (po.predicate.type === SkosPredicateType.Unclassified){
                if (!po.object.literal){
                    let o = prefixManager.resolve(po.document.uri, objectText);
                    let or = o && skosResourceManager.resources[o];
                    if (or){
                        this.addReference(po,or,iconDefinition);          
                    }
                }    
                return;      
            }
            switch(po.predicate.type){
                case SkosPredicateType.Broader:
                case SkosPredicateType.Narrower:
                case SkosPredicateType.InScheme:
                case SkosPredicateType.HasTopConcept:
                case SkosPredicateType.Member: {
                    this.addReference(po,skosResourceManager.getResource(po.object),iconDefinition);
                    break;
                }
                case SkosPredicateType.Notation: {
                    this.notations.push(po.object);
                    break;
                }
                case SkosPredicateType.Type: {
                    switch(objectText){
                        case iridefs.concept: this.types.push(SkosSubjectType.Concept);break;
                        case iridefs.conceptScheme: this.types.push(SkosSubjectType.ConceptScheme);break;
                        case iridefs.collection: this.types.push(SkosSubjectType.Collection);break;
                    }
                    break;
                }
            }
        });
    }

    getSubtree(result:SkosResource[]=[]):SkosResource[]{
        if (result.includes(this)){return result;}
        result.push(this);
        let narrowers = this.narrowers();
        for (let narrower of narrowers) {
            narrower.getSubtree(result);
        }
        return result;
    }

    removeIntersectingoccurences(locations:vscode.Location[]):void{
        this.withAlloccurences(occurence => {
            for (let location of locations){
                if (occurence.document.uri.fsPath === location.uri.fsPath
                    && location.range.intersection(occurence.location().range)){
                    return true;
                }
            }
            return false;
        },true);
    }

    private withAlloccurencesOfArray(array:Occurence[],callback:(occurence:Occurence)=>void|boolean,callbackIsDeleteCondition=false){
        for (let i = array.length-1; i >= 0; i--){
            if (callback(array[i]) && callbackIsDeleteCondition){
                array.splice(i,1);
            }
        }  
    }
    withAlloccurences(callback:(occurence:Occurence)=>void|boolean,callbackIsDeleteCondition=false):void{
        this.withAlloccurencesOfArray(this.idOccurences,callback,callbackIsDeleteCondition);
        this.withAlloccurencesOfArray(this.notations,callback,callbackIsDeleteCondition);
        this.withAlloccurencesOfArray(this.occurences,callback,callbackIsDeleteCondition);
        this.references.map(r => r.predicateObject).concat(this.predicateObjects).forEach(po => {
            if (po.predicate && callback(po.predicate) && callbackIsDeleteCondition){
                delete po.predicate;
            }
            if (po.object){
                if (po.object.literal && callback(po.object.literal) && callbackIsDeleteCondition){
                    delete po.object.literal;
                }
                if (po.object.lang && callback(po.object.lang) && callbackIsDeleteCondition){
                    delete po.object.lang;
                }
                if (callback(po.object) && callbackIsDeleteCondition){
                    delete po.object;
                }
            }
        });
        this.withAlloccurencesOfArray(this.references.map(r => r.predicateObject),callback,callbackIsDeleteCondition);
        this.withAlloccurencesOfArray(this.predicateObjects,callback,callbackIsDeleteCondition);
    }

    adjustLocations(changeEvents: vscode.TextDocumentChangeEvent[]){
        this.withAlloccurences(occ => adjustOccurence(occ,changeEvents));
    }

    addDescriptions() {            
        let pathMarkdown = "";
        let pathsArray = this.getLabelPaths();
        pathsArray.forEach(path => {
            for (let i = path.length-1; i>=0; i--){
                for (let j=path.length-1;j>=i;j--){
                    pathMarkdown+="    ";
                }
                pathMarkdown+="- "+path[i]+"\n";
            }	
        });

        let mds = new vscode.MarkdownString();
        let label = this.getLabel();
        mds.appendMarkdown(label+"\n---\n");
        mds.appendMarkdown(pathMarkdown);
        this.description=mds;
    }

    private getLabelPaths():string[][] {
        return this.getParentPaths().map(path => path.map(resource => resource.getLabel()));
    }

    private getParentPaths(path:SkosResource[]=[]):SkosResource[][]{
        if (path.includes(this)){return [path];}
        let result:SkosResource[][]=[];
        path = path.concat([this]);
        let parents = this.parents();
        parents.forEach(parent => {
            result = result.concat(parent.getParentPaths(path));
        });
        if (parents.length === 0){
            result.push(path);
        }
        return result;
    }

    getLabel():string{
        let labels = <string[]>this.predicateObjects
            .filter(po => po.predicate.type === SkosPredicateType.Label && po.object.lang?.getText()==="en")
            .map(po => po.object.literal?.getText())
            .filter(label => label !== undefined);
        return labels.length>0&&labels[0] || this.id;
    }
}

export class Occurence {
    document:TurtleDocument;
    documentOffset:{
        start:number;
        end:number;
    }={
        start:0,
        end:0
    };
    location():vscode.Location{
        let range:vscode.Range;
        if (!this.document.vscDocument){
            range = new vscode.Range(
                new vscode.Position(0,0),
                new vscode.Position(0,0)
            );
        } else {
            range = new vscode.Range(
                this.document.vscDocument?.positionAt(this.documentOffset.start),
                this.document.vscDocument?.positionAt(this.documentOffset.end)
            );
        }
        return new vscode.Location(this.document.uri,range);
    }

    constructor(uri:vscode.Uri,documentOffset:{start:number;end:number;}){
        this.document=turtleDocuments.get(uri);
        this.documentOffset = documentOffset;
    }
    async init(){
        await this.document.init();
        return this;
    }

    getText():string{
        return this.document.text?.substring(this.documentOffset.start,this.documentOffset.end) || "";
    }
    getPrefixResolvedText():string{
        let t = this.getText();
        return prefixManager.resolve(this.document.uri,t) || t;
    }

    async getSubOccurencesOfMatchAndGroups(regexp:RegExp,onlyFirstMatch=false):Promise<GetSubOccurencesOfMatchAndGroupsResult[]>{
        let textWithComments = this.getText();
        let removeCommentsResult = removeComments(textWithComments);
        let result:GetSubOccurencesOfMatchAndGroupsResult[]=[];

        regexp.lastIndex=-1;
        let match:RegExpExecArray|null;
        while (match = regexp.exec(removeCommentsResult.text)){
            let offset_start = this.documentOffset.start + this.adjustOffsetWithCommentOffsets(match.index,removeCommentsResult.comment_offsets);
            let offset_end = this.documentOffset.start + this.adjustOffsetWithCommentOffsets(match.index+match[0].length,removeCommentsResult.comment_offsets);
            let subresult:GetSubOccurencesOfMatchAndGroupsResult = {
                matchOccurence: await new Occurence(
                    this.document.uri,
                    {
                        start: offset_start,
                        end:offset_end
                    }
                ).init(),
                groupsOccurences:{}
            };
            if (match.groups){
                for (let group of Object.keys(match.groups)){
                    let groupmatch = (<{[key: string]: string;}>(<RegExpExecArray>match).groups)[group];
                    if (!groupmatch){continue;}
                    let offset_start = this.documentOffset.start + this.adjustOffsetWithCommentOffsets(
                        match.index + match[0].indexOf(groupmatch),
                        removeCommentsResult.comment_offsets
                    );
                    let offset_end = this.documentOffset.start + this.adjustOffsetWithCommentOffsets(
                        match.index + match[0].indexOf(groupmatch) + groupmatch.length,
                        removeCommentsResult.comment_offsets
                    );
                    subresult.groupsOccurences[group] = await new Occurence(
                        this.document.uri,
                        {
                            start: offset_start,
                            end:offset_end
                        }
                    ).init();
                }
            }
            result.push(subresult);
            if (!regexp.global || onlyFirstMatch){
                break;
            }
        }

        return result;
    }

    adjustOffsetWithCommentOffsets(offset:number,comment_offsets: {
        start: number,
        end: number
    }[]):number{
        for (let i = 0; i < comment_offsets.length; i++){
            if (comment_offsets[i].start < offset){
                offset += comment_offsets[i].end - comment_offsets[i].start;
            }
        }
        return offset;
    }
}

interface SkosReference {
    resource:SkosResource;
    external:boolean;
    predicateObject:SkosPredicateObject;
    iconDefinition?:IconDefinition;
}

interface GetSubOccurencesOfMatchAndGroupsResult {
    matchOccurence: Occurence;
    groupsOccurences:{[id:string]: Occurence};
}

export class SkosPredicateObject extends Occurence {
    predicate:SkosPredicate;
    object:SkosObject;
    constructor(uri:vscode.Uri,documentOffset:{start:number,end:number}, predicate:SkosPredicate,object:SkosObject){
        super(uri,documentOffset);
        this.predicate = predicate;
        this.object = object;
    }
}

export class SkosPredicate extends Occurence{
    type:SkosPredicateType=SkosPredicateType.Unclassified;
    evaluateType(predicateText?:string):void {
        let text = predicateText || this.getPrefixResolvedText() || "";
        switch(text){
            case iridefs.broader: this.type = SkosPredicateType.Broader; break;
            case iridefs.inScheme: this.type = SkosPredicateType.InScheme; break;
            case iridefs.member: this.type = SkosPredicateType.Member; break;
            case iridefs.narrower: this.type = SkosPredicateType.Narrower; break;
            case iridefs.notation: this.type = SkosPredicateType.Notation; break;
            case iridefs.prefLabel: this.type = SkosPredicateType.Label; break;
            case iridefs.topConceptOf: this.type = SkosPredicateType.InScheme; break;
            case iridefs.hasTopConcept: this.type = SkosPredicateType.HasTopConcept; break;
            case iridefs.type: this.type = SkosPredicateType.Type; break;
        }
    }
}

export class SkosObject extends Occurence{
    literal?:Occurence;
    lang?:Occurence;
    type:SkosObjectType=SkosObjectType.Unclassified;
}

export enum SkosObjectType {
    Unclassified,
    Literal,
    Iri,
    Numeric,
    Boolean
}

class PrefixManager{
    prefixes:Prefix[]=[];
    
    apply(uri:vscode.Uri,s:string):string|undefined{        
        let matchingPrefix = this.prefixes.filter(p => p.uri === uri && s.startsWith(p.long.substring(0,p.long.length-1)));
        if (matchingPrefix.length>0){
            let prefix = matchingPrefix[0];
            let result = s.replace(prefix.long.substring(0,prefix.long.length-1),prefix.short);
            return result.substr(0,result.length-1);
        }
    }

    resolve(uri:vscode.Uri,s:string):string|undefined{        
        if (s === "a"){return iridefs.type;}
        let matchingPrefix = this.prefixes.filter(p => p.uri===uri && s.startsWith(p.short));
        if (matchingPrefix.length>0) {
            let prefix = matchingPrefix[0];
            let end = s.substr(prefix.short.length);
            return prefix.long.substr(0,prefix.long.length-1)+end+">";
        }
    }

    getSkosPrefix(uri:vscode.Uri):string|undefined{
        let prefix = this.prefixes.filter(p => p.uri === uri && p.long === iridefs.skosBase);
        return prefix[0]?.short;
    }

    addPrefix(uri:vscode.Uri, short:string, long:string){
        this.prefixes.push(new Prefix(uri,short,long));
    }

    getShortByLong(uri:vscode.Uri, long:string):string|undefined{
        let matches = this.prefixes.filter(p => p.uri === uri && p.long === long);
        return matches && matches[0] && matches[0].short;
    }

    getPrefixByShortCandidate(uri:vscode.Uri, candidate:string):Prefix|undefined{
        let candidateStart = candidate.substring(0,candidate.indexOf(":")+1);
        let matches = this.prefixes.filter(p => p.short === candidateStart);
        return matches && matches[0];
    }
}

export const prefixManager = new PrefixManager();

class Prefix{
    uri: vscode.Uri;
    short: string;
    long: string;
    constructor(uri:vscode.Uri, short:string, long:string){
        this.uri = uri;
        this.short = short;
        this.long = long;
    }
}

export enum SkosPredicateType {
    Unclassified,
    Type,
    Label,
    Notation,
    Broader,
    InScheme,
    HasTopConcept,
    Narrower,
    Member
}

export enum SkosSubjectType {
    Unclassified,
    Concept,
    ConceptScheme,
    Collection
}

export function getEmptySkosSubject(concept:{}):ISkosResource{
    return {
        concept:concept,
        statements:[],
        children:[],
        parents:[],
        virtual:true,
        description:new vscode.MarkdownString(""),
        occurences:[],
        treeviewNodes:[]
    };
}

export interface ISkosResource {
    concept:{};
    statements:{}[];
	children:ISkosResource[];
	parents:ISkosResource[];
	virtual?:boolean;
	description:vscode.MarkdownString;
	treeviewNodes:SkosNode[];
	occurences:{
        location:vscode.Location,
        documentOffset:{
            start:number;
            end:number;
        }
    }[];
    icon?:string;
}