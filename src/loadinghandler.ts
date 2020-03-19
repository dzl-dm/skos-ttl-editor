import * as vscode from 'vscode';
import { SkosResourceHandler, SkosResource } from './skosresourcehandler';
import { SkosParser } from './parser';
import { SemanticHandler } from './semantichandler';
import { SkosOutlineProvider } from './outline';
import { DocumentHandler } from './documenthandler';

export class LoadingHandler {      
	skosResourceHandler:SkosResourceHandler;
	skosParser:SkosParser;
	semanticHandler:SemanticHandler;
	skosOutlineProvider:SkosOutlineProvider;
	documentHandler:DocumentHandler;
	mergedSkosResources: { [id: string] : SkosResource; };
	allSkosSubjects: { [id: string] : { [id: string] : SkosResource; }} = {};
    constructor(options:{
        mergedSkosResources: { [id: string] : SkosResource; },
		allSkosSubjects: { [id: string] : { [id: string] : SkosResource; }},
		skosOutlineProvider:SkosOutlineProvider,
		skosResourceHandler?:SkosResourceHandler,
		skosParser?:SkosParser,
		semanticHandler?:SemanticHandler,
		documentHandler?:DocumentHandler,
	}){
        this.skosResourceHandler=options.skosResourceHandler||new SkosResourceHandler();
        this.skosParser=options.skosParser||new SkosParser();
		this.semanticHandler=options.semanticHandler||new SemanticHandler();
        this.skosOutlineProvider=options.skosOutlineProvider;
		this.mergedSkosResources = options.mergedSkosResources;
		this.allSkosSubjects = options.allSkosSubjects;
		this.documentHandler=options.documentHandler||new DocumentHandler({
			mergedSkosResources: this.mergedSkosResources,
			skosParser: this.skosParser,
			skosResourceHandler: this.skosResourceHandler
		});
    }
    wait = async () => await new Promise((resolve) => { setTimeout(() => { resolve(); }, 0); });
	loadTextDocuments(documents:(vscode.TextDocument|Thenable<vscode.TextDocument>|undefined)[],inputThroughTyping:boolean=true):Promise<any>{
		let loadingPromiseResolve:(value:{ [id: string] : SkosResource; })=>void;
		let loadingPromise:Promise<{ [id: string] : SkosResource; }> = new Promise((resolve,reject)=>{
			loadingPromiseResolve = resolve;			
		});	
		this.semanticHandler.reset();
		let numberOfDocuments:number = documents.length;
		let numberOfLoadedTextDocuments = 0;
		let conceptsToUpdate: string[]=[];

		let loadprogress = 0;
		let parsingDocuments:Promise<any>[]=[];
		let cancelled = false;
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Loading "+documents.length+" document(s)",
			cancellable: true
		}, async (progress, token) => {
			token.onCancellationRequested(()=>{
				cancelled = true;
			});
			let loadDocument = async (i:number)=>{
				if (cancelled) {return;}
				if (i < numberOfDocuments){
					if (!documents[i]){return;}
					Promise.resolve(<vscode.TextDocument|Thenable<vscode.TextDocument>>documents[i]).then(async d => {
						let filename = d.uri.fsPath.substr(d.uri.fsPath.lastIndexOf("\\")+1);
						progress.report({message: filename});
						await this.wait();
						let p = this.skosParser.parseTextDocument(d);
						parsingDocuments.push(p);
						p.then(async newsss => {
							if (!newsss) {					
								if (!inputThroughTyping) {
									vscode.window.showInformationMessage(d.uri.fsPath + " is not well formatted.");
								}
							}
							else {
								this.allSkosSubjects[d.uri.path] = newsss;
							}
							conceptsToUpdate = conceptsToUpdate.concat(Object.keys(newsss || {}));
							numberOfLoadedTextDocuments++;
	
							let progressdiff = Math.ceil((70*numberOfLoadedTextDocuments)/numberOfDocuments) - loadprogress;
							progress.report({ increment: progressdiff, message: filename });
							await this.wait();
							loadprogress += progressdiff;
						});
						loadDocument(i+1);
					});
				} else {
					Promise.resolve(parsingDocuments).then(async ()=>{
						if (conceptsToUpdate.length === 0){
							loadingPromiseResolve(this.mergedSkosResources);
							return;
						}
						progress.report({ increment: 0, message: "Merging" });
						await this.wait();
						Object.keys(this.mergedSkosResources).forEach(key => delete this.mergedSkosResources[key]);
						conceptsToUpdate = conceptsToUpdate.filter((value,index,array) => array.indexOf(value)===index);
						let mergedSkosSubjectsTemp = this.skosResourceHandler.mergeSkosSubjects(this.allSkosSubjects,this.mergedSkosResources,conceptsToUpdate);
						Object.keys(mergedSkosSubjectsTemp).forEach(key => {
							this.mergedSkosResources[key] = mergedSkosSubjectsTemp[key];
						});
						this.skosResourceHandler.updateReferences(this.mergedSkosResources);
						progress.report({ increment: 5, message: "Tree View creation" });
						await this.wait();
						this.skosOutlineProvider.createTreeviewContent();
						progress.report({ increment: 5, message: "Semantic checks" });
						await this.wait();
						await this.semanticHandler.checkSemantics(this.mergedSkosResources,{
							progress,ticks:20
						});
						progress.report({ increment: 0, message: "Done." });
						await this.wait();
						loadingPromiseResolve(this.mergedSkosResources);
					});					
				}
			};
			loadDocument(0);
			return loadingPromise;	
		});
		return loadingPromise;
	}


	onDidChangeTextDocumentLock = Promise.resolve();
	loadDocumentsPromiseFinished = true;
	queuedChangeEvents: vscode.TextDocumentChangeEvent[]|undefined;
	loadTextDocumentsAfterTextDocumentChange(changeEvents: vscode.TextDocumentChangeEvent[]){
		if (this.loadDocumentsPromiseFinished){
			this.loadDocumentsPromiseFinished = false;
			let affectedResourcesAndLocationHulls = this.documentHandler.getAffectedResourcesAndLocationHullsByDocumentAndRange(
				changeEvents.map(ce => {
					return ce.contentChanges.map(cc => {return {document: ce.document, range: cc.range};});
				}).reduce((prev,curr)=>prev=prev.concat(curr),[])
			);
			this.onDidChangeTextDocumentLock = this.loadTextDocuments([vscode.window.activeTextEditor?.document]);
			this.onDidChangeTextDocumentLock.then(()=>{
				this.loadDocumentsPromiseFinished=true;
				if (this.queuedChangeEvents){
					this.loadTextDocumentsAfterTextDocumentChange(this.queuedChangeEvents);
					this.queuedChangeEvents = undefined;
				}
				else if (affectedResourcesAndLocationHulls.resources.length>0) {
					this.skosOutlineProvider.selectTreeItem(affectedResourcesAndLocationHulls.resources[0].treeviewNodes[0]); 
				}
			});
		}
		else {
			this.queuedChangeEvents = changeEvents;
		}
	}
}