/**
 * EMCP_WB_ScriptEditor.c - Script editor operations handler
 *
 * Actions: getCurrentFile, getLine, setLine, insertLine, removeLine, getLinesCount, openFile
 * Uses the ScriptEditor Workbench module.
 * Called via NET API TCP protocol: APIFunc = "EMCP_WB_ScriptEditor"
 */

class EMCP_WB_ScriptEditorRequest : JsonApiStruct
{
	string action;
	int line;
	string text;
	string path;
	string expectedFile;
	string expectedText;
	bool checkText;
	int expectedLinesCount;
	int maxLines;

	void EMCP_WB_ScriptEditorRequest()
	{
		RegV("action");
		RegV("line");
		RegV("text");
		RegV("path");
		RegV("expectedFile"); RegV("expectedText"); RegV("checkText"); RegV("expectedLinesCount"); RegV("maxLines");
		expectedLinesCount = -1;
		maxLines = 50;
		line = -1;
	}
}

class EMCP_WB_ScriptEditorResponse : JsonApiStruct
{
	string status;
	string message;
	string action;
	string currentFile;
	int currentLine;
	int linesCount;
	string lineText;
	string beforeText;
	bool verified;
	bool dispatched;
	bool partial;
	int nextLine;
	ref array<string> lines = {};

	void EMCP_WB_ScriptEditorResponse()
	{
		RegV("status");
		RegV("message");
		RegV("action");
		RegV("currentFile");
		RegV("currentLine");
		RegV("linesCount");
		RegV("lineText");
		RegV("beforeText"); RegV("verified"); RegV("partial"); RegV("nextLine");
		RegV("dispatched");
		nextLine = -1;
	}
	override void OnPack()
	{
		StartArray("lines");
		foreach (string item : lines) ItemString(item);
		EndArray();
	}
}

class EMCP_WB_ScriptEditor : NetApiHandler
{
	override JsonApiStruct GetRequest()
	{
		return new EMCP_WB_ScriptEditorRequest();
	}

