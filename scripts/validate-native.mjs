#!/usr/bin/env node
// Explicitly authorized live acceptance. Uses isolated, uniquely named files
// and an entity; never saves the user's world. Owns and closes one MCP child.
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const flag = process.argv.indexOf('--project-path');
if (flag < 0 || !process.argv[flag + 1] || !process.argv.includes('--allow-editor-mutations')) {
  throw new Error('Requires --project-path <loaded addon root> --allow-editor-mutations. Temporarily edits the live editor, adds isolated fixtures, and tests compiler failure/recovery.');
}
const projectPath = resolve(process.argv[flag + 1]);
const packageRoot = resolve(import.meta.dirname, '..');
const token = 'EMCP_NativeSmoke_' + randomBytes(5).toString('hex');
const sourcePath = `Scripts/WorkbenchGame/${token}.c`;
const prefabPath = `Prefabs/${token}.et`;
const source = `class ${token}\n{\n\tstatic int Calculate(int value)\n\t{\n\t\tint doubled = value * 2;\n\t\treturn doubled + 1;\n\t}\n}\n`;
const prefab = 'GenericEntity {\n}\n';
const client = new Client({ name: 'native-workbench-acceptance', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: [join(packageRoot, 'dist/index.js')], stderr: 'pipe',
  env: { ...process.env, ENFUSION_PROJECT_PATH: dirname(projectPath) } });
