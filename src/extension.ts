import * as vscode from 'vscode';
import { SkosOutlineProvider } from './outline';
import { SkosNode } from './skosnode';
import * as parser from './parser';
import { iridefs } from './parser';
import { ISkosResource, skosResourceManager, prefixManager, SkosSubjectType } from './skosresourcehandler';
import { DocumentHandler, getText, turtleDocuments } from './documenthandler';
import { LoadingHandler } from './loadinghandler';


let allSkosResources: { [id: string] : { [id: string] : ISkosResource; }} = {};
const mergedSkosResources: { [id: string] : ISkosResource; } = {};
let documentHandler = new DocumentHandler();
let loadingHandler:LoadingHandler;

export function activate(context: vscode.ExtensionContext) {
	const skosOutlineProvider = new SkosOutlineProvider(context);
	loadingHandler = new LoadingHandler({
		skosOutlineProvider,
		documentHandler
	});

	vscode.commands.registerCommand('skos-ttl-editor.addConcept', (node:SkosNode) => {
		let text = "${1::NEWCONCEPT"+Date.now()+"} a skos:Concept ;\n";
		text += "\t"+iridefs.broader+" "+node.getId()+" ;\n";
		text += "\t"+iridefs.prefLabel+" \"${2:prefered label}\"@en ;\n.";
		documentHandler.insertText(skosResourceManager.resources[node.getId()],text,"after").then(()=>{
			vscode.window.showInformationMessage("Added concept \""+node.getLabel()+"\" to concept \""+node.getLabel()+"\".");
		});
	});
	vscode.commands.registerCommand('skos-ttl-editor.appendToScheme', async (node:SkosNode) => {
		vscode.window.showQuickPick(
			Object.keys(skosResourceManager.resources).map(key => skosResourceManager.resources[key])
				.filter(resource => resource.types.includes(SkosSubjectType.ConceptScheme))
				.map(resource => resource.id)
		).then(iri => {
			if (!iri || node.getTypes().includes(SkosSubjectType.ConceptScheme)) {return;}
			documentHandler.insertText(
				node.getResource(),
				"\t"+ iridefs.inScheme+" "+iri+" ;",
				"append"
			).then(()=>{
				vscode.window.showInformationMessage("Added concept \""+node.getLabel()+"\" to scheme \""+iri+"\".");
			});
		});
	});
	vscode.commands.registerCommand('skos-ttl-editor.appendSubtreeToScheme', async (node:SkosNode) => {
		vscode.window.showQuickPick(
			Object.keys(skosResourceManager.resources).map(key => skosResourceManager.resources[key])
				.filter(resource => resource.types.includes(SkosSubjectType.ConceptScheme))
				.map(resource => resource.id)
		).then(iri => {
			if (!iri || node.getTypes().includes(SkosSubjectType.ConceptScheme)) {return;}
			let resources = node.getResource().getSubtree().filter(resource => !resource.inScheme(skosResourceManager.resources[iri]));
			documentHandler.insertText(
				resources,
				"\tskos:inScheme "+iri+" ;",
				"append"
			).then(()=>{
				vscode.window.showInformationMessage("Added "+resources.length+" concepts to scheme \""+iri+"\".");
			});
		});
	});
	vscode.commands.registerCommand('skos-ttl-editor.selectConcept', (node:SkosNode) => { 
		selectTextSnippet(node);
	});
	
	let inputDelay:NodeJS.Timeout;
	let changeEvents:vscode.TextDocumentChangeEvent[]=[];
	let parseDelay:number = <number>vscode.workspace.getConfiguration().get("skos-ttl-editor.parsingAndVerificationDelayAfterUserInput");
	vscode.workspace.onDidChangeTextDocument(changeEvent => {
		if (changeEvent.contentChanges.length>0){
			changeEvents.push(changeEvent);
		}
		if (inputDelay){
			clearTimeout(inputDelay);
		}
		inputDelay = setTimeout(()=>{
			loadingHandler.loadTextDocumentsAfterTextDocumentChange(changeEvents);
			changeEvents = [];
		},parseDelay);
	});	

	vscode.window.onDidChangeTextEditorSelection((selection)=>{
		if (!loadingHandler.queuedChangeEvents){
			if (selection.kind !== vscode.TextEditorSelectionChangeKind.Mouse) { return; }
			let selectedResources = skosResourceManager.getIntersectionResources(selection.textEditor.document.uri,selection.selections[0]);
			if (selectedResources.length>0 && selectedResources[0].treeNode) { 
				skosOutlineProvider.selectTreeItem(selectedResources[0].treeNode); 
			}
		}
	});

	vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor){
			loadingHandler.loadingProcedure([editor.document]);
		}
	});

	loadingHandler.loadingProcedure([vscode.window.activeTextEditor?.document]);

	context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
			'turtle', 
			new CompletionItemProvider(), 
			':',' ')
		);
	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			'turtle', new ConceptHoverProvider()));
	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			'turtle', new SkosDocumentSymbolProvider(mergedSkosResources)));
	/*context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(
			'turtle', new ConceptDefinitionProvider(mergedSkosSubjects)));*/
	context.subscriptions.push(
		vscode.languages.registerImplementationProvider(
			'turtle', new ConceptImplementationProvider()));
	context.subscriptions.push(
		vscode.languages.registerReferenceProvider(
			'turtle', new ConceptReferenceProvider()));

	vscode.commands.registerCommand('skos-ttl-editor.reload', () => {
		Object.keys(allSkosResources).forEach(key => delete allSkosResources[key]);
		Object.keys(mergedSkosResources).forEach(key => delete mergedSkosResources[key]);		
		if (vscode.window.activeTextEditor){
			loadingHandler.loadingProcedure([vscode.window.activeTextEditor.document]);	
		}
	});	
	vscode.commands.registerCommand('skos-ttl-editor.complementFiles', () => {
		if (vscode.window.activeTextEditor){
			vscode.workspace.findFiles('*.ttl').then(files => {
				if (files.length === 0){
					vscode.window.showInformationMessage("No files to load. Did you open a folder in Visual Studio Code?");
				}
				loadingHandler.loadingProcedure(
					files.map(file => vscode.workspace.openTextDocument(file.path))
				);
			});		
		}
	});	
}

class SkosDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	private sss:{ [id: string] : ISkosResource; }={};
	public constructor(sss:{ [id: string] : ISkosResource; }){
		this.sss = sss;
	}
	provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
		let result:vscode.SymbolInformation[]=[];
		Object.keys(this.sss).forEach(key=>{
			if (vscode.window.activeTextEditor !== undefined){
				result.push(new vscode.SymbolInformation(
					key, 
					vscode.SymbolKind.Class, 
					"", 
					new vscode.Location(
						document.uri,
						document.lineAt(this.sss[key].occurences[0].location.range.start.line).range
					)
				));
			}
		});
		return result; 
	}	
}

class ConceptReferenceProvider implements vscode.ReferenceProvider {
	provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Location[]> {
		let referenceIri = document.getText(document.getWordRangeAtPosition(position,new RegExp(parser.iri)));
		referenceIri = prefixManager.resolve(document.uri,referenceIri) || referenceIri;
		let locations = skosResourceManager.resources[referenceIri]?.references.filter(reference => reference.external)
		 	.map(reference => reference.predicateObject.location());
		return locations;
	}
}

class ConceptImplementationProvider implements vscode.ImplementationProvider {
	provideImplementation(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Location | vscode.Location[] | vscode.LocationLink[]> {
		let implementationIri = document.getText(document.getWordRangeAtPosition(position,new RegExp(parser.iri)));
		implementationIri = prefixManager.resolve(document.uri,implementationIri) || implementationIri;
		let item = skosResourceManager.resources[implementationIri];
		return item && item.occurences.map(o => o.location()) || null;
	}
}

class ConceptHoverProvider implements vscode.HoverProvider {
    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):Promise<vscode.Hover> {
		let result:Promise<vscode.Hover>=new Promise(resolve => {
			let hoveredIri = document.getText(document.getWordRangeAtPosition(position,new RegExp(parser.iri)));
			hoveredIri = prefixManager.resolve(document.uri,hoveredIri) || hoveredIri;
			let resource = skosResourceManager.resources[hoveredIri];
			if (resource){
				resolve(new vscode.Hover(resource.description));
			} else {
				resolve(undefined);
			}
		});
		return result;
    }
}

