import * as assert from 'assert';

import * as vscode from 'vscode';
import * as parser from '../../parser';
import * as documenthandler from '../../documenthandler';
import * as subjecthandler from '../../subjecthandler';
import * as path from 'path';
import { SemanticHandler } from '../../semantichandler';

suite('Parser Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    let uri = vscode.Uri.file(path.join(__dirname,'../../../src/test/test.ttl'));

    test('Hierarchy diagnostic test', async () => {
        await new documenthandler.DocumentHandler({}).openTextDocument(uri).then(doc => {
            new parser.SkosParser().parseTextDocument(doc).then(sss => {
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
    });
});