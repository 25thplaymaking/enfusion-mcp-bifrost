// Native inspect/navigate/edit support. No retained engine objects, filesystem
// access, or script evaluation. Copy values into responses before returning.
class EMCP_WB_EnumChoice : JsonApiStruct
{
	string name;
	int value;
	override void OnPack()
	{
		StoreString("name", name); StoreInteger("value", value);
	}
}

class EMCP_WB_InspectedProperty : JsonApiStruct
{
	string name;
	string type;
	string value;
	string defaultValue;
	string widget;
	string objectBaseClass;
	bool readable;
	bool overridden;
	int dataType;
	int itemCount = -1;
	int limitCount;
	float minimum;
	float maximum;
	float step;
	ref array<string> enumNames = {};
	ref array<int> enumValues = {};

	override void OnPack()
	{
		StoreString("name", name); StoreString("type", type); StoreInteger("dataType", dataType);
		StoreString("value", value); StoreBoolean("readable", readable); StoreBoolean("overridden", overridden);
		StoreString("defaultValue", defaultValue); StoreString("widget", widget);
		StoreString("objectBaseClass", objectBaseClass); StoreInteger("itemCount", itemCount);
		StoreInteger("limitCount", limitCount);
		if (limitCount > 0) StoreFloat("minimum", minimum);
		if (limitCount > 1) StoreFloat("maximum", maximum);
		if (limitCount > 2) StoreFloat("step", step);
		StartArray("enumValues");
		for (int ev = 0; ev < Math.Min(enumNames.Count(), 256); ev++)
		{
			if (ev >= enumValues.Count()) break;
			EMCP_WB_EnumChoice choice = new EMCP_WB_EnumChoice();
			choice.name = enumNames[ev]; choice.value = enumValues[ev]; ItemObject(choice);
		}
		EndArray(); StoreInteger("enumCount", enumNames.Count());
	}
}

class EMCP_WB_InspectedNode : JsonApiStruct
{
	string path;
	string name;
	string className;
	string resource;
	string target;
	string entityId;
	int index;
	bool available;
	override void OnPack()
	{
		StoreString("path", path); StoreString("name", name); StoreString("className", className);
		StoreString("resource", resource); StoreString("target", target); StoreString("entityId", entityId);
		StoreInteger("index", index); StoreBoolean("available", available);
	}
}

class EMCP_WB_Inspector
{
	// Lazy scalar state only. Reload changes the epoch; native object identity
	// additionally changes on editor navigation. Never retain a container/world.
	protected static string s_Epoch;
	static string Epoch()
	{
		if (s_Epoch == "") s_Epoch = System.GetTickCount().ToString();
		return s_Epoch;
	}

	static string Target(string moduleName, BaseContainer container)
	{
		if (!container) return "";
		string target = Epoch() + "|" + moduleName + "|" + container.ToString() + "|" + container.GetResourceName();
		WorldEditor editor = Workbench.GetModule(WorldEditor);
		if (moduleName == "worldEditor" && editor && editor.GetApi() && editor.GetApi().GetWorld())
			target += "|" + editor.GetApi().GetWorld().ToString();
		return target;
	}

	static EMCP_WB_InspectedNode DescribeNode(string moduleName, BaseContainer container, string path, int index)
	{
		EMCP_WB_InspectedNode node = new EMCP_WB_InspectedNode();
		node.path = path;
		node.index = index;
		if (container)
		{
			node.available = true;
			node.name = container.GetName();
			node.className = container.GetClassName();
			node.resource = container.GetResourceName();
			node.target = Target(moduleName, container);
			IEntitySource entity = container.ToEntitySource();
			if (entity) node.entityId = entity.GetID().ToString();
		}
		return node;
	}

	static string ChildPath(string path, string part)
	{
		if (path == "") return part;
		return path + "/" + part;
	}

