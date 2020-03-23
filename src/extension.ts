import * as vscode from 'vscode';
import { SkosOutlineProvider } from './outline';
import { SkosNode } from './skosnode';
import * as parser from './parser';
import { SkosParser, iridefs } from './parser';
import { SkosResource, SkosResourceHandler, getObjectValuesByPredicate } from './skosresourcehandler';
import { DocumentHandler } from './documenthandler';
import { SemanticHandler } from './semantichandler';
import { LoadingHandler } from './loadinghandler';


let allSkosResources: { [id: string] : { [id: string] : SkosResource; }} = {};
const mergedSkosResources: { [id: string] : SkosResource; } = {};
let skosResourceHandler = new SkosResourceHandler({mergedSkosResources,allSkosResources});
let skosParser = new SkosParser(skosResourceHandler);
let documentHandler = new DocumentHandler({
	mergedSkosResources,
	skosResourceHandler,
	skosParser
});
let loadingHandler:LoadingHandler;

export function activate(context: vscode.ExtensionContext) {
	const skosOutlineProvider = new SkosOutlineProvider({
		context,
		mergedSkosResources,
		skosResourceHandler		
	});
	loadingHandler = new LoadingHandler({
		mergedSkosResources,
		skosResourceHandler,
		skosParser,
		skosOutlineProvider,
		documentHandler,
		allSkosResources
	});

	vscode.commands.registerCommand('skos-ttl-editor.addConcept', (node:SkosNode) => {
		let text = "${1::NEWCONCEPT"+Date.now()+"} a skos:Concept ;\n";
		text += "\t"+iridefs.broader+" "+node.getConcept()+" ;\n";
		text += "\t"+iridefs.prefLabel+" \"${2:prefered label}\"@en ;\n";
		documentHandler.insertText(mergedSkosResources[node.getConcept()],text,"after").then(()=>{
			vscode.window.showInformationMessage("Added concept \""+node.getLabel()+"\" to concept \""+node.getLabel()+"\".");
		});
	});
	vscode.commands.registerCommand('skos-ttl-editor.appendToScheme', (node:SkosNode) => {
		vscode.window.showQuickPick(
			Object.keys(mergedSkosResources)
				.map(key => mergedSkosResources[key])
				.filter(s => getObjectValuesByPredicate(iridefs.type,s).includes(iridefs.conceptScheme))
				.map(s => s.concept.text)
		).then(a => {
			if (!a || node.getTypes().includes(iridefs.conceptScheme)) {return;}
			documentHandler.insertText(
				mergedSkosResources[node.getConcept()],
				"\tskos:inScheme "+a+" ;",
				"append"
			).then(()=>{
				vscode.window.showInformationMessage("Added concept \""+node.getLabel()+"\" to scheme \""+a+"\".");
			});
		});
	});
	vscode.commands.registerCommand('skos-ttl-editor.appendSubtreeToScheme', (node:SkosNode) => {
		vscode.window.showQuickPick(
			Object.keys(mergedSkosResources)
				.map(key => mergedSkosResources[key])
				.filter(s => getObjectValuesByPredicate(iridefs.type,s).includes(iridefs.conceptScheme))
				.map(s => s.concept.text)
		).then(a => {
			if (!a || node.getTypes().includes(iridefs.conceptScheme)) {return;}
			let concepts = skosResourceHandler.getDescendants(mergedSkosResources[node.getConcept()]).filter(s => !getObjectValuesByPredicate(iridefs.inScheme,s).includes(a));
			documentHandler.insertText(
				concepts,
				"\tskos:inScheme "+a+" ;",
				"append"
			).then(()=>{
				vscode.window.showInformationMessage("Added "+concepts.length+" concepts to scheme \""+a+"\".");
			});
		});
	});
	vscode.commands.registerCommand('skos-ttl-editor.selectConcept', (node:SkosNode) => { 
		selectTextSnippet(node);
	});

	let initialLoadingPromise = loadingHandler.loadTextDocuments({
		documents:[vscode.window.activeTextEditor?.document],
		inputThroughTyping: false
	});
	
	let inputDelay:NodeJS.Timeout;
	let changeEvents:vscode.TextDocumentChangeEvent[]=[];
	let parseDelay:number = <number>vscode.workspace.getConfiguration().get("skos-ttl-editor.parsingAndVerificationDelayAfterUserInput");
	vscode.workspace.onDidChangeTextDocument(changeEvent => {
		if (inputDelay){
			if (changeEvent.contentChanges.length>0){
				changeEvents.push(changeEvent);
			}
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
			let selectedConcepts = documentHandler.getAffectedResourcesByDocumentAndRange([{document: selection.textEditor.document,range: selection.selections[0]}]);
			if (selectedConcepts.length>0) { 
				skosOutlineProvider.selectTreeItem(selectedConcepts[0].treeviewNodes[0]); 
			}
		}
	});

	vscode.window.onDidChangeActiveTextEditor(changeEvent => {
		if (!vscode.window.activeTextEditor){return;}
		if (!Object.keys(allSkosResources).includes(vscode.window.activeTextEditor.document.uri.path)){
			loadingHandler.loadTextDocuments({
				documents:[vscode.window.activeTextEditor?.document],
				inputThroughTyping: false
			});
		}
	});

	context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
			'turtle', 
			new CompletionItemProvider(mergedSkosResources), 
			':',' ')
		);
	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			'turtle', new ConceptHoverProvider(initialLoadingPromise)));
	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			'turtle', new SkosDocumentSymbolProvider(mergedSkosResources)));
	/*context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(
			'turtle', new ConceptDefinitionProvider(mergedSkosSubjects)));*/
	context.subscriptions.push(
		vscode.languages.registerImplementationProvider(
			'turtle', new ConceptImplementationProvider(mergedSkosResources)));
	context.subscriptions.push(
		vscode.languages.registerReferenceProvider(
			'turtle', new ConceptReferenceProvider(mergedSkosResources)));

	vscode.commands.registerCommand('skos-ttl-editor.reload', () => {
		Object.keys(allSkosResources).forEach(key => delete allSkosResources[key]);
		Object.keys(mergedSkosResources).forEach(key => delete mergedSkosResources[key]);		
		if (vscode.window.activeTextEditor){
			loadingHandler.loadTextDocuments({
				documents: [vscode.window.activeTextEditor.document]
			});	
		}
	});	
	vscode.commands.registerCommand('skos-ttl-editor.complementFiles', () => {
		if (vscode.window.activeTextEditor){
			vscode.workspace.findFiles('*.ttl').then(files => {
				if (files.length === 0){
					vscode.window.showInformationMessage("No files to load. Did you open a folder in Visual Studio Code?");
				}
				loadingHandler.loadTextDocuments({
					documents: files.filter(file => !Object.keys(allSkosResources).includes(file.path))
						.map(file => vscode.workspace.openTextDocument(file.path)),
					inputThroughTyping: false
				});
			});		
		}
	});	
}

class SkosDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	private sss:{ [id: string] : SkosResource; }={};
	public constructor(sss:{ [id: string] : SkosResource; }){
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
						document.lineAt(this.sss[key].occurances[0].location.range.start.line).range
					)
				));
			}
		});
		return result; 
	}	
}

class ConceptReferenceProvider implements vscode.ReferenceProvider {
	private sss:{ [id: string] : SkosResource; }={};
	public constructor(sss:{ [id: string] : SkosResource; }){
		this.sss = sss;
	}	
	provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Location[]> {
		let referenceIri = document.getText(document.getWordRangeAtPosition(position,new RegExp(parser.iri)));
		referenceIri = skosParser.resolvePrefix(referenceIri,document) || referenceIri;
		let locations = Object.keys(this.sss).map(key => this.sss[key].statements)
			.reduce((prev,curr,index) => prev = prev.concat(curr),[])
			.filter(s =>  s.object.text === referenceIri)
			.map(s => s.location);
		return locations;
	}
}

class ConceptImplementationProvider implements vscode.ImplementationProvider {
	private sss:{ [id: string] : SkosResource; }={};
	public constructor(sss:{ [id: string] : SkosResource; }){
		this.sss = sss;
	}	
	provideImplementation(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Location | vscode.Location[] | vscode.LocationLink[]> {
		let implementationIri = document.getText(document.getWordRangeAtPosition(position,new RegExp(parser.iri)));
		implementationIri = skosParser.resolvePrefix(implementationIri,document) || implementationIri;
		let items = Object.keys(this.sss).filter(i => i===implementationIri);
		return this.sss[items[0]].occurances.map(o => o.location);
	}
}

class ConceptHoverProvider implements vscode.HoverProvider {
	private sssp:Promise<{ [id: string] : SkosResource; }>;
	public constructor(sssp:Promise<{ [id: string] : SkosResource; }>){
		this.sssp = sssp;
	}
    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):Promise<vscode.Hover> {
		let result:Promise<vscode.Hover>=new Promise(resolve => {
			this.sssp.then(sss => {
				let hoveredIri = document.getText(document.getWordRangeAtPosition(position,new RegExp(parser.iri)));
				hoveredIri = skosParser.resolvePrefix(hoveredIri,document) || hoveredIri;
				let items = Object.keys(sss).filter(i => i===hoveredIri);
				if (items.length>0) {
					resolve(new vscode.Hover(sss[items[0]].description));
				} else {
					resolve(undefined);
				}
			});
		});
		return result;
    }
}

