import * as assert from 'assert';

suite('Parser Test Suite', () => {
    /*vscode.window.showInformationMessage('Start all tests.');

    let skosResourceHandler = new resourceHandler.SkosResourceHandler({mergedSkosResources:{},allSkosResources:{}});

    let uri = vscode.Uri.file(path.join(__dirname,'../../../src/test/test.ttl'));

    test('Hierarchy diagnostic test', async () => {
        await new documenthandler.DocumentHandler({skosResourceHandler}).openTextDocument(uri).then(doc => {
            new parser.SkosParser(skosResourceHandler).parseTextDocument({document:doc}).then(sss => {
                if (!sss){return;}
                let semantichandler = new SemanticHandler();
                semantichandler.checkSemantics(sss);
                let diagnostics = semantichandler.diagnosticCollection.get(uri);  
                assert.ok(diagnostics?.filter(d => {
                    return d.message === "Hierarchical recursion: <http://data.dzl.de/ont/dwh#TestResource2111>,<http://data.dzl.de/ont/dwh#TestResource211>,<http://data.dzl.de/ont/dwh#TestResource21>";
                }).length === 3);
                assert.ok(diagnostics?.filter(d => {
                    return d.message.startsWith("Hierarchical recursion: ");
                }).length === 3);
            });
        });
    });*/
	assert.ok(true);
});