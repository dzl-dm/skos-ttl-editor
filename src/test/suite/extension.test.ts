import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as extension from '../../extension';
import * as documenthandler from '../../documenthandler';
import * as path from 'path';
import { SkosResourceHandler } from '../../skosresourcehandler';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Hover provider test', async () => {
		let uri = vscode.Uri.file(path.join(__dirname,'../../../src/test/test.ttl'));
		await new documenthandler.DocumentHandler({skosResourceHandler:new SkosResourceHandler({allSkosResources:{},mergedSkosResources:{}})}).selectSingleTextSnippet(
			new vscode.Location(
				uri,
				new vscode.Range(
					new vscode.Position(0,0),
					new vscode.Position(0,0)
				)
			)
		);
		let hoverResult = <vscode.Hover[]>await vscode.commands.executeCommand('vscode.executeHoverProvider',uri,new vscode.Position(18,1));
		let mdString = (<vscode.MarkdownString>hoverResult[0].contents[0]).value;
		assert.equal(mdString,'Test Resource 1.1\n---\n- Test Resource 1\n    - Test Resource 1.1\n');
	});
});
