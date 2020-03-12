import {
    Event,
    EventEmitter,
    ExtensionContext,
    TreeDataProvider,
    TreeItem,
    TreeView,
    window
  } from "vscode";
  import { iridefs } from './parser';

  import * as vscode from 'vscode';
  import { SkosNode } from './skosnode';
  import * as path from 'path';

  export class SkosTreeDataProvider implements TreeDataProvider<SkosNode> {
    private _onDidChangeTreeData: EventEmitter<SkosNode | null> = new EventEmitter<SkosNode | null>();
    readonly onDidChangeTreeData: Event<SkosNode | null> = this._onDidChangeTreeData.event;
    private context: ExtensionContext;
    private tree: SkosNode[];
    constructor(context: ExtensionContext, rootNodes?: SkosNode[]) {
        this.context = context;
        this.tree = rootNodes||[];
    }
    treeSortByLabel = (a:SkosNode,b:SkosNode)=>{
      let suborderedStartCharacters = ["_","<",":"];
      if (!suborderedStartCharacters.includes(a.getLabel()[0]) && suborderedStartCharacters.includes(b.getLabel()[0])){
        return -1;
      } else if (suborderedStartCharacters.includes(a.getLabel()[0]) && !suborderedStartCharacters.includes(b.getLabel()[0])){
        return 1;
      } else if (a.getLabel()<b.getLabel()) {
        return -1;
      } else if (a.getLabel()>b.getLabel()){
        return 1;
      } else {
        return 0;
      }
    }
    setTree(rootNodes:SkosNode[]){
        this.tree = rootNodes.filter(n => n.getTypes().includes(iridefs.conceptScheme)).sort(this.treeSortByLabel);
        this.tree = this.tree.concat(rootNodes.filter(n => n.getTypes().includes(iridefs.collection)).sort(this.treeSortByLabel));
        this.tree = this.tree.concat(rootNodes.filter(n => n.getTypes().includes(iridefs.concept)).sort(this.treeSortByLabel));
        this.tree = this.tree.concat(rootNodes.filter(n => n.getTypes().filter(x => [iridefs.conceptScheme,iridefs.collection,iridefs.concept].includes(x)).length === 0).sort(this.treeSortByLabel));
        this.refresh();
    }
    getChildren(element?: SkosNode): SkosNode[] | Thenable<SkosNode[]> {
        if (element === undefined) {
            return this.tree;
        } else {
            return element.getChildren().sort(this.treeSortByLabel);
        }
    }
    getTreeItem(element: SkosNode): TreeItem {
        let treeItem = new TreeItem(element.getLabel());
        if (element.getChildren().length>0){
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
        treeItem.iconPath = this.getIcon(element);
        treeItem.description = element.getDescription();
        treeItem.id = element.getParent()?.getConcept() + "/" + element.getConcept();
        treeItem.command = {
          arguments: [ element ],
          title: "Selection",
          command: "skos-ttl-editor.selectConcept"
        };
        return treeItem;
    }
    getParent(element?: SkosNode): SkosNode | Thenable<SkosNode> | undefined {
      return element?.getParent();
    }
    refresh(){
        this._onDidChangeTreeData.fire();
    }

    private getIcon(node: SkosNode): any {
      let nodeType;
      if (node.getTypes().includes(iridefs.conceptScheme)) {
        nodeType = "dependency";
      }
      if (node.getTypes().includes(iridefs.collection)) {
        nodeType = "folder";
      }
      if (node.getIconname() !== undefined) {
        nodeType = <string>node.getIconname();
      }
      if (nodeType !== undefined) {
        return {
          light: this.context.asAbsolutePath(path.join('resources', 'light', nodeType+'.svg')),
          dark: this.context.asAbsolutePath(path.join('resources', 'dark', nodeType+'.svg'))
        };
      }
      return null;
	  }
}
  
export class SkosOutlineProvider {
    treeView: TreeView<SkosNode|undefined>;
    private treeDataProvider:SkosTreeDataProvider;
  
    constructor(context: ExtensionContext, rootNodes?: SkosNode[]) {
      this.treeDataProvider = new SkosTreeDataProvider(context, rootNodes);
      let treeDataProvider = this.treeDataProvider;
      this.treeView = window.createTreeView("skosOutline", {
        treeDataProvider
      });
    }

    setTree(rootNodes: SkosNode[]){
      this.treeDataProvider.setTree(rootNodes);
    }
    selectTreeItem(node: SkosNode){
      this.treeView.reveal(node,{select:true});
    }
    selectTreeItems(nodes: SkosNode[]){
      nodes.forEach(node => this.selectTreeItem(node));
    }
  }