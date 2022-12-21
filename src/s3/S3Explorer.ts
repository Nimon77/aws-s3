/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as ui from '../common/UI';
import * as api from '../common/API';
import * as AWS from "aws-sdk";
import { S3TreeView } from "./S3TreeView";
import { S3TreeItem, TreeItemType } from "./S3TreeItem";
import { S3ExplorerItem } from "./S3ExplorerItem";
import * as s3_helper from "./S3Helper";

export class S3Explorer {
    public static Current: S3Explorer | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private extensionUri: vscode.Uri;

    public S3ExplorerItem: S3ExplorerItem = new S3ExplorerItem("undefined", "");
    public S3ObjectList: AWS.S3.ListObjectsV2Output | undefined;
    public HomeKey:string | undefined;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, node:S3TreeItem) {
        ui.logToOutput('S3Explorer.constructor Started');

        this.SetS3ExplorerItem(node);
        this.extensionUri = extensionUri;

        this._panel = panel;
        this._panel.onDidDispose(this.dispose, null, this._disposables);
        this._setWebviewMessageListener(this._panel.webview);
        this.Load();
        ui.logToOutput('S3Explorer.constructor Completed');
    }

    public SetS3ExplorerItem(node:S3TreeItem){
        if(node.TreeItemType === TreeItemType.Bucket && node.Bucket)
        {
            this.S3ExplorerItem = new S3ExplorerItem(node.Bucket, "");
        }
        else if(node.TreeItemType === TreeItemType.Shortcut && node.Bucket && node.Shortcut)
        {
            this.S3ExplorerItem = new S3ExplorerItem(node.Bucket, node.Shortcut);
        }
        else
        {
            this.S3ExplorerItem = new S3ExplorerItem("undefined", "");
        }
        this.HomeKey = node.Shortcut;
    }

    public async RenderHtml() {
        ui.logToOutput('S3Explorer.RenderHmtl Started');
        this._panel.webview.html = this._getWebviewContent(this._panel.webview, this.extensionUri);
        
        ui.logToOutput('S3Explorer.RenderHmtl Completed');
    }

    public async Load(){
        ui.logToOutput('S3Explorer.LoadLogs Started');
        if(!S3TreeView.Current){return;}

        var result = await api.GetS3ObjectList(S3TreeView.Current.AwsProfile, this.S3ExplorerItem.Bucket, this.S3ExplorerItem.Key);
        if(result.isSuccessful)
        {
            this.S3ObjectList = result.result;
        }

        this.RenderHtml();
    }

    public ResetCurrentState(){

    }

    public static Render(extensionUri: vscode.Uri, node:S3TreeItem) {
        ui.logToOutput('S3Explorer.Render Started');
        if (S3Explorer.Current) {
            S3Explorer.Current.ResetCurrentState();
            S3Explorer.Current.SetS3ExplorerItem(node);
            S3Explorer.Current.Load();
        } 
        else 
        {
            const panel = vscode.window.createWebviewPanel("S3Explorer", "S3 Explorer", vscode.ViewColumn.One, {
                enableScripts: true,
            });

            S3Explorer.Current = new S3Explorer(panel, extensionUri, node);
        }
    }

    public s3KeyType(Key:string | undefined)
    {
        if(!Key) { return ""; }
        if(Key.endsWith("/")) { return "Folder";}
        if(!Key.includes("."))
        {
            return "File";
        }
        return Key.split('.').pop() || "";
    }

    public GetFolderName(Key:string | undefined)
    {
        if(!Key) { return ""; }
        if(!Key.endsWith("/")) { return Key; }
        var path = Key.split('/');
        path.pop();
        return path.pop() || "";
    }

    public GetNavigationPath(Key:string | undefined):[[string, string]]
    {
        let result:[[string, string]] = [["/",""]];

        if(Key)
        {
            var paths = Key?.split("/");
            let full_path:string = "";
            for(var p of paths)
            {
                if(!p) { continue; }
                if(Key.includes(p+"/"))
                {
                    full_path += p + "/";
                    p = p + "/";
                }
                else
                {
                    full_path += p;
                }
                result.push([p, full_path]);
            }
        }

        return result;
    }

    private _getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
        ui.logToOutput('S3Explorer._getWebviewContent Started');

        //file URIs
        const toolkitUri = ui.getUri(webview, extensionUri, [
            "node_modules",
            "@vscode",
            "webview-ui-toolkit",
            "dist",
            "toolkit.js", // A toolkit.min.js file is also available
        ]);

        const mainUri = ui.getUri(webview, extensionUri, ["media", "main.js"]);
        const styleUri = ui.getUri(webview, extensionUri, ["media", "style.css"]);
        const addShortcutUri = ui.getUri(webview, extensionUri, ["media", "bookmarks.png"]);
        const upArrowUri = ui.getUri(webview, extensionUri, ["media", "arrow-up.png"]);
        const goHomeUri = ui.getUri(webview, extensionUri, ["media", "go-home.png"]);


        let NavigationRowHtml:string="";
        let PathNavigationHtml:string="";
        if(!this.S3ExplorerItem.IsRoot())
        {
            for(var item of this.GetNavigationPath(this.S3ExplorerItem.Key))
            {
                PathNavigationHtml += `&nbsp;<vscode-link id="go_key_${item[1]}">${item[0]}</vscode-link>`
            }

            NavigationRowHtml += `
            <tr style="background-color: #315562; font-weight: bold;">
            <td colspan="6">
                <vscode-link id="go_home"><img src="${goHomeUri}" alt="Go Home"></vscode-link>
                &nbsp;
                <vscode-link id="go_up"><img src="${upArrowUri}" alt="Go Up"></vscode-link>
                &nbsp;
                ${PathNavigationHtml}
            </td>
            </tr>`
        }


        let S3RowHtml:string="";
        if(this.S3ObjectList)
        {
            if(this.S3ObjectList.CommonPrefixes)
            {
                for(var folder of this.S3ObjectList.CommonPrefixes)
                {
                    if(folder.Prefix === this.S3ExplorerItem.Key){ continue; }

                    S3RowHtml += `
                    <tr>
                        <td>
                            <vscode-checkbox id="checkbox_${folder.Prefix}"></vscode-checkbox>
                        </td>
                        <td>
                            <vscode-button appearance="icon" id="add_shortcut_${folder.Prefix}">
                                <span><img src="${addShortcutUri}"></img></span>
                            </vscode-button>
                        </td>
                        <td><vscode-link id="open_${folder.Prefix}">${this.GetFolderName(folder.Prefix)}</vscode-link></td>
                        <td>Folder</td>
                        <td></td>
                        <td></td>
                    </tr>
                    `;
                }
            }

            if(this.S3ObjectList.Contents)
            {
                for(var file of this.S3ObjectList.Contents)
                {
                    if(file.Key === this.S3ExplorerItem.Key){ continue; }

                    S3RowHtml += `
                    <tr>
                        <td>
                            <vscode-checkbox id="checkbox_${file.Key}"></vscode-checkbox>
                        </td>
                        <td>
                            <vscode-button appearance="icon" id="add_shortcut_${file.Key}">
                                <span><img src="${addShortcutUri}"></img></span>
                            </vscode-button>
                        </td>
                        <td><vscode-link id="open_${file.Key}">${s3_helper.GetFileNameWithExtension(file.Key)}</vscode-link></td>
                        <td>${this.s3KeyType(file.Key)}</td>
                        <td>${file.LastModified ? file.LastModified.toLocaleDateString() : ""}</td>
                        <td>${ui.bytesToText(file.Size)}</td>
                    </tr>
                    `;
                }
            }
        }
        else
        {
            S3RowHtml = `
            <tr>
            <th></th>
            <th></th>
            <th>No Objects !!!</th>
            <th></th>
            <th></th>
            <th></th>
            </tr>
            `;
        }

        let result = /*html*/ `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1.0">
        <script type="module" src="${toolkitUri}"></script>
        <script type="module" src="${mainUri}"></script>
        <link rel="stylesheet" href="${styleUri}">
        <title>Logs</title>
      </head>
      <body>  
        
        <div style="display: flex; align-items: center;">
            <h2>${this.S3ExplorerItem.GetFullPath()}</h2>
        </div>

        <table>
            <tr>
                <td colspan="5" style="text-align:left">
                <vscode-button appearance="primary" id="refresh">Refresh</vscode-button>
                <vscode-button appearance="primary" id="download">Download</vscode-button>
                <vscode-button appearance="primary" id="upload" ${this.S3ExplorerItem.IsFile() ? "disabled":""}>Upload</vscode-button>
                <vscode-button appearance="primary" id="create_folder" ${this.S3ExplorerItem.IsFile() ? "disabled":""}>Create Folder</vscode-button>
                <vscode-dropdown id="edit_dropdown">
                    <vscode-option>Edit</vscode-option>
                    <vscode-option>Delete</vscode-option>
                    <vscode-option>Rename</vscode-option>
                    <vscode-option>Copy</vscode-option>
                    <vscode-option>Move</vscode-option>
                </vscode-dropdown>
                <vscode-dropdown id="copy_dropdown">
                    <vscode-option>Copy</vscode-option>
                    <vscode-option>File Name(s) Without Extesion</vscode-option>
                    <vscode-option>File Name(s) With Extesion</vscode-option>
                    <vscode-option>Key(s)</vscode-option>
                    <vscode-option>ARN(s)</vscode-option>
                    <vscode-option>S3 URI(s)</vscode-option>
                    <vscode-option>URL(s)</vscode-option>
                </vscode-dropdown>
                </td>
                <td style="text-align:right"><vscode-text-field id="search_text" placeholder="Search" disabled></vscode-text-field></td>
            </tr>
            <tr>
                <th></th>
                <th></th>
                <th>Name</th>
                <th>Type</th>
                <th>Last Modified</th>
                <th>Size</th>
            </tr>

            ${NavigationRowHtml}

            ${S3RowHtml}

        </table>
        
        <br>        
        <br>
        <br>
        <br>
                    
        <table>
            <tr>
                <td colspan="3">
                    <vscode-link href="https://github.com/necatiarslan/aws-s3/issues/new">Bug Report & Feature Request</vscode-link>
                </td>
            </tr>
        </table>
      </body>
    </html>
    `;
        ui.logToOutput('S3Explorer._getWebviewContent Completed');
        return result;
    }

    private _setWebviewMessageListener(webview: vscode.Webview) {
        ui.logToOutput('S3Explorer._setWebviewMessageListener Started');
        webview.onDidReceiveMessage(
            (message: any) => {
                const command = message.command;
                let id:string;

                ui.logToOutput('S3Explorer._setWebviewMessageListener Message Received ' + message.command);
                switch (command) {
                    case "refresh":
                        this.Load();
                        this.RenderHtml();
                        return;
                    
                    case "create_folder":
                        this.CreateFolder();
                        return;
                    
                    case "upload":
                        this.UploadFile();
                        return;
                    
                    case "open":
                        id = message.id;
                        id = id.replace("open_", "");
                        this.S3ExplorerItem.Key = id;
                        this.Load();
                        return;

                    case "download":
                        this.DownloadFile(message.keys);
                        return;

                    case "edit":
                        if(message.keys.length == 0) { return; }
                        switch(message.action)
                        {
                            case "Delete":
                                this.DeleteFile(message.keys)
                            return;
                            case "Rename":
                                this.RenameFile(message.keys)
                            return;
                            case "Copy":
                                this.CopyFile(message.keys)
                            return;
                            case "Move":
                                this.MoveFile(message.keys)
                            return;
                        }
                        return;

                    case "copy":
                        if(message.keys.length == 0) { return; }
                        switch(message.action)
                        {
                            case "File Name(s) Without Extesion":
                                this.CopyFileNameWithoutExtension(message.keys)
                            return;
                            case "File Name(s) With Extesion":
                                this.CopyFileNameWithExtension(message.keys)
                            return;
                            case "Key(s)":
                                this.CopyKeys(message.keys)
                            return;
                            case "ARN(s)":
                                this.CopyFileARNs(message.keys)
                            return;
                            case "S3 URI(s)":
                                this.CopyS3URI(message.keys)
                            return;
                            case "URL(s)":
                                this.CopyURLs(message.keys)
                            return;
                        }
                        return;

                    case "add_shortcut":
                        id = message.id;
                        id = id.replace("add_shortcut_", "");
                        this.AddShortcut(id);
                        return;

                    case "go_up":
                        this.S3ExplorerItem.Key = this.S3ExplorerItem.GetParentFolder();
                        this.Load();
                        return;
                    
                    case "go_home":
                        if(this.HomeKey)
                        {
                            this.S3ExplorerItem.Key = this.HomeKey;
                        }
                        else
                        {
                            this.S3ExplorerItem.Key = "";
                        }
                        
                        this.Load();
                        return;
                    
                    case "go_key":
                        id = message.id;
                        id = id.replace("go_key_", "");
                        this.S3ExplorerItem.Key = id;
                        this.Load();
                        return;

                }

            },
            undefined,
            this._disposables
        );
    }
    AddShortcut(key: string) {
        S3TreeView.Current?.AddShortcut(this.S3ExplorerItem.Bucket, key);
    }
    CopyS3URI(keys: string) 
    {
        if(keys.length === 0 || !keys.includes("|")) { return; }
        var keyList = keys.split("|");
        var listToCopy:string[] = [];
        for(var key of keyList)
        {
            if(key)
            {
                listToCopy.push(s3_helper.GetURI(this.S3ExplorerItem.Bucket, key))
            }
        }

        let result = ui.CopyListToClipboard(listToCopy);
        if(result.isSuccessful)
        {
            ui.showInfoMessage("Key(s) are copied to clipboard");
        }
    }
    CopyURLs(keys: string) 
    {
        if(keys.length === 0 || !keys.includes("|")) { return; }
        var keyList = keys.split("|");
        var listToCopy:string[] = [];
        for(var key of keyList)
        {
            if(key)
            {
                listToCopy.push(s3_helper.GetURL(this.S3ExplorerItem.Bucket, key))
            }
        }

        let result = ui.CopyListToClipboard(listToCopy);
        if(result.isSuccessful)
        {
            ui.showInfoMessage("URL(s) are copied to clipboard");
        }
    }
    CopyFileNameWithExtension(keys: string) 
    {
        if(keys.length === 0 || !keys.includes("|")) { return; }
        var keyList = keys.split("|");
        var listToCopy:string[] = [];
        for(var key of keyList)
        {
            if(key)
            {
                listToCopy.push(s3_helper.GetFileNameWithExtension(key))
            }
        }

        let result = ui.CopyListToClipboard(listToCopy);
        if(result.isSuccessful)
        {
            ui.showInfoMessage("File Name(s) with extension are copied to clipboard");
        }
    }
    CopyFileNameWithoutExtension(keys: string) 
    {
        if(keys.length === 0 || !keys.includes("|")) { return; }
        var keyList = keys.split("|");
        var listToCopy:string[] = [];
        for(var key of keyList)
        {
            if(key)
            {
                listToCopy.push(s3_helper.GetFileNameWithoutExtension(key))
            }
        }

        let result = ui.CopyListToClipboard(listToCopy);
        if(result.isSuccessful)
        {
            ui.showInfoMessage("File Name(s) with extension are copied to clipboard");
        }
    }
    CopyKeys(keys: string) 
    {
        if(keys.length === 0 || !keys.includes("|")) { return; }
        var keyList = keys.split("|");
        let result = ui.CopyListToClipboard(keyList);
        if(result.isSuccessful)
        {
            ui.showInfoMessage("Key(s) are copied to clipboard");
        }
    }
    CopyFileARNs(keys: string) 
    {
        if(keys.length === 0 || !keys.includes("|")) { return; }
        var keyList = keys.split("|");
        var listToCopy:string[] = [];
        for(var key of keyList)
        {
            if(key)
            {
                listToCopy.push(s3_helper.GetARN(this.S3ExplorerItem.Bucket, key))
            }
        }

        let result = ui.CopyListToClipboard(listToCopy);
        if(result.isSuccessful)
        {
            ui.showInfoMessage("URL(s) are copied to clipboard");
        }
    }
    MoveFile(key: string) {
        ui.showInfoMessage("Stay Tuned ... MoveFile key=" + key);
    }
    CopyFile(key: string) {
        ui.showInfoMessage("Stay Tuned ... CopyFile key=" + key);
    }
    DeleteFile(key: string) {
        ui.showInfoMessage("Stay Tuned ... DeleteFile key=" + key);
    }
    RenameFile(key: string) {
        ui.showInfoMessage("Stay Tuned ... RenameFile key=" + key);
    }
    DownloadFile(key: string) {
        ui.showInfoMessage("Stay Tuned ... DownloadFile key=" + key);
    }
    UploadFile() {
        ui.showInfoMessage("Stay Tuned ... UploadFile Target=" + this.S3ExplorerItem.Key);
    }
    CreateFolder() {
        ui.showInfoMessage("Stay Tuned ... CreateFolder Target=" + this.S3ExplorerItem.Key);
    }

    public dispose() {
        ui.logToOutput('S3Explorer.dispose Started');
        S3Explorer.Current = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

}