"""Independent mixed-calendar quadrature benchmark; run npm run build first.

Uses Python's own CDF integration, not BufferLogic's sampler, calendar, or
quadrature. Fixed prefix 157 days; A P20/P80=3/6 works seven days, B=2/6
works Monday-Friday. All days have eight hours, with a Monday origin.
"""
import json,math,subprocess
from pathlib import Path
Z80=.8416212335729143
ma,sa=(math.log(3)+math.log(6))/2,math.log(2)/(2*Z80)
mb,sb=(math.log(2)+math.log(6))/2,math.log(3)/(2*Z80)
# Independent cumulative inspector workdays from Monday origin.
def work(t):
 day=math.floor(t);weeks,weekday=divmod(day,7)
 return weeks*5+min(weekday,5)+(t-day if weekday<5 else 0)
def benchmark(n):
 h=18/n
 points=[]
 for i in range(n+1):
  z=-9+i*h;s=157+math.exp(ma+sa*z)
  weight=(1 if i in (0,n) else 4 if i%2 else 2)*math.exp(-z*z/2)/math.sqrt(2*math.pi)*h/3
  points.append((s,work(s),weight))
 def cdf(t):
  endwork=work(t);v=0
  for start,startwork,w in points:
   cap=endwork-startwork
   if start<t and cap>0:v+=w*.5*(1+math.erf((math.log(cap)-mb)/sb/math.sqrt(2)))
  return v
 result={}
 for key,p in [('p95',.95),('p98',.98),('p99',.99)]:
  lo,hi=157,300
  for _ in range(42):
   mid=(lo+hi)/2
   if cdf(mid)<p:lo=mid
   else:hi=mid
  result[key]=(lo+hi)/2
 return result
coarse,fine=benchmark(20000),benchmark(40000)
print(json.dumps({'coarse':coarse,'fine':fine,'maxRefinementDifference':max(abs(fine[k]-coarse[k]) for k in fine)},indent=2))

code="""
import {schedulePortfolio} from './dist/src/portfolio.js';
const t=(id,resource,lo,hi,dependsOn=[])=>({id,name:id,projectId:'P',resource,goodCase:lo,poorCase:hi,dependsOn,priority:1});
const plan={id:'benchmark',versionId:'v1',asOf:0,settings:{durationUnit:'days'},resources:['A','B'],projects:[{id:'P',name:'P',tasks:[t('Fixed','A',157,157),t('Punch','A',3,6,['Fixed']),t('Inspection','B',2,6,['Punch'])]}],calendar:{startDate:'2026-10-19',hoursPerWorkday:8,resources:[{resource:'A',weeklyHours:[8,8,8,8,8,8,8],exceptions:{}},{resource:'B',weeklyHours:[8,8,8,8,8,0,0],exceptions:{}}]}};
console.log(JSON.stringify(schedulePortfolio(plan).projects[0].forecast.completionPercentiles));
"""
actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=Path(__file__).resolve().parent.parent,text=True))
assert max(abs(fine[k]-coarse[k]) for k in fine)<1e-6,'Independent quadrature has not converged'
for key in fine:
    error=abs(actual[key]-fine[key])
    print(f'{key}: app={actual[key]:.8f}, independent={fine[key]:.8f}, error={error:.8f} days')
    assert error<.0001
print('PASS: mixed-calendar convolution agrees with independent quadrature within 0.0001 days.')