	override JsonApiStruct GetResponse(JsonApiStruct request)
	{
		EMCP_WB_ScriptEditorRequest req = EMCP_WB_ScriptEditorRequest.Cast(request);
		EMCP_WB_ScriptEditorResponse resp = new EMCP_WB_ScriptEditorResponse();
		resp.action = req.action;

		ScriptEditor scriptEditor = Workbench.GetModule(ScriptEditor);
		if (!scriptEditor)
		{
			resp.status = "error";
			resp.message = "ScriptEditor module not available";
			return resp;
		}
		scriptEditor.GetCurrentFile(resp.currentFile);
		resp.currentLine = scriptEditor.GetCurrentLine();
		resp.linesCount = scriptEditor.GetLinesCount();
		if (req.expectedFile != "" && req.expectedFile != resp.currentFile)
		{
			resp.status = "error"; resp.message = "STALE_FILE: Script Editor changed files; inspect again"; return resp;
		}
		bool mutation = req.action == "setLine" || req.action == "insertLine" || req.action == "removeLine";
		if (mutation)
		{
			if (req.expectedFile == "" || req.expectedLinesCount != resp.linesCount)
			{
				resp.status = "error"; resp.message = "Mutation requires expectedFile and matching expectedLinesCount"; return resp;
			}
			if (req.line < 0 || req.line >= resp.linesCount || req.text.Contains("\n") || req.text.Contains("\r"))
			{
				resp.status = "error"; resp.message = "Line index is outside the open buffer, or text contains a newline"; return resp;
			}
			if (!scriptEditor.GetLineText(resp.beforeText, req.line) || !req.checkText || req.expectedText != resp.beforeText)
			{
				resp.status = "error"; resp.message = "CONFLICT: line text changed; read the buffer again"; return resp;
			}
		}

		if (req.action == "getCurrentFile")
		{
			string filename;
			bool result = scriptEditor.GetCurrentFile(filename);
			if (result)
			{
				resp.currentFile = filename;
				resp.currentLine = scriptEditor.GetCurrentLine();
				resp.linesCount = scriptEditor.GetLinesCount();
				resp.status = "ok";
				resp.message = "Current file: " + filename;
			}
			else
			{
				resp.status = "ok";
				resp.message = "No file currently open in script editor";
			}
		}
		else if (req.action == "getLine")
		{
			string lineText;
			bool result = scriptEditor.GetLineText(lineText, req.line);
			if (result)
			{
				resp.lineText = lineText;
				resp.status = "ok";
				resp.message = "Line " + req.line.ToString() + " retrieved";
			}
			else
			{
				resp.status = "error";
				resp.message = "GetLineText returned false for line " + req.line.ToString();
			}
		}
		else if (req.action == "setLine")
		{
			scriptEditor.SetLineText(req.text, req.line);
			resp.verified = scriptEditor.GetLineText(resp.lineText, req.line) && resp.lineText == req.text && scriptEditor.GetLinesCount() == req.expectedLinesCount;
		}
		else if (req.action == "insertLine")
		{
			scriptEditor.InsertLine(req.text, req.line);
			resp.verified = scriptEditor.GetLineText(resp.lineText, req.line) && resp.lineText == req.text && scriptEditor.GetLinesCount() == req.expectedLinesCount + 1;
		}
		else if (req.action == "removeLine")
		{
			scriptEditor.RemoveLine(req.line);
			resp.verified = scriptEditor.GetLinesCount() == req.expectedLinesCount - 1;
		}
		else if (req.action == "getLinesCount")
		{
			resp.linesCount = scriptEditor.GetLinesCount();
			resp.status = "ok";
			resp.message = "Lines count: " + resp.linesCount.ToString();
		}
		else if (req.action == "readRange")
		{
			if (req.line < 0 || req.line >= resp.linesCount || req.maxLines < 1 || req.maxLines > 200)
			{
				resp.status = "error"; resp.message = "Invalid buffer range"; return resp;
			}
			for (int li = req.line; li < Math.Min(resp.linesCount, req.line + req.maxLines); li++)
			{
				string bufferLine;
				if (!scriptEditor.GetLineText(bufferLine, li)) { resp.status = "error"; resp.message = "Buffer changed during read"; return resp; }
				if (bufferLine.Length() > 4096) { bufferLine = bufferLine.Substring(0, 4096); resp.partial = true; }
				resp.lines.Insert(bufferLine);
			}
			if (req.line + resp.lines.Count() < resp.linesCount) resp.nextLine = req.line + resp.lines.Count();
			resp.status = "ok"; resp.message = "Live editor buffer, zero-based line indices";
		}
		else if (req.action == "save")
		{
			resp.verified = scriptEditor.Save();
			resp.status = "error"; resp.message = "Script Editor Save returned false. This version uses saveAll to save all open script buffers; inspect other unsaved tabs first";
			if (resp.verified) { resp.status = "ok"; resp.message = "Script Editor Save returned true; verify disk hashes before compilation"; }
		}
		else if (req.action == "saveAll")
		{
			array<string> menuPath = {"File", "Save All"};
			resp.dispatched = scriptEditor.ExecuteAction(menuPath, false);
			resp.status = "error"; resp.message = "Script Editor Save All action was unavailable";
			if (resp.dispatched) { resp.status = "ok"; resp.message = "Save All dispatched for all open script buffers; verify the intended disk content before compilation"; }
		}
		else if (req.action == "openFile")
		{
			if (req.path == "")
			{
				resp.status = "error";
				resp.message = "path parameter required for openFile action";
				return resp;
			}

			bool result = scriptEditor.SetOpenedResource(req.path);
			resp.status = "error";
			if (result)
			{
				resp.status = "ok"; resp.message = "Opened file: " + req.path;
				scriptEditor.GetCurrentFile(resp.currentFile);
				resp.linesCount = scriptEditor.GetLinesCount();
			}
			else
				resp.message = "SetOpenedResource returned false for: " + req.path;
		}
		else
		{
			resp.status = "error";
			resp.message = "Unknown action: " + req.action + ". Valid: getCurrentFile, getLine, setLine, insertLine, removeLine, getLinesCount, openFile";
		}

		if (mutation)
		{
			resp.linesCount = scriptEditor.GetLinesCount();
			resp.status = "error"; resp.message = "Edit was not confirmed; inspect the live buffer before retrying";
			if (resp.verified) { resp.status = "ok"; resp.message = "Buffer edit verified; save explicitly before compilation"; }
		}
		return resp;
	}
}