class CompletionItemProvider implements vscode.CompletionItemProvider {
	private customAutoCompletePrefixedPredicates: { [id: string] : string[]; }=vscode.workspace.getConfiguration().get("skos-ttl-editor.customAutoCompletePrefixedPredicates")||{};
	private customAutoCompletePrefixedObjects: { [id: string] : string[]; }=vscode.workspace.getConfiguration().get("skos-ttl-editor.customAutoCompletePrefixedObjects")||{};

    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext):vscode.CompletionItem[] {
		//after typing an skos predicate
		let objectrange = document.getWordRangeAtPosition(position,new RegExp(prefixManager.getSkosPrefix(document.uri)+"(broader|narrower|member|topConceptOf|hasTopConcept|related)\\s+"));
		if (objectrange) {
			return Object.keys(skosResourceManager.resources).map(key => skosResourceManager.resources[key]).map(resource => {
				let ci = new vscode.CompletionItem(resource.getLabel(),vscode.CompletionItemKind.Property);
				ci.insertText = prefixManager.apply(document.uri,resource.id);
				ci.documentation = resource.description;
				return ci;
			});
		}
		
		//get trigering word
		let irirange = document.getWordRangeAtPosition(position,new RegExp(parser.iri));
		if (!irirange){ return []; }
		let triggerWord = document.getText(irirange);
		let result:vscode.CompletionItem[] = [];
		if (triggerWord === ""){
			return [];
		} 

		//add custom predicates and objects
		let predicateIriref = Object.keys(this.customAutoCompletePrefixedPredicates).filter(key => prefixManager.getShortByLong(document.uri,key)===triggerWord)[0];
		if (predicateIriref) {
			result = result.concat(this.customAutoCompletePrefixedPredicates[predicateIriref].sort().map(prop => {
				let ci = new vscode.CompletionItem(prop,vscode.CompletionItemKind.Property);
				ci.sortText = "__"+prop;
				return ci;
			}));
		} 
		let objectIriref = Object.keys(this.customAutoCompletePrefixedObjects).filter(key => prefixManager.getShortByLong(document.uri,key)===triggerWord)[0];
		if (objectIriref) {
			result = result.concat(this.customAutoCompletePrefixedObjects[objectIriref].sort().map(prop => {
				let ci = new vscode.CompletionItem(prop,vscode.CompletionItemKind.Constant);
				ci.sortText = "__"+prop;
				return ci;
			}));
		} 

		//add skos predicates
		if (triggerWord === prefixManager.getSkosPrefix(document.uri)) {
			result = result.concat(["broader","narrower","notation","prefLabel",
				"altLabel","member","editorialNote","Concept","ConceptScheme",
				"inScheme","hasTopConcept","topConceptOf","Collection","related"].sort().map(prop => new vscode.CompletionItem(prop,vscode.CompletionItemKind.Property)));
		} 

		//add known resource ids
		let prefix = prefixManager.getPrefixByShortCandidate(document.uri,triggerWord);
		if (prefix){
			let iriref = prefix.long;
			iriref = iriref.substring(0,iriref.length-1);
			result = result.concat(Object.keys(skosResourceManager.resources)
				.filter(key => key.startsWith(iriref))
				.map(key => {
					let name = key.replace(iriref,"");
					name = name.substring(0,name.length-1);
					let ci = new vscode.CompletionItem(name,vscode.CompletionItemKind.Reference);
					ci.documentation = skosResourceManager.resources[key].description;
					return ci;
				})
				.sort());			
		} 
		return result;
	}
}

function selectTextSnippet(node:SkosNode){
	if (node.getLocations().length>1){
		showQuickPicksForConceptTextSelection(node.getLocations());
	} else if (node.getLocations().length === 1) {
		let pickedLocation = node.getLocations()[0];
		documentHandler.selectSingleTextSnippet(pickedLocation);
	}
}

function showQuickPicksForConceptTextSelection(locations:vscode.Location[],index:number=0) {
	let items = locations.map(l => "Document "+l.uri.fsPath.substr(l.uri.fsPath.lastIndexOf("\\")+1) + " lines " + l.range.start.line + " to " + l.range.end.line);
	let itemsfromindex = items.slice(index);
	let itemstoindex = index>0?items.slice(0,index):[];
	let sortedItems = itemsfromindex.concat(itemstoindex);
	vscode.window.showQuickPick(sortedItems,{
		onDidSelectItem:(a:string)=>{
			let newindex = items.indexOf(a);
			if (newindex !== index){
				let pickedLocation = locations[newindex];
				documentHandler.selectSingleTextSnippet(pickedLocation).then(()=>{
					showQuickPicksForConceptTextSelection(locations,newindex);
				});
			}
		}}
	);
}

// this method is called when your extension is deactivated
export function deactivate() {}

export async function asyncFilter<T>(arr:T[], callback:(item:T)=>{}):Promise<T[]> {
	const fail = Symbol();
	return <Promise<T[]>><unknown>((await Promise.all(arr.map(async (item) => (await callback(item)) ? item : fail))).filter(i => i !== fail));
}
export async function asyncForeach<T>(arr:T[]|Promise<T[]>, callback:(item:T)=>Promise<void>):Promise<void> {
	if (!Array.isArray(arr)){
		arr = await arr;
	}
	await Promise.all(arr.map(item => callback(item) ));
}    
export async function asyncMap<T,U>(arr:T[]|Promise<T[]>, callback:(item:T)=>Promise<U>):Promise<U[]> {
	if (!Array.isArray(arr)){
		arr = await arr;
	}
	return Promise.all(arr.map(item => callback(item)));
}

export async function wait (ms:number){ await new Promise((resolve) => { setTimeout(() => { resolve(); }, ms); }); }