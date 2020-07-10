import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { before } from 'mocha';
import { parseTextDocument } from '../../parser';
import { openTextDocument, sortLocations, showTextDocument, DocumentHandler, connectLocations, adjustOccurence } from '../../documenthandler';
import { SkosResource, skosResourceManager, SkosPredicateType, SkosSubjectType, Occurence } from '../../skosresourcehandler';
import { LoadingHandler, afterLoadingProcedureFinished } from '../../loadinghandler';
import { getDiagnostics } from '../../semantichandler';

suite('Loadinghandler Test Suite: Initial load + changes', () => {
    vscode.window.showInformationMessage('Start all tests.');

    
    let editor:vscode.TextEditor;
    let document:vscode.TextDocument;

    before(async ()=>{
        await openTextDocument(vscode.Uri.file(path.join(__dirname,'../../../src/test/test.ttl'))).then(showTextDocument).then(async e => {
            if (!e?.document){return;}
            editor=e;
            document = e.document;
        });
        await afterLoadingProcedureFinished();
    });

    test('initial parser result', async ()=>{
        let parsedResources=Object.keys(skosResourceManager.resources).map(key => skosResourceManager.resources[key]);
        assert.equal(parsedResources.length,19);
        assert.equal(JSON.stringify(parsedResources.map(resource => resource.id).sort()),JSON.stringify([
            "<http://data.dzl.de/ont/dwh#TestResource11>",
            "<http://data.dzl.de/ont/dwh#TestResource1>",
            "<http://data.dzl.de/ont/dwh#TestResource2111>",
            "<http://data.dzl.de/ont/dwh#TestResource211>",
            "<http://data.dzl.de/ont/dwh#TestResource21>",
            "<http://data.dzl.de/ont/dwh#TestResource2>",
            "<http://data.dzl.de/ont/dwh#TestResource3111>",
            "<http://data.dzl.de/ont/dwh#TestResource311>",
            "<http://data.dzl.de/ont/dwh#TestResource31>",
            "<http://data.dzl.de/ont/dwh#TestResource3>",
            "<http://data.dzl.de/ont/dwh#TestResource41>",
            "<http://data.dzl.de/ont/dwh#TestResource4>",
            "<http://data.dzl.de/ont/dwh#TestResource51>",
            "<http://data.dzl.de/ont/dwh#TestResource52>",
            "<http://data.dzl.de/ont/dwh#TestResource53>",
            "<http://data.dzl.de/ont/dwh#TestResource54>",
            "<http://data.dzl.de/ont/dwh#TestCollection1>",
            "<http://data.dzl.de/ont/dwh#TestScheme1>",
            "unknownPrefix:TestResource55"
        ].sort()));            
        
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].predicateObjects[2].documentOffset.start,463);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].predicateObjects[2].documentOffset.end,490);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].predicateObjects[2].predicate.documentOffset.start,463);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].predicateObjects[2].predicate.documentOffset.end,475);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].predicateObjects[2].object.documentOffset.start,476);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].predicateObjects[2].object.documentOffset.end,490);

        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].occurences[0].documentOffset.start,616);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].occurences[0].documentOffset.end,767);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].occurences[0].location().range.start.line,27);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].occurences[0].location().range.start.character,0);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].occurences[0].location().range.end.line,31);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].occurences[0].location().range.end.character,1);

        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource41>"].predicateObjects[1].documentOffset.start,1528);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource41>"].predicateObjects[2].documentOffset.start,1570);
    });

    test('initial evaluation result', async ()=>{                  
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2>"].occurences.length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader).length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader)[0].resource.id,"<http://data.dzl.de/ont/dwh#TestResource21>");
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader).length,0);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower).length,0);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower).length,0);
        
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].occurences.length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader).length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader)[0].resource.id,"<http://data.dzl.de/ont/dwh#TestResource211>");
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader).length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader)[0].resource.id,"<http://data.dzl.de/ont/dwh#TestResource2>");
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower).length,0);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower).length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower)[0].resource.id,"<http://data.dzl.de/ont/dwh#TestResource2111>");
        
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].occurences.length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader).length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader)[0].resource.id,"<http://data.dzl.de/ont/dwh#TestResource2111>");
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader).length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader)[0].resource.id,"<http://data.dzl.de/ont/dwh#TestResource21>");
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower).length,0);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower).length,0);
            
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource1>"].references.filter(reference => reference.external).length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource11>"].references.filter(reference => reference.external).length,0);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2>"].references.filter(reference => reference.external).length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => reference.external).length,2);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].references.filter(reference => reference.external).length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].references.filter(reference => reference.external).length,0);
        
        assert.ok(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestScheme1>"].types.includes(SkosSubjectType.ConceptScheme));
    });  

    test('initial semantic check result', ()=>{
        let diagnosticsOccurences = getDiagnostics().map(d => d.occurence);
        let x = skosResourceManager.resources;
        assert.equal(diagnosticsOccurences.length,14);
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].predicateObjects[2]));
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].predicateObjects[2]));
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].predicateObjects[3]));
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource41>"].predicateObjects[1]));
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource41>"].predicateObjects[2]));
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestCollection1>"].predicateObjects[6].object));
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource51>"].occurences[0]));
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource52>"].predicateObjects[0]));
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource52>"].predicateObjects[1]));
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource52>"].predicateObjects[2]));
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource53>"].predicateObjects[1].object));
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource53>"].predicateObjects[2].object));
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource54>"].occurences[0]));
        assert.ok(diagnosticsOccurences.includes(skosResourceManager.resources["unknownPrefix:TestResource55"].idOccurences[0]));
    });

    let contentChanges1 = [
        {
            range: new vscode.Range(new vscode.Position(13,31),new vscode.Position(18,40)),
            rangeLength: 121,
            rangeOffset: 339,
            text: ""
        }
    ];
    let changeEvents:vscode.TextDocumentChangeEvent[];
    let ceLocations:vscode.Location[];
    let affectedResources:SkosResource[]|undefined;
    let locationsToParse:vscode.Location[]|undefined;

    test('get affected resources by contentchange', async ()=>{
        changeEvents = [{
            document: document,
            contentChanges:contentChanges1
        }];         
        let ceOccurences = changeEvents.map(ce => {
            return ce.contentChanges.map(cc => {
                let occ = new Occurence(ce.document.uri, {
                    start:cc.rangeOffset,
                    end:cc.rangeOffset+cc.rangeLength
                });
                adjustOccurence(occ,changeEvents.filter(x => x !== ce));
                return occ;
            });
        }).reduce((prev,curr)=>prev=prev.concat(curr),[]);
        affectedResources = skosResourceManager.removeIntersectingOccurences(ceOccurences);
        
        assert.equal(affectedResources && affectedResources.length,2);
        assert.equal(affectedResources && JSON.stringify(affectedResources.map(r => r.id).sort()),
            JSON.stringify(["<http://data.dzl.de/ont/dwh#TestResource21>","<http://data.dzl.de/ont/dwh#TestResource2>"].sort()));
    });

    test('resetting resources by contentchange', async ()=>{
        if (!affectedResources){
            assert.ok(false);
            return;
        }
        //ohne diese Zeile gibt es einen noch unerklärlichen Fehler
        await parseTextDocument({document:undefined});

        skosResourceManager.resetResourceEvaluations(affectedResources);
        
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2>"].occurences.length,0);//change
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader).length,0);//change
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader).length,0);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower).length,0);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower).length,0);
        
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].occurences.length,0);//change
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader).length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader)[0].resource.id,"<http://data.dzl.de/ont/dwh#TestResource211>");
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader).length,0);//change
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower).length,0);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower).length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource21>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower)[0].resource.id,"<http://data.dzl.de/ont/dwh#TestResource2111>");
        
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].occurences.length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader).length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader)[0].resource.id,"<http://data.dzl.de/ont/dwh#TestResource2111>");
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader).length,1);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Broader)[0].resource.id,"<http://data.dzl.de/ont/dwh#TestResource21>");
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].references.filter(reference => !reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower).length,0);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].references.filter(reference => reference.external && reference.predicateObject.predicate.type === SkosPredicateType.Narrower).length,0);
    });

    test('first content change and get locations to parse by contentchange',async ()=>{
        await editor.edit((editBuilder)=>{
            if (changeEvents){
                editBuilder.delete(changeEvents[0].contentChanges[0].range);
            }
        }); 

        locationsToParse = connectLocations(skosResourceManager.getNewLocationsToParseByChangeEvents(changeEvents));

        assert.equal(locationsToParse && locationsToParse.length,1);
        assert.equal(locationsToParse && locationsToParse[0].range.start.line,11);
        assert.equal(locationsToParse && locationsToParse[0].range.start.character,1);
        assert.equal(locationsToParse && locationsToParse[0].range.end.line,17);
        assert.equal(locationsToParse && locationsToParse[0].range.end.character,0);

        await afterLoadingProcedureFinished();
    });

    test('adjusted locations after contentchange', async ()=>{        
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].occurences[0].documentOffset.start,378);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].occurences[0].documentOffset.end,491);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].occurences[0].location().range.start.line,17);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].occurences[0].location().range.start.character,0);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].occurences[0].location().range.end.line,20);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource211>"].occurences[0].location().range.end.character,1);
        
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].occurences[0].documentOffset.start,495);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].occurences[0].documentOffset.end,646);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].occurences[0].location().range.start.line,22);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].occurences[0].location().range.start.character,0);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].occurences[0].location().range.end.line,26);
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"].occurences[0].location().range.end.character,1);
    });

    test('revert first change', async ()=>{ 
        await editor.edit((editBuilder)=>{
            if (changeEvents){
                editBuilder.insert(document.positionAt(339),`
    skos:prefLabel "Test Resource 2"@en ;
.

:TestResource21 a skos:Concept ;
    skos:prefLabel "Test Resource 2.1"@en ;`);
            }
        }); 
        await afterLoadingProcedureFinished();
    });

    //another change
    let contentChanges2 = [
        {
            range: new vscode.Range(new vscode.Position(23,33),new vscode.Position(28,34)),
            rangeLength: 118,
            rangeOffset: 532,
            text: ""
        }
    ];
    changeEvents=[];

    test('second change', async()=>{
        changeEvents = [{
            document: document,
            contentChanges:contentChanges2
        }]; 
        await editor.edit((editBuilder)=>{
            if (changeEvents){
                editBuilder.delete(changeEvents[0].contentChanges[0].range);
            }
        }); 
        await afterLoadingProcedureFinished();
    });

    test('resource state after second change', async ()=>{
        assert.equal(skosResourceManager.resources["<http://data.dzl.de/ont/dwh#TestResource2111>"],undefined);
    });
});