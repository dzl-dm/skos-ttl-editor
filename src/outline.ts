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
  import { skosResourceManager, SkosResource, SkosSubjectType, SkosPredicateType } from './skosresourcehandler';

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
        this.tree = rootNodes.filter(n => n.getTypes().includes(SkosSubjectType.ConceptScheme)).sort(this.treeSortByLabel);
        this.tree = this.tree.concat(rootNodes.filter(n => n.getTypes().includes(SkosSubjectType.Collection)).sort(this.treeSortByLabel));
        this.tree = this.tree.concat(rootNodes.filter(n => n.getTypes().includes(SkosSubjectType.Concept)).sort(this.treeSortByLabel));
        this.tree = this.tree.concat(rootNodes.filter(n => n.getTypes().filter(x => [SkosSubjectType.Concept,SkosSubjectType.ConceptScheme,SkosSubjectType.Collection].includes(x)).length === 0).sort(this.treeSortByLabel));
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
        if (!element){return new TreeItem("<<Empty>>");}
        let treeItem = new TreeItem(element.getLabel());
        if (element.getChildren().length>0){
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
        treeItem.iconPath = this.getIcon(element);
        treeItem.description = element.getNotations();
        treeItem.id = element.getId();
        let x:SkosNode|undefined = element;
        while (x = x.getParent()){
          treeItem.id = x.getId() + "/" + treeItem.id;
        }
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
  
    constructor(context: ExtensionContext) {
      this.treeDataProvider = new SkosTreeDataProvider(context);
      let treeDataProvider = this.treeDataProvider;
      this.treeView = window.createTreeView("skosOutline", {
        treeDataProvider
      });
    }

    setTree(rootNodes: SkosNode[]){
      this.treeDataProvider.setTree(rootNodes);
    }
    selectTreeItem(node: SkosNode){
      if (this.checkIfNodeInTree(node)){
        this.treeView.reveal(node,{select:true});
      }
    }
    selectTreeItems(nodes: SkosNode[]){
      nodes.forEach(node => this.selectTreeItem(node));
    }
    private checkIfNodeInTree(node: SkosNode):boolean{
      return this.checkNodes(this.topnodes, node);
    }
    private checkNodes(nodes:SkosNode[], nodeToCheck:SkosNode):boolean{
      for (let node of nodes){
        if (node === nodeToCheck){
          return true;
        }
        if (this.checkNodes(node.getChildren(), nodeToCheck)){
          return true;
        }
      }
      return false;
    }

    private topnodes:SkosNode[]=[];
    async createTreeviewContent(){
      this.topnodes = [];
      let topResources = Object.keys(skosResourceManager.resources).map(key => skosResourceManager.resources[key]).filter(resource => resource.broaders().length === 0);
      for (let resource of topResources){
        this.topnodes.push(this.createTreeNode({resource}));
      }
      this.setTree(this.topnodes);
    }

    createTreeNode(options:{
      resource:SkosResource,
      parents?:SkosResource[], 
      parentNode?:SkosNode,
      treeScheme?:SkosResource
    }):SkosNode{
      let [ parents, resource, parentNode, treeScheme ] = [ options.parents || [], options.resource, options.parentNode, options.treeScheme ];
      let newNode = new SkosNode(resource,parentNode);
      newNode.init();
      resource.treeNode = newNode;
      let treeChildren:SkosResource[];
      if (resource.types.includes(SkosSubjectType.ConceptScheme)){
        treeScheme = resource;
        treeChildren = resource.schemeMembers().filter(r =>{
          //without parent in the scheme (if they have a parent in scheme, they will be recognized by the else-clause)
          for (let parent of r.parents()){if (parent.inScheme(resource)){return false;}}
          return true;
        });
      } else if (treeScheme) {
        //TODO: decide whether narrowers not in scheme should be shown as tree children or not
        treeChildren = resource.narrowers().filter(r => treeScheme && r.inScheme(treeScheme));
      } else {
        treeChildren = resource.narrowers();
      }
      treeChildren.forEach(narrower => {
        //recursion check
        if (parents.includes(narrower)){return;}
        let childNode = this.createTreeNode({resource: narrower, parents: parents.concat(narrower), parentNode: newNode, treeScheme});
        newNode.addChild(childNode);
      });
      return newNode;
    }
}