class CompletionItemProvider implements vscode.CompletionItemProvider {
	private sss:{ [id: string] : SkosResource; }={};
	private customAutoCompletePrefixedPredicates: { [id: string] : string[]; }=vscode.workspace.getConfiguration().get("skos-ttl-editor.customAutoCompletePrefixedPredicates")||{};
	private customAutoCompletePrefixedObjects: { [id: string] : string[]; }=vscode.workspace.getConfiguration().get("skos-ttl-editor.customAutoCompletePrefixedObjects")||{};
	public constructor(sss:{ [id: string] : SkosResource; }){
		this.sss = sss;
	}
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext):vscode.CompletionItem[] {
		let objectrange = document.getWordRangeAtPosition(position,new RegExp(skosParser.getSkosPrefix(document)+"(broader|narrower|member|topConceptOf|hasTopConcept|related)\\s+"));
		if (objectrange) {
			return Object.keys(this.sss).map(key => this.sss[key]).map(ss => {
				let ci = new vscode.CompletionItem(skosResourceHandler.getLabel(ss),vscode.CompletionItemKind.Property);
				ci.insertText = skosParser.applyPrefix(ss.concept.text,document);
				ci.documentation = ss.description;
				return ci;
			});
		}
		
		let irirange = document.getWordRangeAtPosition(position,new RegExp(parser.iri));
		if (!irirange){ return []; }
		let triggerWord = document.getText(irirange);
		let result:vscode.CompletionItem[] = [];
		if (triggerWord === ""){
			return result;
		} 
		let predicateIriref = Object.keys(this.customAutoCompletePrefixedPredicates).filter(key => skosParser.getPrefix(key,document)===triggerWord)[0];
		if (predicateIriref) {
			result = result.concat(this.customAutoCompletePrefixedPredicates[predicateIriref].sort().map(prop => {
				let ci = new vscode.CompletionItem(prop,vscode.CompletionItemKind.Property);
				ci.sortText = "__"+prop;
				return ci;
			}));
		} 
		let objectIriref = Object.keys(this.customAutoCompletePrefixedObjects).filter(key => skosParser.getPrefix(key,document)===triggerWord)[0];
		if (objectIriref) {
			result = result.concat(this.customAutoCompletePrefixedObjects[objectIriref].sort().map(prop => {
				let ci = new vscode.CompletionItem(prop,vscode.CompletionItemKind.Constant);
				ci.sortText = "__"+prop;
				return ci;
			}));
		} 
		if (triggerWord === skosParser.getSkosPrefix(document)) {
			result = result.concat(["broader","narrower","notation","prefLabel",
				"altLabel","member","editorialNote","Concept","ConceptScheme",
				"inScheme","hasTopConcept","topConceptOf","Collection","related"].sort().map(prop => new vscode.CompletionItem(prop,vscode.CompletionItemKind.Property)));
		} 
		let prefix = skosParser.getPrefixes(document).filter(p => p.short === triggerWord.substring(0,triggerWord.indexOf(":")+1))[0];
		let iriref = skosParser.getPrefixes(document).filter(p => p.short === triggerWord.substring(0,triggerWord.indexOf(":")+1))[0]?.long;
		iriref = iriref.substring(0,iriref.length-1);
		result = result.concat(Object.keys(this.sss)
			.filter(c => c.startsWith(iriref))
			.map(c => {
				let name = c.replace(iriref,"");
				name = name.substring(0,name.length-1);
				let ci = new vscode.CompletionItem(name,vscode.CompletionItemKind.Reference);
				ci.documentation = this.sss[c].description;
				return ci;
			})
			.sort());
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