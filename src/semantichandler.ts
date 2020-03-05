import * as vscode from 'vscode';
import { SkosResource, getStatementsByPredicate } from './subjecthandler';
import { iridefs, IRIREF } from './parser';

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
                this.addDiagnostic(d.location,vscode.DiagnosticSeverity.Information,"Duplicate entry.");
            });

            //recursion check
            let customHierarchicalReferencePredicatesNarrower:string[] = vscode.workspace.getConfiguration().get("skos-ttl-editor.customHierarchicalReferencePredicatesNarrower") || [];
            let customHierarchicalReferencePredicatesBroader:string[] = vscode.workspace.getConfiguration().get("skos-ttl-editor.customHierarchicalReferencePredicatesBroader") || [];
            let predicatesNarrower = [ iridefs.narrower, iridefs.member ].concat(customHierarchicalReferencePredicatesNarrower);
            let predicatesBroader = [ iridefs.broader, iridefs.inScheme ].concat(customHierarchicalReferencePredicatesBroader);
            getStatementsByPredicate(predicatesBroader,s).forEach(b => {
                let broaterSkosResource = mergedSkosSubjects[b.object.text];
                getStatementsByPredicate(predicatesBroader,broaterSkosResource).forEach(x => {
                    if (x.object.text === s.concept.text){
                        this.addDiagnostic(x.location,vscode.DiagnosticSeverity.Error,"Recursive hierarchical relation.");
                    }
                });
                getStatementsByPredicate(predicatesNarrower,s).forEach(x => {
                    if (x.object.text === b.object.text){
                        this.addDiagnostic(b.location,vscode.DiagnosticSeverity.Error,"Recursive hierarchical relation.");
                        this.addDiagnostic(x.location,vscode.DiagnosticSeverity.Error,"Recursive hierarchical relation.");
                    }
                });
            });
            getStatementsByPredicate(predicatesNarrower,s).forEach(n => {
                let narrowerSkosResource = mergedSkosSubjects[n.object.text];
                getStatementsByPredicate(predicatesNarrower,narrowerSkosResource).forEach(x => {
                    if (x.object.text === s.concept.text){
                        this.addDiagnostic(x.location,vscode.DiagnosticSeverity.Error,"Recursive hierarchical relation.");
                    }
                });
            });
        });
    }
}