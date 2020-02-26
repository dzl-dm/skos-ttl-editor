import * as vscode from 'vscode';
import { SkosNode } from './skosnode';

export class SubjectHandler { 
    getEmptySkosSubject(concept:string):SkosSubject{
        return {
            concept:concept,
            label:concept,
            children:[],
            parents:[],
            broader:[],
            narrower:[],
            notations:[],
            virtual:true,
            description:new vscode.MarkdownString(""),
            occurances:[],
            schemes:[],
            treeviewNodes:[],
            type:undefined,
            collections:[],
            topconcepts:[],
            members:[]
        };
    }

    updateReferences(sss: { [id: string] : SkosSubject; }){
        this.addReferencedSSS(sss);
        this.addHierarchyReferences(sss);
        this.addDescription(sss);
    }
    
    
    private addReferencedSSS(sss:{ [id: string] : SkosSubject; }){
        Object.keys(sss).forEach(key => {
            let ti = sss[key];
            ti.broader.concat(ti.narrower).concat(ti.schemes).concat(ti.topconcepts).concat(ti.collections).concat(ti.members).forEach(b => {
                if (!Object.keys(sss).includes(b)){
                    let t = this.getEmptySkosSubject(b);
                    sss[b]=t;
                }
            });	
        });
    }
    
    private addHierarchyReferences(sss:{ [id: string] : SkosSubject; }){	
        Object.keys(sss).forEach(key => {
            let ti = sss[key];
            ti.broader.concat(ti.schemes).forEach(b => {
                if (Object.keys(sss).includes(b)){
                    if (sss[b].children.filter(x => x.concept === ti.concept).length === 0) {
                        sss[b].children.push(ti);
                    }
                    if (ti.parents.filter(x => x.concept === sss[b].concept).length === 0) {
                        ti.parents.push(sss[b]);
                    }
                }
            });
            ti.narrower.concat(ti.members).forEach(n => {
                if (Object.keys(sss).includes(n)){
                    if (sss[n].parents.filter(x => x.concept === ti.concept).length === 0) {
                        sss[n].parents.push(ti);
                    }
                    if (ti.children.filter(x => x.concept === sss[n].concept).length === 0) {
                        ti.children.push(sss[n]);
                    }
                }
            });
            ti.topconcepts.forEach(tc => sss[tc].schemes.push(ti.concept));
        });
    }
    
    private addDescription(sss:{ [id: string] : SkosSubject; }){
        Object.keys(sss).forEach(key => {
            let item = sss[key];
    
            item.description = new vscode.MarkdownString();
            item.description.appendMarkdown(item.label+"\n---\n");
            
            let pathMarkdown = "";
            let paths = this.getPaths([{top:item,stringPath:[]}]);
            paths.forEach((path:{top: SkosSubject,stringPath: String[]})=>{
                let stringPath = (<String[]>[path.top.label||path.top.concept]).concat(path.stringPath);
                stringPath.forEach((s,index) => {
                    for (let i=0;i<index;i++){
                        pathMarkdown+="    ";
                    }
                    pathMarkdown+="- "+s+"\n";
                });
            });		
            item.description.appendMarkdown(pathMarkdown);
    
            item.occurances.forEach((occ,index)=>{
                item.description.appendMarkdown("\n---\n"+occ.location.uri.fsPath.substr(occ.location.uri.fsPath.lastIndexOf("\\")+1) + ": Lines " + (occ.location.range.start.line+1) + " - " + (occ.location.range.end.line+1));
                item.description.appendCodeblock(occ.statement);
            });
        });
    }

