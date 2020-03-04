import * as vscode from 'vscode';
import { SkosOutlineProvider } from './outline';
import { SkosNode } from './skosnode';
import * as parser from './parser';
import { SkosParser, iridefs } from './parser';
import { SkosResource, SubjectHandler, getObjectValuesByPredicate } from './subjecthandler';
import { DocumentHandler } from './documenthandler';
import { SemanticHandler } from './semantichandler';

let semanticHandler = new SemanticHandler();
let subjectHandler = new SubjectHandler();
let skosParser = new SkosParser(subjectHandler);
let documentHandler = new DocumentHandler(subjectHandler);

export function activate(context: vscode.ExtensionContext) {
	let allSkosSubjects: { [id: string] : { [id: string] : SkosResource; }} = {};
	const mergedSkosSubjects: { [id: string] : SkosResource; } = {};
	const skosOutlineProvider = new SkosOutlineProvider(context);

	vscode.commands.registerCommand('skos-ttl-editor.addConcept', (node:SkosNode) => {
		let text = ":NEWCONCEPT"+Date.now()+" a skos:Concept ;\n";
		text += "\tskos:broader "+node.getConcept()+" ;\n";
		text += "\tskos:prefLabel \"New Concept\"@en ;\n";
		text += ".";
		documentHandler.insertText(mergedSkosSubjects[node.getConcept()],text,"after").then(()=>{
			vscode.window.showInformationMessage("Added concept \""+node.getLabel()+"\" to concept \""+node.getLabel()+"\".");
		});
	});
	vscode.commands.registerCommand('skos-ttl-editor.appendToScheme', (node:SkosNode) => {
		vscode.window.showQuickPick(
			Object.keys(mergedSkosSubjects)
				.map(key => mergedSkosSubjects[key])
				.filter(s => getObjectValuesByPredicate(iridefs.type,s).includes(iridefs.conceptScheme))
				.map(s => s.concept.text)
		).then(a => {
			if (!a || node.getTypes().includes(iridefs.conceptScheme)) {return;}
			documentHandler.insertText(
				mergedSkosSubjects[node.getConcept()],
				"\tskos:inScheme "+a+" ;",
				"append"
			).then(()=>{
				vscode.window.showInformationMessage("Added concept \""+node.getLabel()+"\" to scheme \""+a+"\".");
			});
		});
	});
	vscode.commands.registerCommand('skos-ttl-editor.appendSubtreeToScheme', (node:SkosNode) => {
		vscode.window.showQuickPick(
			Object.keys(mergedSkosSubjects)
				.map(key => mergedSkosSubjects[key])
				.filter(s => getObjectValuesByPredicate(iridefs.type,s).includes(iridefs.conceptScheme))
				.map(s => s.concept.text)
		).then(a => {
			if (!a || node.getTypes().includes(iridefs.conceptScheme)) {return;}
			let concepts = subjectHandler.getSubTree(mergedSkosSubjects[node.getConcept()]).filter(s => !getObjectValuesByPredicate(iridefs.inScheme,s).includes(a));
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

	function loadTextDocuments(documents:(vscode.TextDocument|Thenable<vscode.TextDocument>|undefined)[],inputThroughTyping:boolean=true):Promise<any>{
		return new Promise((resolve,reject)=>{
			semanticHandler.reset();
			let numberOfDocuments:number = documents.length;
			if (numberOfDocuments > 1) {
				vscode.window.showInformationMessage("Loading "+numberOfDocuments+" documents...");
			}
			let numberOfLoadedTextDocuments = 0;
			let updateConcepts:{
                currentConcepts: { [id: string] : SkosResource; },
                conceptsToUpdate: string[]
            } = { currentConcepts: mergedSkosSubjects, conceptsToUpdate: []};
			documents.forEach((document:vscode.TextDocument|Thenable<vscode.TextDocument>|undefined) =>  {
				if (!document){return;}
				Promise.resolve(document).then(d => {
					let newsss = skosParser.parseTextDocument(d);
					if (!newsss) {					
						if (!inputThroughTyping) {
							vscode.window.showInformationMessage(d.uri.fsPath + " is not well formatted.");
						}
					}
					else {
						allSkosSubjects[d.uri.path] = newsss;
					}
					updateConcepts.conceptsToUpdate = updateConcepts.conceptsToUpdate.concat(Object.keys(newsss || {}));
					numberOfLoadedTextDocuments++;
					if (numberOfLoadedTextDocuments >= numberOfDocuments){
						Object.keys(mergedSkosSubjects).forEach(key => delete mergedSkosSubjects[key]);
						let mergedSkosSubjectsTemp = subjectHandler.mergeSkosSubjects(allSkosSubjects, updateConcepts);
						Object.keys(mergedSkosSubjectsTemp).forEach(key => {
							mergedSkosSubjects[key] = mergedSkosSubjectsTemp[key];
						});
						subjectHandler.updateReferences(mergedSkosSubjects);
						createTreeviewContent(skosOutlineProvider,mergedSkosSubjects);
						semanticHandler.checkSemantics(mergedSkosSubjects);
						resolve();
					}
				});
			});		
		});		
	}

	loadTextDocuments([vscode.window.activeTextEditor?.document],false);

	let onDidChangeTextDocumentLock = Promise.resolve();
	let loadDocumentsPromiseFinished = true;
	let queuedChangeEvent: vscode.TextDocumentChangeEvent|undefined;
	function loadTextDocumentsAfterTextDocumentChange(changeEvent: vscode.TextDocumentChangeEvent){
		if (loadDocumentsPromiseFinished){
			loadDocumentsPromiseFinished = false;
			onDidChangeTextDocumentLock = loadTextDocuments([vscode.window.activeTextEditor?.document]);
			onDidChangeTextDocumentLock.then(()=>{
				loadDocumentsPromiseFinished=true;
				if (queuedChangeEvent){
					loadTextDocumentsAfterTextDocumentChange(queuedChangeEvent);
					queuedChangeEvent = undefined;
				}
				else if (vscode.window.activeTextEditor) {
					let selectedConcepts = getConceptsAtRange(vscode.window.activeTextEditor.document, vscode.window.activeTextEditor?.selections[0]);
					if (selectedConcepts.length>0) { 
						skosOutlineProvider.selectTreeItem(selectedConcepts[0].treeviewNodes[0]); 
					}
				}
			});
		}
		else {
			queuedChangeEvent = changeEvent;
		}
	}
	let inputDelay:NodeJS.Timeout;
	vscode.workspace.onDidChangeTextDocument(changeEvent => {
		if (inputDelay){
			clearTimeout(inputDelay);
		}
		inputDelay = setTimeout(()=>{
			loadTextDocumentsAfterTextDocumentChange(changeEvent);
		},500);
	});	

	vscode.window.onDidChangeTextEditorSelection((selection)=>{
		if (!queuedChangeEvent){
			if (selection.kind !== vscode.TextEditorSelectionChangeKind.Mouse) { return; }
			let selectedConcepts = getConceptsAtRange(selection.textEditor.document,selection.selections[0]);
			if (selectedConcepts.length>0) { 
				skosOutlineProvider.selectTreeItem(selectedConcepts[0].treeviewNodes[0]); 
			}
		}
	});

	function getConceptsAtRange(document:vscode.TextDocument, range:vscode.Range):SkosResource[]{
		let lineFrom = range.start.line;
		let lineTo = range.end.line;
		let keys = Object.keys(mergedSkosSubjects);
		let concepts:SkosResource[]=[];
		for (let i = 0; i < keys.length; i++) {
			let key = keys[i];
			let locations = mergedSkosSubjects[key].occurances.map(o => o.location);
			for (let j = 0; j < locations.length; j++){
			let location = locations[j];
				if (location.uri.fsPath === document.uri.fsPath && location.range.start.line <= lineTo && location.range.end.line >= lineFrom) {
					concepts.push(mergedSkosSubjects[key]);
				}
			}
		}	
		return concepts;	
	}

	vscode.window.onDidChangeActiveTextEditor(changeEvent => {
		if (!vscode.window.activeTextEditor){return;}
		if (!Object.keys(allSkosSubjects).includes(vscode.window.activeTextEditor.document.uri.path)){
			loadTextDocuments([vscode.window.activeTextEditor?.document],false);
		}
	});

	context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
			'turtle', 
			new CompletionItemProvider(
				mergedSkosSubjects,
				vscode.workspace.getConfiguration().get("skos-ttl-editor.customAutoCompletePredicates"),
				vscode.workspace.getConfiguration().get("skos-ttl-editor.customAutoCompleteObjects")
			), 
			':',' ')
		);
	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			'turtle', new ConceptHoverProvider(mergedSkosSubjects)));
	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			'turtle', new SkosDocumentSymbolProvider(mergedSkosSubjects)));
	/*context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(
			'turtle', new ConceptDefinitionProvider(mergedSkosSubjects)));*/
	context.subscriptions.push(
		vscode.languages.registerImplementationProvider(
			'turtle', new ConceptImplementationProvider(mergedSkosSubjects)));
	context.subscriptions.push(
		vscode.languages.registerReferenceProvider(
			'turtle', new ConceptReferenceProvider(mergedSkosSubjects)));

	vscode.commands.registerCommand('skos-ttl-editor.reload', () => {
		Object.keys(allSkosSubjects).forEach(key => delete allSkosSubjects[key]);
		Object.keys(mergedSkosSubjects).forEach(key => delete mergedSkosSubjects[key]);		
		if (vscode.window.activeTextEditor){
			loadTextDocuments([vscode.window.activeTextEditor.document]);	
		}
	});	
	vscode.commands.registerCommand('skos-ttl-editor.complementFiles', () => {
		if (vscode.window.activeTextEditor){
			vscode.workspace.findFiles('*.ttl').then(files => {
				if (files.length === 0){
					vscode.window.showInformationMessage("No files to load. Did you open a folder in Visual Studio Code?");
				}
				loadTextDocuments(
					files.filter(file => !Object.keys(allSkosSubjects).includes(file.path))
						.map(file => vscode.workspace.openTextDocument(file.path)),
					false
				);
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

class ConceptDefinitionProvider implements vscode.DefinitionProvider {
	private sss:{ [id: string] : SkosResource; }={};
	public constructor(sss:{ [id: string] : SkosResource; }){
		this.sss = sss;
	}
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Location | vscode.Location[] | vscode.LocationLink[]> {		
		let definitionIri = document.getText(document.getWordRangeAtPosition(position,new RegExp(parser.iri)));
		let items = Object.keys(this.sss).filter(i => i===definitionIri);
		if (items.length>0) {
			if (this.sss[items[0]].occurances.length === 1){
				return this.sss[items[0]].occurances[0].location;
			}
			else if (this.sss[items[0]].occurances.length > 1){
				showQuickPicksForConceptTextSelection(this.sss[items[0]].occurances.map(o => o.location));
			}
		}
		return null;
	}
}

class ConceptReferenceProvider implements vscode.ReferenceProvider {
	private sss:{ [id: string] : SkosResource; }={};
	public constructor(sss:{ [id: string] : SkosResource; }){
		this.sss = sss;
	}	
	provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Location[]> {
		let referenceIri = document.getText(document.getWordRangeAtPosition(position,new RegExp(parser.iri)));
		referenceIri = skosParser.resolve(referenceIri,document) || referenceIri;
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
		implementationIri = skosParser.resolve(implementationIri,document) || implementationIri;
		let items = Object.keys(this.sss).filter(i => i===implementationIri);
		return this.sss[items[0]].occurances.map(o => o.location);
	}
}

class ConceptHoverProvider implements vscode.HoverProvider {
	private sss:{ [id: string] : SkosResource; }={};
	public constructor(sss:{ [id: string] : SkosResource; }){
		this.sss = sss;
	}
    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):vscode.Hover {
		let hoveredIri = document.getText(document.getWordRangeAtPosition(position,new RegExp(parser.iri)));
		let items = Object.keys(this.sss).filter(i => i===hoveredIri);
		if (items.length>0) {
			return new vscode.Hover(this.sss[items[0]].description);
		} else {
			return new vscode.Hover("");
		}
    }
}

class CompletionItemProvider implements vscode.CompletionItemProvider {
	private sss:{ [id: string] : SkosResource; }={};
	private customAutoCompletePredicates: { [id: string] : string[]; }={};
	private customAutoCompleteObjects: { [id: string] : string[]; }={};
	public constructor(sss:{ [id: string] : SkosResource; },customAutoCompletePredicates:{}={},customAutoCompleteObjects:{}={}){
		this.sss = sss;
		this.customAutoCompletePredicates = customAutoCompletePredicates;
		this.customAutoCompleteObjects = customAutoCompleteObjects;
	}
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext):vscode.CompletionItem[] {
		let objectrange = document.getWordRangeAtPosition(position,new RegExp("skos:(broader|narrower|member|topConceptOf|hasTopConcept|related)\\s+"));
		if (objectrange) {
			return Object.keys(this.sss).map(key => this.sss[key]).map(ss => {
				let ci = new vscode.CompletionItem(subjectHandler.getLabel(ss),vscode.CompletionItemKind.Property);
				ci.insertText = ss.concept.text;
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
		if (Object.keys(this.customAutoCompletePredicates).includes(triggerWord)) {
			result = result.concat(this.customAutoCompletePredicates[triggerWord].sort().map(prop => {
				let ci = new vscode.CompletionItem(prop,vscode.CompletionItemKind.Property);
				ci.sortText = "__"+prop;
				return ci;
			}));
		} 
		if (Object.keys(this.customAutoCompleteObjects).includes(triggerWord)) {
			result = result.concat(this.customAutoCompleteObjects[triggerWord].sort().map(prop => {
				let ci = new vscode.CompletionItem(prop,vscode.CompletionItemKind.Constant);
				ci.sortText = "__"+prop;
				return ci;
			}));
		} 
		if (triggerWord === "skos:") {
			result = result.concat(["broader","narrower","notation","prefLabel",
				"altLabel","member","editorialNote","Concept","ConceptScheme",
				"inScheme","hasTopConcept","topConceptOf","Collection","related"].sort().map(prop => new vscode.CompletionItem(prop,vscode.CompletionItemKind.Property)));
		} 
		let prefix = triggerWord.substring(0,triggerWord.indexOf(":")+1);
		result = result.concat(Object.keys(this.sss)
			.filter(c => c.startsWith(prefix))
			.map(c => {
				let ci = new vscode.CompletionItem(c.substr(prefix.length),vscode.CompletionItemKind.Reference);
				ci.documentation = this.sss[c].description;
				return ci;
			})
			.sort());
		return result;
	}
}

function createTreeviewContent(skosOutlineProvider:SkosOutlineProvider, sss:{ [id: string] : SkosResource; } ){	
	let topsss: SkosResource[]=[];
	Object.keys(sss).forEach(key => {
		if (sss[key].parents.filter(p => !getObjectValuesByPredicate(iridefs.type,p).includes(iridefs.conceptScheme)).length===0){
			topsss.push(sss[key]);
		}
	});
	let topnodes:SkosNode[]=[];
	function addSkosNodes(m:SkosResource,node:SkosNode,scheme?:string){
		let childnodes:SkosNode[]=[];
		m.children.forEach(c => {
			if (scheme && !getObjectValuesByPredicate(iridefs.inScheme,c).includes(scheme)){return;}
			let childnode = new SkosNode(c.concept.text);
			childnode.setNodeAttributes({parent:node});
			childnodes.push(childnode);
			addSkosNodes(c,childnode,scheme);
		});
		node.setNodeAttributes({
			children:childnodes,
			label:subjectHandler.getLabel(m),
			notations:getObjectValuesByPredicate(iridefs.notation,m),
			iconname: m.icon,
			occurances: m.occurances,
			types: getObjectValuesByPredicate(iridefs.type,m)
		});
		m.treeviewNodes.push(node);
	}
	let schemes = Object.keys(sss)
		.map(key => getObjectValuesByPredicate(iridefs.inScheme,sss[key]))
		.reduce((prev,current) => prev = prev.concat(current),[])
		.filter((value, index, array) => array.indexOf(value)===index);
	topsss.forEach(m => {
		let topnode = new SkosNode(m.concept.text);
		topnodes.push(topnode);
		if (schemes.includes(m.concept.text)){
			let topschemenodes = Object.keys(sss)
				.map(key => sss[key])
				.filter(s => getObjectValuesByPredicate(iridefs.inScheme,s).includes(m.concept.text) && !s.parents.map(p => getObjectValuesByPredicate(iridefs.inScheme,p)).reduce((p,c)=>p=p.concat(c),[]).includes(m.concept.text));
			m.children = topschemenodes;
			addSkosNodes(m,topnode,m.concept.text);
		}
		else {
			addSkosNodes(m,topnode);
		}
	});
	skosOutlineProvider.setTree(topnodes);
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