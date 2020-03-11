import * as vscode from 'vscode';
import { SkosNode } from './skosnode';
import { LocatedText, LocatedPredicateObject, iridefs, LocatedSubject } from './parser';

export class SubjectHandler {     
    getEmptySkosSubject(concept:LocatedSubject):SkosResource{
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

    updateReferences(sss: { [id: string] : SkosResource; }){
        this.addReferencedSSS(sss);
        this.addHierarchyReferences(sss);
        this.addDescription(sss);
        this.addIcon(sss);
    }
    
    
    private addReferencedSSS(sss:{ [id: string] : SkosResource; }){
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
    
    private addHierarchyReferences(sss:{ [id: string] : SkosResource; }){	
        let customHierarchicalReferencePredicatesNarrower:string[] = vscode.workspace.getConfiguration().get("skos-ttl-editor.customHierarchicalReferencePredicatesNarrower") || [];
        let customHierarchicalReferencePredicatesBroader:string[] = vscode.workspace.getConfiguration().get("skos-ttl-editor.customHierarchicalReferencePredicatesBroader") || [];
        let predicatesNarrower = [ iridefs.narrower, iridefs.member ].concat(customHierarchicalReferencePredicatesNarrower);
        let predicatesBroader = [ iridefs.broader, iridefs.inScheme ].concat(customHierarchicalReferencePredicatesBroader);
        Object.keys(sss).forEach(key => {
            let ti = sss[key];
            getStatementsByPredicate(predicatesBroader,ti).forEach(b => {
                if (Object.keys(sss).includes(b.object.text)){
                    let broaderti = sss[b.object.text];
                    if (!broaderti.children.includes(ti) && !this.getDescendants(ti).includes(broaderti) && broaderti !== ti) {
                        broaderti.children.push(ti);
                    }
                    if (!ti.parents.includes(broaderti) && !this.getAncestors(broaderti).includes(ti) && broaderti !== ti) {
                        ti.parents.push(broaderti);
                    }
                }
            });
            getStatementsByPredicate(predicatesNarrower,ti).forEach(n => {
                if (Object.keys(sss).includes(n.object.text)){
                    let narrowerti = sss[n.object.text];
                    if (!narrowerti.parents.includes(ti) && !this.getAncestors(ti).includes(narrowerti) && narrowerti !== ti) {
                        narrowerti.parents.push(ti);
                    }
                    if (!ti.children.includes(narrowerti) && !this.getDescendants(narrowerti).includes(ti) && narrowerti !== ti) {
                        ti.children.push(narrowerti);
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
    
    private addDescription(sss:{ [id: string] : SkosResource; }){
        Object.keys(sss).forEach(key => {
            let item = sss[key];
    
            item.description = new vscode.MarkdownString();
            item.description.appendMarkdown(this.getLabel(item)+"\n---\n");
            
            let pathMarkdown = "";
            let paths = this.getPaths([{top:item,stringPath:[]}]);
            paths.forEach((path:{top: SkosResource,stringPath: String[]})=>{
                let stringPath = (<String[]>[this.getLabel(path.top)]).concat(path.stringPath);
                stringPath.forEach((s,index) => {
                    for (let i=0;i<index;i++){
                        pathMarkdown+="    ";
                    }
                    pathMarkdown+="- "+s+"\n";
                });
            });		
            item.description.appendMarkdown(pathMarkdown);
    
            /*item.occurances.forEach((occ,index)=>{
                item.description.appendMarkdown("\n---\n"+occ.location.uri.fsPath.substr(occ.location.uri.fsPath.lastIndexOf("\\")+1) + ": Lines " + (occ.location.range.start.line+1) + " - " + (occ.location.range.end.line+1));
                item.description.appendCodeblock(occ.statement);
            });*/
        });
    }

    customIcons:CustomIconDefinition[]|undefined = vscode.workspace.getConfiguration().get("skos-ttl-editor.customIcons");
    private addIcon(sss:{ [id: string] : SkosResource; }){
        Object.keys(sss).forEach(key => {
            sss[key].statements.forEach(statement => {
                this.customIcons?.forEach(ci => {
                    if ((!ci.rule.subject || ci.rule.subject === key)
                        && (!ci.rule.predicate || ci.rule.predicate === statement.predicate.text)
                        && (!ci.rule.object || ci.rule.object === statement.object.text)){
                            if (ci.target === "subject"){
                                sss[key].icon = ci.icon;
                            }
                            else if (ci.target === "object") {
                                sss[statement.object.text].icon = ci.icon;
                            }
                        }     
                });
            });
        });
    }

    private getPaths(paths:{top: SkosResource,stringPath: String[]}[]):{top: SkosResource,stringPath: String[]}[]{
        let result:{top: SkosResource,stringPath: String[]}[] = [];
        paths.forEach((path:{top: SkosResource,stringPath: String[]})=>{
            if (path.top.parents.length > 0){	
                let newpaths:{top: SkosResource,stringPath: String[]}[] = path.top.parents.map(p => { 
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
    mergeSkosSubjects(allSkosSubjects:{[id:string]:{ [id: string] : SkosResource; }}, updateConcepts?:{
                currentConcepts: { [id: string] : SkosResource; },
                conceptsToUpdate: string[]
            }
        ):{ [id: string] : SkosResource; }{
        let sss:{ [id: string] : SkosResource; }={};
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

    getDescendants(s:SkosResource,result:SkosResource[]=[]):SkosResource[]{
        result.splice(result.length,0,...s.children);
        s.children.forEach(c => {
            this.getDescendants(c,result);
        });
        return result;
    }

    getAncestors(s:SkosResource,result:SkosResource[]=[]):SkosResource[]{
        result.splice(result.length,0,...s.parents);
        s.parents.forEach(p => {
            this.getAncestors(p,result);
        });
        return result;
    }

    getLabel(s:SkosResource):string{
        let englishLabels = getStatementsByPredicate(iridefs.prefLabel,s).filter(x => x.object.lang==="en");
        if (englishLabels.length === 0 || !englishLabels[0].object.literal){
            return s.concept.text;
        } else {
            return englishLabels[0].object.literal;
        }
    }

    getStatementsWithObjectReference(s:SkosResource):LocatedPredicateObject[]{
        return s.statements.filter(x => !x.object.literal);
    }
    
    getStatementsWithHierarchyReference(s:SkosResource):LocatedPredicateObject[]{
        let hierarchyReferences = [iridefs.broader,iridefs.member,iridefs.narrower,iridefs.topConceptOf,iridefs.hasTopConcept];
        return s.statements.filter(x => hierarchyReferences.includes(x.predicate.text));
    }
}

export function getStatementsByPredicate(predicate:string|string[],s:SkosResource):LocatedPredicateObject[]{
    return s.statements.filter(x => {
        if (typeof predicate === "string") {
            return x.predicate.text===predicate;
        }
        else if (predicate instanceof Array){
            return predicate.includes(x.predicate.text);
        }
    });
}

export function getObjectValuesByPredicate(predicate:string|string[],s:SkosResource):string[]{
    return getStatementsByPredicate(predicate,s).map(x => x.object.text);
}

export interface SkosResource {
    concept:LocatedSubject;
    statements:LocatedPredicateObject[];
	children:SkosResource[];
	parents:SkosResource[];
	virtual?:boolean;
	description:vscode.MarkdownString;
	treeviewNodes:SkosNode[];
	occurances:{
		location:vscode.Location,
		statement:string
    }[];
    icon?:string;
}

interface CustomIconDefinition {
	rule: {
		subject?: string;								
		predicate?: string;
		object?: string;
	};
	icon: string;
	target: "subject"|"object";
}