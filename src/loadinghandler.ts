import * as vscode from 'vscode';
import { SkosResource, skosResourceManager, Occurence } from './skosresourcehandler';
import * as parser from './parser';
import { SkosOutlineProvider } from './outline';
import { DocumentHandler, sortLocations, connectLocations, turtleDocuments, adjustOccurence } from './documenthandler';
import { wait } from './extension';
import { checkSemantics } from './semantichandler';

export class LoadingHandler {      
	skosOutlineProvider:SkosOutlineProvider;
	documentHandler:DocumentHandler;
    constructor(options:{
		skosOutlineProvider:SkosOutlineProvider,
		documentHandler?:DocumentHandler,
	}){
        this.skosOutlineProvider=options.skosOutlineProvider;
		this.documentHandler=options.documentHandler||new DocumentHandler();
	}

	loadDocumentsPromiseFinished = true;
	queuedChangeEvents: vscode.TextDocumentChangeEvent[]|undefined;
	async loadTextDocumentsAfterTextDocumentChange(changeEvents: vscode.TextDocumentChangeEvent[]){
		if (this.loadDocumentsPromiseFinished){
			this.loadDocumentsPromiseFinished = false;	
			this.loadingProcedure([vscode.window.activeTextEditor?.document],changeEvents)
				.then(()=>{
					this.loadDocumentsPromiseFinished=true;
					if (this.queuedChangeEvents){
						this.loadTextDocumentsAfterTextDocumentChange(this.queuedChangeEvents);
						this.queuedChangeEvents = undefined;
					} 
			});
		}
		else {
			this.queuedChangeEvents = changeEvents;
		}
	}

	private totalProgress=[
		{
			loadingStep:LoadingStep.Parsing,
			message:"Parsing",
			progressDone:0,
			maxProgress:55
		},
		{
			loadingStep:LoadingStep.Evaluation,
			message:"Evaluation",
			progressDone:0,
			maxProgress:30
		},
		{
			loadingStep:LoadingStep.TreeBuild,
			message:"Building concept tree",
			progressDone:0,
			maxProgress:5
		},
		{
			loadingStep:LoadingStep.SemanticChecks,
			message:"Building concept tree",
			progressDone:0,
			maxProgress:10
		}
	];
	private resetProgress(){
		this.totalProgress.forEach(x => x.progressDone=0);
	}
	private async totalProgressReport(progress:vscode.Progress<{
		message?: string | undefined;
		increment?: number | undefined;
	}>,loadingStep:LoadingStep,progressPercantage:number, subMassage?:string){
		let oldProgress = this.totalProgress.map(x => Math.ceil(x.progressDone*x.maxProgress/100)).reduce((prev,curr)=>prev+=curr,0);
		this.totalProgress.filter(x => x.loadingStep === loadingStep).forEach(x => x.progressDone = progressPercantage);
		let newProgress = this.totalProgress.map(x => Math.ceil(x.progressDone*x.maxProgress/100)).reduce((prev,curr)=>prev+=curr,0);
		let tp = this.totalProgress.filter(x => x.loadingStep === loadingStep);
		let message = (tp.length > 0 && tp[0].message || "")+(subMassage?" - "+subMassage:"");
		progress.report({message, increment:newProgress-oldProgress});
		await wait(0);
	}

