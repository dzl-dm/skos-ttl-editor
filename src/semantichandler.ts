import * as vscode from 'vscode';
import { SkosResource, getStatementsByPredicate } from './skosresourcehandler';
import { iridefs, IRIREF, LocatedPredicateObject } from './parser';

export class SemanticHandler {
    diagnosticCollection = vscode.languages.createDiagnosticCollection("Semantic Diagnostics");
    uris: vscode.Uri[]=[];
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

    private removeDiagnostics(resources:SkosResource[],messageStartStringFilter?:string){
        resources.forEach(r => {
            r.occurances.forEach(occ => {
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

    private appendDiagnosticRelatedResources(mergedSkosSubjects: { [id: string]: SkosResource; },conceptsToUpdate:SkosResource[]){
        conceptsToUpdate.forEach(r => {
            r.occurances.forEach(occ => {
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
    async checkSemantics(mergedSkosSubjects: { [id: string]: SkosResource; }, withprogress?:{
        progress:vscode.Progress<{
            message?: string | undefined;
            increment?: number | undefined;
        }>,
        ticks:number
    },conceptsToUpdate?:SkosResource[]){
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

    private typeCheck(mergedSkosSubjects: { [id: string]: SkosResource; },conceptsToUpdate?:SkosResource[]){
        Object.keys(mergedSkosSubjects).forEach(key => {
            if (conceptsToUpdate && !conceptsToUpdate.map(x => x.concept.text).includes(key)){return;}
            let s = mergedSkosSubjects[key];
            let probablySkosResource = s.statements.filter(statement => statement.predicate.text.startsWith(iridefs.skosBase.substring(0,iridefs.skosBase.length-1))).length > 0;

            let skosTypes = getStatementsByPredicate(iridefs.type,s)
                .filter(t => [iridefs.conceptScheme,iridefs.collection,iridefs.concept].includes(t.object.text))
                .filter((value,index,self) => self.map(x => x.object.text).indexOf(value.object.text) === index);
            if (skosTypes.length === 0 
                && probablySkosResource) {
                s.occurances.forEach(occ => {
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

    private labelCheck(mergedSkosSubjects: { [id: string]: SkosResource; },conceptsToUpdate?:SkosResource[]){
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
                    s.occurances.forEach(occ => {
                        this.addDiagnostic(occ.location,vscode.DiagnosticSeverity.Warning,"No english 'skos:prefLabel' defined.");                    
                    });
                }
            }
        });
    }

    private prefixCheck(mergedSkosSubjects: { [id: string]: SkosResource; },conceptsToUpdate?:SkosResource[]){
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

    private duplicateCheck(mergedSkosSubjects: { [id: string]: SkosResource; },conceptsToUpdate?:SkosResource[]){
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

    private recursionCheck(mergedSkosSubjects: { [id: string]: SkosResource; },conceptsToUpdate?:SkosResource[]){
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

    private getBroaderResourcesByStatements(s:SkosResource,mergedSkosSubjects: { [id: string]: SkosResource; }):{resource:SkosResource,statement:LocatedPredicateObject}[]{
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
    loops:{resource:SkosResource,statement:LocatedPredicateObject}[][]=[];
    private getAncestorLoops(
        s:SkosResource,
        mergedSkosSubjects: { [id: string]: SkosResource; },
        path:{resource:SkosResource,statement:LocatedPredicateObject}[]=[]
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
    }
}