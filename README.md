# skos-ttl-editor
An extension for Visual Studio Code for simplified editing of SKOS Turtle (.ttl) files.

<p align="center">
   <img src="images/showcase.png" />
</p>

### Features

- Tree view for SKOS datasets, considering schemes, collections and all SKOS hierarchical relations like broader, narrower, inScheme and member
- Go to implementation for IRIs
- Go to references for IRIs
- Hover information for IRIs
- Autocompletion for SKOS
- Semantic checks, e.g. unique prefLabel and unambiguous type definition (Concept, ConceptScheme and Collection)
- Load whole workspace directory for SKOS resource completion
- Customizable hierarchical relations, tree view icons and auto completion terms

### Recommendation
Also have a look at extensions by Stardog (RDF Languages Extension Pack).

### Preferences

##### Define custom auto completion for predicates and objects
In this example, when typing the rdf-prefix, a list with "type", "hasPart" and "partOf" will be suggested.
```js
"skos-ttl-editor.customAutoCompletePrefixedPredicates": {
   "<http://www.w3.org/1999/02/22-rdf-syntax-ns#>": [
      "type",
      "hasPart",
      "partOf"
   ],
   "<http://purl.org/dc/elements/1.1/>": [
      "description"
   ]
},
"skos-ttl-editor.customAutoCompleteObjects": {

},
```
##### Define custom icons for the tree view based on rules
In this example, a subject with predicate "rdf:partOf" will receive the "puzzle.svg" icon.
```js
"skos-ttl-editor.customIcons": [
   {
      "rule": {
         "predicate": "<http://www.w3.org/1999/02/22-rdf-syntax-ns#partOf>"
      },
      "icon": "puzzle",
      "target": "subject"
   },
   {
      "rule": {
         "predicate": "<http://www.w3.org/1999/02/22-rdf-syntax-ns#hasPart>"
      },
      "icon": "puzzle",
      "target": "object"
   }
]
```
##### Define custom hierarchical references
In this example, resources will be subordinated in the tree view according to the "rdf:hasPart" and "rdf:partOf" relations.
```js
"skos-ttl-editor.customHierarchicalReferencePredicatesNarrower": [
   "<http://www.w3.org/1999/02/22-rdf-syntax-ns#hasPart>"
],
"skos-ttl-editor.customHierarchicalReferencePredicatesBroader": [
   "<http://www.w3.org/1999/02/22-rdf-syntax-ns#partOf>"
]
```