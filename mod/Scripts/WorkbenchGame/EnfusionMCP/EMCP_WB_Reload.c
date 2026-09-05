/**
 * EMCP_WB_Reload.c - Plugin-only reload handler
 *
 * Script reload is intentionally not exposed through NetApiHandler. Reloading
 * the WorkbenchGame module before NET API serializes GetResponse keeps the
 * handler, request, and response alive across teardown and triggers the engine's
 * resource-leak assertion. The MCP uses the engine's native reload handler
 * instead, after any custom NET API transaction has ended.
 */

class EMCP_WB_ReloadRequest : JsonApiStruct
{
	string target;

	void EMCP_WB_ReloadRequest()
	{
		RegV("target");
	}
}

class EMCP_WB_ReloadResponse : JsonApiStruct
{
	string status;
	string message;

	void EMCP_WB_ReloadResponse()
	{
		RegV("status");
		RegV("message");
	}
}

class EMCP_WB_Reload : NetApiHandler
{
	override JsonApiStruct GetRequest()
	{
		return new EMCP_WB_ReloadRequest();
	}

	override JsonApiStruct GetResponse(JsonApiStruct request)
	{
		EMCP_WB_ReloadRequest req = EMCP_WB_ReloadRequest.Cast(request);
		EMCP_WB_ReloadResponse resp = new EMCP_WB_ReloadResponse();
		if (req.target != "plugins")
		{
			resp.status = "error";
			resp.message = "Script reload must be triggered outside NET API; this handler supports plugins only";
			return resp;
		}

		ResourceManager resourceManager = Workbench.GetModule(ResourceManager);
		if (!resourceManager)
		{
			resp.status = "error";
			resp.message = "ResourceManager module not available";
			return resp;
		}

		array<string> menuPath = {};
		menuPath.Insert("Plugins");
		menuPath.Insert("Reload");
		if (!resourceManager.ExecuteAction(menuPath, false))
		{
			resp.status = "error";
			resp.message = "Resource Manager did not accept the plugin reload action";
			return resp;
		}

		resp.status = "ok";
		resp.message = "Plugins: reload action accepted";
		return resp;
	}
}
