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
	allSkosResources: { [id: string] : { [id: string] : SkosResource; }} = {};
    constructor(options:{
        mergedSkosResources: { [id: string] : SkosResource; },
		allSkosResources: { [id: string] : { [id: string] : SkosResource; }},
		skosOutlineProvider:SkosOutlineProvider,
		skosResourceHandler:SkosResourceHandler,
		skosParser?:SkosParser,
		semanticHandler?:SemanticHandler,
		documentHandler?:DocumentHandler,
	}){
        this.skosResourceHandler=options.skosResourceHandler;
        this.skosParser=options.skosParser||new SkosParser(options.skosResourceHandler);
		this.semanticHandler=options.semanticHandler||new SemanticHandler();
        this.skosOutlineProvider=options.skosOutlineProvider;
		this.mergedSkosResources = options.mergedSkosResources;
		this.allSkosResources = options.allSkosResources;
		this.documentHandler=options.documentHandler||new DocumentHandler({
			mergedSkosResources: this.mergedSkosResources,
			skosParser: this.skosParser,
			skosResourceHandler: this.skosResourceHandler
		});
	}
	
    wait = async (ms:number) => await new Promise((resolve) => { setTimeout(() => { resolve(); }, ms); });
	loadTextDocuments(options:{
		documents:(vscode.TextDocument|Thenable<vscode.TextDocument>|undefined)[],
		inputThroughTyping?:boolean,
		affectedResources?: SkosResource[]
	}):Promise<any>{
		let inputThroughTyping = options.inputThroughTyping !== undefined ? options.inputThroughTyping : true;
		let loadingPromiseResolve:(value:{ [id: string] : SkosResource; })=>void;
		let loadingPromise:Promise<{ [id: string] : SkosResource; }> = new Promise((resolve,reject)=>{
			loadingPromiseResolve = resolve;			
		});	
		if (!options.affectedResources){this.semanticHandler.reset();}
		let numberOfDocuments:number = options.documents.length;
		let numberOfLoadedTextDocuments = 0;
		let conceptsToUpdate = options.affectedResources || [];

		let filenames:string[]=[];
		let loadprogress = 0;
		let parsingDocuments:Promise<any>[]=[];
		let cancelled = false;
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Loading "+options.documents.length+" document(s)",
			cancellable: true
		}, async (progress, token) => {
			token.onCancellationRequested(()=>{
				cancelled = true;
			});
			let loadDocument = async (i:number)=>{
				if (cancelled) {return;}
				if (i < numberOfDocuments){
					if (!options.documents[i]){return;}
					Promise.resolve(<vscode.TextDocument|Thenable<vscode.TextDocument>>options.documents[i]).then(async d => {
						filenames[i] = d.uri.fsPath.substr(d.uri.fsPath.lastIndexOf("\\")+1);
						progress.report({increment:0, message: filenames[i]});
						await this.wait(0);
						let ranges = options.affectedResources?.map(r => r.occurances)
							.reduce((prev,curr)=>prev=prev.concat(curr),[])
							.filter(occ => occ.location.uri.fsPath === d.uri.fsPath)
							.map(occ => occ.location.range)
							.sort((a,b)=>{
								if (a.start.line < b.start.line){
									return -1;
								} else if (a.start.line > b.start.line){
									return 1;
								} else if (a.start.character < b.start.character){
									return -1;
								} else if (a.start.character > b.start.character){
									return 1;
								} else if (a.end.line < b.end.line){
									return -1;
								} else if (a.end.line > b.end.line){
									return 1;
								} else if (a.end.character < b.end.character){
									return -1;
								} else if (a.end.character > b.end.character){
									return 1;
								} else {
									return 0;
								}
							});
						if (ranges){
							for (let i = ranges.length-1; i > 0; i--){
								if (ranges[i-1].end.line === ranges[i].start.line && ranges[i-1].end.character === ranges[i].start.character) {
									ranges[i-1] = new vscode.Range(ranges[i-1].start,ranges[i].end);
									ranges.splice(i,1);
								}
							}
						}

						//numberOfLoadedTextDocuments++;
						let progressdiff = Math.ceil((70*(i+1))/numberOfDocuments) - loadprogress;
						loadprogress += progressdiff;

						let p = this.skosParser.parseTextDocument({
							document: d,
							ranges,
							withprogress: {
								progress,
								ticks:progressdiff
							}
						});
						let resolveReceivedResources:(value?: any) => void;
						parsingDocuments.push(new Promise(resolve => resolveReceivedResources = resolve));
						p.then(async newsss => {
							if (!newsss) {					
								if (!inputThroughTyping) {
									vscode.window.showInformationMessage(d.uri.fsPath + " is not well formatted.");
								}
							}
							else {
								if (options.affectedResources){
									options.affectedResources.forEach(r => {
										delete this.allSkosResources[d.uri.path][r.concept.text];
									});
									Object.keys(newsss).forEach(key => {
										this.allSkosResources[d.uri.path][key]=newsss[key];
									});
								} else {
									this.allSkosResources[d.uri.path] = newsss;
									conceptsToUpdate = conceptsToUpdate.concat(Object.keys(newsss).map(key => newsss[key]));
								}
							}
	
							progress.report({ message: filenames[i+1]||filenames[i] });

							resolveReceivedResources();
						});
						loadDocument(i+1);
					});
				} else {
					Promise.all(parsingDocuments).then(async ()=>{
						if (conceptsToUpdate.length === 0){
							loadingPromiseResolve(this.mergedSkosResources);
							return;
						}
						progress.report({ increment: 0, message: "Merging" });
						await this.wait(100);
						Object.keys(this.mergedSkosResources).forEach(key => delete this.mergedSkosResources[key]);
						conceptsToUpdate = conceptsToUpdate.filter((value,index,array) => array.indexOf(value)===index);
						let mergedSkosSubjectsTemp = this.skosResourceHandler.mergeSkosResources(conceptsToUpdate);
						Object.keys(mergedSkosSubjectsTemp).forEach(key => {
							this.mergedSkosResources[key] = mergedSkosSubjectsTemp[key];
						});
						this.skosResourceHandler.updateReferences(this.mergedSkosResources);
						progress.report({ increment: 5, message: "Tree View creation" });
						await this.wait(100);
						this.skosOutlineProvider.createTreeviewContent();
						progress.report({ increment: 5, message: "Semantic checks" });
						await this.wait(100);
						await this.semanticHandler.checkSemantics(this.mergedSkosResources,{
							progress,ticks:20
						},conceptsToUpdate);
						progress.report({ increment: 0, message: "Done." });
						await this.wait(0);
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
			let affectedResources = this.documentHandler.getAffectedResourcesByDocumentAndRange(
				changeEvents.map(ce => {
					return ce.contentChanges.map(cc => {return {document: ce.document, range: cc.range};});
				}).reduce((prev,curr)=>prev=prev.concat(curr),[])
			);
			this.skosResourceHandler.adjustLocations(changeEvents);
			this.onDidChangeTextDocumentLock = this.loadTextDocuments({
				documents:[vscode.window.activeTextEditor?.document],
				affectedResources
			});
			this.onDidChangeTextDocumentLock.then(()=>{
				this.loadDocumentsPromiseFinished=true;
				if (this.queuedChangeEvents){
					this.loadTextDocumentsAfterTextDocumentChange(this.queuedChangeEvents);
					this.queuedChangeEvents = undefined;
				}
				else if (affectedResources.length>0) {
					this.skosOutlineProvider.selectTreeItem(affectedResources[0].treeviewNodes[0]); 
				}
			});
		}
		else {
			this.queuedChangeEvents = changeEvents;
		}
	}
}