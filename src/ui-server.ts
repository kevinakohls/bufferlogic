import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parsePortfolio, schedulePortfolio } from './portfolio.js';
import { parsePortfolioCsv } from './portfolio-csv.js';
import { parseResourceCalendarsCsv, todayDate } from './resource-calendars.js';

const root = new URL('../../', import.meta.url);
async function body(request:IncomingMessage):Promise<Record<string,unknown>> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('Send JSON data');
  let size=0;const chunks:Buffer[]=[];
  for await (const chunk of request) {size+=chunk.length;if(size>1024*1024)throw new Error('Files must total less than 1 MB');chunks.push(chunk);}
  const parsed:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(typeof parsed!=='object'||parsed===null||Array.isArray(parsed))throw new Error('Invalid request');
  return parsed as Record<string,unknown>;
}
export function createReviewServer() {
  return createServer(async(request,response)=>{
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    const json=(value:unknown,status=200)=>{response.statusCode=status;response.setHeader('Content-Type','application/json; charset=utf-8');response.end(JSON.stringify(value));};
    try {
      const host=request.headers.host??'';
      if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)){json({error:'Use localhost or 127.0.0.1'},403);return;}
      if(request.headers.origin && request.headers.origin!==`http://${host}`){json({error:'Open the review app on this computer'},403);return;}
      const path=new URL(request.url??'/',`http://${host}`).pathname;
      if(request.method==='GET'&&path==='/api/example'){
        json({projectText:await readFile(new URL('examples/house_build_tasks2.csv',root),'utf8'),calendarText:await readFile(new URL('examples/house-resource-calendars.csv',root),'utf8')});return;
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
        json(schedulePortfolio(plan));return;
      }
      if(request.method==='POST'&&path==='/api/schedule'){
        const data=await body(request);json(schedulePortfolio(parsePortfolio(data.plan)));return;
      }
      const files:Record<string,{file:string;type:string}>={'/':{file:'index.html',type:'text/html'},'/app.js':{file:'app.js',type:'text/javascript'},'/timeline.js':{file:'timeline.js',type:'text/javascript'},'/styles.css':{file:'styles.css',type:'text/css'}};
      if(request.method==='GET'&&files[path]){const asset=files[path]!;response.setHeader('Content-Type',asset.type+'; charset=utf-8');response.end(await readFile(new URL('ui/'+asset.file,root)));return;}
      json({error:'Not found'},404);
    } catch(error){json({error:error instanceof Error?error.message:'Unable to calculate the schedule'},400);}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.BUFFERLOGIC_PORT??3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('BUFFERLOGIC_PORT must be between 1 and 65535');
  const server=createReviewServer();
  server.on('error',error=>{console.error(`BufferLogic: ${error.message}`);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`BufferLogic review UI: http://localhost:${port}\nKeep this terminal open. Press Ctrl+C to stop.`));
}
