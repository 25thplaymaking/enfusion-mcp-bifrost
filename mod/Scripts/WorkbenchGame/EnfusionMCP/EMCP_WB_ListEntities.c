class EMCP_WB_EntitySummary : JsonApiStruct
{
	string name;
	string className;
	string position;
	string entityId;
	int index;
	override void OnPack()
	{
		StoreString("name", name);
		StoreString("className", className);
		StoreString("position", position);
		StoreString("entityId", entityId);
		StoreInteger("index", index);
	}
}

/**
 * EMCP_WB_ListEntities.c - Entity listing with pagination and name filter
 *
 * Lists editor entities with offset/limit pagination.
 * Uses OnPack() to build JSON array dynamically via StartArray/EndArray.
 * Called via NET API TCP protocol: APIFunc = "EMCP_WB_ListEntities"
 */

class EMCP_WB_ListEntitiesRequest : JsonApiStruct
{
	int offset;
	int limit;
	string nameFilter;

	void EMCP_WB_ListEntitiesRequest()
	{
		RegV("offset");
		RegV("limit");
		RegV("nameFilter");
	}
}

class EMCP_WB_ListEntitiesResponse : JsonApiStruct
{
	string status;
	string message;
	int totalCount;
	int returnedCount;
	int offset;

	// Entity data collected before OnPack
	ref array<string> m_aNames;
	ref array<string> m_aClassNames;
	ref array<string> m_aPositions;
	ref array<string> m_aIDs = {};
	ref array<int> m_aIndices = {};

	void EMCP_WB_ListEntitiesResponse()
	{
		RegV("status");
		RegV("message");
		RegV("totalCount");
		RegV("returnedCount");
		RegV("offset");

		m_aNames = {};
		m_aClassNames = {};
		m_aPositions = {};
	}

	override void OnPack()
	{
		StartArray("entities");
		for (int i = 0; i < m_aNames.Count(); i++)
		{
			EMCP_WB_EntitySummary item = new EMCP_WB_EntitySummary();
			item.name = m_aNames[i];
			item.className = m_aClassNames[i];
			item.position = m_aPositions[i];
			item.entityId = m_aIDs[i];
			item.index = m_aIndices[i];
			ItemObject(item);
		}
		EndArray();
	}
}

class EMCP_WB_ListEntities : NetApiHandler
{
	override JsonApiStruct GetRequest()
	{
		return new EMCP_WB_ListEntitiesRequest();
	}

	override JsonApiStruct GetResponse(JsonApiStruct request)
	{
		EMCP_WB_ListEntitiesRequest req = EMCP_WB_ListEntitiesRequest.Cast(request);
		EMCP_WB_ListEntitiesResponse resp = new EMCP_WB_ListEntitiesResponse();

		WorldEditor worldEditor = Workbench.GetModule(WorldEditor);
		if (!worldEditor)
		{
			resp.status = "error";
			resp.message = "WorldEditor module not available";
			return resp;
		}

		WorldEditorAPI api = worldEditor.GetApi();
		if (!api)
		{
			resp.status = "error";
			resp.message = "WorldEditorAPI not available";
			return resp;
		}

		int entityCount = api.GetEditorEntityCount();
		int pageLimit = req.limit;
		if (pageLimit <= 0)
			pageLimit = 50;

		int pageOffset = req.offset;
		if (pageOffset < 0)
			pageOffset = 0;

		string filter = req.nameFilter;
		filter.ToLower();

		// Collect matching entities with pagination
		int matched = 0;
		int skipped = 0;
		resp.totalCount = 0;

		for (int i = 0; i < entityCount; i++)
		{
			IEntitySource entSrc = api.GetEditorEntity(i);
			if (!entSrc)
				continue;

			string entName = entSrc.GetName();

			// Apply name filter
			if (filter != "")
			{
				string lowerName = entName;
				lowerName.ToLower();
				if (lowerName.IndexOf(filter) < 0)
					continue;
			}

			resp.totalCount++;

			// Pagination: skip until offset
			if (skipped < pageOffset)
			{
				skipped++;
				continue;
			}

			// Pagination: stop at limit
			if (matched >= pageLimit)
				continue;

			string className = entSrc.GetClassName();

			// Get position from the runtime entity
			string posStr = "0 0 0";
			IEntity ent = api.SourceToEntity(entSrc);
			if (ent)
			{
				vector pos = ent.GetOrigin();
				posStr = pos[0].ToString() + " " + pos[1].ToString() + " " + pos[2].ToString();
			}

			resp.m_aNames.Insert(entName);
			resp.m_aClassNames.Insert(className);
			resp.m_aPositions.Insert(posStr);
			resp.m_aIDs.Insert(entSrc.GetID().ToString());
			resp.m_aIndices.Insert(i);
			matched++;
		}

		resp.returnedCount = matched;
		resp.offset = pageOffset;
		resp.status = "ok";
		resp.message = "Listed " + matched.ToString() + " of " + resp.totalCount.ToString() + " entities";

		return resp;
	}
}
