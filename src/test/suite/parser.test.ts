import * as assert from 'assert';

import * as vscode from 'vscode';
import * as parser from '../../parser';
import * as documenthandler from '../../documenthandler';
import * as subjecthandler from '../../subjecthandler';
import * as path from 'path';

suite('Parser Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Existance test', async () => {
        await new documenthandler.DocumentHandler({}).openTextDocument(vscode.Uri.file(path.join(__dirname,'../../../src/test/test.ttl'))).then(doc => {
            let sss = new parser.SkosParser().parseTextDocument(doc)||{};
            let tr1 = sss["<http://data.dzl.de/ont/dwh#TestResource1>"];
            let tr11 = sss["<http://data.dzl.de/ont/dwh#TestResource11>"];
            let tr111 = sss["<http://data.dzl.de/ont/dwh#TestResource111>"];
            assert.ok(tr1);
            assert.ok(tr11);
        });
    });

    test('Hierarchy test', async () => {
        await new documenthandler.DocumentHandler({}).openTextDocument(vscode.Uri.file(path.join(__dirname,'../../../src/test/test.ttl'))).then(doc => {
            let sss = new parser.SkosParser().parseTextDocument(doc)||{};
            new subjecthandler.SubjectHandler().updateReferences(sss);
            let tr1 = sss["<http://data.dzl.de/ont/dwh#TestResource1>"];
            let tr11 = sss["<http://data.dzl.de/ont/dwh#TestResource11>"];
            assert.ok(tr11.parents.includes(tr1));
        });
    });
});