	static BaseContainer Resolve(BaseContainer root, string path)
	{
		BaseContainer current = root;
		if (path == "") return current;
		array<string> segments = {};
		path.Split("/", segments, false);
		if (segments.Count() > 16) return null;
		foreach (string segment : segments)
		{
			if (!current) return null;
			array<string> parts = {};
			segment.Split(":", parts, false);
			if (parts.Count() < 2) return null;
			if (parts[0] == "child")
			{
				int childIndex = parts[1].ToInt();
				if (childIndex < 0 || childIndex >= current.GetNumChildren()) return null;
				current = current.GetChild(childIndex);
			}
			else if (parts[0] == "component")
			{
				IEntitySource entity = current.ToEntitySource();
				int componentIndex = parts[1].ToInt();
				if (!entity || componentIndex < 0 || componentIndex >= entity.GetComponentCount()) return null;
				current = entity.GetComponent(componentIndex);
			}
			else if (parts[0] == "object")
			{
				int objectVar = current.GetVarIndex(parts[1]);
				if (objectVar < 0 || current.GetDataVarType(objectVar) != DataVarType.OBJECT) return null;
				current = current.GetObject(parts[1]);
			}
			else if (parts[0] == "array" && parts.Count() == 3)
			{
				int arrayVar = current.GetVarIndex(parts[1]);
				if (arrayVar < 0 || current.GetDataVarType(arrayVar) != DataVarType.OBJECT_ARRAY) return null;
				BaseContainerList items = current.GetObjectArray(parts[1]);
				int itemIndex = parts[2].ToInt();
				if (!items || itemIndex < 0 || itemIndex >= items.Count()) return null;
				current = items.Get(itemIndex);
			}
			else return null;
		}
		return current;
	}

	static bool ReadValue(BaseContainer container, string key, out string value, out string kind)
	{
		int index = container.GetVarIndex(key);
		if (index < 0) return false;
		DataVarType type = container.GetDataVarType(index);
		if (type == DataVarType.STRING || type == DataVarType.RESOURCE_NAME)
		{
			kind = "string";
			if (type == DataVarType.RESOURCE_NAME) kind = "resource";
			bool gotString = container.Get(key, value);
			if (value.Length() > 16384) { value = ""; return false; }
			return gotString;
		}
		if (type == DataVarType.INTEGER || type == DataVarType.FLAGS)
		{
			int integer;
			kind = "integer";
			if (!container.Get(key, integer)) return false;
			value = integer.ToString();
			return true;
		}
		if (type == DataVarType.SCALAR)
		{
			float scalar;
			kind = "number";
			if (!container.Get(key, scalar)) return false;
			value = scalar.ToString();
			return true;
		}
		if (type == DataVarType.BOOLEAN)
		{
			bool boolean;
			kind = "boolean";
			if (!container.Get(key, boolean)) return false;
			value = "false";
			if (boolean) value = "true";
			return true;
		}
		if (type == DataVarType.VECTOR3)
		{
			vector position;
			kind = "vector3";
			if (!container.Get(key, position)) return false;
			value = position[0].ToString() + " " + position[1].ToString() + " " + position[2].ToString();
			return true;
		}
		kind = "unsupported";
		if (type == DataVarType.OBJECT) kind = "object";
		if (type == DataVarType.OBJECT_ARRAY) kind = "objectArray";
		return false;
	}

	static EMCP_WB_InspectedProperty DescribeProperty(BaseContainer container, int index)
	{
		EMCP_WB_InspectedProperty prop = new EMCP_WB_InspectedProperty();
		prop.name = container.GetVarName(index);
		prop.dataType = container.GetDataVarType(index);
		prop.readable = ReadValue(container, prop.name, prop.value, prop.type);
		container.GetDefaultAsString(prop.name, prop.defaultValue);
		if (prop.defaultValue.Length() > 4096) prop.defaultValue = prop.defaultValue.Substring(0, 4096) + " [truncated]";
		prop.widget = container.GetUIWidget(index);
		prop.overridden = container.IsVariableSetDirectly(prop.name);
		prop.limitCount = container.GetLimits(index, prop.minimum, prop.maximum, prop.step);
		container.GetEnumValues(index, prop.enumNames, prop.enumValues);
		if (prop.type == "object" || prop.type == "objectArray") prop.objectBaseClass = container.GetObjectBaseClass(index);
		if (prop.type == "objectArray")
		{
			BaseContainerList items = container.GetObjectArray(prop.name);
			prop.itemCount = 0;
			if (items) prop.itemCount = items.Count();
		}
		return prop;
	}

