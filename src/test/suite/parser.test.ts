import * as assert from 'assert';

import * as vscode from 'vscode';
import * as parser from '../../parser';
import * as documenthandler from '../../documenthandler';
import * as resourceHandler from '../../skosresourcehandler';
import * as path from 'path';

suite('Parser Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    let skosResourceHandler = new resourceHandler.SkosResourceHandler({mergedSkosResources:{},allSkosResources:{}});
    test('Existance test', async () => {
        await new documenthandler.DocumentHandler({skosResourceHandler}).openTextDocument(vscode.Uri.file(path.join(__dirname,'../../../src/test/test.ttl'))).then(async doc => {
            await new parser.SkosParser(skosResourceHandler).parseTextDocument(doc).then(sss => {
                if (!sss){return;}
                let tr1 = sss["<http://data.dzl.de/ont/dwh#TestResource1>"];
                let tr11 = sss["<http://data.dzl.de/ont/dwh#TestResource11>"];
                let tr111 = sss["<http://data.dzl.de/ont/dwh#TestResource111>"];
                assert.ok(tr1);
                assert.ok(tr11);
            });
        });
    });

    test('Hierarchy test', async () => {
        await new documenthandler.DocumentHandler({skosResourceHandler}).openTextDocument(vscode.Uri.file(path.join(__dirname,'../../../src/test/test.ttl'))).then(async doc => {
            await new parser.SkosParser(skosResourceHandler).parseTextDocument(doc).then(sss => {
                if (!sss){return;}
                skosResourceHandler.updateReferences(sss);
                let tr1 = sss["<http://data.dzl.de/ont/dwh#TestResource1>"];
                let tr11 = sss["<http://data.dzl.de/ont/dwh#TestResource11>"];
                assert.ok(tr11.parents.includes(tr1));
            });
        });
    });
});