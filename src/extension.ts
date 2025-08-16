import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/////////////////////////////////
/////////// CONSTANTS ///////////
/////////////////////////////////

// Spice language keywords and built-ins
const SPICE_KEYWORDS = [
    'interface', 'abstract', 'final', 'static', 'extends', 'implements',
    'def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return',
    'import', 'from', 'as', 'with', 'try', 'except', 'finally', 'raise',
    'pass', 'break', 'continue', 'True', 'False', 'None', 'and', 'or',
    'not', 'in', 'is', 'lambda', 'switch', 'case', 'default'
];

// Line endings that do not require a ;
const VALID_LINE_ENDINGS = [
    ';',
    ':',
    '{',
    '}'
]

// Used as a warning on compile to "not" override built in methods
const PYTHON_BUILTINS = [
    'abs',
    'aiter',
    'all',
    'anext',
    'any',
    'ascii',
    'bin',
    'bool',
    'breakpoint',
    'bytearray',
    'bytes',
    'callable',
    'chr',
    'classmethod',
    'compile',
    'complex',
    'delattr',
    'dict',
    'dir',
    'divmod',
    'enumerate',
    'eval',
    'exec',
    'filter',
    'float',
    'format',
    'frozenset',
    'getattr',
    'globals',
    'hasattr',
    'hash',
    'help',
    'hex',
    'id',
    'input',
    'int',
    'isinstance',
    'issubclass',
    'iter',
    'len',
    'list',
    'locals',
    'map',
    'max',
    'memoryview',
    'min',
    'next',
    'object',
    'oct',
    'open',
    'ord',
    'pow',
    'print',
    'property',
    'range',
    'repr',
    'reversed',
    'round',
    'set',
    'setattr',
    'slice',
    'sorted',
    'staticmethod',
    'str',
    'sum',
    'super',
    'tuple',
    'type',
    'vars',
    'zip',
    '__import__'
]

/////////////////////////////////
///////////// LOGIC /////////////
/////////////////////////////////

export function activate(context: vscode.ExtensionContext) {
    console.log('Spice Language extension is now active!');

    // Registration

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        'spice',
        new SpiceCompletionItemProvider(),
        '.', '(', '[', '{', ' '
    );

    const hoverProvider = vscode.languages.registerHoverProvider(
        'spice',
        new SpiceHoverProvider()
    );

    const signatureProvider = vscode.languages.registerSignatureHelpProvider(
        'spice',
        new SpiceSignatureHelpProvider(),
        '(', ','
    );

    const definitionProvider = vscode.languages.registerDefinitionProvider(
        'spice',
        new SpiceDefinitionProvider()
    );

    const symbolProvider = vscode.languages.registerDocumentSymbolProvider(
        'spice',
        new SpiceDocumentSymbolProvider()
    );

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('spice');

    const compileCommand = vscode.commands.registerCommand('spice.compile', compileSpiceFile);
    const runCommand = vscode.commands.registerCommand('spice.run', runSpiceFile);
    const checkSyntaxCommand = vscode.commands.registerCommand('spice.checkSyntax', checkSyntax);
    const enableBuiltinOverrideCheckCommand = vscode.commands.registerCommand('spice.enableBuiltinOverrideCheck', enableBuiltinOverrideCheck);

    // Listeners
    const didChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === 'spice') {
            updateDiagnostics(event.document, diagnosticCollection);
        }
    });

    const didOpenTextDocument = vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.languageId === 'spice') {
            updateDiagnostics(document, diagnosticCollection);
        }
    });

    context.subscriptions.push(
        completionProvider,
        hoverProvider,
        signatureProvider,
        definitionProvider,
        symbolProvider,
        diagnosticCollection,
        compileCommand,
        runCommand,
        checkSyntaxCommand,
        enableBuiltinOverrideCheckCommand,
        didChangeTextDocument,
        didOpenTextDocument
    );
}

class SpiceCompletionItemProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        const items: vscode.CompletionItem[] = [];

        // Keywords
        for (const keyword of SPICE_KEYWORDS) {
            const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
            item.detail = 'Spice keyword';
            items.push(item);
        }

        // Built-in functions
        for (const builtin of PYTHON_BUILTINS) {
            const item = new vscode.CompletionItem(builtin, vscode.CompletionItemKind.Function);
            item.detail = 'Built-in function';
            items.push(item);
        }

        // Snippets for common patterns
        items.push(...this.getSnippetCompletions());

        // Parse document for user-defined classes, functions, and interfaces
        items.push(...this.parseDocumentSymbols(document));

        return items;
    }

    private getSnippetCompletions(): vscode.CompletionItem[] {
        const snippets: vscode.CompletionItem[] = [];

        // line break - Interface
        const interfaceSnippet = new vscode.CompletionItem('interface', vscode.CompletionItemKind.Snippet);
        interfaceSnippet.insertText = new vscode.SnippetString(
            'interface ${1:Name} {\n\tdef ${2:method}(${3:params}) -> ${4:ReturnType};\n}'
        );
        interfaceSnippet.detail = 'Interface declaration';
        interfaceSnippet.documentation = 'Create a new interface';
        snippets.push(interfaceSnippet);

        // line break - Abstract class
        const abstractClassSnippet = new vscode.CompletionItem('abstract class', vscode.CompletionItemKind.Snippet);
        abstractClassSnippet.insertText = new vscode.SnippetString(
            'abstract class ${1:Name} {\n\tabstract def ${2:method}() -> ${3:ReturnType};\n\t\n\tdef ${4:concrete_method}() -> None {\n\t\t${5:pass};\n\t}\n}'
        );
        abstractClassSnippet.detail = 'Abstract class declaration';
        snippets.push(abstractClassSnippet);

        // line break - Final class
        const finalClassSnippet = new vscode.CompletionItem('final class', vscode.CompletionItemKind.Snippet);
        finalClassSnippet.insertText = new vscode.SnippetString(
            'final class ${1:Name} {\n\tdef __init__(self${2:, params}) -> None {\n\t\t${3:pass};\n\t}\n}'
        );
        finalClassSnippet.detail = 'Final class declaration';
        snippets.push(finalClassSnippet);

        // line break - Static method
        const staticMethodSnippet = new vscode.CompletionItem('static def', vscode.CompletionItemKind.Snippet);
        staticMethodSnippet.insertText = new vscode.SnippetString(
            'static def ${1:method_name}(${2:params}) -> ${3:ReturnType} {\n\t${4:pass};\n}'
        );
        staticMethodSnippet.detail = 'Static method declaration';
        snippets.push(staticMethodSnippet);

        return snippets;
    }

    private parseDocumentSymbols(document: vscode.TextDocument): vscode.CompletionItem[] {
        const symbols: vscode.CompletionItem[] = [];
        const text = document.getText();

        // line break - Parse classes
        const classRegex = /(?:abstract\s+|final\s+)?class\s+(\w+)/g;
        let match;
        while ((match = classRegex.exec(text)) !== null) {
            const item = new vscode.CompletionItem(match[1], vscode.CompletionItemKind.Class);
            item.detail = 'User-defined class';
            symbols.push(item);
        }

        // line break - Parse interfaces
        const interfaceRegex = /interface\s+(\w+)/g;
        while ((match = interfaceRegex.exec(text)) !== null) {
            const item = new vscode.CompletionItem(match[1], vscode.CompletionItemKind.Interface);
            item.detail = 'User-defined interface';
            symbols.push(item);
        }

        // line break - Parse functions
        const functionRegex = /def\s+(\w+)\s*\(/g;
        while ((match = functionRegex.exec(text)) !== null) {
            const item = new vscode.CompletionItem(match[1], vscode.CompletionItemKind.Function);
            item.detail = 'User-defined function';
            symbols.push(item);
        }

        return symbols;
    }
}