	static bool WriteValue(BaseContainer container, string key, string kind, string value)
	{
		if (kind == "string" || kind == "resource") return container.Set(key, value);
		if (kind == "integer") return container.Set(key, value.ToInt());
		if (kind == "number") return container.Set(key, value.ToFloat());
		if (kind == "boolean") return container.Set(key, value == "true");
		if (kind == "vector3")
		{
			vector position = value.ToVector();
			return container.Set(key, position);
		}
		return false;
	}

	static void Inspect(EMCP_WB_EditorModuleRequest req, EMCP_WB_EditorModuleResponse resp, WBModuleDef editor)
	{
		resp.epoch = Epoch();
		resp.containerCount = editor.GetNumContainers();
		resp.status = "error";
		BaseContainer root;
		WorldEditor worldEditor = Workbench.GetModule(WorldEditor);
		WorldEditorAPI api;
		if (worldEditor) api = worldEditor.GetApi();
		if (req.action == "containers")
		{
			for (int ci = req.offset; ci < Math.Min(resp.containerCount, req.offset + req.limit); ci++)
				resp.nodes.Insert(DescribeNode(req.module, editor.GetContainer(ci), "", ci));
			resp.total = resp.containerCount;
			resp.status = "ok";
			resp.result = true;
			return;
		}
		if (req.entityId != "" || req.entityIndex >= 0)
		{
			if (req.module != "worldEditor" || !api) { resp.message = "Entity targets require World Editor edit mode"; return; }
			if (req.entityId != "")
			{
				for (int ei = 0; ei < api.GetEditorEntityCount(); ei++)
				{
					IEntitySource candidate = api.GetEditorEntity(ei);
					if (candidate && candidate.GetID().ToString() == req.entityId) { root = candidate; break; }
				}
			}
			else if (req.entityIndex < api.GetEditorEntityCount()) root = api.GetEditorEntity(req.entityIndex);
		}
		else if (req.containerIndex >= 0 && req.containerIndex < resp.containerCount) root = editor.GetContainer(req.containerIndex);
		BaseContainer target = Resolve(root, req.objectPath);
		if (!target) { resp.message = "Target not available; inspect containers/entities again"; return; }
		resp.target = Target(req.module, target);
		resp.className = target.GetClassName();
		resp.resource = target.GetResourceName();
		if (req.expectedTarget != "" && req.expectedTarget != resp.target) { resp.message = "STALE_TARGET: editor, resource, world or scripts changed; inspect again"; return; }
		IEntitySource entityRoot = root.ToEntitySource();
		EntityID rootId;
		if (entityRoot) rootId = entityRoot.GetID();
		if (entityRoot) resp.entityId = entityRoot.GetID().ToString();
		if (req.action == "setProperty" || req.action == "clearProperty")
		{
			if (req.expectedTarget == "" || !req.checkValue) { resp.message = "Mutation requires expectedTarget and expectedValue from inspection"; return; }
			string kind;
			if (!ReadValue(target, req.propertyKey, resp.beforeValue, kind)) { resp.message = "Property is missing or not a writable scalar type; navigate nested objects or use project source editing"; return; }
			if (resp.beforeValue != req.expectedValue) { resp.message = "CONFLICT: property changed since inspection"; return; }
			if (kind != req.valueType && req.action == "setProperty") { resp.message = "Property type differs from requested valueType"; return; }
			if (req.action == "setProperty" && (kind == "number" || kind == "integer"))
			{
				EMCP_WB_InspectedProperty metadata = DescribeProperty(target, target.GetVarIndex(req.propertyKey));
				float numericValue = req.value.ToFloat();
				if ((metadata.limitCount > 0 && numericValue < metadata.minimum) || (metadata.limitCount > 1 && numericValue > metadata.maximum)) { resp.message = "Value is outside the native property limits"; return; }
				if (metadata.dataType == DataVarType.INTEGER && metadata.enumValues.Count() > 0 && !metadata.enumValues.Contains(req.value.ToInt())) { resp.message = "Value is not a native enum choice"; return; }
			}
			bool changed;
			if (req.module == "worldEditor")
			{
				// The engine requires the root plus a property path for nested edits.
				array<ref ContainerIdPathEntry> editPath = {};
				array<string> segments = {};
				req.objectPath.Split("/", segments, false);
				foreach (string segment : segments)
				{
					array<string> parts = {};
					segment.Split(":", parts, false);
					if (parts.Count() < 2) continue;
					if (parts[0] == "child") { resp.message = "Inspect the child and use its returned entityId as the root for edits"; return; }
					if (parts[0] == "component") editPath.Insert(new ContainerIdPathEntry("components", parts[1].ToInt()));
					else if (parts[0] == "object") editPath.Insert(new ContainerIdPathEntry(parts[1]));
					else if (parts[0] == "array") editPath.Insert(new ContainerIdPathEntry(parts[1], parts[2].ToInt()));
				}
				if (!api || !api.BeginEntityAction("MCP property edit")) { resp.message = "Cannot begin native edit action"; return; }
				if (req.action == "clearProperty") changed = api.ClearVariableValue(root, editPath, req.propertyKey);
				else
				{
					string editorValue = req.value;
					if (kind == "boolean") { editorValue = "0"; if (req.value == "true") editorValue = "1"; }
					changed = api.SetVariableValue(root, editPath, req.propertyKey, editorValue);
				}
				api.EndEntityAction();
			}
			else if (req.action == "clearProperty") { target.ClearVariable(req.propertyKey); changed = !target.IsVariableSetDirectly(req.propertyKey); }
			else changed = WriteValue(target, req.propertyKey, kind, req.value);
			resp.applied = changed;
			// Re-resolve after mutations; native edits can reinitialize containers.
			if (req.module == "worldEditor" && rootId && api)
				root = api.FindEntityByID(rootId);
			target = Resolve(root, req.objectPath);
			if (!changed || !target || !ReadValue(target, req.propertyKey, resp.afterValue, kind)) { resp.message = "Native edit failed or readback unavailable; inspect before retrying"; return; }
			resp.target = Target(req.module, target);
			resp.verified = true;
			if (req.action == "clearProperty") resp.verified = !target.IsVariableSetDirectly(req.propertyKey);
			resp.message = "Native value read back; changes are in memory until explicitly saved";
			resp.result = resp.verified;
			if (resp.verified) resp.status = "ok";
			return;
		}
		resp.total = target.GetNumVars();
		for (int pi = req.offset; pi < Math.Min(resp.total, req.offset + req.limit); pi++)
		{
			EMCP_WB_InspectedProperty prop = DescribeProperty(target, pi);
			resp.properties.Insert(prop);
			if (prop.type == "object")
			{
				if (resp.nodeCount >= req.childOffset && resp.nodeCount < req.childOffset + req.limit)
					resp.nodes.Insert(DescribeNode(req.module, target.GetObject(prop.name), ChildPath(req.objectPath, "object:" + prop.name), pi));
				resp.nodeCount++;
			}
			if (prop.type == "objectArray")
			{
				BaseContainerList objects = target.GetObjectArray(prop.name);
				if (objects)
				{
					for (int ai = Math.Max(0, req.childOffset - resp.nodeCount); ai < Math.Min(objects.Count(), req.childOffset + req.limit - resp.nodeCount); ai++)
						resp.nodes.Insert(DescribeNode(req.module, objects.Get(ai), ChildPath(req.objectPath, "array:" + prop.name + ":" + ai.ToString()), ai));
					resp.nodeCount += objects.Count();
				}
			}
		}
		resp.childCount = target.GetNumChildren();
		for (int ch = Math.Max(0, req.childOffset - resp.nodeCount); ch < Math.Min(resp.childCount, req.childOffset + req.limit - resp.nodeCount); ch++)
			resp.nodes.Insert(DescribeNode(req.module, target.GetChild(ch), ChildPath(req.objectPath, "child:" + ch.ToString()), ch));
		resp.nodeCount += resp.childCount;
		IEntitySource entity = target.ToEntitySource();
		if (entity)
		{
			resp.componentCount = entity.GetComponentCount();
			for (int co = Math.Max(0, req.childOffset - resp.nodeCount); co < Math.Min(resp.componentCount, req.childOffset + req.limit - resp.nodeCount); co++)
				resp.nodes.Insert(DescribeNode(req.module, entity.GetComponent(co), ChildPath(req.objectPath, "component:" + co.ToString()), co));
			resp.nodeCount += resp.componentCount;
		}
		if (req.childOffset + resp.nodes.Count() < resp.nodeCount) resp.nextNodeOffset = req.childOffset + resp.nodes.Count();
		resp.result = true;
		resp.status = "ok";
		resp.message = "Live native properties; unsupported types are explicit, never substituted with defaults";
	}
}
