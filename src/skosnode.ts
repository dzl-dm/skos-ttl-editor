import * as vscode from 'vscode';
import { SkosSubjectType, SkosResource } from './skosresourcehandler';

export class SkosNode {
	private label:string|undefined;
	private children:SkosNode[]=[];
	private parent:SkosNode|undefined;
	private notations:string[]=[];
    private skosResource:SkosResource;

    constructor(resource:SkosResource,parent?:SkosNode){
        this.skosResource = resource;
        this.parent = parent;
    }
    init(){
        this.label = this.skosResource.label();
        this.notations = this.skosResource.notations();
    }
    getLabel(){
        return this.label || this.skosResource.id;
    }
    getChildren(){
        return this.children;
    }
    addChild(child:SkosNode){
        this.children.push(child);
    }
    getNotations(){
        return this.notations.join(",");
    }
    getId(){
        return this.skosResource.id;
    }
    getIconname(){
        let icons = this.skosResource.references.filter(reference => 
            reference.iconDefinition 
            && reference.iconDefinition.target==="subject"
            && reference.resource === this.skosResource).map(reference => reference.iconDefinition?.icon);
        return icons.length > 0 && icons[0] || undefined;
    }
    getParent(){
        return this.parent;
    }
    getLocations(){
        return this.skosResource.occurences.map(o => o.location());
    }
    getoccurences(){
        return this.skosResource.occurences;
    }
    getTypes():SkosSubjectType[]{
        return this.skosResource.types;
    }
    getResource():SkosResource{
        return this.skosResource;
    }
}

export interface IconDefinition {
	rule: {
		subject?: string;								
		predicate?: string|string[];
		object?: string;
	};
	icon: string;
	target: "subject"|"object";
}
let customIconDefinitions:IconDefinition[] = vscode.workspace.getConfiguration().get("skos-ttl-editor.customIcons") || [];
export const iconDefinitions:IconDefinition[]=(<IconDefinition[]>[
    {
        rule: {
            predicate: ["a","<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>"],
            object: "<http://www.w3.org/2004/02/skos/core#ConceptScheme>"
        },
        icon: "dependency",
        target: "subject"
    },
    {
        rule: {
            predicate: ["a","<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>"],
            object: "<http://www.w3.org/2004/02/skos/core#Collection>"
        },
        icon: "folder",
        target: "subject"
    }
]).concat(customIconDefinitions);