// Provide hover info for Spice keywords
class SpiceHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return;

        const word = document.getText(wordRange);

        if (word === 'interface') {
            return new vscode.Hover([
                '**interface** keyword',
                'Declares an interface (Protocol in Python) that defines method signatures',
                '```spice\ninterface Drawable {\n    def draw() -> None;\n}\n```'
            ]);
        }

        if (word === 'abstract') {
            return new vscode.Hover([
                '**abstract** modifier',
                'Marks a class or method as abstract (must be overridden)',
                '```spice\nabstract class Shape {\n    abstract def area() -> float;\n}\n```'
            ]);
        }

        if (word === 'final') {
            return new vscode.Hover([
                '**final** modifier',
                'Prevents a class from being inherited or a method from being overridden',
                '```spice\nfinal class Dog extends Animal {\n    final def bark() -> None { ... }\n}\n```'
            ]);
        }

        if (word === 'static') {
            return new vscode.Hover([
                '**static** modifier',
                'Declares a static method that belongs to the class rather than instances',
                '```spice\nstatic def utility_function() -> None {\n    pass;\n}\n```'
            ]);
        }

        if (word === 'extends') {
            return new vscode.Hover([
                '**extends** keyword',
                'Specifies class inheritance',
                '```spice\nclass Dog extends Animal { ... }\n```'
            ]);
        }

        if (word === 'implements') {
            return new vscode.Hover([
                '**implements** keyword',
                'Specifies that a class implements one or more interfaces',
                '```spice\nclass Circle extends Shape implements Drawable { ... }\n```'
            ]);
        }

        return undefined;
    }
}

class SpiceSignatureHelpProvider implements vscode.SignatureHelpProvider {
    provideSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.SignatureHelpContext
    ): vscode.ProviderResult<vscode.SignatureHelp> {
        // Find function calls and provide parameter hints
        const lineText = document.lineAt(position.line).text;
        const functionCallRegex = /(\w+)\s*\(/g;

        let match;
        while ((match = functionCallRegex.exec(lineText)) !== null) {
            if (match.index <= position.character && position.character <= match.index + match[0].length) {
                const functionName = match[1];

                // Provide signature for known functions
                const help = new vscode.SignatureHelp();

                if (functionName === 'print') {
                    const signature = new vscode.SignatureInformation('print(*objects, sep=" ", end="\\n")');
                    signature.parameters = [
                        new vscode.ParameterInformation('*objects', 'Objects to print'),
                        new vscode.ParameterInformation('sep=" "', 'String separator'),
                        new vscode.ParameterInformation('end="\\n"', 'String appended after the last value')
                    ];
                    help.signatures = [signature];
                    help.activeSignature = 0;
                    help.activeParameter = 0;
                    return help;
                }
            }
        }

        return undefined;
    }
}

class SpiceDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return;

        const word = document.getText(wordRange);
        const text = document.getText();

        // Class
        const classRegex = new RegExp(`(?:abstract\\s+|final\\s+)?class\\s+${word}\\b`, 'g');
        let match = classRegex.exec(text);
        if (match) {
            const pos = document.positionAt(match.index + match[0].indexOf(word));
            return new vscode.Location(document.uri, pos);
        }

        // Interface
        const interfaceRegex = new RegExp(`interface\\s+${word}\\b`, 'g');
        match = interfaceRegex.exec(text);
        if (match) {
            const pos = document.positionAt(match.index + match[0].indexOf(word));
            return new vscode.Location(document.uri, pos);
        }

        // Method
        const methodRegex = new RegExp(`def\\s+${word}\\s*\\(`, 'g');
        match = methodRegex.exec(text);
        if (match) {
            const pos = document.positionAt(match.index + match[0].indexOf(word));
            return new vscode.Location(document.uri, pos);
        }

        return undefined;
    }
}

class SpiceDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        const symbols: vscode.DocumentSymbol[] = [];
        const text = document.getText();

        // Parse classes
        const classRegex = /(?:abstract\s+|final\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w\s,]+)?/g;
        let match;
        while ((match = classRegex.exec(text)) !== null) {
            const name = match[1];
            const startPos = document.positionAt(match.index);
            const endPos = this.findBlockEnd(document, startPos);
            const range = new vscode.Range(startPos, endPos);
            const symbol = new vscode.DocumentSymbol(
                name,
                'class',
                vscode.SymbolKind.Class,
                range,
                range
            );
            symbols.push(symbol);
        }

        // Parse interfaces
        const interfaceRegex = /interface\s+(\w+)/g;
        while ((match = interfaceRegex.exec(text)) !== null) {
            const name = match[1];
            const startPos = document.positionAt(match.index);
            const endPos = this.findBlockEnd(document, startPos);
            const range = new vscode.Range(startPos, endPos);
            const symbol = new vscode.DocumentSymbol(
                name,
                'interface',
                vscode.SymbolKind.Interface,
                range,
                range
            );
            symbols.push(symbol);
        }

        // Parse functions
        const functionRegex = /(?:static\s+|final\s+|abstract\s+)?def\s+(\w+)\s*\([^)]*\)(?:\s*->\s*\w+)?/g;
        while ((match = functionRegex.exec(text)) !== null) {
            const name = match[1];
            const startPos = document.positionAt(match.index);
            const endPos = this.findBlockEnd(document, startPos);
            const range = new vscode.Range(startPos, endPos);
            const symbol = new vscode.DocumentSymbol(
                name,
                'function',
                vscode.SymbolKind.Function,
                range,
                range
            );
            symbols.push(symbol);
        }

        return symbols;
    }

    private findBlockEnd(document: vscode.TextDocument, startPos: vscode.Position): vscode.Position {
        let braceCount = 0;
        let foundFirstBrace = false;

        for (let i = startPos.line; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            for (let j = (i === startPos.line ? startPos.character : 0); j < line.length; j++) {
                if (line[j] === '{') {
                    braceCount++;
                    foundFirstBrace = true;
                } else if (line[j] === '}') {
                    braceCount--;
                    if (foundFirstBrace && braceCount === 0) {
                        return new vscode.Position(i, j + 1);
                    }
                }
            }
        }

        return new vscode.Position(document.lineCount - 1, 0);
    }
}

