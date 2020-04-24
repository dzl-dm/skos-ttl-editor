import * as vscode from 'vscode';
import { Occurence, SkosResource, SkosPredicateType, SkosObject, SkosSubjectType, SkosPredicateObject, SkosObjectType } from './skosresourcehandler';
import { iridefs, IRIREF } from './parser';

let diagnosticCollection = vscode.languages.createDiagnosticCollection("Semantic Diagnostics");

let diagnostics: {
    diagnostic: vscode.Diagnostic,
    occurence: Occurence,
    resource: SkosResource
}[]=[];

export function getDiagnostics(){
    return diagnostics;
}

function addDiagnostic(
    resource:SkosResource,
    occurence:Occurence,
    severity:vscode.DiagnosticSeverity,
    message:string,
    related?:{
        occurence:Occurence,
        message?:string
    }[]
){
    let diagnostic = new vscode.Diagnostic(occurence.location().range, message, severity);
    diagnostics.push({diagnostic,occurence,resource});
    if (related){
        diagnostic.relatedInformation = related.map(r => {
            return new vscode.DiagnosticRelatedInformation(r.occurence.location(),r.message||r.occurence.getText());
        });
    }
}

function refreshDiagnostics(){
    diagnosticCollection.clear();
    diagnostics.map(d => d.occurence.document.uri).filter((value,index,array)=>array.indexOf(value)===index).forEach(uri => {
        diagnosticCollection.set(uri, diagnostics.filter(d => d.occurence.document.uri.fsPath === uri.fsPath).map(d => d.diagnostic));
    });
}

export function resetDiagnostics(resources?:SkosResource[]){
    if (resources){
        let resourceIds=resources.map(r => r.id);
        diagnostics = diagnostics.filter(d => !resourceIds.includes(d.resource.id));
    } else {
        diagnostics=[];
    }
    refreshDiagnostics();
}

export function refreshDiagnosticsRanges(){
    diagnostics.forEach(d => d.diagnostic.range = d.occurence.location().range);
}

export async function checkSemantics(resources:SkosResource[],progressReport?:(percentage:number,message?:string)=>Promise<any>){
    //TODO: werden teilweise mehrfach hinzugefügt 
    if (progressReport){progressReport(0,"Label Check");}
    labelCheck(resources);
    if (progressReport){progressReport(20,"Type Check");}
    typeCheck(resources);
    if (progressReport){progressReport(40,"Prefix Check");}
    prefixCheck(resources);
    if (progressReport){progressReport(60,"Duplicate Check");}
    duplicateCheck(resources);
    if (progressReport){progressReport(80,"Recursion Check");}
    recursionCheck(resources);
    if (progressReport){progressReport(100);}
    refreshDiagnostics();
}

function labelCheck(resources:SkosResource[]){
    resources.forEach(resource => {
        let probablySkosResource = resource.predicateObjects.filter(po => po.predicate.type !== SkosPredicateType.Unclassified).length > 0;
        if (probablySkosResource){
            let labels:SkosObject[] = resource.predicateObjects.filter(po => po.predicate.type === SkosPredicateType.Label).map(po => po.object);
            let langs = labels.map(l => l.lang?.getText());
            let literals = labels.map(l => l.literal?.getText());
            langs.forEach((value,index,array)=>{
                if (array.filter((x,i) => x === value && literals[index] !== literals[i]).length > 0){
                    addDiagnostic(
                        resource,
                        labels[index],
                        vscode.DiagnosticSeverity.Error,
                        "The 'skos:prefLabel' for this resource and language '"+value+"' has been declared more than once.",
                        array.map((x,i) => {
                            return {
                                occurence: labels[i],
                                message: literals[i] ||""
                            };
                        }).filter((x,i) => array[i] === value && i !== index)
                    );
                }
            }); 
            if (langs.filter(lang => lang?.toLowerCase() === "en").length === 0){
                resource.occurences.forEach(occurence => 
                    addDiagnostic(
                        resource,
                        occurence,
                        vscode.DiagnosticSeverity.Warning,
                        "No english 'skos:prefLabel' defined.",
                    )
                );
            }               
        }
    });        
}

