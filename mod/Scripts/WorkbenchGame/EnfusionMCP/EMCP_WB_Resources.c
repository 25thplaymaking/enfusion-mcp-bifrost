/**
 * EMCP_WB_Resources.c - Resource operations handler
 *
 * Actions: register, rebuild, open
 * Uses the ResourceManager Workbench module.
 * Called via NET API TCP protocol: APIFunc = "EMCP_WB_Resources"
 */

class EMCP_WB_ResourcesRequest : JsonApiStruct
{
	string action;
	string path;
	bool buildRuntime;

	void EMCP_WB_ResourcesRequest()
	{
		RegV("action");
		RegV("path");
		RegV("buildRuntime");
	}
}

class EMCP_WB_ResourceEntry : JsonApiStruct
{
	string m_sName;
	string m_sPath;
	string m_sType;
	override void OnPack()
	{
		StoreString("name", m_sName);
		StoreString("path", m_sPath);
		StoreString("type", m_sType);
	}
}

class EMCP_WB_ResourcesResponse : JsonApiStruct
{
	string status;
	string message;
	string action;
	string path;
	int entryCount;
	ref array<ref EMCP_WB_ResourceEntry> m_aEntries;

	void EMCP_WB_ResourcesResponse()
	{
		RegV("status");
		RegV("message");
		RegV("action");
		RegV("path");
		RegV("entryCount");
		m_aEntries = {};
	}

	override void OnPack()
	{
		if (m_aEntries.Count() > 0)
		{
			StartArray("entries");
			for (int i = 0; i < m_aEntries.Count(); i++)
			{
				EMCP_WB_ResourceEntry e = m_aEntries[i];
				ItemObject(e);
			}
			EndArray();
		}
	}
}

class EMCP_WB_Resources : NetApiHandler
{
	override JsonApiStruct GetRequest()
	{
		return new EMCP_WB_ResourcesRequest();
	}

	override JsonApiStruct GetResponse(JsonApiStruct request)
	{
		EMCP_WB_ResourcesRequest req = EMCP_WB_ResourcesRequest.Cast(request);
		EMCP_WB_ResourcesResponse resp = new EMCP_WB_ResourcesResponse();
		resp.action = req.action;
		resp.path = req.path;

		if (req.path == "")
		{
			resp.status = "error";
			resp.message = "path parameter required";
			return resp;
		}

		ResourceManager resMgr = Workbench.GetModule(ResourceManager);
		if (!resMgr)
		{
			resp.status = "error";
			resp.message = "ResourceManager module not available";
			return resp;
		}

		if (req.action == "register")
		{
			bool result = resMgr.RegisterResourceFile(req.path, req.buildRuntime);
			resp.status = "error";
			if (result)
			{
				resp.status = "ok"; resp.message = "Resource registered: " + req.path;
			}
			else
				resp.message = "RegisterResourceFile returned false for: " + req.path;
		}
		else if (req.action == "rebuild")
		{
			resMgr.RebuildResourceFile(req.path, "", false);
			resp.status = "ok";
			resp.message = "Rebuild initiated for: " + req.path;
		}
		else if (req.action == "open")
		{
			bool result = resMgr.SetOpenedResource(req.path);
			resp.status = "error";
			if (result)
			{
				resp.status = "ok"; resp.message = "Opened resource: " + req.path;
			}
			else
				resp.message = "SetOpenedResource returned false for: " + req.path;
		}
		else if (req.action == "validateMaterial")
		{
			Resource resource = Resource.Load(req.path);
			if (!resource || !resource.IsValid()) { resp.status = "error"; resp.message = "Material resource could not be loaded"; return resp; }
			BaseContainer material = resource.GetResource().ToBaseContainer();
			if (!material) { resp.status = "error"; resp.message = "Resource has no material container"; return resp; }
			// Call shipped validation routines directly. The built-in NET handler
			// takes an index into a separate UI plugin's selection, not a path.
			MaterialValidatorResponse report = new MaterialValidatorResponse();
			report.mat_name = material.GetName();
			MaterialValidatorUtils validator = new MaterialValidatorUtils();
			validator.ValidateUVs(material, 0, 5, report);
			validator.CheckDefaults(material, report);
			validator.CheckExtremes(material, 5, 95, report);
			validator.CheckDependencies(material, report);
			validator.CheckTextures(material, report);
			return report;
		}
		else if (req.action == "validateTexture")
		{
			MetaFile meta = resMgr.GetMetaFile(req.path);
			if (!meta) { resp.status = "error"; resp.message = "Texture metadata is not registered"; return resp; }
			BaseContainerList configurations = meta.GetObjectArray("Configurations");
			if (!configurations || configurations.Count() == 0) { resp.status = "error"; resp.message = "Texture import configuration is missing"; return resp; }
			TextureValidatorResponse textureReport = new TextureValidatorResponse();
			TextureValidator textureValidator = new TextureValidator();
			textureValidator.TextureImportSettings(req.path, textureReport);
			return textureReport;
		}
		else
		{
			resp.status = "error";
			resp.message = "Unknown action: " + req.action + ". Valid: register, rebuild, open";
		}

		return resp;
	}
}
