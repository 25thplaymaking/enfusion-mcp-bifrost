/**
 * Shared, focus-free control for every public Workbench editor module.
 *
 * The graph editors intentionally expose only WBModuleDef in the public script
 * API. This handler uses exactly that common surface: open, inspect, open a
 * resource, save, and execute a documented menu action. Editor-specific data
 * authoring remains in the MCP's validated file tools.
 */

class EMCP_WB_EditorModuleRequest : JsonApiStruct
{
	string module;
	string action;
	string resourcePath;
	string menuPath;
	bool keepFocus;
	int containerIndex;
	int entityIndex;
	string entityId;
	string objectPath;
	string expectedTarget;
	string expectedValue;
	string expectedFile;
	int expectedLine;
	bool checkValue;
	string propertyKey;
	string value;
	string valueType;
	int offset;
	int childOffset;
	int limit;

	void EMCP_WB_EditorModuleRequest()
	{
		RegV("module");
		RegV("action");
		RegV("resourcePath");
		RegV("menuPath");
		RegV("keepFocus");
		RegV("containerIndex"); RegV("entityIndex"); RegV("entityId"); RegV("objectPath");
		RegV("expectedTarget"); RegV("expectedValue"); RegV("checkValue");
		RegV("expectedFile");
		RegV("expectedLine"); expectedLine = -1;
		RegV("propertyKey"); RegV("value"); RegV("valueType");
		RegV("offset"); RegV("childOffset"); RegV("limit");
		entityIndex = -1;
		limit = 50;
		keepFocus = false;
	}
}

class EMCP_WB_EditorModuleResponse : JsonApiStruct
{
	string status;
	string module;
	string action;
	string message;
	int containerCount;
	bool result;
	string bridgeVersion;
	string epoch;
	string target;
	string className;
	string resource;
	string entityId;
	string beforeValue;
	string afterValue;
	bool applied;
	bool verified;
	int total;
	int childCount;
	int componentCount;
	int nodeCount;
	int nextNodeOffset = -1;
	ref array<ref EMCP_WB_InspectedProperty> properties = {};
	ref array<ref EMCP_WB_InspectedNode> nodes = {};

	void EMCP_WB_EditorModuleResponse()
	{
		RegV("status");
		RegV("module");
		RegV("action");
		RegV("message");
		RegV("containerCount");
		RegV("result");
		RegV("bridgeVersion"); RegV("epoch"); RegV("target"); RegV("className");
		RegV("resource"); RegV("entityId"); RegV("beforeValue"); RegV("afterValue");
		RegV("applied"); RegV("verified"); RegV("total"); RegV("childCount"); RegV("componentCount");
		RegV("nodeCount"); RegV("nextNodeOffset");
		bridgeVersion = "0.15.0";
		containerCount = -1;
	}

	override void OnPack()
	{
		StartArray("properties");
		foreach (EMCP_WB_InspectedProperty prop : properties) ItemObject(prop);
		EndArray();
		StartArray("nodes");
		foreach (EMCP_WB_InspectedNode node : nodes) ItemObject(node);
		EndArray();
	}
}

class EMCP_WB_EditorModule : NetApiHandler
{
	override JsonApiStruct GetRequest()
	{
		return new EMCP_WB_EditorModuleRequest();
	}

	protected bool OpenEditor(string moduleName)
	{
		if (moduleName == "resourceManager") return Workbench.OpenModule(ResourceManager);
		if (moduleName == "scriptEditor") return Workbench.OpenModule(ScriptEditor);
		if (moduleName == "worldEditor") return Workbench.OpenModule(WorldEditor);
		if (moduleName == "audioEditor") return Workbench.OpenModule(AudioEditor);
		if (moduleName == "animationEditor") return Workbench.OpenModule(AnimEditor);
		if (moduleName == "particleEditor") return Workbench.OpenModule(ParticleEditor);
		if (moduleName == "behaviorEditor") return Workbench.OpenModule(BehaviorEditor);
		if (moduleName == "localizationEditor") return Workbench.OpenModule(LocalizationEditor);
		if (moduleName == "proceduralAnimationEditor") return Workbench.OpenModule(ProcAnimEditor);
		if (moduleName == "navmeshEditor") return Workbench.OpenModule(NavmeshGeneratorMain);
		return false;
	}