function typeCheck(resources:SkosResource[]){
    resources.forEach(resource => {
        let probablySkosResource = resource.predicateObjects.filter(po => po.predicate.type !== SkosPredicateType.Unclassified).length > 0;
        if (probablySkosResource){
            let uniqueSubjectTypes = resource.types
                .filter(type => [SkosSubjectType.Concept,SkosSubjectType.Collection,SkosSubjectType.ConceptScheme].includes(type))
                .filter((value,index,array)=>array.indexOf(value)===index);
            if (uniqueSubjectTypes.length === 0){
                resource.occurences.forEach(occurence => 
                    addDiagnostic(
                        resource,
                        occurence,
                        vscode.DiagnosticSeverity.Warning,
                        "No 'skos:ConceptScheme', 'skos:Collection' or 'skos:Concept' type defined.",
                    )
                );                    
            }
            if (uniqueSubjectTypes.length > 1){  
                let subjectTypes:SkosPredicateObject[] = resource.predicateObjects
                    .filter(po => po.predicate.type === SkosPredicateType.Type
                        && [iridefs.conceptScheme,iridefs.collection,iridefs.concept].includes(po.object.getPrefixResolvedText()));  
                subjectTypes.forEach((value,index,array)=>{
                    addDiagnostic(
                        resource,
                        subjectTypes[index],
                        vscode.DiagnosticSeverity.Error,
                        "Invalid SKOS type combination.",
                        array.map((x,i) => {
                            return {
                                occurence: subjectTypes[i]
                            };
                        }).filter((x,i) => i !== index)
                    );
                });                    
            }
        }
    });
}

function prefixCheck(resources:SkosResource[]){
    resources.forEach(resource => {
        let regex = new RegExp("^"+IRIREF+"$");
        if (!resource.id.startsWith("_BLANK")&&!regex.exec(resource.id)){
            resource.idOccurences.forEach(occurence => {
                addDiagnostic(
                    resource,
                    occurence,
                    vscode.DiagnosticSeverity.Error,
                    "Prefix not found for '"+resource.id+"'."
                );
            });
        }
        resource.predicateObjects.forEach(po => {
            if (!regex.exec(po.predicate.getPrefixResolvedText())){
                addDiagnostic(
                    resource,
                    po.predicate,
                    vscode.DiagnosticSeverity.Error,
                    "Prefix not found for '"+po.predicate.getText()+"'."
                );
            }
            if (po.object && po.object.type === SkosObjectType.Iri && !regex.exec(po.object.getPrefixResolvedText())){
                addDiagnostic(
                    resource,
                    po.object,
                    vscode.DiagnosticSeverity.Error,
                    "Prefix not found for '"+po.object.getText()+"'."
                );
            }
        });
    });
}

function duplicateCheck(resources:SkosResource[]){
    resources.forEach(resource => {
        let poTexts = resource.predicateObjects.map(r => r.predicate.getPrefixResolvedText()+" "+r.object.getPrefixResolvedText());
        resource.predicateObjects.forEach((value,index,array)=>{
            let duplicates = resource.predicateObjects.filter((v,i,a)=>index !== i && poTexts[i] === poTexts[index]);
            if (duplicates.length > 0){
                addDiagnostic(
                    resource,
                    value,
                    vscode.DiagnosticSeverity.Information,
                    "Duplicate entry.",
                    duplicates.map(x => {
                        return {
                            occurence: x
                        };
                    })
                );
            }
        });
    });
}

function recursionCheck(resources:SkosResource[]){
    checkedResources=[];
    resources.forEach(resource => {
        loops = [];
        getAncestorLoops(resource);
        loops.forEach(loop => {
            loop.forEach((po,index) => {
                addDiagnostic(
                    resource,
                    po,
                    vscode.DiagnosticSeverity.Error,
                    "Hierarchical recursion:",
                    loop.map(po2 => {
                        return {
                            occurence: po2
                        };
                    }).filter((po2,i)=>i !== index)
                );             
            });
        });

    });
}

let checkedResources:SkosResource[] = [];
let loops:SkosPredicateObject[][]=[];
function getAncestorLoops(
    resource:SkosResource,
    path:SkosPredicateObject[]=[]
){
    if (!checkedResources.includes(resource)){
        let broaders = resource.broaderReferences();
        for (let i = 0; i < broaders.length; i++){
            let b = broaders[i];
            if (path.includes(b.predicateObject))
            {
                loops.push(path.slice(path.indexOf(b.predicateObject)));
            } else {
                getAncestorLoops(b.resource,path.concat(b.predicateObject));
            }
        }
        checkedResources.push(resource);
    }
}

