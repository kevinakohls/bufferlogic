import { csvRecords } from './csv-input.js';

export interface ResourceCalendar {
  readonly resource: string;
  /** Monday through Sunday, total available hours per date. */
  readonly weeklyHours: readonly number[];
  readonly exceptions: Readonly<Record<string, number>>;
}
export interface CalendarSettings {
  readonly startDate: string;
  readonly timeZone?: string;
  readonly hoursPerWorkday: number;
  readonly resources: readonly ResourceCalendar[];
}
const weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export function todayDate(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(now);
  const part=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const millisecondsPerDay = 86400000;
const searchDays = 36600;
const epsilon = 1e-9;

/** Date-only Gregorian arithmetic, independent of machine timezone and DST. */
export function parseDate(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date must be YYYY-MM-DD');
  const parsed = Date.parse(value+'T00:00:00Z');
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0,10) !== value) throw new Error(`Invalid date: ${value}`);
  return parsed;
}
export function validateCalendarSettings(value: unknown): CalendarSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid calendar settings');
  const v = value as Record<string,unknown>;
  parseDate(v.startDate);
  if(v.timeZone!==undefined){if(typeof v.timeZone!=='string')throw new Error('Invalid calendar timezone');todayDate(v.timeZone);}
  if (typeof v.hoursPerWorkday !== 'number' || !Number.isFinite(v.hoursPerWorkday) || v.hoursPerWorkday <= 0 || v.hoursPerWorkday > 24 || !Array.isArray(v.resources)) throw new Error('Calendar requires hoursPerWorkday greater than 0 and at most 24 and resource calendars');
  const seen = new Set<string>();
  const resources = v.resources.map((item:unknown):ResourceCalendar => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error('Invalid resource calendar');
    const r=item as Record<string,unknown>;
    if (typeof r.resource !== 'string' || !r.resource.trim() || seen.has(r.resource)) throw new Error('Resource calendar names must be nonempty and unique');
    seen.add(r.resource);
    if (!Array.isArray(r.weeklyHours) || r.weeklyHours.length !== 7 || !r.weeklyHours.every(hours)) throw new Error(`Invalid weekly hours: ${r.resource}`);
    if (typeof r.exceptions !== 'object' || r.exceptions === null || Array.isArray(r.exceptions)) throw new Error('Invalid calendar exceptions');
    const exceptions:Record<string,number> = {};
    for (const [date,value] of Object.entries(r.exceptions)) {parseDate(date);if(!hours(value))throw new Error(`Invalid exception hours: ${date}`);exceptions[date]=value;}
    return {resource:r.resource,weeklyHours:[...r.weeklyHours] as number[],exceptions};
  });
  return {startDate:v.startDate as string,hoursPerWorkday:v.hoursPerWorkday,resources,...(v.timeZone===undefined?{}:{timeZone:v.timeZone as string})};
}
function hours(v:unknown):v is number {return typeof v==='number' && Number.isFinite(v) && v>=0 && v<=24;}

