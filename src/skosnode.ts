  import * as vscode from 'vscode';
import { SkosResource } from './skosresourcehandler';
  
  export class SkosNode {
	private concept:string;
	private label:string|undefined;
	private children:SkosNode[]=[];
	private parent:SkosNode|undefined;
	private notations:string[]=[];
	private virtual?:boolean;
	private description:vscode.MarkdownString|undefined;
    private iconname:string|undefined;
    private types:string[]=[];
    private occurances:{
        location:vscode.Location
    }[]=[];

    constructor(concept:string){
        this.concept = concept || "root";
    }
    setNodeAttributes(attributes: {
        children?:SkosNode[],
        parent?:SkosNode,
        label?:string,
        notations?:string[],
        iconname?:string,
        types?:string[],
        occurances?:{
            location:vscode.Location
        }[]
    }){
        if (attributes.children) {
            this.children = attributes.children;
        }
        if (attributes.parent){
            this.parent = attributes.parent;
        }
        if (attributes.label) {
            this.label = attributes.label;
        }
        if (attributes.notations) {
            this.notations = attributes.notations;
        }
        if (attributes.iconname) {
            this.iconname = attributes.iconname;
        }
        if (attributes.occurances){
            this.occurances = attributes.occurances;
        }
        if (attributes.types){
            this.types = attributes.types;
        }
    }
    getLabel(){
        return this.label || this.concept;
    }
    getChildren(){
        return this.children;
    }
    getDescription(){
        return this.notations.join(",");
    }
    getConcept(){
        return this.concept;
    }
    getIconname(){
        return this.iconname;
    }
    getParent(){
        return this.parent;
    }
    getLocations(){
        return this.occurances.map(o => o.location);
    }
    getOccurances(){
        return this.occurances;
    }
    getTypes():string[]{
        return this.types;
    }
}