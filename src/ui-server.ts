import {compareScenarios} from './scenario-comparison.js';
import {taskAssignments} from './task-resources.js';
import { createBlankProject, appendTask, deleteProject, deleteTask } from './project-editor.js';
import { instantiateTemplate, templateProjects } from './templates.js';
import { resourceUtilization } from './utilization.js';
import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parsePortfolio, schedulePortfolio } from './portfolio.js';
import { parsePortfolioCsv } from './portfolio-csv.js';
import { parseResourceCalendarsCsv, todayDate } from './resource-calendars.js';

function reviewResult(input:unknown){
 const plan=parsePortfolio(input);
 if(!plan.projects.some(project=>project.tasks.length))return {plan,needsTasks:true};
 const unassignedTaskIds=plan.projects.flatMap(project=>project.tasks).filter(task=>taskAssignments(task).some(a=>!a.resource)).map(task=>task.id);
 if(unassignedTaskIds.length)return {plan,needsAssignments:true,unassignedTaskIds};
 const result=schedulePortfolio(plan);return {...result,...(result.plan.calendar?{utilization:resourceUtilization(result)}:{})};}
const root = new URL('../../', import.meta.url);
async function body(request:IncomingMessage):Promise<Record<string,unknown>> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('Send JSON data');
  let size=0;const chunks:Buffer[]=[];
  for await (const chunk of request) {size+=chunk.length;if(size>1024*1024)throw new Error('Files must total less than 1 MB');chunks.push(chunk);}
  const parsed:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(typeof parsed!=='object'||parsed===null||Array.isArray(parsed))throw new Error('Invalid request');
  return parsed as Record<string,unknown>;
}
export interface ReviewServerOptions { readonly publicOrigin?: string; }
export function createReviewServer(options: ReviewServerOptions = {}) {
  let publicOrigin: string | undefined;
  if(options.publicOrigin){
    const url=new URL(options.publicOrigin);
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Public origin must be an HTTPS origin without a path or credentials');
    publicOrigin=url.origin;
  }
  return createServer(async(request,response)=>{
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    const json=(value:unknown,status=200)=>{response.statusCode=status;response.setHeader('Content-Type','application/json; charset=utf-8');response.end(JSON.stringify(value));};
    try {
      const host=request.headers.host??'';
      const local=/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
      const expectedOrigin=publicOrigin&&host===new URL(publicOrigin).host?publicOrigin:local?`http://${host}`:undefined;
      if(!expectedOrigin){json({error:'Use the configured BufferLogic address'},403);return;}
      if(request.headers.origin && request.headers.origin!==expectedOrigin){json({error:'Open BufferLogic at the same address as this request'},403);return;}
      const path=new URL(request.url??'/',`http://${host}`).pathname;
      if(request.method==='GET'&&path==='/api/housing-template'){json({csvText:await readFile(new URL('examples/housing-template.csv',root),'utf8')});return;}
      if(request.method==='GET'&&path==='/api/software-template'){json({csvText:await readFile(new URL('examples/software-template.csv',root),'utf8')});return;}
      if(request.method==='GET'&&path==='/api/example'){
        json({projectText:await readFile(new URL('examples/house_build_tasks2.csv',root),'utf8'),calendarText:await readFile(new URL('examples/house-resource-calendars.csv',root),'utf8')});return;
      }
      if(request.method==='POST'&&path==='/api/compare'){
        const data=await body(request);json(compareScenarios(data.baseline,data.scenario));return;
      }
      if(request.method==='POST'&&path==='/api/project/delete'){
        const data=await body(request);
        if(typeof data.projectId!=='string'||!data.projectId.trim())throw new Error('Choose a project to delete');
        json(reviewResult(deleteProject(parsePortfolio(data.plan),data.projectId)));return;
      }
      if(request.method==='POST'&&path==='/api/project'){
        const data=await body(request);
        if(typeof data.name!=='string')throw new Error('Give the new project a name');
        const timeZone=typeof data.timeZone==='string'?data.timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone;
        const startDate=typeof data.startDate==='string'&&data.startDate.trim()?data.startDate.trim():todayDate(timeZone);
        json(reviewResult(createBlankProject(data.name,data.plan===undefined?undefined:parsePortfolio(data.plan),startDate,timeZone)));return;
      }
      if(request.method==='POST'&&path==='/api/task/delete'){
        const data=await body(request);
        if(typeof data.taskId!=='string'||!data.taskId.trim())throw new Error('Choose a task to delete');
        json(reviewResult(deleteTask(parsePortfolio(data.plan),data.taskId)));return;
      }
      if(request.method==='POST'&&path==='/api/task'){
        const data=await body(request);
        if(typeof data.projectId!=='string'||typeof data.name!=='string'||typeof data.resource!=='string'
            ||typeof data.goodCase!=='number'||typeof data.poorCase!=='number'||!Array.isArray(data.dependsOn)||!data.dependsOn.every(id=>typeof id==='string'))throw new Error('Provide the task project, name, resource, estimates and dependencies');
        json(reviewResult(appendTask(parsePortfolio(data.plan),{projectId:data.projectId,name:data.name,resource:data.resource,goodCase:data.goodCase,poorCase:data.poorCase,dependsOn:data.dependsOn})));return;
      }
      if(request.method==='POST'&&path==='/api/template-info'){
        const data=await body(request);if(typeof data.csvText!=='string')throw new Error('Choose a template CSV');json({projects:templateProjects(data.csvText)});return;
      }
      if(request.method==='POST'&&path==='/api/template'){
        const data=await body(request);if(typeof data.csvText!=='string'||typeof data.name!=='string')throw new Error('Choose a template and project name');
        let plan=instantiateTemplate(data.csvText,data.name,data.plan===undefined?undefined:parsePortfolio(data.plan),typeof data.sourceProjectId==='string'?data.sourceProjectId:undefined);
        if(!plan.calendar){const timeZone=typeof data.timeZone==='string'?data.timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone;plan={...plan,calendar:{startDate:typeof data.startDate==='string'&&data.startDate?data.startDate:todayDate(timeZone),timeZone,hoursPerWorkday:8,resources:plan.resources.map(resource=>({resource,weeklyHours:[8,8,8,8,8,0,0],exceptions:{}}))}};}
        json(reviewResult(plan));return;
      }
      if(request.method==='POST'&&path==='/api/load'){
        const data=await body(request);
        if(typeof data.projectText!=='string'||(data.format!=='csv'&&data.format!=='json'))throw new Error('Choose a project CSV or JSON file');
        let plan;
        if(data.format==='csv')plan=parsePortfolioCsv(data.projectText,'review-project','review-v1');
        else {const parsed=JSON.parse(data.projectText);plan=parsePortfolio(parsed && typeof parsed==='object' ? parsed.plan??parsed : parsed);}
        if(data.calendarText!==undefined){
          if(typeof data.calendarText!=='string')throw new Error('Choose a calendar CSV file');
          const timeZone=typeof data.timeZone==='string'?data.timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone;
          const startDate=typeof data.startDate==='string'&&data.startDate?data.startDate:todayDate(timeZone);
          if(plan.calendar && plan.calendar.startDate!==startDate && plan.projects.some(p=>p.tasks.some(t=>t.locked||t.actuals)))throw new Error('This plan contains fixed commitments or actuals. Keep its recorded schedule start date.');
          plan={...plan,calendar:{startDate,timeZone,hoursPerWorkday:plan.calendar?.hoursPerWorkday??8,resources:parseResourceCalendarsCsv(data.calendarText)}};
        }
        json(reviewResult(plan));return;
      }
      if(request.method==='POST'&&path==='/api/schedule'){
        const data=await body(request);json(reviewResult(data.plan));return;
      }
      const files:Record<string,{file:string;type:string}>={'/':{file:'index.html',type:'text/html'},'/favicon.svg':{file:'favicon.svg',type:'image/svg+xml'},'/workspace-name.js':{file:'workspace-name.js',type:'text/javascript'},'/app.js':{file:'app.js',type:'text/javascript'},'/help.js':{file:'help.js',type:'text/javascript'},'/timeline.js':{file:'timeline.js',type:'text/javascript'},'/forecast-state.js':{file:'forecast-state.js',type:'text/javascript'},'/feeding-visuals.js':{file:'feeding-visuals.js',type:'text/javascript'},'/styles.css':{file:'styles.css',type:'text/css'},'/bufferlogic-logo.png':{file:'bufferlogic-logo.png',type:'image/png'}};
      if(request.method==='GET'&&files[path]){const asset=files[path]!;response.setHeader('Content-Type',asset.type.startsWith('image/')?asset.type:asset.type+'; charset=utf-8');response.end(await readFile(new URL('ui/'+asset.file,root)));return;}
      json({error:'Not found'},404);
    } catch(error){json({error:error instanceof Error?error.message:'Unable to calculate the schedule'},400);}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT??process.env.BUFFERLOGIC_PORT??3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT or BUFFERLOGIC_PORT must be between 1 and 65535');
  const server=createReviewServer(process.env.BUFFERLOGIC_PUBLIC_ORIGIN?{publicOrigin:process.env.BUFFERLOGIC_PUBLIC_ORIGIN}:{});
  server.on('error',error=>{console.error(`BufferLogic: ${error.message}`);process.exitCode=1;});
  server.listen(port,process.env.PORT?'0.0.0.0':'127.0.0.1',()=>console.log(`BufferLogic review UI: http://localhost:${port}\nKeep this terminal open. Press Ctrl+C to stop.`));
}
