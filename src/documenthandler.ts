import * as vscode from 'vscode';
import { SkosResource, SubjectHandler } from './subjecthandler';
import { SkosParser } from './parser';

export class DocumentHandler { 
    subjectHandler:SubjectHandler;
    parser:SkosParser;
    constructor(subjectHandler:SubjectHandler,parser:SkosParser){
        this.subjectHandler=subjectHandler;
        this.parser=parser;
    } 
    async insertText(sss:SkosResource[]|SkosResource, text:string, type:"append"|"after"):Promise<any>{
        return new Promise(async (resolve,reject)=>{
            let concepts = (<SkosResource[]>(sss instanceof Array && sss || [sss])).filter(s => s.occurances.length > 0).sort((a,b)=>{
                if (a.occurances[0].location.uri.fsPath > b.occurances[0].location.uri.fsPath) {
                    return -1;
                }
                else if (a.occurances[0].location.uri.fsPath < b.occurances[0].location.uri.fsPath) {
                    return 1;
                }
                if (a.occurances[0].location.range.start.line > b.occurances[0].location.range.start.line) {
                    return -1;
                }
                else if (a.occurances[0].location.range.start.line < b.occurances[0].location.range.start.line) {
                    return 1;
                }
                else if (a.occurances[0].location.range.start.character > b.occurances[0].location.range.start.character) {
                    return -1;
                }
                else if (a.occurances[0].location.range.start.character < b.occurances[0].location.range.start.character) {
                    return 1;
                }
                else {
                    return 0;
                }
            });
            let documentUris = concepts.filter(c => c.occurances.length > 0).map(c => c.occurances[0].location.uri).filter((v,i,a)=>a.map(u => u.fsPath).indexOf(v.fsPath)===i);
            let inserts:{
                    uri:vscode.Uri,
                    position:vscode.Position,
                    textBefore:string,
                    textAfter:string
                }[] = <{
                    uri:vscode.Uri,
                    position:vscode.Position,
                    textBefore:string,
                    textAfter:string
                }[]>concepts.filter(c => {
                    if (c.occurances.length === 0 && type === "append") { vscode.window.showErrorMessage(this.subjectHandler.getLabel(c) + " occurs nowhere."); return false; }
                    if (c.occurances.length === 0 && type === "after" && !vscode.window.activeTextEditor) { vscode.window.showErrorMessage("No open editor to insert."); return false; }
                    return true;
                }).map(c => {
                    if (c.occurances.length === 0 && type === "after") { 
                        let editor = <vscode.TextEditor>vscode.window.activeTextEditor;
                        documentUris.push(editor.document.uri);
                        return new vscode.Location(editor.document.uri,new vscode.Position(editor.document.lineCount-1,editor.document.lineAt(editor.document.lineCount-1).text.length));
                    }
                    return c.occurances[0].location;
                }).map(l => {
                    if (type==="append") {
                        return {
                            uri: l.uri,
                            position: new vscode.Position(l.range.end.line,l.range.end.character),
                            textBefore: "",
                            textAfter: "\n"
                        };
                    } else if (type==="after") {
                        return {
                            uri: l.uri,
                            position: new vscode.Position(l.range.end.line, l.range.end.character),
                            textBefore: ".\n\n",
                            textAfter: ""
                        };
                    } else {
                        return {
                            uri: l.uri,
                            position: new vscode.Position(0,0),
                            textAfter: "",
                            textBefore: ""
                        };
                    }
            });
            for (let i = 0; i < documentUris.length; i++){
                let du = documentUris[i];
                await this.openTextDocument(du).then(doc => {
                    if (!doc){return;}
                    return this.showTextDocument(doc).then((editor)=>{
                        if (!editor){return;}
                        inserts.filter(i => i.uri.fsPath === doc.uri.fsPath).forEach(i => {
                            editor.insertSnippet(new vscode.SnippetString(i.textBefore+this.parser.applyPrefixesOnText(text,doc)+i.textAfter),i.position);
                        });
                        /*return editor.edit(editBuilder => {
                            inserts.filter(i => i.uri.fsPath === doc.uri.fsPath).forEach(i => {
                                editBuilder.insert(i.position,i.textBefore+this.parser.applyPrefixesOnText(text,doc)+i.textAfter);
                            });
                        });*/
                    });
                });
            }
            resolve();
        });
    }

    private openTextDocument(uri:vscode.Uri):Thenable<vscode.TextDocument|undefined>{
        let matchingDocs = vscode.window.visibleTextEditors.map(te => te.document).filter(d => d.uri.fsPath === uri.fsPath);
        let opening:Thenable<vscode.TextDocument|undefined> = Promise.resolve(matchingDocs[0]);
        if (matchingDocs.length === 0){
            opening = vscode.workspace.openTextDocument(uri);
        }
        return opening;
    }

    private showTextDocument(document:vscode.TextDocument):Thenable<vscode.TextEditor|undefined>{
        let showing:Thenable<vscode.TextEditor|undefined> = Promise.resolve(vscode.window.activeTextEditor);
        if (document){
            showing = vscode.window.showTextDocument(document);
        }
        return showing;
    }

    selectSingleTextSnippet(location:vscode.Location):Promise<any>{
        return new Promise((resolve,reject)=>{
            this.openTextDocument(location.uri).then(doc => {
                if (!doc){return;}
                return this.showTextDocument(doc).then((editor)=>{
                    if (!editor){return;}
                    editor.revealRange(location.range);
                    editor.selections = [new vscode.Selection(
                        new vscode.Position(location.range.start.line,0),
                        location.range.end)];
                    resolve();
                });
            });
        });
    }
}