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

	void EMCP_WB_EditorModuleRequest()
	{
		RegV("module");
		RegV("action");
		RegV("resourcePath");
		RegV("menuPath");
		RegV("keepFocus");
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

	void EMCP_WB_EditorModuleResponse()
	{
		RegV("status");
		RegV("module");
		RegV("action");
		RegV("message");
		RegV("containerCount");
		RegV("result");
		containerCount = -1;
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
		return null;
	}

	protected bool IsKnownEditor(string moduleName)
	{
		return moduleName == "resourceManager" || moduleName == "scriptEditor" ||
			moduleName == "worldEditor" || moduleName == "audioEditor" ||
			moduleName == "animationEditor" || moduleName == "particleEditor" ||
			moduleName == "behaviorEditor" || moduleName == "localizationEditor" ||
			moduleName == "proceduralAnimationEditor";
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

		WBModuleDef editor = GetEditor(req.module);
		if (!editor)
		{
			resp.status = "error";
			resp.message = "Editor module is not available; call action=open first";
			return resp;
		}

		if (req.action == "state")
		{
			resp.containerCount = editor.GetNumContainers();
			resp.result = true;
			resp.status = "ok";
			resp.message = "Editor module is available";
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
			SetOperationResult(resp, editor.Save(), "Editor saved", "Save returned false");
		}
		else if (req.action == "executeAction")
		{
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