let createdEntity = false, sourceCreated = false, prefabCreated = false, prefabOpened = false;
let prefabTarget, openedSourceFile, warningCount, projectId;
let primaryError;
const evidence = [];
async function call(name, args = {}, expectError = false) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 180000 });
  const data = result.structuredContent?.data ?? result.structuredContent;
  evidence.push({ tool: name, action: args.action, expectedError: expectError });
  console.log(JSON.stringify({ tool: name, action: args.action, expectedError: expectError, outcome: result.isError ? 'error' : 'completed' }));
  assert.equal(!!result.isError, expectError, `${name}: ${JSON.stringify(result.content)}`);
  return data;
}
async function write(path, content) {
  return call('project', { action: 'write', projectPath, path, content, expectedMissing: true });
}
try {
  await client.connect(transport);
  const bridge = await call('wb_bridge', { action: 'status', projectPath });
  assert(bridge.projectId);
  projectId = bridge.projectId;
  const initialState = await call('wb_state');
  assert(['no_world', 'no_world_editor'].includes(initialState.mode), 'Live acceptance needs an empty World Editor; it never replaces an existing user world.');
  const initialSource = await call('wb_script_editor', { action: 'getCurrentFile' });
  assert.equal(initialSource.currentFile, '', 'Close existing Script Editor tabs before acceptance; Save All must only affect this fixture.');
  for (const module of ['resourceManager', 'scriptEditor', 'worldEditor', 'audioEditor', 'animationEditor', 'particleEditor', 'behaviorEditor', 'localizationEditor', 'proceduralAnimationEditor', 'navmeshEditor']) {
    await call('wb_editor_module', { module, action: 'open', allowForeground: true });
    const state = await call('wb_editor_module', { module, action: 'state' });
    assert.equal(state.bridgeVersion, '0.15.0');
    const roots = await call('wb_editor_module', { module, action: 'containers', limit: 2 });
    assert(roots.nodes.every(n => n && typeof n === 'object'));
    if (!['resourceManager', 'scriptEditor', 'worldEditor'].includes(module)) await call('wb_editor_module', { module, action: 'close', allowForeground: true });
  }
  await write(prefabPath, prefab); prefabCreated = true;
  await call('wb_resources', { action: 'register', path: join(projectPath, prefabPath) });
  await call('wb_editor_module', { module: 'worldEditor', action: 'openResource', resourcePath: prefabPath, allowForeground: true });
  prefabOpened = true;
  const prefabRoots = await call('wb_editor_module', { module: 'worldEditor', action: 'containers', limit: 10 });
  prefabTarget = prefabRoots.nodes.find(n => n.available && n.className === 'GenericEntity')?.target;
  assert(prefabTarget);
  await call('wb_entity_create', { prefab: prefabPath, name: token, position: '1 2 3' }); createdEntity = true;
  const listed = await call('wb_entity_list', { nameFilter: token });
  assert.equal(listed.entities.length, 1);
  const entityId = listed.entities[0].entityId;
  assert(entityId);
  const inspected = await call('wb_editor_module', { module: 'worldEditor', action: 'inspect', entityId });
  const scale = inspected.properties.find(p => p.name === 'scale');
  assert.equal(scale.readable, true);
  const args = { module: 'worldEditor', action: 'setProperty', entityId, expectedTarget: inspected.target, expectedValue: scale.value, propertyKey: 'scale', valueType: 'number', value: 1.25 };
  await call('wb_editor_module', { ...args, expectedTarget: 'stale' }, true);
  const changed = await call('wb_editor_module', args);
  assert.equal(changed.verified, true);
  await call('wb_editor_module', { ...args, expectedTarget: changed.target, expectedValue: 'stale' }, true);
  const restored = await call('wb_editor_module', { ...args, expectedTarget: changed.target, expectedValue: changed.afterValue, value: Number(scale.value) });
  assert.equal(restored.verified, true);
  const nested = inspected.nodes.find(n => n.available && n.path.startsWith('object:'));
  if (nested) await call('wb_editor_module', { module: 'worldEditor', action: 'inspect', entityId, objectPath: nested.path });
  await call('wb_entity_modify', { action: 'rotate', name: token, value: '0 25 0' });
  const rotated = await call('wb_entity_modify', { action: 'getProperty', name: token, propertyKey: 'angles' });
  assert.equal(rotated.message, '0 25 0');
  const details = await call('wb_entity_inspect', { name: token });
  assert.equal(details.properties.find(p => p.name === 'scale').dataType, scale.dataType);
  assert.notEqual(scale.dataType, 0);
  await write(sourcePath, source); sourceCreated = true;
  await call('wb_script_editor', { action: 'openFile', path: sourcePath, allowForeground: true });
  const buffer = await call('wb_script_editor', { action: 'readRange', line: 0 });
  openedSourceFile = buffer.currentFile;
  assert.deepEqual(buffer.lines.slice(0, 8), source.trimEnd().split('\n'));
  const lineArgs = { expectedFile: buffer.currentFile, expectedLinesCount: buffer.linesCount, line: 5, expectedText: buffer.lines[5] };
  await call('wb_script_editor', { ...lineArgs, action: 'setLine', expectedText: 'stale', text: 'stale' }, true);
  await call('wb_script_editor', { ...lineArgs, action: 'setLine', text: '\t\treturn doubled + ;' });
  assert.equal(readFileSync(join(projectPath, sourcePath), 'utf8'), source);
  await call('wb_script_editor', { action: 'saveAll', expectedFile: buffer.currentFile, allowForeground: true });
  assert(readFileSync(join(projectPath, sourcePath), 'utf8').includes('return doubled + ;'));
  const failedCompile = await call('wb_validate_scripts', { configuration: 'WORKBENCH' }, true);
  assert(failedCompile.Errors.some(e => e.file?.includes(token)));
  await call('wb_script_editor', { ...lineArgs, expectedText: '\t\treturn doubled + ;', action: 'setLine', text: buffer.lines[5] });
  await call('wb_script_editor', { action: 'saveAll', expectedFile: buffer.currentFile, allowForeground: true });
  const compile = await call('wb_validate_scripts', { configuration: 'WORKBENCH' });
  assert.equal(compile.Success, true);
  warningCount = compile.Warnings.length;
  await call('wb_debug', { action: 'controls' });
  await call('wb_debug', { action: 'snapshot', maxLines: 5 });
  const docs = await call('wb_docs', { action: 'list' });
  assert(docs);
  await call('wb_editor_module', { module: 'scriptEditor', action: 'executeAction', menuPath: 'Window,Close Tab', expectedFile: buffer.currentFile, allowForeground: true });
  openedSourceFile = undefined;
} catch (error) {
  primaryError = error;
} finally {
  const cleanupErrors = [];
  const clean = async action => { try { await action(); return true; } catch (error) { cleanupErrors.push(error); return false; } };
  try {
    if (createdEntity) await clean(() => call('wb_entity_delete', { name: token }));
    let sourceClosed = !openedSourceFile;
    if (openedSourceFile) sourceClosed = await clean(async () => {
      const current = await call('wb_script_editor', { action: 'getCurrentFile' });
      if (!current.currentFile) return;
      assert.equal(current.currentFile, openedSourceFile, 'Source tab changed; retain the fixture for inspection.');
      // Restore only an unchanged test edit before closing; never save other buffers.
      const currentBuffer = await call('wb_script_editor', { action: 'readRange', line: 0 });
      if (currentBuffer.lines[5] === '\t\treturn doubled + ;') {
        await call('wb_script_editor', { action: 'setLine', line: 5, text: '\t\treturn doubled + 1;', expectedFile: openedSourceFile, expectedLinesCount: currentBuffer.linesCount, expectedText: currentBuffer.lines[5] });
        await call('wb_script_editor', { action: 'saveAll', expectedFile: openedSourceFile, allowForeground: true });
      }
      await call('wb_editor_module', { module: 'scriptEditor', action: 'executeAction', menuPath: 'Window,Close Tab', expectedFile: openedSourceFile, allowForeground: true });
    });
    let prefabClosed = !prefabOpened;
    if (prefabOpened) prefabClosed = await clean(async () => {
      const state = await call('wb_state');
      assert(state.isPrefabEditMode === 1 || state.isPrefabEditMode === true, 'Editor left the isolated prefab; preserve current scene for inspection.');
      const roots = await call('wb_editor_module', { module: 'worldEditor', action: 'containers', limit: 10 });
      assert(roots.nodes.some(n => n.target === prefabTarget), 'Editor changed targets; preserve the current scene and fixture for inspection.');
      // All edits targeted the deleted test entity. Generic Save in prefab mode
      // attempts to save the unnamed world and can open a Save As dialog.
      await call('wb_editor_module', { module: 'worldEditor', action: 'close', allowForeground: true });
    });
    for (const [owned, path] of [[sourceCreated && sourceClosed, sourcePath], [prefabCreated && prefabClosed, prefabPath]]) {
      if (!owned) continue;
      // Only delete the exact generated fixture and sidecar in its verified root.
      for (const suffix of ['', '.meta']) {
        const file = join(projectPath, path + suffix);
        await clean(async () => {
          if (existsSync(file)) {
            assert(!lstatSync(file).isSymbolicLink(), 'Fixture was replaced by a link; preserve it.');
            unlinkSync(file);
          }
        });
      }
    }
    if (sourceCreated && sourceClosed && prefabClosed && !cleanupErrors.length) {
      await clean(async () => {
        await call('wb_validate_scripts', { configuration: 'WORKBENCH' });
        await call('wb_reload');
      });
    }
  } finally { await client.close(); await transport.close(); }
  const errors = [primaryError, ...cleanupErrors].filter(Boolean);
  if (errors.length) throw new AggregateError(errors, `Native acceptance failed (${token}); inspect the retained evidence and any fixtures before retrying.`);
}
console.log(JSON.stringify({ passed: true, cleanup: 'complete', operations: evidence.length, projectId, warningCount }));
