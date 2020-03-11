import * as vscode from 'vscode';
import { SkosResource, getStatementsByPredicate } from './subjecthandler';
import { iridefs, IRIREF, LocatedPredicateObject } from './parser';

export class SemanticHandler {
    diagnosticCollection = vscode.languages.createDiagnosticCollection("Semantic Diagnostics");
    uris: vscode.Uri[]=[];
    diagnostics : { [id: string ] : vscode.Diagnostic[]; } = {};

    reset(){      
        this.uris.forEach(uri => {
            this.diagnosticCollection.set(uri, []);
        });
        this.uris = [];
        this.diagnostics={};
    }

    private addDiagnostic(location:vscode.Location,severity:vscode.DiagnosticSeverity,message:string){
        if (!this.uris.includes(location.uri)){
            this.uris.push(location.uri);
            this.diagnostics[location.uri.fsPath]=[];
        }
        this.diagnostics[location.uri.fsPath].push(new vscode.Diagnostic(location.range, message, severity));
        this.uris.forEach(uri => {
            this.diagnosticCollection.set(uri, this.diagnostics[uri.fsPath]);
        });
    }

    checkSemantics(mergedSkosSubjects: { [id: string]: SkosResource; }){
        Object.keys(mergedSkosSubjects).forEach(key => {
            let s = mergedSkosSubjects[key];
            let probablySkosResource = s.statements.filter(statement => statement.predicate.text.startsWith(iridefs.skosBase.substring(0,iridefs.skosBase.length-1))).length > 0;

            //type check
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

            //label check
            if (probablySkosResource) {
                let labels = getStatementsByPredicate(iridefs.prefLabel,s);
                labels.map(l => l.object.lang).filter((value,index,array)=>array.indexOf(value)===index).forEach(lang => {
                    let langMatchingLabels = labels.filter(l => l.object.lang === lang).filter((value,index,self)=>self.map(s => s.object.text).indexOf(value.object.text)===index);
                    if (langMatchingLabels.length > 1) {
                        langMatchingLabels.forEach(label => {
                            this.addDiagnostic(label.object.location,vscode.DiagnosticSeverity.Error,"The 'skos:prefLabel' for this resource and language '"+lang+"' has been declared more than once.");
                        });
                    }
                });
                if (labels.filter(l => l.object.lang==="en").length === 0){  
                    s.occurances.forEach(occ => {
                        this.addDiagnostic(occ.location,vscode.DiagnosticSeverity.Warning,"No english 'skos:prefLabel' defined.");                    
                    });
                }
            }

            //prefix check
            let regex = new RegExp("^"+IRIREF+"$");
            if (!s.concept.text.startsWith("_BLANK")&&!regex.exec(s.concept.text)){
                s.concept.locations?.forEach(l => {
                    this.addDiagnostic(l,vscode.DiagnosticSeverity.Error,"Prefix not found for '"+s.concept.text+"'.");
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

            //duplicate check
            let duplicates = s.statements.filter((value,index,self)=>self.map(s => s.predicate.text + " " + s.object.text).indexOf(value.predicate.text + " " + value.object.text) !== index);
            duplicates.forEach(d => {
                this.addDiagnostic(d.location,vscode.DiagnosticSeverity.Information,"Duplicate entry '"+d.text+"'.");
            });

            //recursion check
            let loops = this.getAncestorLoops(s,mergedSkosSubjects);
            loops.forEach(loop => {
                loop.forEach(a => {
                    if (this.diagnosticCollection.get(a.statement.location.uri)?.filter(d => d.message.startsWith("Hierarchical recursion:") 
                        && d.range.start.line === a.statement.location.range.start.line
                        && d.range.start.character === a.statement.location.range.start.character
                        && d.range.end.line === a.statement.location.range.end.line
                        && d.range.end.character === a.statement.location.range.end.character
                    ).length === 0){
                        this.addDiagnostic(a.statement.location,vscode.DiagnosticSeverity.Error,"Hierarchical recursion: "+loop.map(a => a.resource.concept.text).join(","));
                    }                    
                });
            });
        });
    }

    customHierarchicalReferencePredicatesNarrower:string[] = vscode.workspace.getConfiguration().get("skos-ttl-editor.customHierarchicalReferencePredicatesNarrower") || [];
    customHierarchicalReferencePredicatesBroader:string[] = vscode.workspace.getConfiguration().get("skos-ttl-editor.customHierarchicalReferencePredicatesBroader") || [];
    predicatesNarrower = [ iridefs.narrower, iridefs.member, iridefs.hasTopConcept ].concat(this.customHierarchicalReferencePredicatesNarrower);
    predicatesBroader = [ iridefs.broader, iridefs.topConceptOf ].concat(this.customHierarchicalReferencePredicatesBroader);

    getBroaderResourcesByStatements(s:SkosResource,mergedSkosSubjects: { [id: string]: SkosResource; }):{resource:SkosResource,statement:LocatedPredicateObject}[]{
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
    getAncestorLoops(s:SkosResource,mergedSkosSubjects: { [id: string]: SkosResource; },path:{resource:SkosResource,statement:LocatedPredicateObject}[]=[],loops:{resource:SkosResource,statement:LocatedPredicateObject}[][]=[]):{resource:SkosResource,statement:LocatedPredicateObject}[][]{
        this.getBroaderResourcesByStatements(s,mergedSkosSubjects).forEach(b => {   
            if (path.length > 0 && path[0].resource === b.resource && path[0].statement === b.statement)
            {
                loops.push(path);
            } else {
                this.getAncestorLoops(b.resource,mergedSkosSubjects,path.concat(b),loops);
            }
        });
        return loops;
    }
}