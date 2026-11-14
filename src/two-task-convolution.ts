import type {DurationEstimates} from './types.js';
import {fitTaskLognormal} from './percentiles.js';

// Normal CDF approximation (absolute error < 8e-8); no random draws.
function normalCdf(z:number){
 const x=Math.abs(z),t=1/(1+.2316419*x),density=Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);
 const tail=density*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
 return z>=0?1-tail:tail;
}
/** Deterministic quadrature of P(B <= available effort after A).
 * Callbacks retain each task's own calendar and any fixed work between them.
 * Conditional on the fixed chain: alternate paths/resources are not redispatched.
 */
export function twoTaskConvolution(options:{
 first:DurationEstimates;second:DurationEstimates;
 secondReady:(firstEffort:number)=>number;
 secondWork:(time:number)=>number;
 lower:number;initialUpper:number;
}){
 const a=fitTaskLognormal(options.first.goodCase,options.first.poorCase,options.first.estimateBasis),b=fitTaskLognormal(options.second.goodCase,options.second.poorCase,options.second.estimateBasis);
 const points:{work:number;weight:number}[]=[];
 const count=2048,step=12/count;
 for(let i=0;i<=count;i++){
  const z=-6+i*step,ready=options.secondReady(Math.exp(a.mu+a.sigma*z));
  const weight=(i===0||i===count?1:i%2?4:2)*Math.exp(-z*z/2)/Math.sqrt(2*Math.PI)*step/3;
  points.push({work:options.secondWork(ready),weight});
 }
 const cdf=(time:number)=>{
  const work=options.secondWork(time);let probability=0;
  for(const point of points){const capacity=work-point.work;if(capacity>0)probability+=point.weight*normalCdf((Math.log(capacity)-b.mu)/b.sigma);}
  return probability;
 };
 return (probability:number)=>{
  let lower=options.lower,upper=Math.max(lower+1,options.initialUpper);
  for(let i=0;cdf(upper)<probability;i++){
   if(i===20)throw new Error('Calendar convolution percentile exceeds numeric range');
   upper=lower+2*(upper-lower);
  }
  for(let i=0;i<38;i++){const mid=(lower+upper)/2;if(cdf(mid)<probability)lower=mid;else upper=mid;}
  return (lower+upper)/2;
 };
}