/*uris: vscode.Uri[]=[];
diagnostics : { [id: string ] : {
    diagnostic: vscode.Diagnostic,
    location: vscode.Location
}[]; } = {};

reset(){      
    this.uris.forEach(uri => {
        this.diagnosticCollection.set(uri, []);
    });
    this.uris = [];
    this.diagnostics={};
}

refreshDiagnosticsRanges(){
    Object.keys(this.diagnostics).forEach(key => {
        this.diagnostics[key].forEach(d => {
            d.diagnostic.range = d.location.range;
        });
    });
}
refreshDiagnostics(){
    this.uris.forEach(uri => {
        this.diagnosticCollection.set(uri, this.diagnostics[uri.fsPath].map(d => d.diagnostic));
    });
}

private addDiagnostic(location:vscode.Location,severity:vscode.DiagnosticSeverity,message:string,related?:{
    location:vscode.Location,
    id:string
}[]){
    if (!this.uris.includes(location.uri)){
        this.uris.push(location.uri);
        this.diagnostics[location.uri.fsPath]=[];
    }
    let dIndex = this.diagnostics[location.uri.fsPath].push({
        diagnostic: new vscode.Diagnostic(location.range, message, severity),
        location: location
    });
    if (related){
        this.diagnostics[location.uri.fsPath][dIndex-1].diagnostic.relatedInformation = related.map(r => {
            return new vscode.DiagnosticRelatedInformation(r.location,r.id);
        });
    }
}

private removeDiagnostics(resources:ISkosResource[],messageStartStringFilter?:string){
    resources.forEach(r => {
        r.occurences.forEach(occ => {
            let ds = this.diagnostics[occ.location.uri.fsPath];
            if (!ds){return;}
            for (let i = ds.length-1;i>=0;i--){
                let d = ds[i].diagnostic;
                if (occ.location.range.contains(d.range) && (!messageStartStringFilter || d.message.startsWith(messageStartStringFilter))){
                    ds.splice(i,1);
                }
            }
        });
    });
}

private appendDiagnosticRelatedResources(mergedSkosSubjects: { [id: string]: ISkosResource; },conceptsToUpdate:ISkosResource[]){
    conceptsToUpdate.forEach(r => {
        r.occurences.forEach(occ => {
            let ds = this.diagnostics[occ.location.uri.fsPath];
            if (!ds){return;}
            for (let i = ds.length-1;i>=0;i--){
                let d = ds[i].diagnostic;
                if (occ.location.range.contains(d.range) && d.relatedInformation) {
                    for (let j = 0; j < d.relatedInformation.length; j++){
                        if (!conceptsToUpdate.map(x => x.concept.text).includes(d.relatedInformation[j].message)
                            && mergedSkosSubjects[d.relatedInformation[j].message]){
                            conceptsToUpdate.push(mergedSkosSubjects[d.relatedInformation[j].message]);
                        }
                    }
                }
            }
        });
    });
}

wait = async () => await new Promise((resolve) => { setTimeout(() => { resolve(); }, 100); });
async checkSemantics(mergedSkosSubjects: { [id: string]: ISkosResource; }, withprogress?:{
    progress:vscode.Progress<{
        message?: string | undefined;
        increment?: number | undefined;
    }>,
    ticks:number
},conceptsToUpdate?:ISkosResource[]){
    if (conceptsToUpdate){
        this.appendDiagnosticRelatedResources(mergedSkosSubjects,conceptsToUpdate);
        this.removeDiagnostics(conceptsToUpdate);
    } else {
        this.reset();
    }
    this.refreshDiagnosticsRanges();
    withprogress?.progress.report({ increment: 0, message: "Semantic checks (type)" });
    await this.wait();
    this.typeCheck(mergedSkosSubjects,conceptsToUpdate);
    withprogress?.progress.report({ increment: Math.floor(withprogress.ticks/5), message: "Semantic checks (label)" });
    await this.wait();
    this.labelCheck(mergedSkosSubjects,conceptsToUpdate);
    withprogress?.progress.report({ increment: Math.floor(withprogress.ticks/5), message: "Semantic checks (prefix)" });
    await this.wait();
    this.prefixCheck(mergedSkosSubjects,conceptsToUpdate);
    withprogress?.progress.report({ increment: Math.floor(withprogress.ticks/5), message: "Semantic checks (duplicate)" });
    await this.wait();
    this.duplicateCheck(mergedSkosSubjects,conceptsToUpdate);
    withprogress?.progress.report({ increment: Math.floor(withprogress.ticks/5), message: "Semantic checks (recursion)" });
    await this.wait();
    this.recursionCheck(mergedSkosSubjects,conceptsToUpdate);
    this.refreshDiagnostics();
}

private typeCheck(mergedSkosSubjects: { [id: string]: ISkosResource; },conceptsToUpdate?:ISkosResource[]){
    Object.keys(mergedSkosSubjects).forEach(key => {
        if (conceptsToUpdate && !conceptsToUpdate.map(x => x.concept.text).includes(key)){return;}
        let s = mergedSkosSubjects[key];
        let probablySkosResource = s.statements.filter(statement => statement.predicate.text.startsWith(iridefs.skosBase.substring(0,iridefs.skosBase.length-1))).length > 0;

        let skosTypes = getStatementsByPredicate(iridefs.type,s)
            .filter(t => [iridefs.conceptScheme,iridefs.collection,iridefs.concept].includes(t.object.text))
            .filter((value,index,self) => self.map(x => x.object.text).indexOf(value.object.text) === index);
        if (skosTypes.length === 0 
            && probablySkosResource) {
            s.occurences.forEach(occ => {
                this.addDiagnostic(occ.location,vscode.DiagnosticSeverity.Warning,"No 'skos:ConceptScheme', 'skos:Collection' or 'skos:Concept' type defined.");                    
            });
        }
        if (skosTypes.length > 1){
            skosTypes.forEach(type => {
                this.addDiagnostic(type.object.location,vscode.DiagnosticSeverity.Error,"Invalid SKOS type combination: "+skosTypes.map(x => "'"+x.object.text+"'").join(",")+".");                    
            });
        }
    });
}

private labelCheck(mergedSkosSubjects: { [id: string]: ISkosResource; },conceptsToUpdate?:ISkosResource[]){
    Object.keys(mergedSkosSubjects).forEach(key => {
        if (conceptsToUpdate && !conceptsToUpdate.map(x => x.concept.text).includes(key)){return;}
        let s = mergedSkosSubjects[key];
        let probablySkosResource = s.statements.filter(statement => statement.predicate.text.startsWith(iridefs.skosBase.substring(0,iridefs.skosBase.length-1))).length > 0;
        if (probablySkosResource) {
            let labels = getStatementsByPredicate(iridefs.prefLabel,s);
            labels.map(l => l.object.lang).filter((value,index,array)=>array.indexOf(value)===index).forEach(lang => {
                let langMatchingLabels = labels.filter(l => l.object.lang === lang).filter((value,index,self)=>self.map(s => s.object.text).indexOf(value.object.text)===index);
                if (langMatchingLabels.length > 1) {
                    langMatchingLabels.forEach(label => {
                        this.addDiagnostic(label.object.location,
                            vscode.DiagnosticSeverity.Error,
                            "The 'skos:prefLabel' for this resource and language '"+lang+"' has been declared more than once.",
                            langMatchingLabels.filter(x => x !== label).map(x => {
                                return {
                                    location:x.object.location,
                                    id:x.object.text
                                };
                            })
                        );
                    });
                }
            });
            if (labels.filter(l => l.object.lang==="en").length === 0){  
                s.occurences.forEach(occ => {
                    this.addDiagnostic(occ.location,vscode.DiagnosticSeverity.Warning,"No english 'skos:prefLabel' defined.");                    
                });
            }
        }
    });
}

private prefixCheck(mergedSkosSubjects: { [id: string]: ISkosResource; },conceptsToUpdate?:ISkosResource[]){
    Object.keys(mergedSkosSubjects).forEach(key => {
        if (conceptsToUpdate && !conceptsToUpdate.map(x => x.concept.text).includes(key)){return;}
        let s = mergedSkosSubjects[key];
        let regex = new RegExp("^"+IRIREF+"$");
        if (!s.concept.text.startsWith("_BLANK")&&!regex.exec(s.concept.text)){
            s.concept.locations?.forEach(l => {
                this.addDiagnostic(l.location,vscode.DiagnosticSeverity.Error,"Prefix not found for '"+s.concept.text+"'.");
            });
        }
        s.statements.forEach(s => {
            if (!regex.exec(s.predicate.text)){
                this.addDiagnostic(s.predicate.location,vscode.DiagnosticSeverity.Error,"Prefix not found for '"+s.predicate.text+"'.");
            }
            if (!s.object.literal && !regex.exec(s.object.text)){
                this.addDiagnostic(s.object.location,vscode.DiagnosticSeverity.Error,"Prefix not found for '"+s.object.text+"'.");
            }
        });
    });
}

private duplicateCheck(mergedSkosSubjects: { [id: string]: ISkosResource; },conceptsToUpdate?:ISkosResource[]){
    Object.keys(mergedSkosSubjects).forEach(key => {
        if (conceptsToUpdate && !conceptsToUpdate.map(x => x.concept.text).includes(key)){return;}
        let s = mergedSkosSubjects[key];
        let duplicates = s.statements.filter((value,index,self)=>self.map(s => s.predicate.text + " " + s.object.text).filter(x => x === value.predicate.text + " " + value.object.text).length > 1);
        duplicates.forEach(d => {
            this.addDiagnostic(d.location,
                vscode.DiagnosticSeverity.Information,
                "Duplicate entry '"+d.text+"'.",
                duplicates.filter(x => x !== d).map(x => {
                    return {
                        location:x.object.location,
                        id:x.object.text
                    };
                })
            );
        });
    });
}

private recursionCheck(mergedSkosSubjects: { [id: string]: ISkosResource; },conceptsToUpdate?:ISkosResource[]){
    this.checkedResources=[];
    Object.keys(mergedSkosSubjects).forEach(key => {
        if (conceptsToUpdate && !conceptsToUpdate.map(x => x.concept.text).includes(key)){return;}
        let s = mergedSkosSubjects[key];
        this.loops = [];
        this.getAncestorLoops(s,mergedSkosSubjects);
        if (conceptsToUpdate) {
            this.removeDiagnostics(this.loops.reduce((prev,curr)=>prev=prev.concat(curr),[]).map(x => x.resource),"Hierarchical recursion:");
        }
        this.loops.forEach(loop => {
            loop.forEach(a => {
                let sameDiagnostics = this.diagnostics[a.statement.location.uri.fsPath]?.filter(d => 
                    d.diagnostic.message.startsWith("Hierarchical recursion:") 
                    && d.diagnostic.range.isEqual(a.statement.location.range)
                );
                if (!sameDiagnostics || sameDiagnostics.length === 0){
                    this.addDiagnostic(
                        a.statement.location,
                        vscode.DiagnosticSeverity.Error,
                        "Hierarchical recursion:",
                        loop.map(l => {
                            return {
                                location:l.statement.location,
                                id:l.resource.concept.text
                            };
                        })
                    );
                }                    
            });
        });
    });
}



private customHierarchicalReferencePredicatesNarrower:string[] = vscode.workspace.getConfiguration().get("skos-ttl-editor.customHierarchicalReferencePredicatesNarrower") || [];
private customHierarchicalReferencePredicatesBroader:string[] = vscode.workspace.getConfiguration().get("skos-ttl-editor.customHierarchicalReferencePredicatesBroader") || [];
private predicatesNarrower = [ iridefs.narrower, iridefs.member, iridefs.hasTopConcept ].concat(this.customHierarchicalReferencePredicatesNarrower);
private predicatesBroader = [ iridefs.broader, iridefs.topConceptOf ].concat(this.customHierarchicalReferencePredicatesBroader);

private getBroaderResourcesByStatements(s:ISkosResource,mergedSkosSubjects: { [id: string]: ISkosResource; }):{resource:ISkosResource,statement:LocatedPredicateObject}[]{
    let sBroaderX = s.statements.filter(statement => this.predicatesBroader.includes(statement.predicate.text))            
    .map(statement => {
            return {
                resource:mergedSkosSubjects[statement.object.text],
                statement:statement
            };
        });
    let xNarrowerS = Object.keys(mergedSkosSubjects).map(key => {
        return mergedSkosSubjects[key].statements
            .filter(statement => this.predicatesNarrower.includes(statement.predicate.text) && statement.object.text === s.concept.text)
            .map(statement => {
                return {
                    resource:mergedSkosSubjects[key],
                    statement:statement
                };
            }
        );
    }).reduce((prev,curr)=>prev = prev.concat(curr),[]);
    return sBroaderX.concat(xNarrowerS);
}

checkedResources:string[] = [];
loops:{resource:ISkosResource,statement:LocatedPredicateObject}[][]=[];
private getAncestorLoops(
    s:ISkosResource,
    mergedSkosSubjects: { [id: string]: ISkosResource; },
    path:{resource:ISkosResource,statement:LocatedPredicateObject}[]=[]
){
    if (!this.checkedResources.includes(s.concept.text)){
        let broaders = this.getBroaderResourcesByStatements(s,mergedSkosSubjects);
        for (let i = 0; i < broaders.length; i++){
            let b = broaders[i];
            let sameAsPathElement = path.map(p => p.resource === b.resource && p.statement === b.statement);
            if (sameAsPathElement.indexOf(true) > -1)
            {
                this.loops.push(path.slice(sameAsPathElement.indexOf(true)));
            } else {
                this.getAncestorLoops(b.resource,mergedSkosSubjects,path.concat(b));
            }
        }
        this.checkedResources.push(s.concept.text);
    }
}*/