    private getPaths(paths:{top: SkosSubject,stringPath: String[]}[]):{top: SkosSubject,stringPath: String[]}[]{
        let result:{top: SkosSubject,stringPath: String[]}[] = [];
        paths.forEach((path:{top: SkosSubject,stringPath: String[]})=>{
            if (path.top.parents.length > 0){	
                let newpaths:{top: SkosSubject,stringPath: String[]}[] = path.top.parents.map(p => { 
                    return {
                        top:p,
                        stringPath:(<String[]>[path.top.label||path.top.concept]).concat(path.stringPath)
                    };
                });
                result = result.concat(this.getPaths(newpaths));
            }
            else {
                result.push(path);
            }
        });	
        return result;
    }   
    mergeSkosSubjects(allSkosSubjects:{[id:string]:{ [id: string] : SkosSubject; }}, updateConcepts?:{
                currentConcepts: { [id: string] : SkosSubject; },
                conceptsToUpdate: string[]
            }
        ):{ [id: string] : SkosSubject; }{
        let sss:{ [id: string] : SkosSubject; }={};
        Object.keys(allSkosSubjects).forEach(filename => {
            Object.keys(allSkosSubjects[filename]).forEach(subjectname => {
                if (updateConcepts && !updateConcepts.conceptsToUpdate.includes(subjectname) && Object.keys(updateConcepts.currentConcepts).includes(subjectname)){
                    sss[subjectname] = updateConcepts.currentConcepts[subjectname];
                }
                else {
                    let ss = allSkosSubjects[filename][subjectname];
                    if (!sss[subjectname]){
                        sss[subjectname] = this.getEmptySkosSubject(subjectname);
                    }

                    sss[subjectname].children.push(...ss.children);
                    sss[subjectname].label = sss[subjectname].label !== subjectname && sss[subjectname].label || ss.label;
                    sss[subjectname].narrower.push(...ss.narrower);
                    sss[subjectname].broader.push(...ss.broader);
                    sss[subjectname].notations.push(...ss.notations);
                    sss[subjectname].parents.push(...ss.parents);
                    sss[subjectname].occurances.push(...ss.occurances);
                    sss[subjectname].schemes.push(...ss.schemes);
                    sss[subjectname].collections.push(...ss.collections);
                    sss[subjectname].topconcepts.push(...ss.topconcepts);
                    sss[subjectname].members.push(...ss.members);
                    sss[subjectname].type = ss.type !== undefined && ss.type || sss[subjectname].type;

                    sss[subjectname].children = sss[subjectname].children.filter((value,index,self) => self.map(c => c.concept).indexOf(value.concept) === index);
                    sss[subjectname].parents = sss[subjectname].parents.filter((value,index,self) => self.map(p => p.concept).indexOf(value.concept) === index);
                    sss[subjectname].narrower = sss[subjectname].narrower.filter((value,index,self) => self.indexOf(value) === index);
                    sss[subjectname].broader = sss[subjectname].broader.filter((value,index,self) => self.indexOf(value) === index);
                    sss[subjectname].notations = sss[subjectname].notations.filter((value,index,self) => self.indexOf(value) === index);
                    sss[subjectname].schemes = sss[subjectname].schemes.filter((value,index,self) => self.indexOf(value) === index);
                    sss[subjectname].collections = sss[subjectname].collections.filter((value,index,self) => self.indexOf(value) === index);
                    sss[subjectname].topconcepts = sss[subjectname].topconcepts.filter((value,index,self) => self.indexOf(value) === index);
                    sss[subjectname].members = sss[subjectname].members.filter((value,index,self) => self.indexOf(value) === index);
                }
                if (!sss[subjectname]){console.log(subjectname);}
            });
        });
        return sss;
    }

    getSubTree(s:SkosSubject):SkosSubject[]{
        let result:SkosSubject[] = [s];
        s.children.forEach(c => {
            result = result.concat(this.getSubTree(c));
        });
        return result;
    }
}

export interface SkosSubject {
	concept:string;
	label:string;
	broader:string[];
	narrower:string[];
	children:SkosSubject[];
	parents:SkosSubject[];
	schemes:string[];
	notations:string[];
	virtual?:boolean;
	description:vscode.MarkdownString;
	treeviewNodes:SkosNode[];
	occurances:{
		location:vscode.Location,
		statement:string
    }[];
    collections:string[];
    members:string[];
    topconcepts:string[];
	type:"skos:Concept"|"skos:ConceptScheme"|"skos:Collection"|undefined;
}