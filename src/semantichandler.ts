import * as vscode from 'vscode';
import { SkosSubject, SubjectHandler } from './subjecthandler';

export class SemanticHandler {
    diagnosticCollection = vscode.languages.createDiagnosticCollection("Semantic Diagnostics");
    uris: vscode.Uri[]=[];
    diagnostics : { [id: string ] : vscode.Diagnostic[]; } = {};

    reset(){
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

    checkSemantics(mergedSkosSubjects: { [id: string]: SkosSubject; }){
        Object.keys(mergedSkosSubjects).forEach(key => {
            let sss = mergedSkosSubjects[key];
            Object.keys(sss.labels).forEach(lang => {
                if (sss.labels[lang].length > 1) {
                    sss.labels[lang].forEach(label => {
                        this.addDiagnostic(label.location,vscode.DiagnosticSeverity.Error,"The 'skos:prefLabel' for this resource and language '"+lang+"' has been declared more than once.");
                    });
                }
            });
            if (!Object.keys(sss.labels).includes("en")){  
                sss.occurances.forEach(occ => {
                    this.addDiagnostic(occ.location,vscode.DiagnosticSeverity.Warning,"No english 'skos:prefLabel' defined.");                    
                });
            }
        });
    }
}