async function updateDiagnostics(document: vscode.TextDocument, diagnosticCollection: vscode.DiagnosticCollection) {
    if (!vscode.workspace.getConfiguration('spice').get('enableDiagnostics')) {
        return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const no_spaces = line.trim();

        if (!no_spaces) continue;

        // Check for missing semicolons (simple heuristic)
        if (!VALID_LINE_ENDINGS.some(ending => no_spaces.endsWith(ending))) {
            const lastChar = line.length - 1;
            const range = new vscode.Range(i, lastChar, i, lastChar + 1);
            const diagnostic = new vscode.Diagnostic(
                range,
                'Statement should end with a semicolon',
                vscode.DiagnosticSeverity.Warning
            );
            diagnostic.code = 'spice-missing-semicolon';
            diagnostics.push(diagnostic);
        }

        // Check for unmatched braces
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;
        if (openBraces !== closeBraces) {
            // This is a simple check; a real implementation would track across lines
        }
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

async function compileSpiceFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'spice') {
        vscode.window.showErrorMessage('No Spice file is currently open');
        return;
    }

    const document = editor.document;
    await document.save();

    // Check for built-in overrides before compiling
    const shouldCheckOverrides = vscode.workspace.getConfiguration('spice').get('checkBuiltinOverrides', true);
    if (shouldCheckOverrides) {
        const overrides = detectBuiltinOverrides(document);
        if (overrides.length > 0) {
            const shouldContinue = await showBuiltinOverrideWarning(overrides);
            if (!shouldContinue) {
                return; // User canceled
            }
        }
    }

    const spicePath = document.fileName;
    const pythonPath = spicePath.replace(/\.spc$/, '.py');
    const compilerPath = vscode.workspace.getConfiguration('spice').get('compilerPath', 'spicy');

    try {
        const { stdout, stderr } = await execAsync(`${compilerPath} "${spicePath}" -o "${pythonPath}"`);
        if (stderr) {
            vscode.window.showErrorMessage(`Compilation error: ${stderr}`);
        } else {
            vscode.window.showInformationMessage(`Successfully compiled to ${path.basename(pythonPath)}`);
        }
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to compile: ${error.message}`);
    }
}

async function runSpiceFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'spice') {
        vscode.window.showErrorMessage('No Spice file is currently open');
        return;
    }

    const document = editor.document;
    await document.save();

    const shouldCheckOverrides = vscode.workspace.getConfiguration('spice').get('checkBuiltinOverrides', true);
    if (shouldCheckOverrides) {
        const overrides = detectBuiltinOverrides(document);
        if (overrides.length > 0) {
            const shouldContinue = await showBuiltinOverrideWarning(overrides);
            if (!shouldContinue) {
                return; // Cancelled (denied)
            }
        }
    }

    const spicePath = document.fileName;
    const runnerPath = 'spice'; // Default

    const terminal = vscode.window.createTerminal('Spice Run');
    terminal.show();
    terminal.sendText(`${runnerPath} "${spicePath}"`);
}

async function checkSyntax() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'spice') {
        vscode.window.showErrorMessage('No Spice file is currently open');
        return;
    }

    const document = editor.document;
    await document.save();

    const spicePath = document.fileName;
    const compilerPath = vscode.workspace.getConfiguration('spice').get('compilerPath', 'spicy');

    try {
        const { stdout, stderr } = await execAsync(`${compilerPath} "${spicePath}" -c`);
        if (stderr) {
            vscode.window.showErrorMessage(`Syntax error: ${stderr}`);
        } else {
            vscode.window.showInformationMessage('Syntax check passed!');
        }
    } catch (error: any) {
        vscode.window.showErrorMessage(`Syntax check failed: ${error.message}`);
    }
}

interface BuiltinOverride {
    name: string;
    line: number;
    type: 'function' | 'assignment';
}

function detectBuiltinOverrides(document: vscode.TextDocument): BuiltinOverride[] {
    const overrides: BuiltinOverride[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('//')) {
            continue;
        }

        // Check for function definitions that override built-ins
        // Pattern: [modifiers] def <builtin_name>(
        const functionDefMatch = trimmedLine.match(/^(?:(?:static|final|abstract)\s+)*def\s+(\w+)\s*\(/);
        if (functionDefMatch) {
            const functionName = functionDefMatch[1];
            if (PYTHON_BUILTINS.includes(functionName)) {
                overrides.push({
                    name: functionName,
                    line: i + 1,
                    type: 'function'
                });
            }
        }

        // Check for variable assignments that override built-ins
        // Pattern: <builtin_name> = (but not inside function calls or comparisons)
        const assignmentMatch = trimmedLine.match(/^(\w+)\s*=/);
        if (assignmentMatch && !trimmedLine.includes('==') && !trimmedLine.includes('!=') && !trimmedLine.includes('<=') && !trimmedLine.includes('>=')) {
            const variableName = assignmentMatch[1];
            if (PYTHON_BUILTINS.includes(variableName)) {
                overrides.push({
                    name: variableName,
                    line: i + 1,
                    type: 'assignment'
                });
            }
        }
    }

    return overrides;
}

async function showBuiltinOverrideWarning(overrides: BuiltinOverride[]): Promise<boolean> {
    const overrideList = overrides.map(override =>
        `  • ${override.name} (line ${override.line}) - ${override.type === 'function' ? 'function definition' : 'variable assignment'}`
    ).join('\n');

    const warningIcon = '⚠️';
    const message = `${warningIcon} Built-in Function Overrides Detected\n\nThe following built-in functions are being overridden in your code:\n\n${overrideList}\n\nOverriding built-in functions can lead to unexpected behavior and may break standard functionality. This is generally considered bad practice.\n\nWould you like to continue running the code anyway?`;

    const result = await vscode.window.showWarningMessage(
        message,
        {
            modal: true,
            detail: `Found ${overrides.length} built-in override${overrides.length > 1 ? 's' : ''} in your code.`
        },
        'Continue Anyway',
        'Cancel',
        "Don't Show This Again"
    );

    if (result === "Don't Show This Again") {
        // Disable the check for built-in overrides
        await vscode.workspace.getConfiguration('spice').update('checkBuiltinOverrides', false, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Built-in override warnings have been disabled. You can re-enable them in the Spice extension settings or use the "Spice: Re-enable Built-in Override Warnings" command.');
        return true; // Continue with execution
    }

    return result === 'Continue Anyway';
}

async function enableBuiltinOverrideCheck() {
    await vscode.workspace.getConfiguration('spice').update('checkBuiltinOverrides', true, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('Built-in override warnings have been re-enabled.');
}

export function deactivate() {}