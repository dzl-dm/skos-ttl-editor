import * as vscode from 'vscode';
import { SkosNode } from './skosnode';
import { LocatedText, LocatedPredicateObject, iridefs, LocatedSubject } from './parser';

export class SubjectHandler {     
    getEmptySkosSubject(concept:LocatedSubject):SkosSubject{
        return {
            concept:concept,
            statements:[],
            children:[],
            parents:[],
            virtual:true,
            description:new vscode.MarkdownString(""),
            occurances:[],
            treeviewNodes:[]
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
            this.getStatementsWithHierarchyReference(ti).forEach(b => {
                if (!Object.keys(sss).includes(b.object.text)){
                    let t = this.getEmptySkosSubject({text: b.object.text});
                    sss[b.object.text]=t;
                }
            });	
        });
    }
    
    private addHierarchyReferences(sss:{ [id: string] : SkosSubject; }){	
        Object.keys(sss).forEach(key => {
            let ti = sss[key];
            getStatementsByPredicate(iridefs.broader,ti).concat(getStatementsByPredicate(iridefs.inScheme,ti)).forEach(b => {
                if (Object.keys(sss).includes(b.object.text)){
                    if (sss[b.object.text].children.filter(x => x.concept === ti.concept).length === 0) {
                        sss[b.object.text].children.push(ti);
                    }
                    if (ti.parents.filter(x => x.concept === sss[b.object.text].concept).length === 0) {
                        ti.parents.push(sss[b.object.text]);
                    }
                }
            });
            getStatementsByPredicate(iridefs.narrower,ti).concat(getStatementsByPredicate(iridefs.member,ti)).forEach(n => {
                if (Object.keys(sss).includes(n.object.text)){
                    if (sss[n.object.text].parents.filter(x => x.concept === ti.concept).length === 0) {
                        sss[n.object.text].parents.push(ti);
                    }
                    if (ti.children.filter(x => x.concept === sss[n.object.text].concept).length === 0) {
                        ti.children.push(sss[n.object.text]);
                    }
                }
            });
            getStatementsByPredicate(iridefs.topConceptOf,ti).forEach(tc => {
                sss[tc.object.text].statements.push({
                    location:tc.location,
                    text:tc.text,
                    predicate:{
                        location:tc.predicate.location,
                        text:iridefs.conceptScheme,
                    },
                    object:{
                        location:tc.object.location,
                        text:ti.concept.text
                    }
                });
            });
        });
    }
    
    private addDescription(sss:{ [id: string] : SkosSubject; }){
        Object.keys(sss).forEach(key => {
            let item = sss[key];
    
            item.description = new vscode.MarkdownString();
            item.description.appendMarkdown(this.getLabel(item)+"\n---\n");
            
            let pathMarkdown = "";
            let paths = this.getPaths([{top:item,stringPath:[]}]);
            paths.forEach((path:{top: SkosSubject,stringPath: String[]})=>{
                let stringPath = (<String[]>[this.getLabel(path.top)]).concat(path.stringPath);
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
                        stringPath:(<String[]>[this.getLabel(path.top)]).concat(path.stringPath)
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
                        sss[subjectname] = this.getEmptySkosSubject(ss.concept);
                    }

                    sss[subjectname].children.push(...ss.children);
                    sss[subjectname].parents.push(...ss.parents);
                    sss[subjectname].occurances.push(...ss.occurances);
                    sss[subjectname].statements.push(...ss.statements);   

                    sss[subjectname].children = sss[subjectname].children.filter((value,index,self) => self.map(c => c.concept).indexOf(value.concept) === index);
                    sss[subjectname].parents = sss[subjectname].parents.filter((value,index,self) => self.map(p => p.concept).indexOf(value.concept) === index);
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

    getLabel(s:SkosSubject):string{
        let englishLabels = getStatementsByPredicate(iridefs.prefLabel,s).filter(x => x.object.lang==="en");
        if (englishLabels.length === 0 || !englishLabels[0].object.literal){
            return s.concept.text;
        } else {
            return englishLabels[0].object.literal;
        }
    }

    getStatementsWithObjectReference(s:SkosSubject):LocatedPredicateObject[]{
        return s.statements.filter(x => !x.object.literal);
    }
    
    getStatementsWithHierarchyReference(s:SkosSubject):LocatedPredicateObject[]{
        let hierarchyReferences = [iridefs.broader,iridefs.member,iridefs.narrower,iridefs.topConceptOf,iridefs.hasTopConcept];
        return s.statements.filter(x => hierarchyReferences.includes(x.predicate.text));
    }
}

export function getStatementsByPredicate(predicate:string,s:SkosSubject):LocatedPredicateObject[]{
    return s.statements.filter(x => x.predicate.text===predicate);
}

export function getObjectValuesByPredicate(predicate:string,s:SkosSubject):string[]{
    return getStatementsByPredicate(predicate,s).map(x => x.object.text);
}

export interface SkosSubject {
    concept:LocatedSubject;
    statements:LocatedPredicateObject[];
	children:SkosSubject[];
	parents:SkosSubject[];
	virtual?:boolean;
	description:vscode.MarkdownString;
	treeviewNodes:SkosNode[];
	occurances:{
		location:vscode.Location,
		statement:string
    }[];
}