	async loadingProcedure(documents:(vscode.TextDocument|undefined)[]|Thenable<(vscode.TextDocument|undefined)>[], changeEvents?: vscode.TextDocumentChangeEvent[]){
		let cancelled=false;
		this.resetProgress();
		await Promise.resolve(documents).then(async documents => {
			let resolvedDocuments:vscode.TextDocument[]=[];
			let documentsToParse:vscode.TextDocument[]=resolvedDocuments;
			for (let i = documents.length; i >= 0; i--){
				let document = await Promise.resolve(<vscode.TextDocument|undefined|Thenable<(vscode.TextDocument|undefined)>>documents[i]);
				if (document && document.uri.fsPath.endsWith('.ttl')){
					resolvedDocuments.push(document);
				}
			}
			return vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Loading "+documents.length+" document(s)",
				cancellable: true
			}, async (progress, token) => {
				token.onCancellationRequested(()=>{
					cancelled = true;
				});


				//before parse
				let affectedResources:SkosResource[]|undefined;
				let locationsToParse:vscode.Location[]|undefined;
				if (changeEvents){
					for (let uri of changeEvents.map(ce => ce.document.uri).filter((value,index,arr)=>arr.indexOf(value)===index)){
						if (turtleDocuments.includes(uri)){
							await turtleDocuments.get(uri).refreshAfterDocumentChange();
						}
					}
					let ceOccurences = changeEvents.map(ce => {
						return ce.contentChanges.map(cc => new Occurence(ce.document.uri, {
							start:cc.rangeOffset,
							end:cc.rangeOffset+cc.rangeLength
						}));
					}).reduce((prev,curr)=>prev=prev.concat(curr),[]);
					affectedResources = skosResourceManager.removeIntersectingOccurences(ceOccurences);
					skosResourceManager.resetResourceEvaluations(affectedResources);
					skosResourceManager.removeResourcesWithoutOccurenceOrReference();
					skosResourceManager.adjustLocations(changeEvents);
					locationsToParse = connectLocations(skosResourceManager.getNewLocationsToParseByChangeEvents(changeEvents));
				} else {
					documentsToParse = resolvedDocuments.filter(document => !turtleDocuments.includes(document.uri));
				}

				//parse
				let parsingDocuments:Promise<SkosResource[]>[]=[];
				this.totalProgressReport(progress,LoadingStep.Parsing,0);
				for (let i = 0; i < documentsToParse.length; i++){
					let document = documentsToParse[i];
					if (cancelled) {break;}	
					if (!document){continue;}		
					let p = parser.parseTextDocument({
						document,
						ranges:locationsToParse?.map(l => l.range),
						progressReport:async (percantage:number, message?:string)=>this.totalProgressReport(
							progress,
							LoadingStep.Parsing,
							Math.floor(i*100/documentsToParse.length + percantage/documentsToParse.length)
							,message
						)
					});
					parsingDocuments.push(p);
					await p;
				}

				//after parse
				await Promise.all(parsingDocuments).then(async (parsedResources)=>{
					let resources = parsedResources.reduce((prev,curr)=>prev = prev.concat(curr),[]);
					await skosResourceManager.evaluatePredicateObjects(
						resources,
						async (percantage:number, message?:string)=>this.totalProgressReport(progress,LoadingStep.Evaluation,percantage,message)
					);
					this.totalProgressReport(progress,LoadingStep.TreeBuild,0);
					this.skosOutlineProvider.createTreeviewContent();
					this.totalProgressReport(progress,LoadingStep.TreeBuild,100);
					if (affectedResources && affectedResources.length>0 && affectedResources[0].treeNode){
						this.skosOutlineProvider.selectTreeItem(affectedResources[0].treeNode);
					}
					checkSemantics(
						resources,
						async (percantage:number, message?:string)=>this.totalProgressReport(progress,LoadingStep.SemanticChecks,percantage,message)
					);
				});
			});
		});
		if (afterLoadingProcedureFinishedPromise && afterLoadingProcedureFinishedPromiseResolve) {
			afterLoadingProcedureFinishedPromiseResolve();
			afterLoadingProcedureFinishedPromise = undefined;
		}
	}
}	

enum LoadingStep {
	Parsing,
	Evaluation,
	TreeBuild,
	SemanticChecks
}

let afterLoadingProcedureFinishedPromise:Promise<any>|undefined;
let afterLoadingProcedureFinishedPromiseResolve:(()=>void)|undefined;
export function afterLoadingProcedureFinished():Promise<any>{
	if (!afterLoadingProcedureFinishedPromise){
		afterLoadingProcedureFinishedPromise = new Promise(resolve => afterLoadingProcedureFinishedPromiseResolve = resolve);
	}
	return afterLoadingProcedureFinishedPromise;
}