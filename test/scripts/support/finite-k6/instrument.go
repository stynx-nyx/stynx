// Inspector-only AST instrumentation of the exact native Run function.
// Never build the final derivative from this diagnostic source copy.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
)

type site struct {
	Original    string `json:"original"`
	Replacement string `json:"replacement"`
	Line        int    `json:"line"`
	Column      int    `json:"column"`
}

func main() {
	if len(os.Args) != 4 {
		panic("expected exact source path, SHA256 and manifest destination")
	}
	path, expected, manifest := os.Args[1], os.Args[2], os.Args[3]
	source, err := os.ReadFile(path)
	must(err)
	digest := sha256.Sum256(source)
	if hex.EncodeToString(digest[:]) != expected {
		panic("native source digest differs")
	}
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, path, source, parser.ParseComments)
	must(err)
	var before bytes.Buffer
	must(format.Node(&before, fset, file))
	var run *ast.FuncDecl
	for _, decl := range file.Decls {
		if f, ok := decl.(*ast.FuncDecl); ok && f.Name.Name == "Run" && f.Recv != nil {
			if run != nil {
				panic("ambiguous Run")
			}
			run = f
		}
	}
	if run == nil {
		panic("native Run absent")
	}
	replacements := map[string]string{"time.NewTimer": "inspectorFiniteNewTimer", "time.Since": "inspectorFiniteSince", "time.Now": "inspectorFiniteNow", "getDurationContexts": "inspectorFiniteDurationContexts"}
	counts := map[string]int{}
	var sites []site
	type change struct {
		call     *ast.CallExpr
		original ast.Expr
	}
	var changes []change
	ast.Inspect(run.Body, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		var name bytes.Buffer
		must(format.Node(&name, fset, call.Fun))
		key := name.String()
		replacement, ok := replacements[key]
		if !ok {
			return true
		}
		counts[key]++
		pos := fset.Position(call.Pos())
		sites = append(sites, site{key, replacement, pos.Line, pos.Column})
		changes = append(changes, change{call, call.Fun})
		call.Fun = ast.NewIdent(replacement)
		return true
	})
	for key, count := range map[string]int{"time.NewTimer": 1, "time.Since": 2, "time.Now": 1, "getDurationContexts": 1} {
		if counts[key] != count {
			panic(fmt.Sprintf("unexpected native AST sites for %s: %d", key, counts[key]))
		}
	}
	var transformed bytes.Buffer
	must(format.Node(&transformed, fset, file))
	for _, changed := range changes {
		changed.call.Fun = changed.original
	}
	var reversed bytes.Buffer
	must(format.Node(&reversed, fset, file))
	if !bytes.Equal(before.Bytes(), reversed.Bytes()) {
		panic("non-whitelist native structure changed")
	}
	must(os.WriteFile(path, transformed.Bytes(), 0600))
	out := sha256.Sum256(transformed.Bytes())
	result := map[string]interface{}{"scope": "Inspector-only exact native Run AST clock/context instrumentation", "sourceSha256": expected, "instrumentedSha256": hex.EncodeToString(out[:]), "sites": sites, "nonWhitelistASTUnchanged": true, "actualPoolDropAllocationCancellationCleanupRetained": true, "productionInstrumentation": false, "runtimeAdmission": false, "performanceQualified": false}
	encoded, err := json.MarshalIndent(result, "", "  ")
	must(err)
	must(os.WriteFile(manifest, append(encoded, '\n'), 0600))
}
func must(err error) {
	if err != nil {
		panic(err)
	}
}