export function parseResourceCalendarsCsv(text:string):ResourceCalendar[] {
  const rows=csvRecords(text), header=rows.shift()?.map(c=>c.trim());
  const required=['Resource','Row type','Date',...weekdays.map(d=>d+' hours'),'Exception hours'];
  if(!header || new Set(header).size!==header.length || required.some(c=>!header.includes(c)))throw new Error('Calendar CSV is missing required columns or has duplicate columns');
  const weekly=new Map<string,number[]>(), exceptions=new Map<string,Record<string,number>>();
  function number(raw:string):number {if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)||!hours(Number(raw)))throw new Error('Available hours must be numeric, between 0 and 24');return Number(raw);}
  for(const row of rows){
    if(row.every(c=>!c.trim()))continue;
    if(row.length!==header.length)throw new Error('Calendar CSV row has wrong number of fields');
    const cell=(name:string)=>row[header.indexOf(name)]!.trim();
    const resource=cell('Resource'),type=cell('Row type');
    if(!resource)throw new Error('Calendar row requires a resource');
    if(type==='weekly'){
      if(weekly.has(resource))throw new Error(`Duplicate weekly calendar: ${resource}`);
      if(cell('Date')||cell('Exception hours'))throw new Error('Weekly rows cannot specify dates or exception hours');
      weekly.set(resource,weekdays.map(d=>number(cell(d+' hours'))));
    }else if(type==='exception'){
      const date=cell('Date');parseDate(date);
      if(weekdays.some(d=>cell(d+' hours')))throw new Error('Exception rows must leave weekday hours empty');
      const values=exceptions.get(resource)??{};
      if(Object.hasOwn(values,date))throw new Error(`Duplicate exception: ${resource} ${date}`);
      values[date]=number(cell('Exception hours'));exceptions.set(resource,values);
    }else throw new Error('Row type must be weekly or exception');
  }
  for(const resource of exceptions.keys())if(!weekly.has(resource))throw new Error(`Exception requires weekly calendar: ${resource}`);
  if(!weekly.size)throw new Error('Calendar CSV has no weekly calendars');
  return [...weekly].map(([resource,weeklyHours])=>({resource,weeklyHours,exceptions:exceptions.get(resource)??{}}));
}

/** Daily capacity model: available hours are spread uniformly over the date.
 * Fractional offsets describe progress within a capacity day, not clock times/shifts.
 */
export function createCalendar(settings:CalendarSettings) {
  const origin=parseDate(settings.startDate);
  const byResource=new Map(settings.resources.map(r=>[r.resource,r]));
  const date=(offset:number)=>{
    if(!Number.isFinite(offset))throw new Error('Calendar offset must be finite');
    const value=new Date(origin+Math.floor(offset+epsilon)*millisecondsPerDay);
    if(!Number.isFinite(value.getTime())||value.getUTCFullYear()>9999)throw new Error('Calendar date exceeds numeric range');
    return value.toISOString().slice(0,10);
  };
  const completionDate=(offset:number)=>date(offset>0 ? Math.max(0,Math.ceil(offset-epsilon)-1) : 0);
  function available(resource:string,offset:number):number {
    const r=byResource.get(resource);if(!r)throw new Error(`Missing resource calendar: ${resource}`);
    const dateKey=date(offset),weekday=(new Date(parseDate(dateKey)).getUTCDay()+6)%7;
    return r.exceptions[dateKey]??r.weeklyHours[weekday]!;
  }
  function nextWorking(resource:string,time:number):number {
    let value=Math.abs(time-Math.round(time))<epsilon?Math.round(time):time;
    for(let count=0;count<searchDays;count++){
      if(available(resource,value)>0)return value;
      value=Math.floor(value)+1;
    }
    throw new Error(`No working availability for ${resource} within ${searchDays} days`);
  }
  function finish(resource:string,start:number,effortDays:number):number {
    if(!Number.isFinite(effortDays)||effortDays<0)throw new Error('Invalid calendar effort');
    if(effortDays===0)return start;
    let time=start,remaining=effortDays*settings.hoursPerWorkday;
    if(!Number.isFinite(remaining))throw new Error('Calendar effort exceeds numeric range');
    for(let count=0;count<searchDays;count++){
      time=nextWorking(resource,time);
      const end=Math.floor(time)+1, capacity=available(resource,time)*(end-time);
      if(remaining<=capacity+epsilon)return Math.min(end,time+remaining/available(resource,time));
      remaining-=capacity;time=end;
    }
    throw new Error(`Calendar effort exceeds ${searchDays}-day scheduling range`);
  }
  function effortBetween(resource:string,start:number,end:number):number {
    if(end-start>searchDays)throw new Error('Locked calendar interval exceeds scheduling range');
    let hours=0;
    for(let time=start;time<end;){const boundary=Math.min(end,Math.floor(time)+1);hours+=available(resource,time)*(boundary-time);time=boundary;}
    return hours/settings.hoursPerWorkday;
  }
  return {date,completionDate,available,nextWorking,finish,effortBetween};
}