	protected WBModuleDef GetEditor(string moduleName)
	{
		if (moduleName == "resourceManager") return Workbench.GetModule(ResourceManager);
		if (moduleName == "scriptEditor") return Workbench.GetModule(ScriptEditor);
		if (moduleName == "worldEditor") return Workbench.GetModule(WorldEditor);
		if (moduleName == "audioEditor") return Workbench.GetModule(AudioEditor);
		if (moduleName == "animationEditor") return Workbench.GetModule(AnimEditor);
		if (moduleName == "particleEditor") return Workbench.GetModule(ParticleEditor);
		if (moduleName == "behaviorEditor") return Workbench.GetModule(BehaviorEditor);
		if (moduleName == "localizationEditor") return Workbench.GetModule(LocalizationEditor);
		if (moduleName == "proceduralAnimationEditor") return Workbench.GetModule(ProcAnimEditor);
		if (moduleName == "navmeshEditor") return Workbench.GetModule(NavmeshGeneratorMain);
		return null;
	}

	protected bool CloseEditor(string moduleName)
	{
		if (moduleName == "resourceManager") return Workbench.CloseModule(ResourceManager);
		if (moduleName == "scriptEditor") return Workbench.CloseModule(ScriptEditor);
		if (moduleName == "worldEditor") return Workbench.CloseModule(WorldEditor);
		if (moduleName == "audioEditor") return Workbench.CloseModule(AudioEditor);
		if (moduleName == "animationEditor") return Workbench.CloseModule(AnimEditor);
		if (moduleName == "particleEditor") return Workbench.CloseModule(ParticleEditor);
		if (moduleName == "behaviorEditor") return Workbench.CloseModule(BehaviorEditor);
		if (moduleName == "localizationEditor") return Workbench.CloseModule(LocalizationEditor);
		if (moduleName == "proceduralAnimationEditor") return Workbench.CloseModule(ProcAnimEditor);
		if (moduleName == "navmeshEditor") return Workbench.CloseModule(NavmeshGeneratorMain);
		return false;
	}

	protected bool IsKnownEditor(string moduleName)
	{
		return moduleName == "resourceManager" || moduleName == "scriptEditor" ||
			moduleName == "worldEditor" || moduleName == "audioEditor" ||
			moduleName == "animationEditor" || moduleName == "particleEditor" ||
			moduleName == "behaviorEditor" || moduleName == "localizationEditor" ||
			moduleName == "proceduralAnimationEditor" || moduleName == "navmeshEditor";
	}

	protected void SetOperationResult(EMCP_WB_EditorModuleResponse resp, bool result, string successMessage, string errorMessage)
	{
		resp.result = result;
		if (result)
		{
			resp.status = "ok";
			resp.message = successMessage;
		}
		else
		{
			resp.status = "error";
			resp.message = errorMessage;
		}
	}

	protected void SplitMenuPath(string menuPath, out array<string> parts)
	{
		parts = {};
		string remaining = menuPath;
		int commaIdx = remaining.IndexOf(",");
		while (commaIdx >= 0)
		{
			string part = remaining.Substring(0, commaIdx);
			part.Trim();
			if (part != "") parts.Insert(part);
			remaining = remaining.Substring(commaIdx + 1, remaining.Length() - commaIdx - 1);
			commaIdx = remaining.IndexOf(",");
		}
		remaining.Trim();
		if (remaining != "") parts.Insert(remaining);
	}

