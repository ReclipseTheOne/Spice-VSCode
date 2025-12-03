/**
 * Spice Language Extension for VSCode
 *
 * This extension provides language support for Spice (.spc files) by:
 * - Starting and connecting to the Spice LSP server
 * - Providing compile and run commands
 * - Syntax highlighting and snippets (via package.json contributions)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

const execAsync = promisify(exec);

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
    console.log('Spice Language extension is now active!');

    // Start the LSP server
    startLanguageServer(context);

    // Register commands (compile, run, etc.)
    const compileCommand = vscode.commands.registerCommand('spice.compile', compileSpiceFile);
    const runCommand = vscode.commands.registerCommand('spice.run', runSpiceFile);
    const checkSyntaxCommand = vscode.commands.registerCommand('spice.checkSyntax', checkSyntax);
    const enableBuiltinOverrideCheckCommand = vscode.commands.registerCommand(
        'spice.enableBuiltinOverrideCheck',
        enableBuiltinOverrideCheck
    );

    context.subscriptions.push(
        compileCommand,
        runCommand,
        checkSyntaxCommand,
        enableBuiltinOverrideCheckCommand
    );
}

function startLanguageServer(context: vscode.ExtensionContext) {
    // Get the LSP server path from configuration
    const config = vscode.workspace.getConfiguration('spice');
    const serverCommand = config.get<string>('lspServerPath', 'spice-lsp');

    // Server options - start the Python LSP server
    const serverOptions: ServerOptions = {
        command: serverCommand,
        args: [],
        transport: TransportKind.stdio
    };

    // Client options - configure the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'spice' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.spc')
        }
    };

    // Create and start the language client
    client = new LanguageClient(
        'spice-lsp',
        'Spice Language Server',
        serverOptions,
        clientOptions
    );

    client.start().then(() => {
        console.log('Spice LSP server started successfully');
    }).catch((error) => {
        console.error('Failed to start Spice LSP server:', error);
        vscode.window.showErrorMessage(
            `Failed to start Spice Language Server. Make sure 'spice-lsp' is installed and in your PATH.`
        );
    });
}

async function compileSpiceFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'spice') {
        vscode.window.showErrorMessage('No Spice file is currently open');
        return;
    }

    const document = editor.document;
    await document.save();

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

    const spicePath = document.fileName;
    const runnerPath = 'spice';

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

async function enableBuiltinOverrideCheck() {
    await vscode.workspace.getConfiguration('spice').update('checkBuiltinOverrides', true, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('Built-in override warnings have been re-enabled.');
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
