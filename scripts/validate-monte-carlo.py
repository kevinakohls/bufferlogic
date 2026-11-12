#!/usr/bin/env python3
"""Independent standard-library benchmark for planned, 100%-allocation fixtures.
No BufferLogic sampling or scheduling code is used by the reference simulator.
Run after npm run build. Calendars, locks and fractional allocations have separate
engine/regression tests; this benchmark does not claim to validate those cases.
"""
import json, math, random, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent

def task(id, resource, good, poor, deps=(), support=()):
    return dict(id=id,name=id,resource=resource,goodCase=good,poorCase=poor,priority=1,dependsOn=list(deps),supportingResources=[dict(resource=r,allocationPercent=100) for r in support])

def make_plan(projects):
    result=[];resources=set()
    for i,tasks in enumerate(projects):
        project=f'P{i+1}'
        for item in tasks:
            item['projectId']=project;resources.add(item['resource']);resources.update(s['resource'] for s in item['supportingResources'])
        result.append(dict(id=project,name=project,tasks=tasks))
    return dict(id='independent-benchmark',versionId='v1',asOf=0,settings=dict(durationUnit='days'),resources=sorted(resources),projects=result)

def reference(plan, draws=100000, seed=1234):
    rng=random.Random(seed);results={p['id']:[] for p in plan['projects']}
    tasks=[t for p in plan['projects'] for t in p['tasks']]
    # Independent event simulation: resources become idle only at job completion.
    for _ in range(draws):
        durations={}
        for t in tasks:
            good,poor=t['goodCase'],t['poorCase']
            durations[t['id']]=good if good==poor else rng.lognormvariate((math.log(good)+math.log(poor))/2,(math.log(poor)-math.log(good))/(2*.8416212335729143))
        pending=list(tasks);running=[];finished={};time=0.;occupied=set()
        while pending or running:
            for job in list(running):
                if job[0]<=time:
                    finish,t=job;finished[t['id']]=finish;occupied.difference_update([t['resource']]+[s['resource'] for s in t['supportingResources']]);running.remove(job)
            progress=False
            for t in list(pending):
                resources={t['resource']}|{s['resource'] for s in t['supportingResources']}
                if any(d not in finished for d in t['dependsOn']) or resources&occupied:continue
                finish=time+durations[t['id']];pending.remove(t);progress=True
                if finish==time:finished[t['id']]=finish
                else:running.append((finish,t));occupied.update(resources)
            if not pending and not running:break
            if progress:continue
            if not running:raise AssertionError('Reference deadlock')
            time=min(f for f,_ in running)
        for p in plan['projects']:results[p['id']].append(max(finished[t['id']] for t in p['tasks']))
    return {id:{key:sorted(values)[math.ceil(prob*draws)-1] for key,prob in [('p98',.98),('p99',.99)]} for id,values in results.items()}

fixtures={
    'serial-sum':make_plan([[task('A','One',1,3),task('B','Two',2,4,['A'])]]),
    'parallel-path-switching':make_plan([[task('A','One',8,8),task('B','Two',2,6),task('Merge','Three',0,0,['A','B'])]]),
    'cross-project-support-contention':make_plan([[task('A','Operator1',2,4,support=['Machine'])],[task('B','Operator2',1,3,support=['Machine']),task('C','Operator2',1,2,['B'])]])
}
node="""import {simulatePortfolio} from './dist/src/monte-carlo.js';let text='';for await(const c of process.stdin)text+=c;console.log(JSON.stringify(simulatePortfolio(JSON.parse(text),{samples:10000,seed:42})));"""
for name,plan in fixtures.items():
    expected=reference(plan)
    actual=json.loads(subprocess.run(['node','--input-type=module','-e',node],input=json.dumps(plan),text=True,capture_output=True,check=True,cwd=ROOT).stdout)
    assert actual['resourceViolationSamples']==0
    for project in actual['projects']:
        for key in ['p98','p99']:
            value=project['completionPercentiles'][key]['value'];target=expected[project['projectId']][key];error=abs(value/target-1)
            print(f'{name}: {project["projectId"]} {key}: engine={value:.4f} independent={target:.4f} relative_error={error:.2%}')
            assert error<.08,(name,key,error)
print('PASS: independent 100,000-draw Python reference versus 10,000-draw BufferLogic runs (8% tolerance).')