	override JsonApiStruct GetResponse(JsonApiStruct request)
	{
		EMCP_WB_EditorModuleRequest req = EMCP_WB_EditorModuleRequest.Cast(request);
		EMCP_WB_EditorModuleResponse resp = new EMCP_WB_EditorModuleResponse();
		resp.module = req.module;
		resp.action = req.action;

		if (!IsKnownEditor(req.module))
		{
			resp.status = "error";
			resp.message = "Unknown editor module";
			return resp;
		}

		if (req.action == "open")
		{
			SetOperationResult(resp, OpenEditor(req.module), "Editor module opened", "Workbench.OpenModule returned false");
			return resp;
		}
		if (req.action == "close")
		{
			SetOperationResult(resp, CloseEditor(req.module), "Editor module closed", "Workbench.CloseModule returned false; inspect unsaved changes or dialogs");
			return resp;
		}

		WBModuleDef editor = GetEditor(req.module);
		if (!editor)
		{
			resp.status = "error";
			resp.message = "Editor module is not available; call action=open first";
			return resp;
		}

		if (req.action == "state")
		{
			resp.epoch = EMCP_WB_Inspector.Epoch();
			resp.containerCount = editor.GetNumContainers();
			resp.result = true;
			resp.status = "ok";
			resp.message = "Editor module is available";
		}
		else if (req.action == "containers" || req.action == "inspect" || req.action == "setProperty" || req.action == "clearProperty")
		{
			if (req.offset < 0 || req.childOffset < 0 || req.limit < 1 || req.limit > 100)
			{
				resp.status = "error"; resp.message = "Invalid pagination; limit must be 1..100"; return resp;
			}
			EMCP_WB_Inspector.Inspect(req, resp, editor);
		}
		else if (req.action == "openResource")
		{
			if (req.resourcePath == "")
			{
				resp.status = "error";
				resp.message = "resourcePath is required";
				return resp;
			}
			SetOperationResult(resp, editor.SetOpenedResource(req.resourcePath), "Resource opened", "SetOpenedResource returned false");
		}
		else if (req.action == "save")
		{
			if (req.module == "worldEditor")
			{
				WorldEditor worldEditor = Workbench.GetModule(WorldEditor);
				string worldPath;
				if (worldEditor.GetApi()) worldEditor.GetApi().GetWorldPath(worldPath);
				if (worldPath == "")
				{
					resp.status = "error"; resp.message = "Unnamed world: Save may open a modal Save As dialog. Use prefab template operations for a prefab or the observed editor Save As control for a new world."; return resp;
				}
			}
			SetOperationResult(resp, editor.Save(), "Editor saved", "Save returned false");
		}
		else if (req.action == "executeAction")
		{
			if (req.module == "scriptEditor" && req.expectedFile != "")
			{
				ScriptEditor scriptEditor = Workbench.GetModule(ScriptEditor);
				string currentFile;
				if (!scriptEditor.GetCurrentFile(currentFile) || currentFile != req.expectedFile)
				{
					resp.status = "error"; resp.message = "STALE_FILE: inspect Script Editor before debugger control"; return resp;
				}
				if (req.expectedLine >= 0 && scriptEditor.GetCurrentLine() != req.expectedLine)
				{
					resp.status = "error"; resp.message = "STALE_LINE: Script Editor cursor moved; inspect before toggling a breakpoint"; return resp;
				}
			}
			string lowerMenu = req.menuPath;
			lowerMenu.ToLower();
			if (lowerMenu.Contains("compile") || lowerMenu.Contains("reload scripts"))
			{
				resp.status = "error"; resp.message = "Compile/reload must use native NET API outside this handler"; return resp;
			}
			array<string> parts;
			SplitMenuPath(req.menuPath, parts);
			if (parts.Count() == 0)
			{
				resp.status = "error";
				resp.message = "menuPath is required";
				return resp;
			}
			SetOperationResult(resp, editor.ExecuteAction(parts, req.keepFocus), "Editor action executed", "ExecuteAction returned false");
		}
		else
		{
			resp.status = "error";
			resp.message = "Unknown action; valid: open, state, openResource, save, executeAction";
		}

		return resp;
	}
}
