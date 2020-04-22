import * as vscode from 'vscode';
import { ISkosResource, SkosResource, skosResourceManager, Occurence } from './skosresourcehandler';
import { applyPrefixesOnText } from './parser';

export class DocumentHandler { 
    constructor(){} 
    async insertText(resources:SkosResource[]|SkosResource, text:string, type:"append"|"after"):Promise<any>{
        return new Promise(async (resolve,reject)=>{
            let insertResources = Array.isArray(resources)?resources:[resources];
            insertResources = insertResources.filter(s => s.occurences.length > 0).sort((a,b)=>{
                if (a.occurences[0].document.uri.fsPath > b.occurences[0].document.uri.fsPath) {
                    return -1;
                }
                else if (a.occurences[0].document.uri.fsPath < b.occurences[0].document.uri.fsPath) {
                    return 1;
                }
                if (a.occurences[0].documentOffset.start > b.occurences[0].documentOffset.start) {
                    return -1;
                }
                else if (a.occurences[0].documentOffset.start < b.occurences[0].documentOffset.start) {
                    return 1;
                }
                else {
                    return 0;
                }
            });
            let documentUris = insertResources.filter(resource => resource.occurences.length > 0).map(resource => resource.occurences[0].document.uri).filter((v,i,a)=>a.map(u => u.fsPath).indexOf(v.fsPath)===i);
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
                }[]>insertResources.filter(resource => {
                    if (resource.occurences.length === 0) { vscode.window.showErrorMessage(resource + " occurs nowhere."); return false; }
                    return true;
                }).map(resource => {
                    let occ = resource.occurences[0];
                    if (type==="append") {
                        return {
                            uri: occ.document.uri,
                            position: occ.document.vscDocument?.positionAt(occ.documentOffset.end-1),
                            textBefore: "",
                            textAfter: "\n"
                        };
                    } else if (type==="after") {
                        return {
                            uri: occ.document.uri,
                            position: occ.document.vscDocument?.positionAt(occ.documentOffset.end),
                            textBefore: "\n\n",
                            textAfter: ""
                        };
                    } else {
                        return {
                            uri: occ.document.uri,
                            position: new vscode.Position(0,0),
                            textAfter: "",
                            textBefore: ""
                        };
                    }
            });
            for (let i = 0; i < documentUris.length; i++){
                let du = documentUris[i];
                await openTextDocument(du).then(doc => {
                    if (!doc){return;}
                    return showTextDocument(doc).then((editor)=>{
                        if (!editor){return;}
                        inserts.filter(i => i.uri.fsPath === doc.uri.fsPath).forEach(i => {
                            editor.insertSnippet(new vscode.SnippetString(i.textBefore+applyPrefixesOnText(text,doc)+i.textAfter),i.position);
                        });
                    });
                });
            }
            resolve();
        });
    }

    selectSingleTextSnippet(location:vscode.Location):Promise<any>{
        return new Promise((resolve,reject)=>{
            openTextDocument(location.uri).then(doc => {
                if (!doc){return;}
                return showTextDocument(doc).then((editor)=>{
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

    getAffectedResourcesByDocumentAndRange(fromoccurences:{document:vscode.TextDocument,range:vscode.Range}[]):SkosResource[]{
		let affectedResources:SkosResource[]=[];
		let keys = Object.keys(skosResourceManager.resources);
		for (let j = 0; j < keys.length; j++){
			let r = skosResourceManager.resources[keys[j]];
			for (let i = 0; i < r.occurences.length;i++){
				let occ = r.occurences[i];
				for (let k = 0; k < fromoccurences.length; k++){
                    let intersection = fromoccurences[k].range.intersection(occ.location().range);
                    if (intersection){
                        affectedResources.push(r);
                    }
				}
			}
		}
		return affectedResources.filter((value,index,array)=>array.indexOf(value)===index);
    }
}

export async function openTextDocument(uri:vscode.Uri):Promise<vscode.TextDocument|undefined>{
    let matchingDocs = vscode.window.visibleTextEditors.map(te => te.document).filter(d => d.uri.fsPath === uri.fsPath);
    let opening:Thenable<vscode.TextDocument|undefined> = Promise.resolve(matchingDocs[0]);
    if (matchingDocs.length === 0){
        opening = vscode.workspace.openTextDocument(uri);
    }
    return opening;
}

export async function showTextDocument(document:vscode.TextDocument|undefined):Promise<vscode.TextEditor|undefined>{
    let showing:Thenable<vscode.TextEditor|undefined> = Promise.resolve(vscode.window.activeTextEditor);
    if (document){
        showing = vscode.window.showTextDocument(document);
    }
    return showing;
}
    
export function getText(location:vscode.Location):Thenable<string>{
    return openTextDocument(location.uri).then(d => d && d.getText(location.range) || "");
}

export function sortLocations(locations: vscode.Location[]):vscode.Location[]{
    return locations.sort((a,b)=>{
        if (a.uri.fsPath < b.uri.fsPath){
            return -1;
        } else if (a.uri.fsPath > b.uri.fsPath){
            return 1;
        } else if (a.range.start.line < b.range.start.line){
            return -1;
        } else if (a.range.start.line > b.range.start.line){
            return 1;
        } else if (a.range.start.character < b.range.start.character){
            return -1;
        } else if (a.range.start.character > b.range.start.character){
            return 1;
        } else if (a.range.end.line < b.range.end.line){
            return -1;
        } else if (a.range.end.line > b.range.end.line){
            return 1;
        } else if (a.range.end.character < b.range.end.character){
            return -1;
        } else if (a.range.end.character > b.range.end.character){
            return 1;
        } else {
            return 0;
        }
    });
}

export function connectLocations(locations:vscode.Location[]):vscode.Location[]{
    locations = sortLocations(locations);
    for (let i = locations.length-1; i > 0; i--){
        if (locations[i].uri === locations[i-1].uri
            && locations[i].range.intersection(locations[i-1].range)){
                locations[i-1].range=locations[i].range.union(locations[i-1].range);
                locations.splice(i,1);
            }
    }
    return locations;
}

export class TurtleDocument {
    uri:vscode.Uri;
    vscDocument:vscode.TextDocument|undefined;
    text:string|undefined;
    private initiated = false;
    constructor(uri:vscode.Uri){        
        this.uri = uri;
    }
    async init(){
        if (this.initiated){return;}
        this.initiated=true;
        await openTextDocument(this.uri).then(doc => {
            this.vscDocument = doc;
            this.text=doc?.getText();
        });
    }
    async refreshAfterDocumentChange(){
        await openTextDocument(this.uri).then(doc => {
            this.text=doc?.getText();
        });
    }
}

export class TurtleDocuments {
    documents:TurtleDocument[] = [];
    get(uri:vscode.Uri):TurtleDocument{
        let td = this.documents.find(doc => doc.uri === uri);
        if (!td){
            td = new TurtleDocument(uri);
            this.documents.push(td);
        }
        return td;
    }
    includes(uri:vscode.Uri):boolean{
        return this.documents.find(doc => doc.uri === uri)!==undefined;
    }
}

export const turtleDocuments = new TurtleDocuments();

export function adjustOccurence(occ:Occurence,changeEvents:vscode.TextDocumentChangeEvent[]){
    for (let ce of changeEvents){
        let document = ce.document;
        if (document.uri.fsPath !== occ.document.uri.fsPath){return;}
        for (let i = 0; i < ce.contentChanges.length; i++){
            let cc = ce.contentChanges[i];
            if (occ.documentOffset.end>cc.rangeOffset){
                let substraction = Math.min(cc.rangeOffset+cc.rangeLength,occ.documentOffset.end)-cc.rangeOffset;
                occ.documentOffset.end = occ.documentOffset.end-substraction+cc.text.length;
                if (occ.documentOffset.start>cc.rangeOffset){
                    let substraction = Math.min(cc.rangeOffset+cc.rangeLength,occ.documentOffset.start)-cc.rangeOffset;
                    occ.documentOffset.start = occ.documentOffset.start-substraction+cc.text.length;
                }
            }
        }
    }
}