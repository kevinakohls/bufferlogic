import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePortfolio} from '../src/portfolio.js';
import {createBlankProject} from '../src/project-editor.js';
const {workspaceFilename}=await import(new URL('../../ui/workspace-name.js',import.meta.url).href);

test('workspace names default from the first project and survive parsing and project additions',()=>{
 const first=createBlankProject('Release One',undefined,'2026-10-15');
 assert.equal(first.name,'Release One workspace');
 const renamed={...first,name:'  Kevin review  '};
 const parsed=parsePortfolio(renamed);assert.equal(parsed.name,'Kevin review');
 assert.equal(createBlankProject('Release Two',parsed).name,'Kevin review');
 const {name:removed,...legacy}=first;
 assert.equal(parsePortfolio(legacy).name,'Release One workspace');
 assert.equal(parsePortfolio({...legacy,projects:[]}).name,'Untitled workspace');
 assert.throws(()=>parsePortfolio({...first,name:''}),/Workspace name/);
 assert.throws(()=>parsePortfolio({...first,name:4}),/Workspace name/);
});

test('download names include the workspace name and timestamp, removing Windows path characters',()=>{
 const one=workspaceFilename('Review: Release/One?',new Date('2026-10-15T16:20:30.123Z'));
 assert.equal(one,'bufferlogic-Review- Release-One--2026-10-15T16-20-30-123Z.json');
 assert.doesNotMatch(one,/[<>:"/\\|?*]/);
 assert.notEqual(one,workspaceFilename('Review: Release/One?',new Date('2026-10-15T16:20:30.124Z')));
 assert.match(workspaceFilename('',new Date('2026-10-15')),/Untitled workspace/);
});
