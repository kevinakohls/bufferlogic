"""Independent deterministic convolution check; run npm run build first.

Integrates F_B(q-A) against A's normal variate density, using only Python
stdlib math. This does not reuse BufferLogic's aggregate fitting or sampling.
A=(P20=3,P80=7), B=(P20=2,P80=7), with 100 fixed days preceding them.
The aggregate lognormal is approximate; tolerance is 3% of the uncertain tail,
not 3% of the total padded with the 100-day deterministic prefix.
"""
import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
Z80 = .8416212335729143
MU_A, SIGMA_A = (math.log(3)+math.log(7))/2, math.log(7/3)/(2*Z80)
MU_B, SIGMA_B = (math.log(2)+math.log(7))/2, math.log(7/2)/(2*Z80)


def cdf(q, subdivisions):
    step = 18/subdivisions
    total = 0
    for i in range(subdivisions+1):
        z = -9+i*step
        remainder = q-math.exp(MU_A+SIGMA_A*z)
        probability = 0 if remainder <= 0 else .5*(1+math.erf((math.log(remainder)-MU_B)/SIGMA_B/math.sqrt(2)))
        weight = 1 if i in (0,subdivisions) else 4 if i % 2 else 2
        total += weight*probability*math.exp(-z*z/2)/math.sqrt(2*math.pi)
    return total*step/3


def quantile(p, subdivisions):
    low, high = 0, 100
    for _ in range(45):
        mid = (low+high)/2
        if cdf(mid,subdivisions) < p:
            low = mid
        else:
            high = mid
    return 100+(low+high)/2


code = """
import {estimateProjectPercentiles} from './dist/src/percentiles.js';
const t=(id,lo,hi,deps=[])=>({id,name:id,resource:'R',priority:1,goodCase:lo,poorCase:hi,dependsOn:deps});
console.log(JSON.stringify(estimateProjectPercentiles([t('Fixed',100,100),t('A',3,7,['Fixed']),t('B',2,7,['A'])]).projectPercentiles));
"""
actual = json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=ROOT,text=True))
for key, p in [('p95',.95),('p98',.98),('p99',.99)]:
    reference = quantile(p,4000)
    refined = quantile(p,8000)
    assert abs(reference-refined) < 1e-6, 'Quadrature has not converged'
    error = abs(actual[key]-refined)/(refined-100)
    print(f'{key}: analytical={actual[key]:.6f}, independent={refined:.6f}, uncertain-tail error={error:.2%}')
    assert error < .03
print('PASS: shifted two-task forecast matches independent convolution within 3% of uncertain-tail duration.')
